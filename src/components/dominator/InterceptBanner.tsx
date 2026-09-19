import React, { useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { InterceptRequest } from '@src/shared/types/message';

export function InterceptBanner({
  intercepts,
  onResolve,
}: {
  intercepts: InterceptRequest[];
  onResolve: (id: string, action: 'deliver' | 'drop' | 'edit', extra?: { origin?: string; data?: string; mode?: 'json' | 'text' }) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { origin: string; data: string }>>({});
  if (!intercepts.length) return null;

  return (
    <div className="mb-2 space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        <Pause className="h-3 w-3" />
        {intercepts.length} paused message{intercepts.length === 1 ? '' : 's'}
      </p>
      {intercepts.map(item => {
        const draft = drafts[item.id] || { origin: item.origin, data: item.message };
        return (
          <div key={item.id} className="space-y-1.5 rounded border bg-background/70 p-2">
            <p className="font-mono text-[10px] text-muted-foreground">
              {item.frame} · listener {item.listenerId} · {item.origin}
            </p>
            <textarea
              value={draft.data}
              rows={3}
              spellCheck={false}
              onChange={event =>
                setDrafts(current => ({ ...current, [item.id]: { ...draft, data: event.target.value } }))
              }
              className="w-full resize-y rounded-md border bg-muted/40 p-1.5 font-mono text-[11px] outline-none"
            />
            <input
              value={draft.origin}
              spellCheck={false}
              onChange={event =>
                setDrafts(current => ({ ...current, [item.id]: { ...draft, origin: event.target.value } }))
              }
              className="h-7 w-full rounded-md border bg-background px-2 font-mono text-[11px] outline-none"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onResolve(item.id, 'edit', { origin: draft.origin, data: draft.data, mode: item.dataType === 'string' ? 'text' : 'json' })}
                className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/10 text-[11px] font-medium text-primary">
                <Play className="h-3 w-3" />
                Deliver
              </button>
              <button
                type="button"
                onClick={() => onResolve(item.id, 'drop')}
                className="inline-flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
                Drop
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
