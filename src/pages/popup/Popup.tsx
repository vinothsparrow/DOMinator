import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Braces,
  Download,
  Inbox,
  RotateCcw,
  Search,
  ShieldAlert,
  SquareDashedBottomCode,
} from 'lucide-react';
import withSuspense from '@src/shared/hoc/withSuspense';
import withErrorBoundary from '@src/shared/hoc/withErrorBoundary';
import { useDominator } from '@src/shared/hooks/useDominator';
import { cn } from '@src/lib/utils';
import {
  collectFrames,
  countRisky,
  downloadJson,
  hostOf,
  listenerHaystack,
  listenerInFrame,
  matchesQuery,
  messageHaystack,
  messageInFrame,
  RISK_ORDER,
} from '@src/shared/lib/format';
import { EmptyState, StatCard } from '@src/components/dominator/primitives';
import { ListenerItem, MessageItem } from '@src/components/dominator/items';
import { ThemeToggle } from '@src/components/dominator/ThemeToggle';
import { Brand } from '@src/components/dominator/Brand';
import { FrameSelect } from '@src/components/dominator/FrameSelect';

type Tab = 'messages' | 'listeners';
type Direction = 'all' | 'sent' | 'received';

const directionFilters: { value: Direction; label: string; icon?: typeof ArrowUpRight }[] = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent', icon: ArrowUpRight },
  { value: 'received', label: 'Received', icon: ArrowDownLeft },
];

const Popup = () => {
  const { messages, listeners, url, connected, clear } = useDominator('popup');
  const [tab, setTab] = useState<Tab>('messages');
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<Direction>('all');
  const [riskyOnly, setRiskyOnly] = useState(false);
  const [frame, setFrame] = useState('');

  const riskyCount = countRisky(messages, listeners);
  const frames = useMemo(() => collectFrames(messages, listeners), [messages, listeners]);

  const visibleMessages = useMemo(() => {
    return messages
      .filter(message => direction === 'all' || message.direction === direction)
      .filter(message => messageInFrame(message, frame))
      .filter(message => !riskyOnly || message.risk === 'high')
      .filter(message => matchesQuery(messageHaystack(message), query))
      .slice()
      .reverse();
  }, [messages, direction, riskyOnly, query, frame]);

  const visibleListeners = useMemo(() => {
    return listeners
      .filter(listener => listenerInFrame(listener, frame))
      .filter(listener => !riskyOnly || listener.risk === 'high')
      .filter(listener => matchesQuery(listenerHaystack(listener), query))
      .slice()
      .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.time - a.time);
  }, [listeners, riskyOnly, query, frame]);

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b bg-gradient-to-r from-indigo-500/10 via-sky-500/5 to-transparent px-3 py-2.5">
        <Brand url={url} className="flex-1" />
        <span
          title={connected ? 'Listening to this tab' : 'Reconnecting…'}
          className={cn(
            'h-2 w-2 rounded-full',
            connected ? 'bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/20' : 'bg-amber-500',
          )}
        />
        <ThemeToggle />
      </header>

      <div className="flex gap-1.5 px-3 pt-2.5">
        <StatCard
          icon={Inbox}
          label="Messages"
          value={messages.length}
          active={tab === 'messages'}
          onClick={() => setTab('messages')}
        />
        <StatCard
          icon={Braces}
          label="Listeners"
          value={listeners.length}
          active={tab === 'listeners'}
          onClick={() => setTab('listeners')}
        />
        <StatCard
          icon={ShieldAlert}
          label="High risk"
          value={riskyCount}
          tone="danger"
          active={riskyOnly}
          onClick={() => setRiskyOnly(value => !value)}
        />
      </div>

      <div className="flex items-center gap-1.5 px-3 pb-2 pt-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={tab === 'messages' ? 'Filter payloads, origins, files…' : 'Filter listeners, sinks, files…'}
            className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-xs outline-none ring-offset-background transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="button"
          title="Clear captured data for this tab"
          onClick={clear}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Export capture as JSON"
          onClick={() => downloadJson(`dominator-${hostOf(url)}-${Date.now()}.json`, { url, messages, listeners })}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1 px-3 pb-2">
        <FrameSelect frames={frames} value={frame} onChange={setFrame} className="flex-1" />
        {tab === 'listeners' && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {visibleListeners.length}/{listeners.length}
          </span>
        )}
      </div>

      {tab === 'messages' && (
        <div className="flex items-center gap-1 px-3 pb-2">
          {directionFilters.map(filter => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setDirection(filter.value)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                direction === filter.value
                  ? 'border-primary/40 bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50',
              )}>
              {filter.icon && <filter.icon className="h-3 w-3" />}
              {filter.label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {visibleMessages.length}/{messages.length}
          </span>
        </div>
      )}

      <main className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {tab === 'messages' ? (
          visibleMessages.length > 0 ? (
            visibleMessages.map(message => <MessageItem key={message.id} message={message} />)
          ) : (
            <EmptyState
              icon={Inbox}
              title={messages.length ? 'No message matches the filter' : 'No postMessage traffic yet'}
              hint={
                messages.length
                  ? 'Loosen the search or switch the direction filter.'
                  : 'Reload the page with the extension enabled — every window.postMessage call and message event on this tab is captured with its file, line and column.'
              }
            />
          )
        ) : visibleListeners.length > 0 ? (
          visibleListeners.map(listener => <ListenerItem key={listener.id} listener={listener} />)
        ) : (
          <EmptyState
            icon={Braces}
            title={listeners.length ? 'No listener matches the filter' : 'No message listeners registered yet'}
            hint="Listeners registered before the page finished loading are captured too — reload the tab to see them all."
          />
        )}
      </main>

      <footer className="flex items-center gap-1.5 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        <SquareDashedBottomCode className="h-3 w-3" />
        Open DevTools → <span className="font-medium text-foreground">DOMinator</span> for the full table view.
      </footer>
    </div>
  );
};

export default withErrorBoundary(
  withSuspense(
    Popup,
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading…</div>,
  ),
  <div className="flex h-full items-center justify-center text-xs text-destructive">Something went wrong.</div>,
);
