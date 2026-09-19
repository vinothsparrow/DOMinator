import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClobberRecord,
  ExtensionCommand,
  ExtensionCommandType,
  ExtensionListenerMessage,
  ExtensionPostMessage,
  InterceptRequest,
  ListenerHit,
  PollutionRecord,
  SessionDump,
  SinkFlow,
} from '@src/shared/types/message';
import { isEmptyMessage } from '@src/shared/lib/format';

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

function patchById<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] {
  return list.map(item => (item.id === id ? { ...item, ...patch } : item));
}

/**
 * Opens one long-lived port to the background worker for the inspected tab and
 * keeps the captured postMessages / listeners in sync with it.
 */
export function useDominator(portName = 'client') {
  const [messages, setMessages] = useState<ExtensionPostMessage[]>([]);
  const [listeners, setListeners] = useState<ExtensionListenerMessage[]>([]);
  const [intercepts, setIntercepts] = useState<InterceptRequest[]>([]);
  const [pollutions, setPollutions] = useState<PollutionRecord[]>([]);
  const [clobbers, setClobbers] = useState<ClobberRecord[]>([]);
  const [url, setUrl] = useState<string>('');
  const [tabId, setTabId] = useState<number>(-1);
  const [connected, setConnected] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    let disposed = false;

    const handle = (
      payload:
        | ExtensionCommand
        | ExtensionPostMessage
        | ExtensionListenerMessage
        | SinkFlow
        | InterceptRequest
        | ListenerHit
        | PollutionRecord
        | ClobberRecord
        | { kind: string; id?: string; patch?: Partial<ExtensionListenerMessage> },
    ) => {
      if (!payload) return;
      if (Object.hasOwn(payload, 'command')) {
        const command = payload as ExtensionCommand;
        if (command.command === ExtensionCommandType.initial) {
          setMessages((command.messages ?? []).filter(message => !isEmptyMessage(message)));
          setListeners(command.listeners ?? []);
          setIntercepts(command.intercepts ?? []);
          setPollutions(command.pollutions ?? []);
          setClobbers(command.clobbers ?? []);
          if (command.url) setUrl(command.url);
        } else if (command.command === ExtensionCommandType.reload) {
          setMessages([]);
          setListeners([]);
          setIntercepts([]);
          setPollutions([]);
          setClobbers([]);
        }
        return;
      }

      const kind = (payload as { kind?: string }).kind;
      if (kind === 'flow' || (Object.hasOwn(payload, 'sink') && kind !== 'message')) {
        const flow = payload as SinkFlow;
        setMessages(current =>
          current.map(message => {
            if (message.id !== flow.messageId) return message;
            const flag = flow.blocked ? 'blocked ' + flow.sink : 'reached ' + flow.sink;
            return {
              ...message,
              flows: (message.flows || []).concat(flow),
              confirmed: true,
              risk: 'high',
              flags: message.flags.indexOf(flag) === -1 ? message.flags.concat(flag) : message.flags,
            };
          }),
        );
        return;
      }
      if (kind === 'intercept') {
        setIntercepts(current => append(current, payload as InterceptRequest));
        return;
      }
      if (kind === 'intercept-clear') {
        const id = (payload as { id?: string }).id;
        setIntercepts(current => current.filter(item => item.id !== id));
        return;
      }
      if (kind === 'listener-hit') {
        const hit = payload as ListenerHit;
        setListeners(current =>
          current.map(listener =>
            listener.id === hit.listenerId
              ? { ...listener, hitCount: (listener.hitCount || 0) + 1, lastHit: hit.time }
              : listener,
          ),
        );
        setMessages(current => {
          for (let i = current.length - 1; i >= 0; i--) {
            if (current[i].direction !== 'received') continue;
            if (hit.time - current[i].time > 2000) break;
            const hits = current[i].listenerHits || [];
            if (hits.indexOf(hit.listenerId) !== -1) return current;
            const next = current.slice();
            next[i] = { ...current[i], listenerHits: hits.concat(hit.listenerId) };
            return next;
          }
          return current;
        });
        return;
      }
      if (kind === 'listener-update') {
        const update = payload as { id: string; patch?: Partial<ExtensionListenerMessage> };
        if (update.id) setListeners(current => patchById(current, update.id, update.patch || {}));
        return;
      }
      if (kind === 'pollution') {
        setPollutions(current => append(current, payload as PollutionRecord));
        return;
      }
      if (kind === 'clobber') {
        setClobbers(current => append(current, payload as ClobberRecord));
        return;
      }
      if (kind === 'listener' || Object.hasOwn(payload, 'listener')) {
        setListeners(current => append(current, payload as ExtensionListenerMessage));
        return;
      }
      if (kind === 'message' || Object.hasOwn(payload, 'message')) {
        const message = payload as ExtensionPostMessage;
        if (isEmptyMessage(message)) return;
        setMessages(current => append(current, message));
      }
    };

    const connect = (id: number) => {
      if (disposed) return;
      const port = chrome.runtime.connect({ name: portName });
      portRef.current = port;
      port.onMessage.addListener(handle);
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
    setIntercepts([]);
    setPollutions([]);
    setClobbers([]);
    portRef.current?.postMessage({ name: 'clear', tabId });
  }, [tabId]);

  const refresh = useCallback(() => {
    if (tabId < 0) return;
    portRef.current?.postMessage({ name: 'fetch', tabId });
  }, [tabId]);

  const resolveIntercept = useCallback(
    (interceptId: string, action: 'deliver' | 'drop' | 'edit', extra?: { origin?: string; data?: string; mode?: 'json' | 'text' }) => {
      if (tabId < 0) return;
      setIntercepts(current => current.filter(item => item.id !== interceptId));
      portRef.current?.postMessage({
        name: 'intercept-resolve',
        tabId,
        interceptId,
        action,
        origin: extra?.origin,
        data: extra?.data,
        mode: extra?.mode,
      });
    },
    [tabId],
  );

  const importSession = useCallback(
    (dump: SessionDump) => {
      if (tabId < 0) return;
      setMessages(dump.messages || []);
      setListeners(dump.listeners || []);
      setPollutions(dump.pollutions || []);
      setClobbers(dump.clobbers || []);
      setIntercepts([]);
      if (dump.url) setUrl(dump.url);
      portRef.current?.postMessage({
        name: 'import',
        tabId,
        messages: dump.messages,
        listeners: dump.listeners,
        pollutions: dump.pollutions,
        clobbers: dump.clobbers,
      });
    },
    [tabId],
  );

  return {
    messages,
    listeners,
    intercepts,
    pollutions,
    clobbers,
    url,
    tabId,
    connected,
    clear,
    refresh,
    resolveIntercept,
    importSession,
  };
}
