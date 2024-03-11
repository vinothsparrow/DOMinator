import { ExtensionPostMessage, ExtensionListenerMessage } from '@root/src/shared/types/message';

(function () {
  'use strict';

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
      /* empty */
    }
    return frameName;
  }

  function sendMessage(message: ExtensionPostMessage | ExtensionListenerMessage) {
    const trackEvent = new CustomEvent('DOMinator-SendMessage', { detail: message });
    window.dispatchEvent(trackEvent);
  }

  window.addEventListener('message', function (this: Window, e: MessageEvent) {
    if (typeof e.data == 'string' && e.data.startsWith('setImmediate')) return;
    const message: ExtensionPostMessage = {
      isTop: isTop(),
      from: e.origin,
      fromFrame: getFrameName(e.source),
      toFrame: getFrameName(this.window),
      to: window.location.href,
      message: typeof e.data == 'string' ? e.data : '[object] ' + JSON.stringify(e.data),
    };
    sendMessage(message);
  });

  const oldListener = Window.prototype.addEventListener;

  function getStack(): string {
    const offset = 3;
    let stackStr = '';
    try {
      throw new Error('');
    } catch (error) {
      stackStr = error.stack || '';
    }
    const stack = stackStr.split('\n').map(function (line) {
      return line.trim();
    });
    return stack[offset];
  }

  Window.prototype.addEventListener = function (type, listener) {
    if (type === 'message' && listener != undefined && typeof listener == 'function') {
      const stack = getStack();
      const message: ExtensionListenerMessage = {
        stack: stack,
        frame: getFrameName(this.window),
        origin: window.location.href,
        listener: listener.toString(),
      };
      sendMessage(message);
    }
    // eslint-disable-next-line prefer-rest-params
    return oldListener.apply(this, arguments);
  };
})();
