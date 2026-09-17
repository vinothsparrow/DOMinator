import type {
  ExtensionPostMessage,
  ExtensionListenerMessage,
  RiskLevel,
  SinkFlow,
  SourceLocation,
} from '@root/src/shared/types/message';

/**
 * Runs in the page realm (injected by the content script) so it can hook
 * Window.prototype and read call sites of postMessage / addEventListener.
 * Keep this file free of runtime imports: it is loaded as a classic script.
 */
(function () {
  'use strict';

  const MAX_PAYLOAD = 8000;
  const SELF_URL = (document.currentScript as HTMLScriptElement | null)?.src || '';

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
  ];

  const ORIGIN_CHECK = /\.\s*origin\b|\borigin\s*[!=]==?|originIsAllowed|isTrustedOrigin/;
  const HTML_PAYLOAD =
    /<\s*(script|img|svg|iframe|object|embed|body|a\b)|javascript:|on(error|load|click)\s*=|srcdoc=/i;

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
    } catch (e) {
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
    let stackStr = '';
    try {
      throw new Error('DOMinator');
    } catch (error) {
      stackStr = (error && error.stack) || '';
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
        text = JSON.stringify(data, function (key, value) {
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
      } catch (e) {
        text = String(data);
      }
    }
    if (text === undefined) text = String(data);
    const size = text.length;
    if (size > MAX_PAYLOAD) text = text.slice(0, MAX_PAYLOAD) + '… [truncated]';
    return { text, type, size };
  }

  /** Cheap fingerprint used by the worker to pair a send with its receive. */
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
    } catch (e) {
      return url;
    }
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
    const checksOrigin = ORIGIN_CHECK.test(source);
    let risk: RiskLevel = 'low';
    if (sinks.length > 0 && !checksOrigin) risk = 'high';
    else if (sinks.length > 0 || !checksOrigin) risk = 'medium';
    return { sinks, checksOrigin, risk };
  }

  /**
   * Error-reporting libraries hand addEventListener their own wrapper, which
   * hides the listener a researcher actually cares about. Each entry names the
   * property the library keeps the original function on.
   */
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
    } catch (e) {
      return String(fn);
    }
  }

  /** Peels known wrapper functions until the real listener is reached. */
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
          } catch (e) {
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

  /**
   * jQuery attaches one dispatcher per event type and keeps the real handlers
   * in its own data store, which it only fills after addEventListener returns.
   */
  function jqueryHandlers(listener) {
    const jq = (window as never as { jQuery? }).jQuery || (window as never as { $? }).$;
    if (!jq || typeof jq._data !== 'function') return null;
    const source = safeToString(listener);
    let looksLikeJQuery = JQUERY_DISPATCH.test(source);
    try {
      looksLikeJQuery = looksLikeJQuery || !!listener.elem || typeof listener.guid === 'number';
    } catch (e) {
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
    } catch (e) {
      return [];
    }
  }

  function emit(message: ExtensionPostMessage | ExtensionListenerMessage | SinkFlow) {
    try {
      window.dispatchEvent(new CustomEvent('DOMinator-SendMessage', { detail: message }));
    } catch (e) {
      /* the page may have navigated away */
    }
  }

  /* ---------- dynamic taint tracking: source (message) -> sink ---------- */

  /**
   * Records a received payload's string values, then reports when one of them
   * later reaches a dangerous sink. This turns a listener that *looks* risky
   * (static sink scan) into a *confirmed* source-to-sink flow: "this exact
   * payload reached innerHTML at app.js:412".
   */
  const MIN_TAINT = 8;
  const TAINT_TTL = 12000;
  const MAX_TAINT = 200;

  interface Taint {
    value: string;
    messageId: string;
    time: number;
  }
  const taints: Taint[] = [];

  function addTaint(value: string, messageId: string) {
    if (typeof value !== 'string' || value.length < MIN_TAINT) return;
    // A value made only of the same repeated char (padding) is noise.
    if (/^(.)\1*$/.test(value)) return;
    taints.push({ value, messageId, time: Date.now() });
    if (taints.length > MAX_TAINT) taints.shift();
  }

  /** Collects string leaves of a payload so `data.html` taints, not just strings. */
  function registerTaint(data, messageId: string, depth = 0) {
    if (typeof data === 'string') {
      addTaint(data, messageId);
      return;
    }
    if (!data || typeof data !== 'object' || depth > 4) return;
    let seen = 0;
    for (const key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      if (seen++ > 100) break;
      try {
        registerTaint(data[key], messageId, depth + 1);
      } catch (e) {
        /* getter threw */
      }
    }
  }

  /** Returns the tainted source whose value appears in `arg`, or null. */
  function matchTaint(arg: string): Taint | null {
    if (taints.length === 0) return null;
    const now = Date.now();
    for (let i = taints.length - 1; i >= 0; i--) {
      if (now - taints[i].time > TAINT_TTL) {
        taints.splice(i, 1);
        continue;
      }
      if (arg.indexOf(taints[i].value) !== -1) return taints[i];
    }
    return null;
  }

  let sinkReentry = false;
  function reportSink(sink: string, rawValue) {
    if (sinkReentry || taints.length === 0) return;
    let value: string;
    try {
      value = typeof rawValue === 'string' ? rawValue : String(rawValue);
    } catch (e) {
      return;
    }
    if (value.length < MIN_TAINT) return;
    const hit = matchTaint(value);
    if (!hit) return;
    sinkReentry = true;
    try {
      const stack = captureStack();
      const flow: SinkFlow = {
        id: uid('snk'),
        time: Date.now(),
        messageId: hit.messageId,
        sink,
        value: value.length > MAX_PAYLOAD ? value.slice(0, MAX_PAYLOAD) + '… [truncated]' : value,
        source: stack[0],
        stack,
      };
      emit(flow);
    } catch (e) {
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
          return nativeSet.call(this, value);
        },
      });
    } catch (e) {
      /* sealed prototype */
    }
  }

  function hookMethod(obj, method: string, sink: string, argIndex = 0) {
    try {
      const native = obj[method];
      if (typeof native !== 'function') return;
      obj[method] = function (...args) {
        reportSink(sink, args[argIndex]);
        // eslint-disable-next-line prefer-spread
        return native.apply(this, args);
      };
    } catch (e) {
      /* non-writable */
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
    // setTimeout/setInterval only matter when handed a string to compile.
    const nativeSetTimeout = window.setTimeout;
    if (typeof nativeSetTimeout === 'function') {
      window.setTimeout = function (handler, ...rest) {
        if (typeof handler === 'string') reportSink('setTimeout(string)', handler);
        // eslint-disable-next-line prefer-spread
        return nativeSetTimeout.apply(this, [handler, ...rest] as never);
      } as typeof window.setTimeout;
    }
    const nativeSetInterval = window.setInterval;
    if (typeof nativeSetInterval === 'function') {
      window.setInterval = function (handler, ...rest) {
        if (typeof handler === 'string') reportSink('setInterval(string)', handler);
        // eslint-disable-next-line prefer-spread
        return nativeSetInterval.apply(this, [handler, ...rest] as never);
      } as typeof window.setInterval;
    }
    // Attribute-based sinks: only URL/markup-bearing attributes are interesting.
    const nativeSetAttribute = Element.prototype.setAttribute;
    if (typeof nativeSetAttribute === 'function') {
      Element.prototype.setAttribute = function (name, value) {
        if (typeof name === 'string' && /^(src|href|srcdoc|action|formaction|data)$/i.test(name)) {
          reportSink('setAttribute(' + name.toLowerCase() + ')', value);
        }
        // eslint-disable-next-line prefer-rest-params
        return nativeSetAttribute.apply(this, arguments);
      };
    }
  }

  try {
    installSinkHooks();
  } catch (e) {
    /* never break the page */
  }

  /* ---------- outgoing: window.postMessage() call sites ---------- */

  /**
   * Chrome exposes postMessage both on Window.prototype and as an own property
   * of each window, and the own property shadows the prototype - so both have
   * to be replaced. A same-origin cross-frame send resolves to the *target*
   * window's property, which is why the hook reports the caller from the stack
   * rather than from `location`. Cross-origin sends go through the target's
   * cross-origin WindowProxy and cannot be intercepted at all; those are still
   * captured by the receiving frame as an incoming message.
   */
  const nativePostMessage = window.postMessage;

  function hookedPostMessage(this: Window, ...args) {
    try {
      const target = this || window;
      const [data, targetOrigin] = args;
      const stack = captureStack();
      const payload = serialize(data);
      let targetUrl = '';
      try {
        targetUrl = target.location.href;
      } catch (e) {
        targetUrl = typeof targetOrigin === 'string' ? targetOrigin : 'cross-origin window';
      }
      const callerUrl = stack[0] ? stack[0].file : location.href;
      const record: ExtensionPostMessage = {
        id: uid('snd'),
        time: Date.now(),
        direction: 'sent',
        isTop: isTop(),
        from: callerUrl,
        to: targetUrl,
        fromFrame: target === window ? getFrameName(window) : 'caller',
        toFrame: getFrameName(target),
        targetOrigin: typeof targetOrigin === 'string' ? targetOrigin : undefined,
        message: payload.text,
        dataType: payload.type,
        size: payload.size,
        source: stack[0],
        stack,
        hash: fingerprint(payload.text, payload.type),
        ...scoreMessage(payload.text, callerUrl, targetUrl, typeof targetOrigin === 'string' ? targetOrigin : ''),
      };
      emit(record);
    } catch (e) {
      /* never break the page */
    }
    return nativePostMessage.apply(this || window, args as Parameters<typeof nativePostMessage>);
  }

  try {
    Window.prototype.postMessage = hookedPostMessage as typeof nativePostMessage;
  } catch (e) {
    /* frozen prototype */
  }
  try {
    window.postMessage = hookedPostMessage as typeof nativePostMessage;
  } catch (e) {
    /* non-writable own property */
  }

  /* ---------- incoming: message events ---------- */

  window.addEventListener('message', function (this: Window, e: MessageEvent) {
    if (typeof e.data == 'string' && e.data.startsWith('setImmediate')) return;
    const payload = serialize(e.data);
    const record: ExtensionPostMessage = {
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
      ...scoreMessage(payload.text, e.origin, window.location.href),
    };
    emit(record);
    // Mark this payload's strings as tainted so the sink hooks can confirm a flow.
    try {
      registerTaint(e.data, record.id);
    } catch (err) {
      /* exotic payload */
    }
  });

  /* ---------- listener registration sites ---------- */

  const nativeAddEventListener = window.addEventListener;

  function reportListener(listener, wrappers: string[], stack: SourceLocation[], target: Window) {
    const source = safeToString(listener);
    const bound = NATIVE_SOURCE.test(source);
    const record: ExtensionListenerMessage = {
      id: uid('lsn'),
      time: Date.now(),
      stack: stack[0] ? stack[0].raw : '',
      source: stack[0],
      stackFrames: stack,
      frame: getFrameName(target),
      origin: window.location.href,
      listener: source,
      wrappers: wrappers.length ? wrappers : undefined,
      bound: bound || undefined,
      ...scoreListener(source),
    };
    emit(record);
  }

  function captureListener(rawListener, stack: SourceLocation[], target: Window) {
    const outerSource = safeToString(rawListener);

    // jQuery only registers its dispatcher here; the real handlers land in its
    // data store a tick later, so read them after the current task.
    const jquery = jqueryHandlers(rawListener);
    if (jquery) {
      setTimeout(function () {
        const handlers = jqueryHandlers(rawListener) || [];
        if (handlers.length === 0) {
          reportListener(rawListener, [], stack, target);
          return;
        }
        for (let i = 0; i < handlers.length; i++) {
          const unwrapped = unwrapListener(handlers[i]);
          const record = ['jQuery'].concat(unwrapped.wrappers);
          reportListenerWithSource(unwrapped.fn, record, outerSource, stack, target);
        }
      }, 0);
      return;
    }

    const unwrapped = unwrapListener(rawListener);
    if (unwrapped.wrappers.length) {
      reportListenerWithSource(unwrapped.fn, unwrapped.wrappers, outerSource, stack, target);
    } else {
      reportListener(rawListener, [], stack, target);
    }
  }

  function reportListenerWithSource(listener, wrappers: string[], wrapperSource: string, stack, target: Window) {
    const source = safeToString(listener);
    const record: ExtensionListenerMessage = {
      id: uid('lsn'),
      time: Date.now(),
      stack: stack[0] ? stack[0].raw : '',
      source: stack[0],
      stackFrames: stack,
      frame: getFrameName(target),
      origin: window.location.href,
      listener: source,
      wrappers: wrappers,
      wrapperSource: wrapperSource,
      bound: NATIVE_SOURCE.test(source) || undefined,
      ...scoreListener(source),
    };
    emit(record);
  }

  function hookedAddEventListener(this: Window, type, listener) {
    if (type === 'message' && listener != undefined && typeof listener == 'function') {
      try {
        captureListener(listener, captureStack(), this || window);
      } catch (e) {
        /* never break the page */
      }
    }
    // eslint-disable-next-line prefer-rest-params
    return nativeAddEventListener.apply(this || window, arguments);
  }

  try {
    Window.prototype.addEventListener = hookedAddEventListener;
  } catch (e) {
    /* frozen prototype */
  }
  try {
    window.addEventListener = hookedAddEventListener;
  } catch (e) {
    /* non-writable own property */
  }
})();
