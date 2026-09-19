import {
  ClobberRecord,
  ExtensionCommand,
  ExtensionCommandType,
  ExtensionListenerMessage,
  ExtensionPostMessage,
  InterceptRequest,
  ListenerHit,
  PollutionRecord,
  SinkFlow,
} from '@src/shared/types/message';
import { isEmptyMessage } from '@src/shared/lib/format';
import { watchExclusions } from './registration';

const MAX_RECORDS = 500;
/** How long a send stays pairable with the receive it produced. */
const CORRELATION_WINDOW_MS = 3000;
const SESSION_PREFIX = 'dominator-tab-';

type TabState = {
  messages: ExtensionPostMessage[];
  listeners: ExtensionListenerMessage[];
  intercepts: InterceptRequest[];
  pollutions: PollutionRecord[];
  clobbers: ClobberRecord[];
};

/** Views (devtools panel, popup) listening to a tab. */
const tabPorts: Record<number, chrome.runtime.Port[]> = {};
const tabs: Record<number, TabState> = {};
let selectedTabId = -1;

function emptyState(): TabState {
  return { messages: [], listeners: [], intercepts: [], pollutions: [], clobbers: [] };
}

function state(tabId: number): TabState {
  return tabs[tabId] || (tabs[tabId] = emptyState());
}

function cap<T>(list: T[], record: T): T[] {
  if (list.length >= MAX_RECORDS) list.shift();
  list.push(record);
  return list;
}

function persist(tabId: number) {
  const store = chrome.storage?.session;
  if (!store) return;
  const snapshot = tabs[tabId];
  try {
    if (!snapshot) {
      store.remove(SESSION_PREFIX + tabId);
      return;
    }
    store.set({ [SESSION_PREFIX + tabId]: snapshot });
  } catch {
    /* quota / session storage missing */
  }
}

function restore(tabId: number): Promise<TabState> {
  if (tabs[tabId]) return Promise.resolve(tabs[tabId]);
  const store = chrome.storage?.session;
  if (!store) return Promise.resolve(state(tabId));
  return store.get(SESSION_PREFIX + tabId).then(result => {
    const saved = result[SESSION_PREFIX + tabId] as TabState | undefined;
    if (saved && !tabs[tabId]) {
      tabs[tabId] = {
        messages: saved.messages || [],
        listeners: saved.listeners || [],
        intercepts: saved.intercepts || [],
        pollutions: saved.pollutions || [],
        clobbers: saved.clobbers || [],
      };
    }
    return state(tabId);
  });
}

/** Give a received message the file:line of the send that produced it. */
function correlate(tabId: number, message: ExtensionPostMessage) {
  if (message.direction !== 'received' || message.source || !message.hash) return;
  const history = state(tabId).messages;
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
  if (isEmptyMessage(message)) return;
  message.kind = 'message';
  correlate(tabId, message);
  state(tabId).messages = cap(state(tabId).messages, message);
}

function storeListener(tabId: number, listener: ExtensionListenerMessage) {
  listener.kind = listener.kind || 'listener';
  if (!listener.originCheck) listener.originCheck = listener.checksOrigin ? 'strict' : 'none';
  const list = state(tabId).listeners;
  if (listener.fingerprint) {
    const existing = list.find(item => item.fingerprint === listener.fingerprint && !item.removed);
    if (existing) {
      existing.seen = (existing.seen || 1) + 1;
      existing.time = listener.time;
      existing.id = existing.id || listener.id;
      broadcast(tabId, { kind: 'listener-update', id: existing.id, patch: { seen: existing.seen, time: existing.time } });
      persist(tabId);
      return 'deduped';
    }
  }
  state(tabId).listeners = cap(list, listener);
  return 'stored';
}

function patchListener(tabId: number, id: string, patch: Partial<ExtensionListenerMessage>) {
  const listener = state(tabId).listeners.find(item => item.id === id);
  if (!listener) return null;
  Object.assign(listener, patch);
  return listener;
}

function storeFlow(tabId: number, flow: SinkFlow) {
  const messages = state(tabId).messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].id !== flow.messageId) continue;
    const message = messages[i];
    message.flows = (message.flows || []).concat(flow);
    message.confirmed = true;
    message.risk = 'high';
    const flag = flow.blocked ? 'blocked ' + flow.sink : 'reached ' + flow.sink;
    if (message.flags.indexOf(flag) === -1) message.flags = message.flags.concat(flag);
    if (message.listenerHits) {
      for (const listenerId of message.listenerHits) {
        const listener = patchListener(tabId, listenerId, {});
        if (listener) listener.confirmedCount = (listener.confirmedCount || 0) + 1;
      }
    }
    return;
  }
}

function storeHit(tabId: number, hit: ListenerHit) {
  const listener = patchListener(tabId, hit.listenerId, {});
  if (listener) {
    listener.hitCount = (listener.hitCount || 0) + 1;
    listener.lastHit = hit.time;
  }
  const messages = state(tabId).messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.direction !== 'received') continue;
    if (hit.time - message.time > 2000) break;
    message.listenerHits = message.listenerHits || [];
    if (message.listenerHits.indexOf(hit.listenerId) === -1) message.listenerHits.push(hit.listenerId);
    break;
  }
}

function storeIntercept(tabId: number, request: InterceptRequest, frameId?: number) {
  (request as InterceptRequest & { frameId?: number }).frameId = frameId;
  state(tabId).intercepts = cap(state(tabId).intercepts, request);
}

function clearTab(tabId: number) {
  delete tabs[tabId];
  persist(tabId);
}

function broadcast(tabId: number, payload: unknown) {
  const ports = tabPorts[tabId];
  if (!ports) return;
  for (const port of ports) {
    try {
      port.postMessage(payload);
    } catch {
      /* the view was closed */
    }
  }
}

function snapshot(tabId: number, url?: string): ExtensionCommand {
  const current = tabs[tabId] || emptyState();
  return {
    command: ExtensionCommandType.initial,
    messages: current.messages.filter(message => !isEmptyMessage(message)),
    listeners: current.listeners,
    intercepts: current.intercepts,
    pollutions: current.pollutions,
    clobbers: current.clobbers,
    url,
  };
}

function refreshBadgeCount() {
  if (selectedTabId < 0) return;
  const current = tabs[selectedTabId] || emptyState();
  const messages = current.messages.filter(message => !isEmptyMessage(message));
  const risky =
    messages.filter(m => m.risk === 'high').length + current.listeners.filter(l => l.risk === 'high').length;
  chrome.tabs.get(selectedTabId, function () {
    if (chrome.runtime.lastError) return;
    const text =
      messages.length >= MAX_RECORDS ? MAX_RECORDS + '+' : messages.length ? String(messages.length) : '';
    chrome.action.setBadgeText({ text, tabId: selectedTabId });
    chrome.action.setBadgeBackgroundColor({
      color: risky > 0 ? [220, 38, 38, 255] : [79, 70, 229, 255],
      tabId: selectedTabId,
    });
  });
}

function sendToFrame(tabId: number, payload: unknown, frameId?: number) {
  const message = { name: 'dominator-command', payload };
  const send = (options?: chrome.tabs.MessageSendOptions) => {
    try {
      chrome.tabs.sendMessage(tabId, message, options || {}, () => void chrome.runtime.lastError);
    } catch {
      /* tab gone */
    }
  };
  if (typeof frameId === 'number') send({ frameId });
  else send();
}

chrome.runtime.onConnect.addListener(function (port) {
  let boundTabId = -1;

  const extensionListener = function (message: {
    name: string;
    tabId: number;
    interceptId?: string;
    action?: 'deliver' | 'drop' | 'edit';
    origin?: string;
    data?: string;
    mode?: 'json' | 'text';
    messages?: ExtensionPostMessage[];
    listeners?: ExtensionListenerMessage[];
    pollutions?: PollutionRecord[];
    clobbers?: ClobberRecord[];
  }) {
    if (!message || typeof message.tabId !== 'number') return;
    const tabId = message.tabId;

    if (message.name === 'init') {
      boundTabId = tabId;
      const ports = tabPorts[tabId] || (tabPorts[tabId] = []);
      if (ports.indexOf(port) === -1) ports.push(port);
      restore(tabId).then(() => {
        chrome.tabs.get(tabId, function (tab) {
          port.postMessage(snapshot(tabId, chrome.runtime.lastError ? undefined : tab?.url));
        });
      });
    } else if (message.name === 'fetch') {
      port.postMessage(snapshot(tabId));
    } else if (message.name === 'clear') {
      clearTab(tabId);
      broadcast(tabId, snapshot(tabId));
      refreshBadgeCount();
    } else if (message.name === 'import') {
      const next = state(tabId);
      next.messages = message.messages || [];
      next.listeners = message.listeners || [];
      next.pollutions = message.pollutions || [];
      next.clobbers = message.clobbers || [];
      next.intercepts = [];
      persist(tabId);
      broadcast(tabId, snapshot(tabId));
      refreshBadgeCount();
    } else if (message.name === 'intercept-resolve') {
      const current = state(tabId);
      const pending = current.intercepts.find(item => item.id === message.interceptId);
      current.intercepts = current.intercepts.filter(item => item.id !== message.interceptId);
      sendToFrame(
        tabId,
        {
          op: 'intercept-resolve',
          id: message.interceptId,
          action: message.action,
          origin: message.origin,
          data: message.data,
          mode: message.mode,
        },
        (pending as InterceptRequest & { frameId?: number })?.frameId,
      );
      broadcast(tabId, { kind: 'intercept-clear', id: message.interceptId });
      persist(tabId);
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

function kindOf(request): string {
  if (!request) return '';
  if (request.kind) return request.kind;
  if (Object.hasOwn(request, 'sink')) return 'flow';
  if (Object.hasOwn(request, 'listener') && typeof request.listener === 'string') return 'listener';
  if (Object.hasOwn(request, 'message')) return 'message';
  return '';
}

// Relay records coming from the page into every view watching that tab.
chrome.runtime.onMessage.addListener(function (request, sender: chrome.runtime.MessageSender) {
  if (!sender.tab || !request) return true;
  const tabId = sender.tab.id;
  const kind = kindOf(request);
  if (kind === 'flow') {
    storeFlow(tabId, request);
    broadcast(tabId, request);
  } else if (kind === 'listener') {
    if (storeListener(tabId, request) === 'stored') broadcast(tabId, request);
  } else if (kind === 'listener-update') {
    patchListener(tabId, request.id, request.patch || {});
    broadcast(tabId, request);
  } else if (kind === 'listener-hit') {
    storeHit(tabId, request);
    broadcast(tabId, request);
  } else if (kind === 'intercept') {
    storeIntercept(tabId, request, sender.frameId);
    broadcast(tabId, request);
  } else if (kind === 'pollution') {
    state(tabId).pollutions = cap(state(tabId).pollutions, request);
    broadcast(tabId, request);
  } else if (kind === 'clobber') {
    state(tabId).clobbers = cap(state(tabId).clobbers, request);
    broadcast(tabId, request);
  } else if (kind === 'message') {
    storeMessage(tabId, request);
    broadcast(tabId, request);
  }
  persist(tabId);
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

chrome.tabs.query({ active: true, currentWindow: true }, function (tabsQuery) {
  if (tabsQuery[0]) selectedTabId = tabsQuery[0].id;
  refreshBadgeCount();
});

watchExclusions();
