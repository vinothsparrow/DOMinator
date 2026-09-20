import type {
  ClobberRecord,
  ExtensionListenerMessage,
  ExtensionPostMessage,
  InterceptRequest,
  ListenerHit,
  OriginCheckKind,
  OriginSpoofMode,
  PollutionRecord,
  RiskLevel,
  SinkFlow,
  SourceLocation,
  TaintSourceKind,
} from '@root/src/shared/types/message';

/* Native hooks must forward unknown extra arguments. */
/* eslint-disable prefer-rest-params */

/**
 * Runs in the page realm (injected by the content script) so it can hook
 * Window.prototype and read call sites of postMessage / addEventListener.
 * Keep this file free of runtime imports: it is loaded as a classic script.
 */
(function () {
  'use strict';

  const MAX_PAYLOAD = 8000;
  const SELF_URL = (document.currentScript as HTMLScriptElement | null)?.src || '';
  const INTERCEPT_TIMEOUT = 20000;

  type Config = {
    sinks: Record<string, boolean>;
    sources: Record<string, boolean>;
    autoProbe: boolean;
    intercept: boolean;
    spoofOrigin: OriginSpoofMode;
    spoofCustom: string;
    canaryInjection: boolean;
    minTaint: number;
    taintTtl: number;
  };

  const config: Config = {
    sinks: {},
    sources: {},
    autoProbe: false,
    intercept: false,
    spoofOrigin: 'off',
    spoofCustom: 'https://evil.com',
    canaryInjection: false,
    minTaint: 8,
    taintTtl: 12000,
  };

  function sinkOn(key: string): boolean {
    return config.sinks[key] !== false;
  }

  function sourceOn(key: string): boolean {
    return config.sources[key] !== false;
  }

  function sinkEnabled(sink: string): boolean {
    if (sink.indexOf('innerHTML') !== -1) return sinkOn('innerHTML');
    if (sink.indexOf('outerHTML') !== -1) return sinkOn('outerHTML');
    if (sink.indexOf('insertAdjacentHTML') !== -1) return sinkOn('insertAdjacentHTML');
    if (sink.indexOf('document.write') !== -1) return sinkOn('document.write');
    if (sink === 'eval') return sinkOn('eval');
    if (sink.indexOf('Function') !== -1) return sinkOn('Function');
    if (sink.indexOf('setTimeout') !== -1 || sink.indexOf('setInterval') !== -1) return sinkOn('setTimeout');
    if (sink.indexOf('location') !== -1) return sinkOn('location');
    if (sink.indexOf('srcdoc') !== -1) return sinkOn('srcdoc');
    if (sink.indexOf('setAttribute') !== -1) return sinkOn('setAttribute');
    if (sink.indexOf('src') !== -1 || sink.indexOf('href') !== -1) return sinkOn('src');
    if (sink.indexOf('DOMParser') !== -1) return sinkOn('DOMParser');
    if (sink.indexOf('createContextualFragment') !== -1) return sinkOn('createContextualFragment');
    if (sink.indexOf('jQuery') !== -1) return sinkOn('jquery');
    if (sink.indexOf('cookie') !== -1) return sinkOn('cookie');
    if (sink.indexOf('localStorage') !== -1 || sink.indexOf('sessionStorage') !== -1) return sinkOn('storage');
    if (sink.indexOf('fetch') !== -1 || sink.indexOf('XHR') !== -1) return sinkOn('fetch');
    if (sink.indexOf('script') !== -1 || sink.indexOf('import') !== -1) return sinkOn('script');
    return true;
  }

  /** Sinks worth looking at when a message listener has no origin check. */
  const SINKS: { name: string; re: RegExp }[] = [
    { name: 'innerHTML', re: /\.\s*innerHTML\s*=/ },
    { name: 'outerHTML', re: /\.\s*outerHTML\s*=/ },
    { name: 'insertAdjacentHTML', re: /insertAdjacentHTML\s*\(/ },
    { name: 'document.write', re: /document\s*\.\s*write(ln)?\s*\(/ },
    { name: 'eval', re: /(^|[^.\w])eval\s*\(/ },
    { name: 'new Function', re: /new\s+Function\s*\(/ },
    { name: 'setTimeout(string)', re: /set(Timeout|Interval)\s*\(\s*['"`]/ },
    { name: 'location', re: /location\s*(\.\s*(href|hash|search)\s*)?=|location\s*\.\s*(assign|replace)\s*\(/ },
    { name: 'iframe.srcdoc', re: /\.\s*srcdoc\s*=/ },
    { name: 'element.src', re: /\.\s*src\s*=/ },
    { name: 'jQuery.html()', re: /\.\s*html\s*\(/ },
    { name: 'jQuery.append()', re: /\.\s*(append|prepend|after|before)\s*\(/ },
    { name: 'postMessage relay', re: /postMessage\s*\(/ },
    { name: 'storage write', re: /(localStorage|sessionStorage)\s*\.\s*setItem\s*\(/ },
    { name: 'document.cookie', re: /document\s*\.\s*cookie\s*=/ },
    { name: 'fetch/XHR', re: /fetch\s*\(|\.\s*open\s*\(\s*['"`]?(GET|POST)/i },
    { name: 'DOMParser', re: /parseFromString\s*\(/ },
    { name: 'createContextualFragment', re: /createContextualFragment\s*\(/ },
    { name: 'import()', re: /\bimport\s*\(/ },
  ];

  const HTML_PAYLOAD =
    /<\s*(script|img|svg|iframe|object|embed|body|a\b)|javascript:|on(error|load|click)\s*=|srcdoc=/i;

  // Keep in sync with src/shared/lib/originCheck.ts
  const STRICT_RE =
    /origin\s*===|===\s*[\w.]*origin|origin\s*!==|!==\s*[\w.]*origin|originIsAllowed|isTrustedOrigin|ALLOWED_ORIGINS|allowedOrigins|trustedOrigins|ALLOWEDORIGIN/i;
  const BYPASS_METHOD_RE = /\.origin\s*\.\s*(startsWith|endsWith|includes|indexOf|search)\s*\(/;
  const BYPASS_INDEXOF_RE = /\.indexOf\s*\(\s*(event\.)?origin|(event\.)?origin\s*\)\s*[!=<>]/;
  const BYPASS_MATCH_RE = /\.origin\s*\.match\s*\(\s*\/[^/\n]*[^$/]/;
  const BYPASS_TEST_RE = /\/[^/\n]*[^$/\n]\/\s*\.\s*(?:test|exec)\s*\(\s*(event\.)?origin/;
  const SOURCE_RE = /event\s*\.\s*source\b|\.source\s*===\s*(window|parent|opener|frames)/;

  /**
   * Snapshots of builtins taken before we wrap anything. Internal code MUST
   * call these: wrapping String.prototype / encodeURIComponent and then using
   * the hooked versions from matchTaint recurses until the renderer dies
   * (Chrome "Aw, Snap!" error code 5).
   */
  const nativeJSONParse = JSON.parse.bind(JSON);
  const nativeJSONStringify = JSON.stringify.bind(JSON);
  const nativeEncodeURIComponent = window.encodeURIComponent.bind(window);
  const nativeBtoa = typeof window.btoa === 'function' ? window.btoa.bind(window) : null;
  const nativeUnescape = typeof window.unescape === 'function' ? window.unescape.bind(window) : null;

  let counter = 0;
  function uid(prefix: string): string {
    counter += 1;
    return prefix + '-' + Date.now().toString(36) + '-' + counter.toString(36);
  }

  function isTop(): boolean {
    return window === window.parent;
  }

  function getFrameName(source): string {
    let frameName = '';
    try {
      if (!source) source = window;
      if (source.top != source && source.top == window.top) {
        let w = source;
        while (top != w) {
          let x = 0;
          for (let i = 0; i < w.parent.frames.length; i++) {
            if (w == w.parent.frames[i]) x = i;
          }
          frameName = 'frames[' + x + ']' + (frameName.length ? '.' : '') + frameName;
          w = w.parent;
        }
        frameName = 'top' + (frameName.length ? '.' + frameName : '');
      } else {
        frameName = source.top == window.top ? 'top' : 'diffwin';
      }
    } catch {
      /* cross-origin window, name is not reachable */
    }
    return frameName || 'unknown';
  }

  /** `at fn (https://host/app.js:12:5)` / `at https://host/app.js:12:5` */
  function parseFrame(raw: string): SourceLocation | null {
    const line = raw.trim().replace(/^at\s+/, '');
    const match = line.match(/^(?:(.*?)\s*\()?((?:[a-z-]+:\/\/|blob:|data:|<)[^\s)]*?|[^\s()]+):(\d+):(\d+)\)?$/i);
    if (!match) return null;
    const file = match[2];
    return {
      file,
      fileName: file.split(/[\\/]/).pop().split('?')[0] || file,
      line: parseInt(match[3], 10),
      column: parseInt(match[4], 10),
      fn: match[1] ? match[1].trim() : undefined,
      raw: line,
    };
  }

  /** Call stack of the caller, with this script's own frames removed. */
  function captureStack(): SourceLocation[] {
    let stackStr: string;
    try {
      stackStr = new Error('DOMinator').stack || '';
    } catch {
      stackStr = '';
    }
    const frames: SourceLocation[] = [];
    const lines = stackStr.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const frame = parseFrame(lines[i]);
      if (!frame) continue;
      if (frame.file === SELF_URL) continue;
      if (frame.file.indexOf('chrome-extension://') === 0 || frame.file.indexOf('moz-extension://') === 0) continue;
      frames.push(frame);
      if (frames.length >= 12) break;
    }
    return frames;
  }

  /** JSON.stringify that survives cycles, DOM nodes and windows. */
  function serialize(data): { text: string; type: string; size: number } {
    const type = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    let text: string;
    if (typeof data === 'string') {
      text = data;
    } else {
      const seen = new WeakSet();
      try {
        text = nativeJSONStringify(data, function (key, value) {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
            if (typeof Window !== 'undefined' && value instanceof Window) return '[Window]';
            if (typeof Node !== 'undefined' && value instanceof Node) return '[' + value.nodeName + ']';
            if (typeof MessagePort !== 'undefined' && value instanceof MessagePort) return '[MessagePort]';
          }
          if (typeof value === 'function') return '[Function ' + (value.name || 'anonymous') + ']';
          return value;
        });
      } catch {
        text = String(data);
      }
    }
    if (text === undefined) text = String(data);
    const size = text.length;
    if (size > MAX_PAYLOAD) text = text.slice(0, MAX_PAYLOAD) + '… [truncated]';
    return { text, type, size };
  }

  function fingerprint(text: string, type: string): string {
    let hash = 5381;
    const sample = text.length > 512 ? text.slice(0, 512) : text;
    for (let i = 0; i < sample.length; i++) {
      hash = ((hash << 5) + hash + sample.charCodeAt(i)) | 0;
    }
    return type + ':' + text.length + ':' + (hash >>> 0).toString(36);
  }

  function originOf(url: string): string {
    try {
      return new URL(url, location.href).origin;
    } catch {
      return url;
    }
  }

  function classifyOriginCheck(source: string): { kind: OriginCheckKind; detail?: string; checksOrigin: boolean } {
    if (!source) return { kind: 'none', checksOrigin: false };
    const method = (BYPASS_METHOD_RE.exec(source) || [])[1];
    const unanchored = BYPASS_MATCH_RE.test(source) || BYPASS_TEST_RE.test(source);
    const indexOf = BYPASS_INDEXOF_RE.test(source);
    if (method || unanchored || indexOf) {
      return { kind: 'bypassable', detail: method || (indexOf ? 'indexOf' : 'unanchored-regex'), checksOrigin: true };
    }
    if (STRICT_RE.test(source)) return { kind: 'strict', detail: '=== / allowlist', checksOrigin: true };
    if (SOURCE_RE.test(source)) return { kind: 'source', detail: 'event.source', checksOrigin: true };
    return { kind: 'none', checksOrigin: false };
  }

  function scoreListenerRisk(sinkCount: number, kind: OriginCheckKind): RiskLevel {
    if (sinkCount > 0 && (kind === 'none' || kind === 'bypassable' || kind === 'source')) return 'high';
    if (sinkCount > 0) return 'medium';
    if (kind === 'none' || kind === 'bypassable') return 'medium';
    return 'low';
  }

  function scoreMessage(payload: string, from: string, to: string, targetOrigin?: string) {
    const flags: string[] = [];
    if (targetOrigin === '*') flags.push('wildcard target origin');
    if (HTML_PAYLOAD.test(payload)) flags.push('markup / script-like payload');
    if (originOf(from) !== originOf(to)) flags.push('cross-origin');
    let risk: RiskLevel = 'low';
    if (flags.indexOf('markup / script-like payload') > -1 && flags.indexOf('cross-origin') > -1) risk = 'high';
    else if (flags.length > 0) risk = 'medium';
    return { risk, flags };
  }

  function scoreListener(source: string) {
    const sinks: string[] = [];
    for (let i = 0; i < SINKS.length; i++) {
      if (SINKS[i].re.test(source)) sinks.push(SINKS[i].name);
    }
    const origin = classifyOriginCheck(source);
    return {
      sinks,
      checksOrigin: origin.checksOrigin,
      originCheck: origin.kind,
      originCheckDetail: origin.detail,
      risk: scoreListenerRisk(sinks.length, origin.kind),
    };
  }

  const WRAPPERS: { name: string; props: string[] }[] = [
    { name: 'Sentry', props: ['__sentry_original__', '__sentry_wrapped_original__'] },
    { name: 'Raven', props: ['__inner__', '__raven_original__'] },
    { name: 'New Relic', props: ['nr@original', 'nr@wrapped_original'] },
    { name: 'Rollbar', props: ['_rollbar_orig', '_rollbarOriginal', '_rollbar_wrapped_original'] },
    { name: 'Bugsnag', props: ['__bugsnag_original__', '_bugsnag_original', 'bugsnagOriginal'] },
    { name: 'wrapper', props: ['__original__', '__orig__', '__wrapped__', 'originalHandler', 'inner'] },
  ];

  const NATIVE_SOURCE = /\{\s*\[native code\]\s*\}/;
  const JQUERY_DISPATCH = /jQuery|\bdispatch\b.*apply|\.handle\.apply/;

  function safeToString(fn): string {
    try {
      return Function.prototype.toString.call(fn);
    } catch {
      return String(fn);
    }
  }

  function unwrapListener(fn): { fn; wrappers: string[] } {
    const wrappers: string[] = [];
    let current = fn;
    for (let depth = 0; depth < 5; depth++) {
      let next = null;
      let name = '';
      for (let i = 0; i < WRAPPERS.length && !next; i++) {
        for (let j = 0; j < WRAPPERS[i].props.length; j++) {
          let candidate;
          try {
            candidate = current[WRAPPERS[i].props[j]];
          } catch {
            candidate = null;
          }
          if (typeof candidate === 'function' && candidate !== current) {
            next = candidate;
            name = WRAPPERS[i].name;
            break;
          }
        }
      }
      if (!next) break;
      wrappers.push(name);
      current = next;
    }
    return { fn: current, wrappers };
  }

  function jqueryHandlers(listener) {
    const jq = (window as never as { jQuery? }).jQuery || (window as never as { $? }).$;
    if (!jq || typeof jq._data !== 'function') return null;
    const source = safeToString(listener);
    let looksLikeJQuery = JQUERY_DISPATCH.test(source);
    try {
      looksLikeJQuery = looksLikeJQuery || !!listener.elem || typeof listener.guid === 'number';
    } catch {
      /* exotic function object */
    }
    if (!looksLikeJQuery) return null;
    try {
      const events = jq._data(window, 'events');
      if (!events || !events.message) return [];
      const handlers = [];
      for (let i = 0; i < events.message.length; i++) {
        const handler = events.message[i] && events.message[i].handler;
        if (typeof handler === 'function') handlers.push(handler);
      }
      return handlers;
    } catch {
      return [];
    }
  }

  const localMessages: ExtensionPostMessage[] = [];
  const localListeners: ExtensionListenerMessage[] = [];
  const localFlows: SinkFlow[] = [];

  function cap<T>(list: T[], record: T, max = 200): void {
    list.push(record);
    if (list.length > max) list.shift();
  }

  function emit(
    message:
      | ExtensionPostMessage
      | ExtensionListenerMessage
      | SinkFlow
      | InterceptRequest
      | ListenerHit
      | PollutionRecord
      | ClobberRecord
      | { kind: 'listener-update'; id: string; patch: Record<string, unknown> },
  ) {
    try {
      if (message && (message as ExtensionPostMessage).direction) cap(localMessages, message as ExtensionPostMessage);
      if (message && (message as ExtensionListenerMessage).listener) {
        cap(localListeners, message as ExtensionListenerMessage);
      }
      if (message && (message as SinkFlow).kind === 'flow') {
        cap(localFlows, message as SinkFlow);
      }
      window.dispatchEvent(new CustomEvent('DOMinator-SendMessage', { detail: message }));
    } catch {
      /* the page may have navigated away */
    }
  }

  /* ---------- dynamic taint tracking ---------- */

  const MAX_TAINT = 400;

  interface Taint {
    value: string;
    messageId: string;
    time: number;
    sourceKind?: TaintSourceKind;
  }
  const taints: Taint[] = [];

  function addTaint(value: string, messageId: string, sourceKind?: TaintSourceKind) {
    if (typeof value !== 'string' || value.length < config.minTaint) return;
    if (/^(.)\1*$/.test(value)) return;
    taints.push({ value, messageId, time: Date.now(), sourceKind });
    if (taints.length > MAX_TAINT) taints.shift();
  }

  function registerTaint(data, messageId: string, depth = 0, sourceKind?: TaintSourceKind) {
    if (typeof data === 'string') {
      addTaint(data, messageId, sourceKind);
      return;
    }
    if (!data || typeof data !== 'object' || depth > 4) return;
    let seen = 0;
    for (const key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      if (seen++ > 100) break;
      try {
        registerTaint(data[key], messageId, depth + 1, sourceKind);
      } catch {
        /* getter threw */
      }
    }
  }

  function matchTaint(arg: string): Taint | null {
    if (typeof arg !== 'string' || taints.length === 0) return null;
    const now = Date.now();
    for (let i = taints.length - 1; i >= 0; i--) {
      if (now - taints[i].time > config.taintTtl) {
        taints.splice(i, 1);
        continue;
      }
      const value = taints[i].value;
      if (arg.indexOf(value) !== -1) return taints[i];
      try {
        if (arg.indexOf(nativeEncodeURIComponent(value)) !== -1) return taints[i];
      } catch {
        /* malformed uri */
      }
      try {
        if (nativeBtoa && nativeUnescape && arg.indexOf(nativeBtoa(nativeUnescape(nativeEncodeURIComponent(value)))) !== -1) {
          return taints[i];
        }
      } catch {
        /* non-encodable */
      }
    }
    return null;
  }

  function taintResult(result, hit: Taint | null) {
    if (!hit) return;
    if (typeof result === 'string') addTaint(result, hit.messageId, hit.sourceKind);
    else registerTaint(result, hit.messageId, 0, hit.sourceKind);
  }

  let sinkReentry = false;
  function isBlockedError(error): boolean {
    const msg = String((error && error.message) || error || '');
    return /TrustedHTML|TrustedScript|Content Security Policy|requires a Trusted|violates the following Content Security Policy/i.test(
      msg,
    );
  }

  function reportSink(sink: string, rawValue, extra?: { blocked?: boolean; blockedReason?: string }) {
    if (sinkReentry || taints.length === 0) return;
    if (!sinkEnabled(sink)) return;
    let value: string;
    try {
      value = typeof rawValue === 'string' ? rawValue : String(rawValue);
    } catch {
      return;
    }
    if (value.length < config.minTaint) return;
    const hit = matchTaint(value);
    if (!hit) return;
    sinkReentry = true;
    try {
      const stack = captureStack();
      const flow: SinkFlow = {
        kind: 'flow',
        id: uid('snk'),
        time: Date.now(),
        messageId: hit.messageId,
        sink,
        value: value.length > MAX_PAYLOAD ? value.slice(0, MAX_PAYLOAD) + '… [truncated]' : value,
        source: stack[0],
        stack,
        taintSource: hit.sourceKind,
        blocked: extra && extra.blocked,
        blockedReason: extra && extra.blockedReason,
      };
      emit(flow);
    } catch {
      /* never break the page */
    } finally {
      sinkReentry = false;
    }
  }

  function hookSetter(proto, prop: string, sink: string) {
    try {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || typeof desc.set !== 'function' || !desc.configurable) return;
      const nativeSet = desc.set;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set: function (value) {
          reportSink(sink, value);
          try {
            return nativeSet.call(this, value);
          } catch (error) {
            if (isBlockedError(error)) reportSink(sink, value, { blocked: true, blockedReason: String(error) });
            throw error;
          }
        },
      });
    } catch {
      /* sealed prototype */
    }
  }

  function hookMethod(obj, method: string, sink: string, argIndex = 0) {
    try {
      const native = obj[method];
      if (typeof native !== 'function') return;
      obj[method] = function (...args) {
        reportSink(sink, args[argIndex]);
        try {
          return native.apply(this, args);
        } catch (error) {
          if (isBlockedError(error)) reportSink(sink, args[argIndex], { blocked: true, blockedReason: String(error) });
          throw error;
        }
      };
    } catch {
      /* non-writable */
    }
  }

  let transformReentry = false;

  function installTransformHooks() {
    const wrapUnary = (obj, name: string, native) => {
      if (typeof native !== 'function') return;
      try {
        obj[name] = function (input) {
          const result = native.call(obj, input);
          if (!transformReentry && taints.length && typeof input === 'string') {
            transformReentry = true;
            try {
              taintResult(result, matchTaint(input));
            } finally {
              transformReentry = false;
            }
          }
          return result;
        };
      } catch {
        /* missing */
      }
    };
    wrapUnary(window, 'encodeURIComponent', window.encodeURIComponent);
    wrapUnary(window, 'decodeURIComponent', window.decodeURIComponent);
    wrapUnary(window, 'encodeURI', window.encodeURI);
    wrapUnary(window, 'decodeURI', window.decodeURI);
    wrapUnary(window, 'btoa', window.btoa);
    wrapUnary(window, 'atob', window.atob);

    try {
      JSON.parse = function (text, reviver) {
        const result = nativeJSONParse(text, reviver);
        if (!transformReentry && typeof text === 'string' && taints.length) {
          transformReentry = true;
          try {
            taintResult(result, matchTaint(text));
          } finally {
            transformReentry = false;
          }
        }
        return result;
      };
    } catch {
      /* frozen */
    }
    try {
      JSON.stringify = function (value, replacer, space) {
        const result = nativeJSONStringify(value, replacer, space);
        if (!transformReentry && typeof result === 'string' && taints.length) {
          transformReentry = true;
          try {
            const hit = matchTaint(result);
            if (hit) addTaint(result, hit.messageId, hit.sourceKind);
          } finally {
            transformReentry = false;
          }
        }
        return result;
      };
    } catch {
      /* frozen */
    }
  }

  function installSinkHooks() {
    hookSetter(Element.prototype, 'innerHTML', 'innerHTML');
    hookSetter(Element.prototype, 'outerHTML', 'outerHTML');
    if (typeof HTMLIFrameElement !== 'undefined') hookSetter(HTMLIFrameElement.prototype, 'srcdoc', 'iframe.srcdoc');
    hookMethod(Element.prototype, 'insertAdjacentHTML', 'insertAdjacentHTML', 1);
    hookMethod(Document.prototype, 'write', 'document.write');
    hookMethod(Document.prototype, 'writeln', 'document.write');
    hookMethod(window, 'eval', 'eval');
    if (typeof Location !== 'undefined' && Location.prototype) {
      hookMethod(Location.prototype, 'assign', 'location.assign');
      hookMethod(Location.prototype, 'replace', 'location.replace');
    }
    const nativeSetTimeout = window.setTimeout;
    if (typeof nativeSetTimeout === 'function') {
      window.setTimeout = function (handler, ...rest) {
        if (typeof handler === 'string') reportSink('setTimeout(string)', handler);
        return nativeSetTimeout.apply(this, [handler, ...rest] as never);
      } as typeof window.setTimeout;
    }
    const nativeSetInterval = window.setInterval;
    if (typeof nativeSetInterval === 'function') {
      window.setInterval = function (handler, ...rest) {
        if (typeof handler === 'string') reportSink('setInterval(string)', handler);
        return nativeSetInterval.apply(this, [handler, ...rest] as never);
      } as typeof window.setInterval;
    }
    const nativeSetAttribute = Element.prototype.setAttribute;
    if (typeof nativeSetAttribute === 'function') {
      Element.prototype.setAttribute = function (name, value) {
        if (typeof name === 'string' && /^(src|href|srcdoc|action|formaction|data)$/i.test(name)) {
          reportSink('setAttribute(' + name.toLowerCase() + ')', value);
        }
        try {
          return nativeSetAttribute.apply(this, arguments as never);
        } catch (error) {
          if (isBlockedError(error)) {
            reportSink('setAttribute(' + String(name).toLowerCase() + ')', value, {
              blocked: true,
              blockedReason: String(error),
            });
          }
          throw error;
        }
      };
    }
    if (typeof DOMParser !== 'undefined') {
      hookMethod(DOMParser.prototype, 'parseFromString', 'DOMParser.parseFromString', 0);
    }
    if (typeof Range !== 'undefined' && Range.prototype) {
      hookMethod(Range.prototype, 'createContextualFragment', 'createContextualFragment', 0);
    }
    try {
      const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      if (cookieDesc && cookieDesc.set && cookieDesc.configurable) {
        Object.defineProperty(Document.prototype, 'cookie', {
          configurable: true,
          enumerable: cookieDesc.enumerable,
          get: cookieDesc.get,
          set: function (value) {
            reportSink('document.cookie', value);
            return cookieDesc.set.call(this, value);
          },
        });
      }
    } catch {
      /* frozen */
    }
    const hookStorage = (storage: Storage, name: string) => {
      try {
        const native = storage.setItem.bind(storage);
        storage.setItem = function (key, value) {
          reportSink(name + '.setItem', value);
          return native(key, value);
        };
      } catch {
        /* unavailable */
      }
    };
    try {
      hookStorage(window.localStorage, 'localStorage');
    } catch {
      /* blocked */
    }
    try {
      hookStorage(window.sessionStorage, 'sessionStorage');
    } catch {
      /* blocked */
    }
    try {
      const nativeFetch = window.fetch;
      if (typeof nativeFetch === 'function') {
        window.fetch = function (input, init) {
          const url = typeof input === 'string' ? input : input && (input as Request).url;
          if (url) reportSink('fetch', url);
          if (init && init.body) reportSink('fetch.body', init.body);
          return nativeFetch.apply(this, arguments as never);
        } as typeof window.fetch;
      }
    } catch {
      /* frozen */
    }
    try {
      const nativeOpen = XMLHttpRequest.prototype.open;
      const nativeSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        (this as XMLHttpRequest & { __dominatorUrl?: string }).__dominatorUrl = String(url);
        reportSink('XHR.open', url);
        return nativeOpen.apply(this, arguments as never);
      };
      XMLHttpRequest.prototype.send = function (body) {
        if (body) reportSink('XHR.send', body);
        return nativeSend.apply(this, arguments as never);
      };
    } catch {
      /* frozen */
    }
  }

  function hookJQuery() {
    const jq = (window as never as { jQuery?; $ }).jQuery || (window as never as { $ }).$;
    if (!jq || !jq.fn || jq.fn.__dominatorHooked) return;
    jq.fn.__dominatorHooked = true;
    ['html', 'append', 'prepend', 'after', 'before', 'replaceWith'].forEach(method => {
      const native = jq.fn[method];
      if (typeof native !== 'function') return;
      jq.fn[method] = function () {
        if (arguments[0] != null) reportSink('jQuery.' + method, arguments[0]);
        return native.apply(this, arguments);
      };
    });
    if (typeof jq.extend === 'function') {
      const nativeExtend = jq.extend;
      jq.extend = function () {
        const result = nativeExtend.apply(this, arguments);
        checkPollution('jQuery.extend');
        return result;
      };
    }
  }

  function hookLodash() {
    const lodash = (window as never as { _? })._;
    if (!lodash || lodash.__dominatorHooked) return;
    lodash.__dominatorHooked = true;
    ['merge', 'mergeWith', 'defaultsDeep', 'extend', 'assignIn'].forEach(method => {
      const native = lodash[method];
      if (typeof native !== 'function') return;
      lodash[method] = function () {
        const result = native.apply(this, arguments);
        checkPollution('_.' + method);
        return result;
      };
    });
  }

  const PROTO_WATCH = ['dominatorPolluted', 'isAdmin', 'admin', 'toString', 'valueOf', 'constructor'];
  let protoSnapshot: string[] = [];
  try {
    protoSnapshot = Object.getOwnPropertyNames(Object.prototype);
  } catch {
    protoSnapshot = [];
  }

  function checkPollution(via: string, messageId?: string) {
    try {
      const proto = Object.prototype as unknown as Record<string, unknown>;
      const keys: string[] = [];
      for (let i = 0; i < PROTO_WATCH.length; i++) {
        if (Object.prototype.hasOwnProperty.call(proto, PROTO_WATCH[i]) && protoSnapshot.indexOf(PROTO_WATCH[i]) === -1) {
          keys.push(PROTO_WATCH[i]);
        }
      }
      const current = Object.getOwnPropertyNames(Object.prototype);
      for (let i = 0; i < current.length; i++) {
        if (protoSnapshot.indexOf(current[i]) === -1 && keys.indexOf(current[i]) === -1) keys.push(current[i]);
      }
      if (!keys.length) return;
      const stack = captureStack();
      const record: PollutionRecord = {
        kind: 'pollution',
        id: uid('pol'),
        time: Date.now(),
        via,
        keys,
        source: stack[0],
        stack,
        messageId,
        frame: getFrameName(window),
      };
      emit(record);
      protoSnapshot = current;
    } catch {
      /* never break the page */
    }
  }

  function installPollutionHooks() {
    try {
      const nativeAssign = Object.assign;
      Object.assign = function (target, ...sources) {
        const result = nativeAssign.call(Object, target, ...sources);
        checkPollution('Object.assign');
        return result;
      } as typeof Object.assign;
    } catch {
      /* frozen */
    }
    hookJQuery();
    hookLodash();
    setTimeout(hookJQuery, 0);
    setTimeout(hookLodash, 0);
    setTimeout(hookJQuery, 1000);
    setTimeout(hookLodash, 1000);
  }

  const SENSITIVE_KEY = /cookie|token|secret|session|auth|jwt|password|bearer|csrf/i;

  function detectLeaks(payload: string, from: string, to: string): string[] {
    const leaks: string[] = [];
    try {
      if (originOf(from) === originOf(to) && originOf(to) !== '*') return leaks;
      if (location.href && payload.indexOf(location.href) !== -1) leaks.push('location.href');
      if (document.referrer && payload.indexOf(document.referrer) !== -1) leaks.push('document.referrer');
      if (typeof document.cookie === 'string' && document.cookie) {
        const first = document.cookie.split(';')[0];
        if (first && payload.indexOf(first) !== -1) leaks.push('cookie');
      }
      if (SENSITIVE_KEY.test(payload)) leaks.push('sensitive-key');
    } catch {
      /* ignore */
    }
    return leaks;
  }

  try {
    installSinkHooks();
    installTransformHooks();
    installPollutionHooks();
  } catch {
    /* never break the page */
  }

  /* ---------- outgoing postMessage ---------- */

  function describeTransfer(transfer): string[] | undefined {
    if (!transfer || !transfer.length) return undefined;
    const out: string[] = [];
    for (let i = 0; i < transfer.length; i++) {
      const item = transfer[i];
      try {
        if (typeof MessagePort !== 'undefined' && item instanceof MessagePort) out.push('MessagePort');
        else if (typeof ArrayBuffer !== 'undefined' && item instanceof ArrayBuffer) out.push('ArrayBuffer');
        else out.push(Object.prototype.toString.call(item));
      } catch {
        out.push('[transfer]');
      }
    }
    return out;
  }

  function isEmptyPayload(data): boolean {
    if (data === null || data === undefined) return true;
    if (typeof data === 'string' && data.trim() === '') return true;
    return false;
  }

  function parseWindowArgs(args) {
    const data = args[0];
    let targetOrigin: string | undefined;
    let transfer;
    if (typeof args[1] === 'string' || args[1] == null) {
      targetOrigin = args[1];
      transfer = args[2];
    } else if (args[1] && typeof args[1] === 'object') {
      targetOrigin = args[1].targetOrigin;
      transfer = args[1].transfer;
    }
    return { data, targetOrigin, transfer };
  }

  const nativePostMessage = window.postMessage;

  function hookedPostMessage(this: Window, ...args) {
    try {
      if (sourceOn('postMessage')) {
        const target = this || window;
        const parsed = parseWindowArgs(args);
        if (isEmptyPayload(parsed.data)) {
          /* null / empty payloads are keepalive noise */
        } else {
        const stack = captureStack();
        const payload = serialize(parsed.data);
        let targetUrl = '';
        try {
          targetUrl = target.location.href;
        } catch {
          targetUrl = typeof parsed.targetOrigin === 'string' ? parsed.targetOrigin : 'cross-origin window';
        }
        const callerUrl = stack[0] ? stack[0].file : location.href;
        const leaks = detectLeaks(payload.text, callerUrl, targetUrl);
        const scored = scoreMessage(
          payload.text,
          callerUrl,
          targetUrl,
          typeof parsed.targetOrigin === 'string' ? parsed.targetOrigin : '',
        );
        if (leaks.length) {
          scored.flags = scored.flags.concat(leaks.map(item => 'leak:' + item));
          if (scored.risk === 'low') scored.risk = 'medium';
        }
        const record: ExtensionPostMessage = {
          kind: 'message',
          id: uid('snd'),
          time: Date.now(),
          direction: 'sent',
          isTop: isTop(),
          from: callerUrl,
          to: targetUrl,
          fromFrame: target === window ? getFrameName(window) : 'caller',
          toFrame: getFrameName(target),
          targetOrigin: typeof parsed.targetOrigin === 'string' ? parsed.targetOrigin : undefined,
          message: payload.text,
          dataType: payload.type,
          size: payload.size,
          source: stack[0],
          stack,
          hash: fingerprint(payload.text, payload.type),
          channel: 'window',
          transfer: describeTransfer(parsed.transfer),
          leaks: leaks.length ? leaks : undefined,
          ...scored,
        };
        emit(record);
        }
      }
    } catch {
      /* never break the page */
    }
    return nativePostMessage.apply(this || window, args as Parameters<typeof nativePostMessage>);
  }

  try {
    Window.prototype.postMessage = hookedPostMessage as typeof nativePostMessage;
  } catch {
    /* frozen prototype */
  }
  try {
    window.postMessage = hookedPostMessage as typeof nativePostMessage;
  } catch {
    /* non-writable own property */
  }

  function recordPortSend(channel: ExtensionPostMessage['channel'], data, transfer, targetHint: string) {
    if (!sourceOn('postMessage')) return;
    if (isEmptyPayload(data)) return;
    try {
      const stack = captureStack();
      const payload = serialize(data);
      const scored = scoreMessage(payload.text, location.href, targetHint);
      const record: ExtensionPostMessage = {
        kind: 'message',
        id: uid('snd'),
        time: Date.now(),
        direction: 'sent',
        isTop: isTop(),
        from: location.href,
        to: targetHint,
        fromFrame: getFrameName(window),
        toFrame: getFrameName(window),
        message: payload.text,
        dataType: payload.type,
        size: payload.size,
        source: stack[0],
        stack,
        hash: fingerprint(payload.text, payload.type),
        channel,
        transfer: describeTransfer(transfer),
        ...scored,
      };
      emit(record);
    } catch {
      /* ignore */
    }
  }

  try {
    if (typeof MessagePort !== 'undefined' && MessagePort.prototype) {
      const native = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function (data, transfer) {
        recordPortSend('port', data, transfer, 'MessagePort');
        return native.apply(this, arguments as never);
      };
    }
  } catch {
    /* frozen */
  }

  try {
    if (typeof BroadcastChannel !== 'undefined' && BroadcastChannel.prototype) {
      const native = BroadcastChannel.prototype.postMessage;
      BroadcastChannel.prototype.postMessage = function (data) {
        recordPortSend('broadcast', data, undefined, 'BroadcastChannel');
        return native.apply(this, arguments as never);
      };
    }
  } catch {
    /* missing */
  }

  try {
    if (typeof Worker !== 'undefined' && Worker.prototype) {
      const native = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (data, transfer) {
        recordPortSend('worker', data, transfer, 'Worker');
        return native.apply(this, arguments as never);
      };
    }
  } catch {
    /* missing */
  }
  try {
    if (typeof ServiceWorker !== 'undefined' && ServiceWorker.prototype) {
      const native = ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage = function (data, transfer) {
        recordPortSend('service-worker', data, transfer, 'service-worker');
        return native.apply(this, arguments as never);
      };
    }
  } catch {
    /* missing */
  }

  /* ---------- incoming: message events ---------- */

  const nativeAddEventListener = window.addEventListener;
  const nativeRemoveEventListener = window.removeEventListener;

  nativeAddEventListener.call(window, 'message', function (this: Window, e: MessageEvent) {
    if (!sourceOn('postMessage')) return;
    if (typeof e.data == 'string' && e.data.startsWith('setImmediate')) return;
    if (isEmptyPayload(e.data)) return;
    const payload = serialize(e.data);
    const record: ExtensionPostMessage = {
      kind: 'message',
      id: uid('rcv'),
      time: Date.now(),
      direction: 'received',
      isTop: isTop(),
      from: e.origin,
      fromFrame: getFrameName(e.source),
      toFrame: getFrameName(this.window),
      to: window.location.href,
      message: payload.text,
      dataType: payload.type,
      size: payload.size,
      hash: fingerprint(payload.text, payload.type),
      channel: 'window',
      transfer: e.ports && e.ports.length ? describeTransfer(e.ports) : undefined,
      ...scoreMessage(payload.text, e.origin, window.location.href),
    };
    emit(record);
    try {
      registerTaint(e.data, record.id, 0, 'postMessage');
    } catch {
      /* exotic payload */
    }
  });

  /* ---------- listener wrapping, intercept, origin spoof ---------- */

  type ListenerMeta = {
    id: string;
    channel: ExtensionPostMessage['channel'];
    via: ExtensionListenerMessage['via'];
  };

  const wrappersByOriginal = new WeakMap();
  const originalsByWrapped = new WeakMap();
  const metaByWrapped = new WeakMap<WeakKey, ListenerMeta>();
  let replaying = false;

  interface PendingIntercept {
    original;
    thisArg;
    event: MessageEvent;
    meta: ListenerMeta;
    origin: string;
    data;
    originRead: { v: boolean };
    dataRead: { v: boolean };
  }
  const pendingIntercepts: Record<string, PendingIntercept> = {};

  function makeCanary(): string {
    return '__DOMNTR_' + Math.random().toString(36).slice(2, 12) + '__';
  }

  function injectCanaryValue(data, canary: string) {
    if (typeof data === 'string') return data + canary;
    if (!data || typeof data !== 'object') return data;
    try {
      const clone = JSON.parse(JSON.stringify(data));
      const walk = node => {
        if (typeof node === 'string') return node + canary;
        if (Array.isArray(node)) return node.map(walk);
        if (node && typeof node === 'object') {
          const out = {};
          for (const key in node) {
            if (Object.prototype.hasOwnProperty.call(node, key)) out[key] = walk(node[key]);
          }
          return out;
        }
        return node;
      };
      return walk(clone);
    } catch {
      return data;
    }
  }

  function spoofedOrigin(real: string): string {
    switch (config.spoofOrigin) {
      case 'evil':
        return 'https://evil.com';
      case 'prefix':
        try {
          const url = new URL(real);
          return url.protocol + '//evil.' + url.host;
        } catch {
          return 'https://evil.com';
        }
      case 'suffix':
        try {
          const url = new URL(real);
          return url.protocol + '//' + url.hostname + '.evil.com';
        } catch {
          return real + '.evil.com';
        }
      case 'custom':
        return config.spoofCustom || 'https://evil.com';
      default:
        return real;
    }
  }

  function proxyEvent(event: MessageEvent, origin: string, data, originRead, dataRead) {
    try {
      return new Proxy(event, {
        get(target, prop, receiver) {
          if (prop === 'origin') {
            originRead.v = true;
            return origin;
          }
          if (prop === 'data') {
            dataRead.v = true;
            return data;
          }
          const value = Reflect.get(target, prop, receiver);
          if (typeof value === 'function') return value.bind(target);
          return value;
        },
      });
    } catch {
      return new MessageEvent('message', {
        data,
        origin,
        source: event.source,
        ports: event.ports ? Array.from(event.ports) : [],
      });
    }
  }

  function invokeHandler(original, thisArg, event, meta: ListenerMeta, originRead, dataRead) {
    let result;
    try {
      result = original.call(thisArg, event);
    } finally {
      const hit: ListenerHit = {
        kind: 'listener-hit',
        id: uid('hit'),
        time: Date.now(),
        listenerId: meta.id,
        origin: event && event.origin,
        originRead: originRead.v,
        dataRead: dataRead.v,
      };
      emit(hit);
    }
    return result;
  }

  function finishIntercept(id: string, action: 'deliver' | 'drop' | 'edit', origin?: string, data?) {
    const pending = pendingIntercepts[id];
    if (!pending) return;
    delete pendingIntercepts[id];
    if (action === 'drop') return;
    const presentedOrigin = origin || pending.origin;
    const presentedData = data !== undefined ? data : pending.data;
    const presented = proxyEvent(pending.event, presentedOrigin, presentedData, pending.originRead, pending.dataRead);
    invokeHandler(pending.original, pending.thisArg, presented, pending.meta, pending.originRead, pending.dataRead);
  }

  function deliver(original, thisArg, event: MessageEvent, meta: ListenerMeta) {
    let data = event.data;
    let origin = event.origin;
    if (config.spoofOrigin !== 'off') origin = spoofedOrigin(event.origin || location.origin);
    if (config.canaryInjection && !replaying) {
      data = injectCanaryValue(data, makeCanary());
      try {
        registerTaint(data, uid('cny'), 0, 'postMessage');
      } catch {
        /* ignore */
      }
    }
    const originRead = { v: false };
    const dataRead = { v: false };
    const needsProxy = origin !== event.origin || data !== event.data;

    if (config.intercept && !replaying) {
      const id = uid('int');
      pendingIntercepts[id] = { original, thisArg, event, meta, origin, data, originRead, dataRead };
      const payload = serialize(data);
      const request: InterceptRequest = {
        kind: 'intercept',
        id,
        time: Date.now(),
        listenerId: meta.id,
        origin,
        message: payload.text,
        dataType: payload.type,
        frame: getFrameName(window),
        channel: meta.channel,
      };
      emit(request);
      setTimeout(function () {
        if (pendingIntercepts[id]) finishIntercept(id, 'deliver');
      }, INTERCEPT_TIMEOUT);
      return;
    }

    const presented = needsProxy ? proxyEvent(event, origin, data, originRead, dataRead) : event;
    if (!needsProxy) {
      try {
        void event.origin;
        originRead.v = true;
      } catch {
        /* ignore */
      }
    }
    return invokeHandler(original, thisArg, presented, meta, originRead, dataRead);
  }

  function wrapHandler(original, meta: ListenerMeta) {
    const existing = wrappersByOriginal.get(original);
    if (existing) return existing;
    function wrapped(event: MessageEvent) {
      return deliver(original, this, event, meta);
    }
    try {
      wrapped.toString = function () {
        return Function.prototype.toString.call(original);
      };
    } catch {
      /* ignore */
    }
    wrappersByOriginal.set(original, wrapped);
    originalsByWrapped.set(wrapped, original);
    metaByWrapped.set(wrapped, meta);
    return wrapped;
  }

  function autoProbe(original, meta: ListenerMeta) {
    if (!config.autoProbe) return;
    setTimeout(function () {
      const canary = makeCanary();
      const probes = [
        canary,
        { type: 'dominator-probe', html: '<img src=x onerror=alert(document.domain)>', url: 'javascript:alert(1)', q: canary },
        JSON.parse('{"__proto__":{"dominatorPolluted":true}}'),
      ];
      replaying = true;
      try {
        for (let i = 0; i < probes.length; i++) {
          const origin = config.spoofOrigin === 'off' ? 'https://evil.com' : spoofedOrigin(location.origin);
          const payload = serialize(probes[i]);
          const record: ExtensionPostMessage = {
            kind: 'message',
            id: uid('prb'),
            time: Date.now(),
            direction: 'received',
            isTop: isTop(),
            from: origin,
            to: location.href,
            fromFrame: 'probe',
            toFrame: getFrameName(window),
            message: payload.text,
            dataType: payload.type,
            size: payload.size,
            hash: fingerprint(payload.text, payload.type),
            probe: true,
            spoofed: true,
            presentedOrigin: origin,
            listenerHits: [meta.id],
            channel: meta.channel,
            ...scoreMessage(payload.text, origin, location.href),
          };
          emit(record);
          registerTaint(probes[i], record.id, 0, 'postMessage');
          const ev = new MessageEvent('message', { data: probes[i], origin, source: window });
          original.call(window, ev);
        }
      } catch {
        /* listener threw */
      } finally {
        replaying = false;
      }
    }, 40);
  }

  function reportListener(listener, wrappers: string[], stack: SourceLocation[], target: Window, via: ExtensionListenerMessage['via'], channel: ExtensionPostMessage['channel'], wrapperSource?: string) {
    const source = safeToString(listener);
    const bound = NATIVE_SOURCE.test(source);
    const scored = scoreListener(source);
    const loc = stack[0];
    const record: ExtensionListenerMessage = {
      kind: 'listener',
      id: uid('lsn'),
      time: Date.now(),
      stack: loc ? loc.raw : '',
      source: loc,
      stackFrames: stack,
      frame: getFrameName(target),
      origin: window.location.href,
      listener: source,
      wrappers: wrappers.length ? wrappers : undefined,
      wrapperSource,
      bound: bound || undefined,
      via,
      channel,
      fingerprint: (loc ? loc.file + ':' + loc.line + ':' + loc.column : '') + ':' + fingerprint(source, 'fn'),
      seen: 1,
      hitCount: 0,
      confirmedCount: 0,
      ...scored,
    };
    emit(record);
    const wrapped = wrapHandler(listener, { id: record.id, channel, via });
    autoProbe(listener, { id: record.id, channel, via });
    return wrapped;
  }

  function captureListener(rawListener, stack: SourceLocation[], target: Window, via: ExtensionListenerMessage['via'], channel: ExtensionPostMessage['channel']) {
    const outerSource = safeToString(rawListener);
    const jquery = jqueryHandlers(rawListener);
    if (jquery) {
      setTimeout(function () {
        const handlers = jqueryHandlers(rawListener) || [];
        if (handlers.length === 0) {
          reportListener(rawListener, [], stack, target, via, channel);
          return;
        }
        for (let i = 0; i < handlers.length; i++) {
          const unwrapped = unwrapListener(handlers[i]);
          reportListener(unwrapped.fn, ['jQuery'].concat(unwrapped.wrappers), stack, target, via, channel, outerSource);
        }
      }, 0);
      return wrapHandler(rawListener, { id: uid('lsn'), channel, via });
    }

    const unwrapped = unwrapListener(rawListener);
    if (unwrapped.wrappers.length) {
      return reportListener(unwrapped.fn, unwrapped.wrappers, stack, target, via, channel, outerSource);
    }
    return reportListener(rawListener, [], stack, target, via, channel);
  }

  function normalizeListener(listener) {
    if (typeof listener === 'function') return { fn: listener, via: 'addEventListener' as const };
    if (listener && typeof listener === 'object' && typeof listener.handleEvent === 'function') {
      return { fn: listener.handleEvent.bind(listener), via: 'handleEvent' as const };
    }
    return null;
  }

  function hookedAddEventListener(this: Window, type, listener) {
    if (type === 'message' && listener != undefined) {
      try {
        const normalized = normalizeListener(listener);
        if (normalized) {
          const wrapped = captureListener(normalized.fn, captureStack(), this || window, normalized.via, 'window');
          if (typeof listener === 'function') {
            return nativeAddEventListener.call(this || window, type, wrapped, arguments[2]);
          }
        }
      } catch {
        /* never break the page */
      }
    }
    return nativeAddEventListener.apply(this || window, arguments);
  }

  function hookedRemoveEventListener(this: Window, type, listener) {
    let fn = listener;
    if (type === 'message' && listener) {
      const wrapped = wrappersByOriginal.get(typeof listener === 'function' ? listener : listener.handleEvent);
      if (wrapped) fn = wrapped;
      const meta = metaByWrapped.get(fn) || (wrapped && metaByWrapped.get(wrapped));
      if (meta) emit({ kind: 'listener-update', id: meta.id, patch: { removed: true } });
    }
    return nativeRemoveEventListener.call(this || window, type, fn, arguments[2]);
  }

  try {
    Window.prototype.addEventListener = hookedAddEventListener;
  } catch {
    /* frozen prototype */
  }
  try {
    window.addEventListener = hookedAddEventListener;
  } catch {
    /* non-writable own property */
  }
  try {
    Window.prototype.removeEventListener = hookedRemoveEventListener;
  } catch {
    /* frozen */
  }
  try {
    window.removeEventListener = hookedRemoveEventListener;
  } catch {
    /* frozen */
  }

  try {
    if (typeof MessagePort !== 'undefined' && MessagePort.prototype) {
      const proto = MessagePort.prototype;
      const nativeAEL = proto.addEventListener;
      proto.addEventListener = function (type, listener, options) {
        if (type === 'message' && listener) {
          const normalized = normalizeListener(listener);
          if (normalized) {
            const wrapped = captureListener(normalized.fn, captureStack(), window, normalized.via, 'port');
            return nativeAEL.call(this, type, wrapped, options);
          }
        }
        return nativeAEL.call(this, type, listener, options);
      };
    }
  } catch {
    /* frozen */
  }

  try {
    const desc =
      Object.getOwnPropertyDescriptor(Window.prototype, 'onmessage') ||
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onmessage');
    if (desc && desc.set && desc.configurable) {
      const originals = new WeakMap();
      Object.defineProperty(Window.prototype, 'onmessage', {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () {
          return originals.get(this) || (desc.get ? desc.get.call(this) : undefined);
        },
        set: function (fn) {
          if (typeof fn === 'function') {
            originals.set(this, fn);
            const wrapped = captureListener(fn, captureStack(), this || window, 'onmessage', 'window');
            return desc.set.call(this, wrapped);
          }
          originals.set(this, fn);
          return desc.set.call(this, fn);
        },
      });
    }
  } catch {
    /* frozen */
  }

  /* ---------- URL / DOM sources ---------- */

  function seedSource(kind: TaintSourceKind, value: string) {
    if (typeof value !== 'string' || value.length < config.minTaint) return;
    const payload = serialize(value);
    const record: ExtensionPostMessage = {
      kind: 'message',
      id: uid('src'),
      time: Date.now(),
      direction: 'received',
      isTop: isTop(),
      from: kind,
      to: location.href,
      fromFrame: getFrameName(window),
      toFrame: getFrameName(window),
      message: payload.text,
      dataType: payload.type,
      size: payload.size,
      hash: fingerprint(payload.text, payload.type),
      taintSource: kind,
      flags: ['url source'],
      risk: 'medium',
    };
    emit(record);
    addTaint(value, record.id, kind);
    try {
      const query = value.replace(/^[^?#]*[?#]/, '');
      if (query && query !== value) {
        const params = new URLSearchParams(query);
        params.forEach(function (item) {
          addTaint(item, record.id, kind);
        });
      }
    } catch {
      /* ignore */
    }
  }

  function seedDocumentSources() {
    try {
      if (sourceOn('location')) {
        seedSource('location.href', location.href);
        seedSource('location.hash', location.hash);
        seedSource('location.search', location.search);
      }
      if (sourceOn('referrer') && document.referrer) seedSource('document.referrer', document.referrer);
      if (sourceOn('windowName') && window.name) seedSource('window.name', window.name);
    } catch {
      /* ignore */
    }
  }

  try {
    const nativePush = history.pushState;
    const nativeReplace = history.replaceState;
    history.pushState = function () {
      const result = nativePush.apply(this, arguments as never);
      if (sourceOn('history')) seedSource('history', String(arguments[2] || location.href));
      return result;
    };
    history.replaceState = function () {
      const result = nativeReplace.apply(this, arguments as never);
      if (sourceOn('history')) seedSource('history', String(arguments[2] || location.href));
      return result;
    };
    nativeAddEventListener.call(window, 'popstate', function () {
      if (sourceOn('history')) seedSource('history', location.href);
    });
    nativeAddEventListener.call(window, 'hashchange', function () {
      if (sourceOn('location')) seedSource('location.hash', location.hash);
    });
  } catch {
    /* ignore */
  }

  if (document.readyState === 'loading') {
    nativeAddEventListener.call(document, 'DOMContentLoaded', seedDocumentSources);
  } else {
    seedDocumentSources();
  }

  /* ---------- DOM clobbering ---------- */

  const DANGEROUS_CLOBBER: Record<string, number> = {
    location: 1,
    name: 1,
    getElementById: 1,
    getElementsByTagName: 1,
    getElementsByClassName: 1,
    attributes: 1,
    children: 1,
    firstChild: 1,
    lastChild: 1,
    parentNode: 1,
    cookie: 1,
    body: 1,
    head: 1,
    document: 1,
    contentWindow: 1,
    contentDocument: 1,
    forms: 1,
    images: 1,
    scripts: 1,
    defaultView: 1,
    URL: 1,
    domain: 1,
    referrer: 1,
    title: 1,
  };

  const clobberSeen: Record<string, boolean> = {};

  function scanClobber() {
    try {
      if (!document.documentElement) return;
      const nodes = document.querySelectorAll('[id],[name]');
      const limit = Math.min(nodes.length, 500);
      for (let i = 0; i < limit; i++) {
        const el = nodes[i] as HTMLElement;
        const names = [el.id, el.getAttribute('name')].filter(Boolean) as string[];
        for (let n = 0; n < names.length; n++) {
          const name = names[n];
          if (clobberSeen[name]) continue;
          let hits = false;
          try {
            hits = (window as unknown as Record<string, unknown>)[name] === el || document[name] === el;
          } catch {
            hits = false;
          }
          if (!hits) continue;
          clobberSeen[name] = true;
          const record: ClobberRecord = {
            kind: 'clobber',
            id: uid('clb'),
            time: Date.now(),
            name,
            tag: el.tagName,
            dangerous: Boolean(DANGEROUS_CLOBBER[name]),
            frame: getFrameName(window),
            origin: location.href,
          };
          emit(record);
        }
      }
    } catch {
      /* ignore */
    }
  }

  function scheduleClobber() {
    setTimeout(scanClobber, 50);
    setTimeout(scanClobber, 1500);
    try {
      let pending = 0;
      const observer = new MutationObserver(function () {
        if (pending) return;
        pending = window.setTimeout(function () {
          pending = 0;
          scanClobber();
        }, 400);
      });
      observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['id', 'name'],
      });
    } catch {
      /* ignore */
    }
  }
  if (document.readyState === 'loading') nativeAddEventListener.call(document, 'DOMContentLoaded', scheduleClobber);
  else scheduleClobber();

  /* ---------- page API + config ---------- */

  function applyConfig(next) {
    if (!next || typeof next !== 'object') return;
    if (next.sinks) config.sinks = next.sinks;
    if (next.sources) config.sources = next.sources;
    if (typeof next.autoProbe === 'boolean') config.autoProbe = next.autoProbe;
    if (typeof next.intercept === 'boolean') config.intercept = next.intercept;
    if (typeof next.spoofOrigin === 'string') config.spoofOrigin = next.spoofOrigin;
    if (typeof next.spoofCustom === 'string') config.spoofCustom = next.spoofCustom;
    if (typeof next.canaryInjection === 'boolean') config.canaryInjection = next.canaryInjection;
    if (typeof next.minTaint === 'number' && next.minTaint > 0) config.minTaint = next.minTaint;
    if (typeof next.taintTtl === 'number' && next.taintTtl > 0) config.taintTtl = next.taintTtl;
  }

  nativeAddEventListener.call(window, 'DOMinator-Command', function (event: CustomEvent) {
    const command = event && event.detail;
    if (!command) return;
    if (command.op === 'config') applyConfig(command.config);
    if (command.op === 'intercept-resolve') {
      let data = command.data;
      if (command.mode === 'json' && typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          /* keep as string */
        }
      }
      finishIntercept(command.id, command.action || 'deliver', command.origin, data);
    }
  } as EventListener);

  try {
    (window as unknown as { __DOMINATOR__ }).__DOMINATOR__ = {
      version: '0.0.1',
      replay(data, origin: string) {
        replaying = true;
        try {
          const presented = origin || 'https://evil.com';
          const payload = serialize(data);
          const record: ExtensionPostMessage = {
            kind: 'message',
            id: uid('rpl'),
            time: Date.now(),
            direction: 'received',
            isTop: isTop(),
            from: presented,
            to: location.href,
            fromFrame: 'replay',
            toFrame: getFrameName(window),
            message: payload.text,
            dataType: payload.type,
            size: payload.size,
            hash: fingerprint(payload.text, payload.type),
            probe: true,
            spoofed: true,
            presentedOrigin: presented,
            channel: 'window',
            ...scoreMessage(payload.text, presented, location.href),
          };
          emit(record);
          registerTaint(data, record.id, 0, 'postMessage');
          const ev = new MessageEvent('message', { data, origin: presented, source: window });
          window.dispatchEvent(ev);
          return { ok: true, spoofed: true };
        } catch (error) {
          return { ok: false, error: String((error && (error as Error).message) || error) };
        } finally {
          replaying = false;
        }
      },
      dump() {
        return { messages: localMessages.slice(), listeners: localListeners.slice(), flows: localFlows.slice() };
      },
      config() {
        return config;
      },
    };
  } catch {
    /* frozen window */
  }
})();
