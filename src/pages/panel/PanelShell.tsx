import React from 'react';
import { Braces, Download, Inbox, RotateCcw } from 'lucide-react';
import { Nav } from '@src/components/ui/nav';
import { cn } from '@src/lib/utils';
import { ThemeToggle } from '@src/components/dominator/ThemeToggle';
import { Brand } from '@src/components/dominator/Brand';

interface PanelShellProps {
  active: 'messages' | 'listeners';
  messageCount: number;
  listenerCount: number;
  riskyCount: number;
  url: string;
  connected: boolean;
  onClear: () => void;
  onExport: () => void;
  children: React.ReactNode;
}

export function PanelShell({
  active,
  messageCount,
  listenerCount,
  riskyCount,
  url,
  connected,
  onClear,
  onExport,
  children,
}: PanelShellProps) {
  return (
    <div className="flex h-full w-full bg-background text-foreground">
      <aside className="flex w-[200px] shrink-0 flex-col border-r">
        <div className="border-b px-3 py-2.5">
          <Brand url={url} />
        </div>

        <Nav
          isCollapsed={false}
          links={[
            {
              title: 'Messages',
              label: messageCount ? String(messageCount) : '',
              icon: Inbox,
              to: '/index.html',
              variant: active === 'messages' ? 'default' : 'ghost',
            },
            {
              title: 'Listeners',
              label: listenerCount ? String(listenerCount) : '',
              icon: Braces,
              to: '/listeners',
              variant: active === 'listeners' ? 'default' : 'ghost',
            },
          ]}
        />

        <div className="mt-auto space-y-2 border-t p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span
              className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500')}
              title={connected ? 'Listening to the inspected tab' : 'Reconnecting…'}
            />
            {connected ? 'Live' : 'Reconnecting'}
            {riskyCount > 0 && <span className="ml-auto font-medium text-red-500">{riskyCount} high risk</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClear}
              title="Clear captured data for this tab"
              className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <RotateCcw className="h-3 w-3" />
              Clear
            </button>
            <button
              type="button"
              onClick={onExport}
              title="Export capture as JSON"
              className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Download className="h-3 w-3" />
              Export
            </button>
            <ThemeToggle className="h-7 w-7" />
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col p-3">{children}</main>
    </div>
  );
}

/** Shared search + filter strip above the panel tables. */
export function PanelToolbar({
  query,
  onQueryChange,
  placeholder,
  children,
  summary,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  children?: React.ReactNode;
  summary?: React.ReactNode;
}) {
  return (
    <div className="flex flex-none flex-wrap items-center gap-2">
      <input
        value={query}
        onChange={event => onQueryChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-[260px] rounded-md border bg-background px-2.5 text-xs outline-none ring-offset-background transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {children}
      <span className="ml-auto font-mono text-[11px] text-muted-foreground">{summary}</span>
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
  tone = 'default',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
        active
          ? tone === 'danger'
            ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
            : 'border-primary/40 bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/50',
      )}>
      {children}
    </button>
  );
}
