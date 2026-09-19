import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, LucideIcon } from 'lucide-react';
import { cn } from '@src/lib/utils';
import { RiskLevel, SourceLocation } from '@src/shared/types/message';
import { formatLocation, formatLocationMapped, riskClass, riskDotClass, riskLabel } from '@src/shared/lib/format';
import { resolveSourceLocation } from '@src/shared/lib/sourceMap';

export function RiskDot({ risk, className }: { risk: RiskLevel; className?: string }) {
  return (
    <span
      title={`${riskLabel[risk]} risk`}
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', riskDotClass[risk], className)}
    />
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide',
        riskClass[risk],
      )}>
      <RiskDot risk={risk} className="h-1.5 w-1.5" />
      {riskLabel[risk]}
    </span>
  );
}

export function Chip({
  className,
  children,
  title,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-md border bg-muted/50 px-1.5 py-px text-[10px] font-medium text-muted-foreground',
        className,
      )}>
      {children}
    </span>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={label}
      onClick={event => {
        event.stopPropagation();
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/**
 * `app.js:120:15` for a captured call site. Inside devtools it opens the file
 * in the Sources panel; everywhere else it copies the full location.
 */
export function SourceLink({ source, className }: { source?: SourceLocation; className?: string }) {
  const [copied, setCopied] = useState(false);
  const mapKey = source ? `${source.file}:${source.line}:${source.column}` : '';
  const [mappedByKey, setMappedByKey] = useState<Record<string, SourceLocation['mapped']>>({});

  useEffect(() => {
    if (!source || source.mapped) return;
    let cancelled = false;
    resolveSourceLocation(source).then(next => {
      if (!cancelled && next.mapped) {
        setMappedByKey(current => ({ ...current, [mapKey]: next.mapped }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mapKey, source]);

  if (!source) {
    return <span className={cn('font-mono text-[11px] text-muted-foreground/60', className)}>source unknown</span>;
  }

  const loc = source.mapped ? source : { ...source, mapped: mappedByKey[mapKey] };
  const canOpen = typeof chrome !== 'undefined' && !!chrome.devtools?.panels?.openResource;
  const openFile = loc.mapped?.file || loc.file;
  const openLine = loc.mapped?.line || loc.line;

  const onClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (canOpen) {
      chrome.devtools.panels.openResource(openFile, Math.max(openLine - 1, 0), () => undefined);
      return;
    }
    navigator.clipboard.writeText(`${openFile}:${openLine}:${loc.mapped?.column ?? loc.column}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${loc.fn ? loc.fn + ' — ' : ''}${openFile}:${openLine}:${loc.mapped?.column ?? loc.column}`}
      className={cn(
        'group inline-flex max-w-full items-center gap-1 truncate rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-px font-mono text-[11px] text-sky-700 transition-colors hover:bg-sky-500/20 dark:text-sky-300',
        className,
      )}>
      {canOpen ? (
        <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
      ) : copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
      )}
      <span className="truncate">{formatLocationMapped(loc)}</span>
      {loc.mapped && (
        <span className="truncate text-[9px] text-muted-foreground">via {formatLocation(loc)}</span>
      )}
    </button>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone?: 'default' | 'danger';
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex flex-1 flex-col gap-0.5 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors',
        onClick && 'hover:border-primary/40 hover:bg-accent/50',
        active && 'border-primary/60 bg-accent/60',
        tone === 'danger' && Number(value) > 0 && 'border-red-500/40 bg-red-500/5',
      )}>
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('h-3 w-3', tone === 'danger' && Number(value) > 0 && 'text-red-500')} />
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-lg font-semibold leading-none',
          tone === 'danger' && Number(value) > 0 && 'text-red-500',
        )}>
        {value}
      </span>
    </button>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-[260px] text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CodeBlock({ children, className }: { children: string; className?: string }) {
  return (
    <pre
      className={cn(
        'max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed selection:bg-sky-500/30',
        className,
      )}>
      {children}
    </pre>
  );
}
