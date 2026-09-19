window.addEventListener('DOMinator-SendMessage', function (event: CustomEvent) {
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage(event.detail);
  }
});

function dispatchCommand(payload: unknown) {
  try {
    window.dispatchEvent(new CustomEvent('DOMinator-Command', { detail: payload }));
  } catch {
    /* the page realm may have been replaced */
  }
}

chrome.runtime.onMessage.addListener(message => {
  if (!message || message.name !== 'dominator-command') return;
  dispatchCommand(message.payload);
});

const CONFIG_KEY = 'dominator-instrumentation';

function pushConfig() {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(CONFIG_KEY, result => {
    dispatchCommand({ op: 'config', config: result[CONFIG_KEY] || {} });
  });
}

chrome.storage?.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[CONFIG_KEY]) {
    dispatchCommand({ op: 'config', config: changes[CONFIG_KEY].newValue || {} });
  }
});

pushConfig();

const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/pages/contentUI/index.js');
(document.head || document.documentElement).appendChild(script);
script.addEventListener('load', pushConfig);
