import { ExtensionCommand, ExtensionCommandType } from '@src/shared/types/message';

const ports = {};
const tab_messages = {};
const tab_listeners = {};
let selectedTabId = -1;
const tab_push = {},
  tab_lasturl = {};

console.log('background loaded');
const MAX_MESSAGES = 100;

function storeMessage(tabId, message) {
  const result = tab_messages[tabId] ? tab_messages[tabId] : [];

  if (result.length == MAX_MESSAGES) {
    result.pop();
  }
  result.push(message);
  tab_messages[tabId] = result;
}

function clearMessages(tabId) {
  tab_messages[tabId] && delete tab_messages[tabId];
}

function storeListener(tabId, listener) {
  const result = tab_listeners[tabId] ? tab_listeners[tabId] : [];

  if (result.length == MAX_MESSAGES) {
    result.pop();
  }
  result.push(listener);
  tab_listeners[tabId] = result;
}

function clearListeners(tabId) {
  tab_listeners[tabId] && delete tab_listeners[tabId];
}

function refreshBadgeCount() {
  const msgCount = tab_messages[selectedTabId] ? tab_messages[selectedTabId].length : 0;
  const listenerCount = tab_listeners[selectedTabId] ? tab_listeners[selectedTabId].length : 0;
  console.log(msgCount, listenerCount);
  chrome.tabs.get(selectedTabId, function () {
    if (msgCount == MAX_MESSAGES) {
      chrome.action.setBadgeText({ text: MAX_MESSAGES.toString() + '+', tabId: selectedTabId });
    } else {
      chrome.action.setBadgeText({ text: '' + msgCount, tabId: selectedTabId });
    }
    if (listenerCount > 0) {
      chrome.action.setBadgeBackgroundColor({ color: [169, 169, 169, 255] });
    } else {
      chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
    }
  });
}

chrome.runtime.onConnect.addListener(function (port) {
  const extensionListener = function (message, port: chrome.runtime.Port) {
    // The original connection event doesn't include the tab ID of the
    // DevTools page, so we need to send it explicitly.
    if (port.name === 'devtools' && message.name === 'init') {
      ports[message.tabId] = port;
      const messages = tab_messages[message.tabId] ? tab_messages[message.tabId] : [];
      const listeners = tab_listeners[message.tabId] ? tab_listeners[message.tabId] : [];
      const msg: ExtensionCommand = {
        command: ExtensionCommandType.initial,
        messages: messages,
        listeners: listeners,
      };
      port.postMessage(msg);
      return;
    } else if (port.name === 'devtools' && message.name === 'fetch') {
      const messages = tab_messages[message.tabId] ? tab_messages[message.tabId] : [];
      const listeners = tab_listeners[message.tabId] ? tab_listeners[message.tabId] : [];
      const msg: ExtensionCommand = {
        command: ExtensionCommandType.initial,
        messages: messages,
        listeners: listeners,
      };
      port.postMessage(msg);
      return;
    }
    // other message handling
  };
  // Listen to messages sent from the DevTools page
  port.onMessage.addListener(extensionListener);

  port.onDisconnect.addListener(function (port) {
    port.onMessage.removeListener(extensionListener);

    const tabs = Object.keys(ports);
    for (let i = 0, len = tabs.length; i < len; i++) {
      if (ports[tabs[i]] == port) {
        delete ports[tabs[i]];
        break;
      }
    }
  });
});

// Receive message from content script and relay to the devTools page for the
// current tab
chrome.runtime.onMessage.addListener(function (request, sender: chrome.runtime.MessageSender) {
  // Messages from content scripts should have sender.tab set
  if (sender.tab) {
    const tabId = sender.tab.id;
    if (request && Object.hasOwn(request, 'stack')) {
      storeListener(tabId, request);
      if (tabId in ports) {
        ports[tabId].postMessage(request);
      }
    } else if (request && Object.hasOwn(request, 'message')) {
      storeMessage(tabId, request);
      if (tabId in ports) {
        ports[tabId].postMessage(request);
      }
    }
  } else {
    console.log('sender.tab not defined.');
  }
  refreshBadgeCount();
  return true;
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  selectedTabId = activeInfo.tabId;
  // chrome.tabs.get(activeInfo.tabId, function(tab){
  // });
  refreshBadgeCount();
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  clearMessages(tabId);
  clearListeners(tabId);
  clearMessages(tabId);
  clearListeners(tabId);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status == 'complete') {
    if (tabId == selectedTabId) {
      refreshBadgeCount();
    }
  } else if (changeInfo.status) {
    if (tab_push[tabId]) {
      delete tab_push[tabId];
    } else {
      if (!tab_lasturl[tabId]) {
        const msg: ExtensionCommand = {
          command: ExtensionCommandType.reload,
        };
        ports[tabId] && ports[tabId].postMessage(msg);
        clearMessages(tabId);
        clearListeners(tabId);
      }
    }
  }
  if (changeInfo.status == 'loading') tab_lasturl[tabId] = true;
});

chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  selectedTabId = tabs[0].id;
  refreshBadgeCount();
});

chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  selectedTabId = tabs[0].id;
  refreshBadgeCount();
});
