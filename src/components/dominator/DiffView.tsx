import React, { useMemo } from 'react';
import { cn } from '@src/lib/utils';
import { lineDiff, prettyJson } from '@src/shared/lib/diff';

export function DiffView({ before, after, beforeLabel = 'Captured', afterLabel = 'Replay / sink' }: { before: string; after: string; beforeLabel?: string; afterLabel?: string }) {
  const lines = useMemo(() => lineDiff(prettyJson(before), prettyJson(after)), [before, after]);
  if (!after || before === after) {
    return null;
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>
          {beforeLabel} → {afterLabel}
        </span>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
        {lines.map((line, index) => (
          <div
            key={index}
            className={cn(
              line.kind === 'add' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              line.kind === 'del' && 'bg-red-500/10 text-red-600 dark:text-red-400',
            )}>
            <span className="inline-block w-4 select-none text-muted-foreground">
              {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}
            </span>
            {line.text}
          </div>
        ))}
      </pre>
    </div>
  );
}

const TOKEN = /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b|([{}[\],])/g;

export function JsonHighlight({ text, className }: { text: string; className?: string }) {
  const pretty = useMemo(() => prettyJson(text), [text]);
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  pretty.replace(TOKEN, (match, key, string, number, word, punct, offset) => {
    if (offset > last) parts.push(<span key={i++}>{pretty.slice(last, offset)}</span>);
    if (key) parts.push(<span key={i++} className="text-sky-700 dark:text-sky-300">{key}</span>);
    else if (string) parts.push(<span key={i++} className="text-emerald-700 dark:text-emerald-300">{string}</span>);
    else if (number) parts.push(<span key={i++} className="text-amber-700 dark:text-amber-300">{number}</span>);
    else if (word) parts.push(<span key={i++} className="text-violet-700 dark:text-violet-300">{word}</span>);
    else parts.push(<span key={i++} className="text-muted-foreground">{punct}</span>);
    last = offset + match.length;
    return match;
  });
  if (last < pretty.length) parts.push(<span key={i++}>{pretty.slice(last)}</span>);
  return (
    <pre
      className={cn(
        'max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed',
        className,
      )}>
      {parts}
    </pre>
  );
}
