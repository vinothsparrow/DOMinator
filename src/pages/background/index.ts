import {
  ExtensionCommand,
  ExtensionCommandType,
  ExtensionListenerMessage,
  ExtensionPostMessage,
  SinkFlow,
} from '@src/shared/types/message';

const MAX_RECORDS = 500;
/** How long a send stays pairable with the receive it produced. */
const CORRELATION_WINDOW_MS = 3000;

/** Views (devtools panel, popup) listening to a tab. */
const tabPorts: Record<number, chrome.runtime.Port[]> = {};
const tabMessages: Record<number, ExtensionPostMessage[]> = {};
const tabListeners: Record<number, ExtensionListenerMessage[]> = {};
let selectedTabId = -1;

function cap<T>(list: T[], record: T): T[] {
  if (list.length >= MAX_RECORDS) list.shift();
  list.push(record);
  return list;
}

/** Give a received message the file:line of the send that produced it. */
function correlate(tabId: number, message: ExtensionPostMessage) {
  if (message.direction !== 'received' || message.source || !message.hash) return;
  const history = tabMessages[tabId];
  if (!history) return;
  for (let i = history.length - 1; i >= 0; i--) {
    const candidate = history[i];
    if (message.time - candidate.time > CORRELATION_WINDOW_MS) break;
    if (candidate.direction !== 'sent' || candidate.hash !== message.hash) continue;
    message.source = candidate.source;
    message.stack = candidate.stack;
    message.targetOrigin = candidate.targetOrigin;
    message.correlated = true;
    if (candidate.targetOrigin === '*' && message.flags.indexOf('wildcard target origin') === -1) {
      message.flags = message.flags.concat('wildcard target origin');
      if (message.risk === 'low') message.risk = 'medium';
    }
    return;
  }
}

function storeMessage(tabId: number, message: ExtensionPostMessage) {
  correlate(tabId, message);
  tabMessages[tabId] = cap(tabMessages[tabId] || [], message);
}

function storeListener(tabId: number, listener: ExtensionListenerMessage) {
  tabListeners[tabId] = cap(tabListeners[tabId] || [], listener);
}

/** Attach a confirmed sink flow to the message whose payload reached it. */
function storeFlow(tabId: number, flow: SinkFlow) {
  const messages = tabMessages[tabId];
  if (!messages) return;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].id !== flow.messageId) continue;
    const message = messages[i];
    message.flows = (message.flows || []).concat(flow);
    message.confirmed = true;
    message.risk = 'high';
    const flag = 'reached ' + flow.sink;
    if (message.flags.indexOf(flag) === -1) message.flags = message.flags.concat(flag);
    return;
  }
}

function clearTab(tabId: number) {
  delete tabMessages[tabId];
  delete tabListeners[tabId];
}

function broadcast(tabId: number, payload: unknown) {
  const ports = tabPorts[tabId];
  if (!ports) return;
  for (const port of ports) {
    try {
      port.postMessage(payload);
    } catch (e) {
      /* the view was closed */
    }
  }
}

function snapshot(tabId: number, url?: string): ExtensionCommand {
  return {
    command: ExtensionCommandType.initial,
    messages: tabMessages[tabId] || [],
    listeners: tabListeners[tabId] || [],
    url,
  };
}

function refreshBadgeCount() {
  if (selectedTabId < 0) return;
  const messages = tabMessages[selectedTabId] || [];
  const listeners = tabListeners[selectedTabId] || [];
  const risky = messages.filter(m => m.risk === 'high').length + listeners.filter(l => l.risk === 'high').length;
  chrome.tabs.get(selectedTabId, function () {
    if (chrome.runtime.lastError) return;
    const text = messages.length >= MAX_RECORDS ? MAX_RECORDS + '+' : messages.length ? String(messages.length) : '';
    chrome.action.setBadgeText({ text, tabId: selectedTabId });
    chrome.action.setBadgeBackgroundColor({
      color: risky > 0 ? [220, 38, 38, 255] : [79, 70, 229, 255],
      tabId: selectedTabId,
    });
  });
}

chrome.runtime.onConnect.addListener(function (port) {
  let boundTabId = -1;

  const extensionListener = function (message: { name: string; tabId: number }) {
    if (!message || typeof message.tabId !== 'number') return;
    const tabId = message.tabId;

    if (message.name === 'init') {
      boundTabId = tabId;
      const ports = tabPorts[tabId] || (tabPorts[tabId] = []);
      if (ports.indexOf(port) === -1) ports.push(port);
      chrome.tabs.get(tabId, function (tab) {
        port.postMessage(snapshot(tabId, chrome.runtime.lastError ? undefined : tab?.url));
      });
    } else if (message.name === 'fetch') {
      port.postMessage(snapshot(tabId));
    } else if (message.name === 'clear') {
      clearTab(tabId);
      broadcast(tabId, snapshot(tabId));
      refreshBadgeCount();
    }
  };

  port.onMessage.addListener(extensionListener);

  port.onDisconnect.addListener(function () {
    port.onMessage.removeListener(extensionListener);
    const ports = tabPorts[boundTabId];
    if (!ports) return;
    const index = ports.indexOf(port);
    if (index > -1) ports.splice(index, 1);
    if (ports.length === 0) delete tabPorts[boundTabId];
  });
});

// Relay records coming from the page into every view watching that tab.
chrome.runtime.onMessage.addListener(function (request, sender: chrome.runtime.MessageSender) {
  if (!sender.tab || !request) return true;
  const tabId = sender.tab.id;
  if (Object.hasOwn(request, 'sink')) {
    storeFlow(tabId, request);
    broadcast(tabId, request);
  } else if (Object.hasOwn(request, 'listener')) {
    storeListener(tabId, request);
    broadcast(tabId, request);
  } else if (Object.hasOwn(request, 'message')) {
    storeMessage(tabId, request);
    broadcast(tabId, request);
  }
  refreshBadgeCount();
  return true;
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  selectedTabId = activeInfo.tabId;
  refreshBadgeCount();
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  clearTab(tabId);
  delete tabPorts[tabId];
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  // `loading` means a new document is committing in the main frame, so the
  // records of the previous one are stale. SPA history changes do not fire it.
  if (changeInfo.status === 'loading') {
    clearTab(tabId);
    broadcast(tabId, { command: ExtensionCommandType.reload } as ExtensionCommand);
  }
  if (tabId === selectedTabId) refreshBadgeCount();
});

chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  if (tabs[0]) selectedTabId = tabs[0].id;
  refreshBadgeCount();
});
