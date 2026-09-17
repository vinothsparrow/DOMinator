import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExtensionCommand,
  ExtensionCommandType,
  ExtensionListenerMessage,
  ExtensionPostMessage,
  SinkFlow,
} from '@src/shared/types/message';

const MAX_RECORDS = 500;

/** The devtools panel knows its tab; the popup has to ask for the active one. */
function resolveTabId(): Promise<number> {
  const inspected = chrome.devtools?.inspectedWindow?.tabId;
  if (typeof inspected === 'number') return Promise.resolve(inspected);
  return chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0]?.id ?? -1);
}

function append<T>(list: T[], record: T): T[] {
  const next = list.length >= MAX_RECORDS ? list.slice(1) : list.slice();
  next.push(record);
  return next;
}

/**
 * Opens one long-lived port to the background worker for the inspected tab and
 * keeps the captured postMessages / listeners in sync with it.
 */
export function useDominator(portName = 'client') {
  const [messages, setMessages] = useState<ExtensionPostMessage[]>([]);
  const [listeners, setListeners] = useState<ExtensionListenerMessage[]>([]);
  const [url, setUrl] = useState<string>('');
  const [tabId, setTabId] = useState<number>(-1);
  const [connected, setConnected] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    let disposed = false;

    const handle = (payload: ExtensionCommand | ExtensionPostMessage | ExtensionListenerMessage | SinkFlow) => {
      if (!payload) return;
      if (Object.hasOwn(payload, 'command')) {
        const command = payload as ExtensionCommand;
        if (command.command === ExtensionCommandType.initial) {
          setMessages(command.messages ?? []);
          setListeners(command.listeners ?? []);
          if (command.url) setUrl(command.url);
        } else if (command.command === ExtensionCommandType.reload) {
          setMessages([]);
          setListeners([]);
        }
      } else if (Object.hasOwn(payload, 'sink')) {
        // Confirmed source-to-sink flow: fold it into the message it came from.
        const flow = payload as SinkFlow;
        setMessages(current =>
          current.map(message => {
            if (message.id !== flow.messageId) return message;
            const flag = 'reached ' + flow.sink;
            return {
              ...message,
              flows: (message.flows || []).concat(flow),
              confirmed: true,
              risk: 'high',
              flags: message.flags.indexOf(flag) === -1 ? message.flags.concat(flag) : message.flags,
            };
          }),
        );
      } else if (Object.hasOwn(payload, 'listener')) {
        setListeners(current => append(current, payload as ExtensionListenerMessage));
      } else if (Object.hasOwn(payload, 'message')) {
        setMessages(current => append(current, payload as ExtensionPostMessage));
      }
    };

    const connect = (id: number) => {
      if (disposed) return;
      const port = chrome.runtime.connect({ name: portName });
      portRef.current = port;
      port.onMessage.addListener(handle);
      // The service worker can be evicted; reconnect and resync when it is.
      port.onDisconnect.addListener(() => {
        portRef.current = null;
        setConnected(false);
        if (!disposed) setTimeout(() => connect(id), 500);
      });
      port.postMessage({ name: 'init', tabId: id });
      setConnected(true);
    };

    resolveTabId().then(id => {
      if (disposed || id < 0) return;
      setTabId(id);
      connect(id);
    });

    return () => {
      disposed = true;
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, [portName]);

  const clear = useCallback(() => {
    if (tabId < 0) return;
    setMessages([]);
    setListeners([]);
    portRef.current?.postMessage({ name: 'clear', tabId });
  }, [tabId]);

  const refresh = useCallback(() => {
    if (tabId < 0) return;
    portRef.current?.postMessage({ name: 'fetch', tabId });
  }, [tabId]);

  return { messages, listeners, url, tabId, connected, clear, refresh };
}
