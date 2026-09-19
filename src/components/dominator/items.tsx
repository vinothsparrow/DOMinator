import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Crosshair,
  Frame,
  Globe,
  Layers,
  Package,
  Send,
  ShieldAlert,
  ShieldCheck,
  Target,
  Wand2,
  Zap,
} from 'lucide-react';
import { cn } from '@src/lib/utils';
import { ExtensionListenerMessage, ExtensionPostMessage, OriginCheckKind, SinkFlow } from '@src/shared/types/message';
import { formatSize, formatTime, hostOf, originCheckOf, riskDotClass, summarizeWrappers } from '@src/shared/lib/format';
import { originCheckLabel } from '@src/shared/lib/originCheck';
import { Chip, CodeBlock, CopyButton, RiskBadge, RiskDot, SourceLink } from './primitives';
import { PocPanel } from './PocPanel';
import { DiffView, JsonHighlight } from './DiffView';

/** Confirmed source-to-sink flows: the payload actually reached a sink. */
function FlowList({ flows }: { flows: SinkFlow[] }) {
  return (
    <div className="space-y-1.5 rounded-md border border-red-500/30 bg-red-500/5 p-2">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
        <Crosshair className="h-3 w-3" />
        Confirmed sink flow{flows.length > 1 ? 's' : ''}
      </span>
      {flows.map(flow => (
        <div key={flow.id} className="flex flex-wrap items-center gap-1.5">
          <Chip className="border-red-500/40 bg-red-500/10 font-mono text-red-600 dark:text-red-400">{flow.sink}</Chip>
          <SourceLink source={flow.source} />
          {flow.blocked && (
            <Chip className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              blocked {flow.blockedReason ? `· ${flow.blockedReason}` : 'CSP / Trusted Types'}
            </Chip>
          )}
          <span className="w-full break-all pl-1 font-mono text-[10px] text-muted-foreground">
            {flow.value.length > 120 ? flow.value.slice(0, 120) + '…' : flow.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function StackList({ frames }: { frames?: ExtensionPostMessage['stack'] }) {
  if (!frames || frames.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No stack captured for this record.</p>;
  }
  return (
    <ol className="space-y-1">
      {frames.map((frame, index) => (
        <li key={index} className="flex items-center gap-2">
          <span className="w-4 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{index}</span>
          <SourceLink source={frame} />
          {frame.fn && <span className="truncate font-mono text-[10px] text-muted-foreground">{frame.fn}</span>}
        </li>
      ))}
    </ol>
  );
}

function originCheckChip(listener: ExtensionListenerMessage) {
  const kind: OriginCheckKind = originCheckOf(listener);
  if (kind === 'strict') {
    return (
      <Chip className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-2.5 w-2.5" />
        {originCheckLabel(kind)}
      </Chip>
    );
  }
  if (kind === 'bypassable') {
    return (
      <Chip
        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        title={listener.originCheckDetail}>
        <ShieldAlert className="h-2.5 w-2.5" />
        {originCheckLabel(kind)}
      </Chip>
    );
  }
  if (kind === 'source') {
    return (
      <Chip className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
        <ShieldAlert className="h-2.5 w-2.5" />
        {originCheckLabel(kind)}
      </Chip>
    );
  }
  return (
    <Chip className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
      <ShieldAlert className="h-2.5 w-2.5" />
      {originCheckLabel(kind)}
    </Chip>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[11px]">{value}</span>
      <CopyButton value={value} />
    </div>
  );
}

export function MessageDetails({
  message,
  onReplay,
}: {
  message: ExtensionPostMessage;
  onReplay?: (message: ExtensionPostMessage) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <RiskBadge risk={message.risk} />
        {message.flags.map(flag => (
          <Chip key={flag} className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <Zap className="h-2.5 w-2.5" />
            {flag}
          </Chip>
        ))}
        {onReplay && (
          <button
            type="button"
            onClick={() => onReplay(message)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20">
            <Send className="h-3 w-3" />
            Edit &amp; resend
          </button>
        )}
      </div>

      {message.flows && message.flows.length > 0 && <FlowList flows={message.flows} />}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payload</span>
          <CopyButton value={message.message} label="Copy payload" />
        </div>
        {message.dataType === 'string' ? (
          <CodeBlock className="text-emerald-700 dark:text-emerald-300">{message.message || '(empty payload)'}</CodeBlock>
        ) : (
          <JsonHighlight text={message.message || 'null'} />
        )}
      </div>
      {message.flows && message.flows[0] && message.flows[0].value !== message.message && (
        <DiffView before={message.message} after={message.flows[0].value} afterLabel="Reached sink" />
      )}

      <div className="space-y-1">
        <Field label="From" value={message.from} />
        <Field label="To" value={message.to} />
        {message.targetOrigin && <Field label="targetOrigin" value={message.targetOrigin} />}
        {message.channel && message.channel !== 'window' && <Field label="Channel" value={message.channel} />}
        {message.presentedOrigin && <Field label="Presented origin" value={message.presentedOrigin} />}
        {message.taintSource && <Field label="Source" value={message.taintSource} />}
        {message.transfer && message.transfer.length > 0 && <Field label="Transfer" value={message.transfer.join(', ')} />}
        {message.listenerHits && message.listenerHits.length > 0 && (
          <Field label="Listeners hit" value={message.listenerHits.join(', ')} />
        )}
        {message.leaks && message.leaks.length > 0 && <Field label="Leaks" value={message.leaks.join(', ')} />}
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Call stack</span>
        <StackList frames={message.stack} />
      </div>
    </div>
  );
}

export function MessageItem({
  message,
  dense = false,
  onReplay,
}: {
  message: ExtensionPostMessage;
  dense?: boolean;
  onReplay?: (message: ExtensionPostMessage) => void;
}) {
  const [open, setOpen] = useState(false);
  const sent = message.direction === 'sent';

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/30 hover:bg-accent/30',
        open && 'border-primary/40 bg-accent/20',
        message.confirmed && 'border-red-500/40',
      )}>
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', riskDotClass[message.risk])} />
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full flex-col gap-1.5 px-2.5 py-2 pl-3.5 text-left">
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide',
              sent
                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
            )}>
            {sent ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
            {sent ? 'sent' : 'recv'}
          </span>
          {message.confirmed && (
            <span
              title="Payload reached a dangerous sink"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-red-500/15 px-1 py-px text-[10px] font-bold uppercase text-red-600 dark:text-red-400">
              <Crosshair className="h-3 w-3" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-medium" title={`${message.from} → ${message.to}`}>
            {hostOf(message.from)}
            <span className="mx-1 text-muted-foreground">→</span>
            {hostOf(message.to)}
          </span>
          {onReplay && (
            <span
              role="button"
              tabIndex={0}
              title="Edit & resend this message"
              onClick={event => {
                event.stopPropagation();
                onReplay(message);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.stopPropagation();
                  onReplay(message);
                }
              }}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors hover:bg-accent hover:text-foreground group-hover:opacity-100">
              <Send className="h-3 w-3" />
            </span>
          )}
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatTime(message.time)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1 pl-4">
          <SourceLink source={message.source} />
          {message.correlated && <Chip title="Call site matched from the sending frame">via sender</Chip>}
          <Chip title={`${message.fromFrame} → ${message.toFrame}`}>
            <Frame className="h-2.5 w-2.5" />
            {message.fromFrame} → {message.toFrame}
          </Chip>
          <Chip>
            <Layers className="h-2.5 w-2.5" />
            {message.dataType} · {formatSize(message.size)}
          </Chip>
          {message.targetOrigin && (
            <Chip
              className={cn(message.targetOrigin === '*' && 'border-amber-500/40 bg-amber-500/10 text-amber-600')}
              title="targetOrigin argument">
              <Globe className="h-2.5 w-2.5" />
              {message.targetOrigin}
            </Chip>
          )}
          {message.flows?.map(flow => (
            <Chip
              key={flow.id}
              className="border-red-500/40 bg-red-500/10 font-mono text-red-600 dark:text-red-400"
              title={`Payload reached ${flow.sink}`}>
              <Target className="h-2.5 w-2.5" />
              {flow.sink}
            </Chip>
          ))}
        </div>

        <p
          className={cn(
            'pl-4 font-mono text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300',
            open ? 'hidden' : dense ? 'line-clamp-1' : 'line-clamp-2',
          )}>
          {message.message || <span className="text-muted-foreground">(empty payload)</span>}
        </p>
      </button>

      {open && (
        <div className="border-t bg-background/60 px-3 py-2.5">
          <MessageDetails message={message} onReplay={onReplay} />
        </div>
      )}
    </div>
  );
}

export function ListenerDetails({
  listener,
  messages = [],
}: {
  listener: ExtensionListenerMessage;
  messages?: import('@src/shared/types/message').ExtensionPostMessage[];
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Listener source
          </span>
          <CopyButton value={listener.listener} label="Copy listener" />
        </div>
        <CodeBlock className="max-h-64">{listener.listener}</CodeBlock>
        {listener.bound && (
          <p className="text-[11px] text-muted-foreground">
            Bound and native functions cannot be stringified, so the body above is the engine&apos;s placeholder - use
            the registration stack below to find the real handler.
          </p>
        )}
      </div>
      {listener.wrapperSource && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Wrapper ({listener.wrappers?.join(' → ')})
            </span>
            <CopyButton value={listener.wrapperSource} label="Copy wrapper" />
          </div>
          <CodeBlock className="max-h-32 text-muted-foreground">{listener.wrapperSource}</CodeBlock>
        </div>
      )}

      <div className="space-y-1">
        <Field label="Document" value={listener.origin} />
        <Field label="Origin check" value={originCheckLabel(originCheckOf(listener))} />
        {listener.originCheckDetail && <Field label="Detail" value={listener.originCheckDetail} />}
        <Field
          label="Hits"
          value={`${listener.hitCount ?? 0} messages${listener.confirmedCount ? `, ${listener.confirmedCount} confirmed` : ''}${listener.seen && listener.seen > 1 ? `, registered ×${listener.seen}` : ''}`}
        />
        {listener.via && listener.via !== 'addEventListener' && <Field label="Via" value={listener.via} />}
        {listener.channel && listener.channel !== 'window' && <Field label="Channel" value={listener.channel} />}
        {listener.removed && <Field label="Status" value="removed" />}
      </div>
      <div className="space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Registration stack
        </span>
        <StackList frames={listener.stackFrames} />
      </div>

      <div className="border-t pt-3">
        <PocPanel listener={listener} messages={messages} />
      </div>
    </div>
  );
}

export function ListenerItem({ listener }: { listener: ExtensionListenerMessage }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/30 hover:bg-accent/30',
        open && 'border-primary/40 bg-accent/20',
      )}>
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', riskDotClass[listener.risk])} />
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full flex-col gap-1.5 px-2.5 py-2 pl-3.5 text-left">
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
          <RiskDot risk={listener.risk} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium" title={listener.origin}>
            {hostOf(listener.origin)}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatTime(listener.time)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1 pl-4">
          <SourceLink source={listener.source} />
          <Chip title={`Registered in ${listener.frame}`}>
            <Frame className="h-2.5 w-2.5" />
            {listener.frame}
          </Chip>
          {summarizeWrappers(listener.wrappers).map(wrapper => (
            <Chip
              key={wrapper.name}
              className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
              title={`Unwrapped from a ${wrapper.name} wrapper`}>
              <Package className="h-2.5 w-2.5" />
              via {wrapper.name}
              {wrapper.count > 1 ? ` ×${wrapper.count}` : ''}
            </Chip>
          ))}
          {listener.bound && (
            <Chip
              className="border-slate-500/30 bg-slate-500/10"
              title="Bound or native function - the engine cannot stringify its body, so use the registration stack">
              <Wand2 className="h-2.5 w-2.5" />
              bound / native
            </Chip>
          )}
          {originCheckChip(listener)}
          {(listener.hitCount || 0) > 0 && (
            <Chip>
              {listener.hitCount} hit{listener.hitCount === 1 ? '' : 's'}
              {listener.confirmedCount ? ` · ${listener.confirmedCount} confirmed` : ''}
            </Chip>
          )}
          {listener.removed && <Chip>removed</Chip>}
        </div>

        {listener.sinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pl-4">
            {listener.sinks.map(sink => (
              <Chip
                key={sink}
                className="border-amber-500/30 bg-amber-500/10 font-mono text-amber-700 dark:text-amber-300">
                {sink}
              </Chip>
            ))}
          </div>
        )}
      </button>

      {open && (
        <div className="border-t bg-background/60 px-3 py-2.5">
          <ListenerDetails listener={listener} />
        </div>
      )}
    </div>
  );
}
