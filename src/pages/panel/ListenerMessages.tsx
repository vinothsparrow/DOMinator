import React, { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';

import { PanelTableFeatures } from './table-features';
import { Braces, Frame, Package, ShieldAlert, ShieldCheck } from 'lucide-react';
import withSuspense from '@src/shared/hoc/withSuspense';
import withErrorBoundary from '@src/shared/hoc/withErrorBoundary';
import { useDominator } from '@src/shared/hooks/useDominator';
import { ExtensionListenerMessage } from '@src/shared/types/message';
import {
  collectFrames,
  countRisky,
  downloadJson,
  formatTime,
  hostOf,
  listenerHaystack,
  listenerInFrame,
  matchesQuery,
  RISK_ORDER,
  summarizeWrappers,
} from '@src/shared/lib/format';
import { Chip, EmptyState, RiskBadge, SourceLink } from '@src/components/dominator/primitives';
import { ListenerDetails } from '@src/components/dominator/items';
import { FrameSelect } from '@src/components/dominator/FrameSelect';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@src/components/ui/sheet';
import { DataTable } from './data-table';
import { FilterChip, PanelShell, PanelToolbar } from './PanelShell';

export const columns: ColumnDef<PanelTableFeatures, ExtensionListenerMessage>[] = [
  {
    accessorKey: 'time',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Time',
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-muted-foreground">{formatTime(row.original.time)}</span>
    ),
  },
  {
    id: 'source',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Registered at (file:line:col)',
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <SourceLink source={row.original.source} />
        <Chip title={`Registered in ${row.original.frame}`}>
          <Frame className="h-2.5 w-2.5" />
          {row.original.frame}
        </Chip>
      </div>
    ),
  },
  {
    accessorKey: 'origin',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Document',
    cell: ({ row }) => (
      <span
        className="line-clamp-2 max-w-[240px] break-all text-xs text-sky-600 dark:text-sky-400"
        title={row.original.origin}>
        {hostOf(row.original.origin)}
      </span>
    ),
  },
  {
    accessorKey: 'checksOrigin',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Origin check',
    cell: ({ row }) =>
      row.original.checksOrigin ? (
        <Chip className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="h-2.5 w-2.5" />
          checked
        </Chip>
      ) : (
        <Chip className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
          <ShieldAlert className="h-2.5 w-2.5" />
          missing
        </Chip>
      ),
  },
  {
    accessorKey: 'sinks',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Sinks',
    cell: ({ row }) => (
      <div className="flex max-w-[200px] flex-wrap gap-1">
        {row.original.sinks.length ? (
          row.original.sinks.map(sink => (
            <Chip
              key={sink}
              className="border-amber-500/30 bg-amber-500/10 font-mono text-amber-700 dark:text-amber-300">
              {sink}
            </Chip>
          ))
        ) : (
          <span className="text-[11px] text-muted-foreground">none detected</span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'listener',
    meta: { className: 'w-full' },
    header: 'Listener',
    cell: ({ row }) => (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1">
          {summarizeWrappers(row.original.wrappers).map(wrapper => (
            <Chip
              key={wrapper.name}
              className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
              title={`Unwrapped from a ${wrapper.name} wrapper`}>
              <Package className="h-2.5 w-2.5" />
              via {wrapper.name}
              {wrapper.count > 1 ? ` ×${wrapper.count}` : ''}
            </Chip>
          ))}
          {row.original.bound && (
            <Chip className="border-slate-500/30 bg-slate-500/10" title="Bound or native function - body unavailable">
              bound / native
            </Chip>
          )}
        </div>
        <span className="line-clamp-3 break-all font-mono text-[11px] text-green-700 dark:text-green-300">
          {row.original.listener}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'risk',
    meta: { className: 'w-px whitespace-nowrap' },
    header: 'Risk',
    cell: ({ row }) => <RiskBadge risk={row.original.risk} />,
  },
];

const ListenerMessages = () => {
  const { messages, listeners, url, connected, clear } = useDominator('devtools');
  const [query, setQuery] = useState('');
  const [riskyOnly, setRiskyOnly] = useState(false);
  const [unchecked, setUnchecked] = useState(false);
  const [frame, setFrame] = useState('');
  const [selected, setSelected] = useState<ExtensionListenerMessage | null>(null);

  const frames = useMemo(() => collectFrames(messages, listeners), [messages, listeners]);
  const rows = useMemo(
    () =>
      listeners
        .filter(listener => listenerInFrame(listener, frame))
        .filter(listener => !riskyOnly || listener.risk === 'high')
        .filter(listener => !unchecked || !listener.checksOrigin)
        .filter(listener => matchesQuery(listenerHaystack(listener), query))
        .slice()
        .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.time - a.time),
    [listeners, riskyOnly, unchecked, query, frame],
  );

  return (
    <PanelShell
      active="listeners"
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
        onRowClick={row => setSelected(row)}
        isRowActive={row => row.id === selected?.id}
        empty={
          <EmptyState
            icon={Braces}
            title={listeners.length ? 'No listener matches the filter' : 'No message listeners registered yet'}
            hint="Each addEventListener('message', …) call is captured with the file and line that registered it, whether it validates event.origin, and the sinks found in its body."
          />
        }
        toolbar={
          <PanelToolbar
            query={query}
            onQueryChange={setQuery}
            placeholder="Filter listeners, sinks, files…"
            summary={`${rows.length}/${listeners.length} listeners`}>
            <FrameSelect frames={frames} value={frame} onChange={setFrame} />
            <FilterChip tone="danger" active={riskyOnly} onClick={() => setRiskyOnly(value => !value)}>
              <ShieldAlert className="h-3 w-3" />
              High risk
            </FilterChip>
            <FilterChip active={unchecked} onClick={() => setUnchecked(value => !value)}>
              No origin check
            </FilterChip>
          </PanelToolbar>
        }
      />

      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent side="right" className="w-[540px] overflow-y-auto sm:max-w-none">
          <SheetHeader>
            <SheetTitle className="text-sm">
              Message listener
              {selected && (
                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                  {formatTime(selected.time)}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">{selected && <ListenerDetails listener={selected} />}</div>
        </SheetContent>
      </Sheet>
    </PanelShell>
  );
};

export default withErrorBoundary(
  withSuspense(ListenerMessages, <div className="p-4 text-sm text-muted-foreground">Loading…</div>),
  <div className="p-4 text-sm text-destructive">Something went wrong.</div>,
);
