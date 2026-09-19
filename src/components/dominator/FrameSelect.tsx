import React from 'react';
import { Frame } from 'lucide-react';
import { cn } from '@src/lib/utils';
import { FrameOption } from '@src/shared/lib/format';
import { highlightFrame } from '@src/shared/lib/replay';

/**
 * Frame picker in the spirit of the DevTools console one: scopes the view to a
 * single document of the page, `top` or any nested frame that was seen.
 */
export function FrameSelect({
  frames,
  value,
  onChange,
  className,
}: {
  frames: FrameOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('relative inline-flex max-w-[280px] items-center', className)}>
      <Frame className="pointer-events-none absolute left-2 h-3 w-3 text-muted-foreground" />
      <select
        value={value}
        onChange={event => {
          const next = event.target.value;
          onChange(next);
          if (next) highlightFrame(next);
        }}
        title="Scope the view to one frame"
        className="h-8 w-full min-w-[150px] appearance-none truncate rounded-md border bg-background pl-7 pr-6 text-[11px] outline-none ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring">
        <option value="">All frames ({frames.length})</option>
        {frames.map(frame => (
          <option key={frame.value} value={frame.value}>
            {frame.value}
            {frame.detail ? ` — ${frame.detail}` : ''}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 text-[9px] text-muted-foreground">▾</span>
    </div>
  );
}
