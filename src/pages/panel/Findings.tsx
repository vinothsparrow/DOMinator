import React from 'react';
import { Bug, Skull, ShieldAlert } from 'lucide-react';
import withSuspense from '@src/shared/hoc/withSuspense';
import withErrorBoundary from '@src/shared/hoc/withErrorBoundary';
import { useDominator } from '@src/shared/hooks/useDominator';
import { countRisky, downloadJson, downloadText, hostOf } from '@src/shared/lib/format';
import { buildReport, sessionDump } from '@src/shared/lib/report';
import { Chip, EmptyState, SourceLink } from '@src/components/dominator/primitives';
import { PanelShell } from './PanelShell';

const Findings = () => {
  const {
    messages,
    listeners,
    intercepts,
    pollutions,
    clobbers,
    url,
    connected,
    clear,
    resolveIntercept,
    importSession,
  } = useDominator('devtools');

  const leaks = messages.filter(message => message.leaks && message.leaks.length > 0);
  const confirmed = messages.filter(message => message.confirmed);
  const dump = () => sessionDump(url, messages, listeners, pollutions, clobbers);
  const findingCount = pollutions.length + clobbers.length + leaks.length;

  return (
    <PanelShell
      active="findings"
      messageCount={messages.length}
      listenerCount={listeners.length}
      riskyCount={countRisky(messages, listeners)}
      findingCount={findingCount}
      url={url}
      connected={connected}
      intercepts={intercepts}
      onClear={clear}
      onExport={() => downloadJson(`dominator-${hostOf(url)}-${Date.now()}.json`, dump())}
      onReport={() => downloadText(`dominator-${hostOf(url)}-${Date.now()}.md`, buildReport(dump()), 'text/markdown')}
      onImport={importSession}
      onResolveIntercept={resolveIntercept}>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto">
        <section className="space-y-2">
          <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldAlert className="h-3 w-3" />
            Confirmed sink flows ({confirmed.length})
          </h2>
          {confirmed.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No confirmed flows yet"
              hint="Enable Auto-probe or replay a payload. When a tainted value reaches a sink it shows up here — including CSP/Trusted Types blocks."
            />
          ) : (
            <ul className="space-y-2">
              {confirmed.map(message => (
                <li key={message.id} className="rounded-md border p-2 text-xs">
                  <p className="font-medium">
                    {hostOf(message.from)} → {hostOf(message.to)}
                    {message.probe && <Chip className="ml-1">probe</Chip>}
                    {message.taintSource && <Chip className="ml-1">{message.taintSource}</Chip>}
                  </p>
                  {(message.flows || []).map(flow => (
                    <p key={flow.id} className="mt-1 flex flex-wrap items-center gap-1 font-mono text-[11px]">
                      <Chip className="border-red-500/40 bg-red-500/10 text-red-600">{flow.sink}</Chip>
                      <SourceLink source={flow.source} />
                      {flow.blocked && <Chip>blocked</Chip>}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Skull className="h-3 w-3" />
            Prototype pollution ({pollutions.length})
          </h2>
          {pollutions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Object.assign / jQuery.extend / lodash merge are hooked. A <code>__proto__</code> probe that sticks will
              land here.
            </p>
          ) : (
            <ul className="space-y-1">
              {pollutions.map(item => (
                <li key={item.id} className="flex flex-wrap items-center gap-1 rounded-md border px-2 py-1.5 text-[11px]">
                  <Chip className="font-mono">{item.via}</Chip>
                  {item.keys.map(key => (
                    <Chip key={key} className="border-red-500/30 bg-red-500/10 text-red-600">
                      {key}
                    </Chip>
                  ))}
                  <SourceLink source={item.source} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Bug className="h-3 w-3" />
            DOM clobbering ({clobbers.length})
          </h2>
          {clobbers.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Elements whose <code>id</code>/<code>name</code> overwrite a global are listed here.
            </p>
          ) : (
            <ul className="space-y-1">
              {clobbers.map(item => (
                <li key={item.id} className="flex flex-wrap items-center gap-1 rounded-md border px-2 py-1.5 text-[11px]">
                  <Chip className={item.dangerous ? 'border-red-500/40 bg-red-500/10 text-red-600' : undefined}>
                    {item.dangerous ? 'dangerous' : 'clobber'}
                  </Chip>
                  <span className="font-mono">
                    &lt;{item.tag.toLowerCase()} id/name=&quot;{item.name}&quot;&gt;
                  </span>
                  <Chip>{item.frame}</Chip>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cross-origin leaks ({leaks.length})
          </h2>
          {leaks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Sends that appear to ship <code>location.href</code>, cookies or token-like keys to another origin.
            </p>
          ) : (
            <ul className="space-y-1">
              {leaks.map(message => (
                <li key={message.id} className="rounded-md border px-2 py-1.5 text-[11px]">
                  {hostOf(message.from)} → {hostOf(message.to)} · {message.leaks?.join(', ')}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PanelShell>
  );
};

export default withErrorBoundary(
  withSuspense(Findings, <div className="p-4 text-sm text-muted-foreground">Loading…</div>),
  <div className="p-4 text-sm text-destructive">Something went wrong.</div>,
);
