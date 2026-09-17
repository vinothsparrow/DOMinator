import React, { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowDownLeft, ArrowUpRight, Crosshair, Frame, Inbox, Send, ShieldAlert, Target } from 'lucide-react';
import withSuspense from '@src/shared/hoc/withSuspense';
import withErrorBoundary from '@src/shared/hoc/withErrorBoundary';
import { useDominator } from '@src/shared/hooks/useDominator';
import { ExtensionPostMessage } from '@src/shared/types/message';
import { cn } from '@src/lib/utils';
import {
  collectFrames,
  countConfirmed,
  countRisky,
  downloadJson,
  formatSize,
  formatTime,
  hostOf,
  matchesQuery,
  messageHaystack,
  messageInFrame,
} from '@src/shared/lib/format';
import { canReplay } from '@src/shared/lib/replay';
import { Chip, EmptyState, RiskBadge, SourceLink } from '@src/components/dominator/primitives';
import { MessageDetails } from '@src/components/dominator/items';
import { FrameSelect } from '@src/components/dominator/FrameSelect';
import { ReplayDialog } from '@src/components/dominator/ReplayDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@src/components/ui/sheet';
import { DataTable } from './data-table';
import { FilterChip, PanelShell, PanelToolbar } from './PanelShell';

type Direction = 'all' | 'sent' | 'received';

interface MessageTableMeta {
  onReplay?: (message: ExtensionPostMessage) => void;
}

export const columns: ColumnDef<ExtensionPostMessage>[] = [
  {
    accessorKey: 'time',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Time',
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-muted-foreground">{formatTime(row.original.time)}</span>
    ),
  },
  {
    accessorKey: 'direction',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Dir',
    cell: ({ row }) => {
      const sent = row.original.direction === 'sent';
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-semibold uppercase',
            sent
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
              : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
          )}>
          {sent ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
          {sent ? 'sent' : 'recv'}
        </span>
      );
    },
  },
  {
    id: 'source',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Source (file:line:col)',
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <SourceLink source={row.original.source} />
        {row.original.correlated && <Chip title="Call site matched from the sending frame">via sender</Chip>}
      </div>
    ),
  },
  {
    accessorKey: 'from',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Source → Target',
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5 text-xs" title={`${row.original.from} → ${row.original.to}`}>
        <span className="max-w-[220px] truncate text-sky-600 dark:text-sky-400">{hostOf(row.original.from)}</span>
        <span className="max-w-[220px] truncate text-muted-foreground">→ {hostOf(row.original.to)}</span>
      </div>
    ),
  },
  {
    accessorKey: 'fromFrame',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Frame',
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <Chip title={`${row.original.fromFrame} → ${row.original.toFrame}`}>
          <Frame className="h-2.5 w-2.5" />
          {row.original.fromFrame} → {row.original.toFrame}
        </Chip>
        <Chip>
          {row.original.dataType} · {formatSize(row.original.size)}
        </Chip>
      </div>
    ),
  },
  {
    accessorKey: 'message',
    meta: { className: 'w-full' },
    header: 'Payload',
    cell: ({ row }) => (
      <span className="line-clamp-3 max-w-[520px] break-all font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
        {row.original.message || '(empty payload)'}
      </span>
    ),
  },
  {
    accessorKey: 'risk',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Risk',
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <RiskBadge risk={row.original.risk} />
        {row.original.confirmed && (
          <Chip className="border-red-500/40 bg-red-500/10 font-semibold text-red-600 dark:text-red-400">
            <Crosshair className="h-2.5 w-2.5" />
            confirmed
          </Chip>
        )}
        {row.original.flows?.slice(0, 2).map(flow => (
          <Chip
            key={flow.id}
            className="border-red-500/30 bg-red-500/10 font-mono text-red-600 dark:text-red-400"
            title={`Payload reached ${flow.sink}`}>
            <Target className="h-2.5 w-2.5" />
            {flow.sink}
          </Chip>
        ))}
        {row.original.flags
          .filter(flag => flag.indexOf('reached ') !== 0)
          .slice(0, 2)
          .map(flag => (
            <Chip key={flag} className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              {flag}
            </Chip>
          ))}
      </div>
    ),
  },
  {
    id: 'actions',
    meta: { className: 'w-px whitespace-nowrap' },
    header: '',
    cell: ({ row, table }) => {
      const onReplay = (table.options.meta as MessageTableMeta | undefined)?.onReplay;
      if (!onReplay) return null;
      return (
        <button
          type="button"
          title="Edit & resend this message"
          onClick={event => {
            event.stopPropagation();
            onReplay(row.original);
          }}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20">
          <Send className="h-3 w-3" />
          Replay
        </button>
      );
    },
  },
];

const PostMessages = () => {
  const { messages, listeners, url, connected, clear } = useDominator('devtools');
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<Direction>('all');
  const [riskyOnly, setRiskyOnly] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [frame, setFrame] = useState('');
  const [selected, setSelected] = useState<ExtensionPostMessage | null>(null);
  const [replayTarget, setReplayTarget] = useState<ExtensionPostMessage | null>(null);

  const replayable = canReplay();
  const onReplay = replayable ? (message: ExtensionPostMessage) => setReplayTarget(message) : undefined;

  const frames = useMemo(() => collectFrames(messages, listeners), [messages, listeners]);
  const confirmedCount = countConfirmed(messages);
  const rows = useMemo(
    () =>
      messages
        .filter(message => direction === 'all' || message.direction === direction)
        .filter(message => messageInFrame(message, frame))
        .filter(message => !riskyOnly || message.risk === 'high')
        .filter(message => !confirmedOnly || message.confirmed)
        .filter(message => matchesQuery(messageHaystack(message), query))
        .slice()
        .reverse(),
    [messages, direction, riskyOnly, confirmedOnly, query, frame],
  );

  return (
    <PanelShell
      active="messages"
      messageCount={messages.length}
      listenerCount={listeners.length}
      riskyCount={countRisky(messages, listeners)}
      url={url}
      connected={connected}
      onClear={clear}
      onExport={() => downloadJson(`dominator-${hostOf(url)}-${Date.now()}.json`, { url, messages, listeners })}>
      <DataTable
        columns={columns}
        data={rows}
        meta={{ onReplay }}
        onRowClick={row => setSelected(row)}
        isRowActive={row => row.id === selected?.id}
        empty={
          <EmptyState
            icon={Inbox}
            title={messages.length ? 'No message matches the filter' : 'No postMessage traffic yet'}
            hint={
              messages.length
                ? 'Loosen the search or switch the direction filter.'
                : 'Every window.postMessage call and message event on this tab is captured with its file, line and column. Reload the page to catch traffic fired during load.'
            }
          />
        }
        toolbar={
          <PanelToolbar
            query={query}
            onQueryChange={setQuery}
            placeholder="Filter payloads, origins, files…"
            summary={`${rows.length}/${messages.length} messages`}>
            <FrameSelect frames={frames} value={frame} onChange={setFrame} />
            <FilterChip active={direction === 'all'} onClick={() => setDirection('all')}>
              All
            </FilterChip>
            <FilterChip active={direction === 'sent'} onClick={() => setDirection('sent')}>
              <ArrowUpRight className="h-3 w-3" />
              Sent
            </FilterChip>
            <FilterChip active={direction === 'received'} onClick={() => setDirection('received')}>
              <ArrowDownLeft className="h-3 w-3" />
              Received
            </FilterChip>
            <FilterChip tone="danger" active={riskyOnly} onClick={() => setRiskyOnly(value => !value)}>
              <ShieldAlert className="h-3 w-3" />
              High risk
            </FilterChip>
            {confirmedCount > 0 && (
              <FilterChip tone="danger" active={confirmedOnly} onClick={() => setConfirmedOnly(value => !value)}>
                <Crosshair className="h-3 w-3" />
                Confirmed ({confirmedCount})
              </FilterChip>
            )}
          </PanelToolbar>
        }
      />

      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent side="right" className="w-[540px] overflow-y-auto sm:max-w-none">
          <SheetHeader>
            <SheetTitle className="text-sm">
              {selected?.direction === 'sent' ? 'Sent message' : 'Received message'}
              {selected && (
                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                  {formatTime(selected.time)}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">{selected && <MessageDetails message={selected} onReplay={onReplay} />}</div>
        </SheetContent>
      </Sheet>

      <ReplayDialog message={replayTarget} frames={frames} onClose={() => setReplayTarget(null)} />
    </PanelShell>
  );
};

export default withErrorBoundary(
  withSuspense(PostMessages, <div className="p-4 text-sm text-muted-foreground">Loading…</div>),
  <div className="p-4 text-sm text-destructive">Something went wrong.</div>,
);
