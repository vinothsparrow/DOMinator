(function () {
  'use strict';

  function isTop(): boolean {
    return window === window.parent;
  }

  function sendMessage(msg) {
    const trackEvent = new CustomEvent('DOMinator-SendMessage', { detail: msg });
    window.dispatchEvent(trackEvent);
  }

  window.addEventListener('message', function (this: Window, e: MessageEvent) {
    sendMessage({
      isTop: isTop(),
      isMessage: true,
      origin: e.origin,
      to: window.location.href,
      data: typeof e.data == 'string' ? e.data : '[object] ' + JSON.stringify(e.data),
    });
    console.log(
      '%c[DOMinator] %c' +
        e.origin +
        ' => ' +
        window.location.href +
        ' %c' +
        (typeof e.data == 'string' ? e.data : '[object] ' + JSON.stringify(e.data)),
      'color:red',
      '',
      'color: green',
    );
  });
})();
