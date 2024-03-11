window.addEventListener('DOMinator-SendMessage', function (event: CustomEvent) {
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage(event.detail);
  }
});

const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/pages/contentUI/index.js');
(document.head || document.documentElement).appendChild(script);
