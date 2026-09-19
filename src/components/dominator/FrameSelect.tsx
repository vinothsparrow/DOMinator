import React from 'react';
import { Frame } from 'lucide-react';
import { cn } from '@src/lib/utils';
import { FrameOption } from '@src/shared/lib/format';
import { highlightFrame } from '@src/shared/lib/replay';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@src/components/ui/select';

const ALL = '__all__';

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
    <Select
      value={value || ALL}
      onValueChange={next => {
        const frame = next === ALL ? '' : next;
        onChange(frame);
        if (frame) highlightFrame(frame);
      }}>
      <SelectTrigger
        title="Scope the view to one frame"
        className={cn('h-8 w-full min-w-[150px] gap-1.5 px-2 text-[11px]', className)}>
        <Frame className="h-3 w-3 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="All frames" />
      </SelectTrigger>
      <SelectContent className="z-[200]" position="popper">
        <SelectItem value={ALL} className="text-xs">
          All frames ({frames.length})
        </SelectItem>
        {frames.map(frame => (
          <SelectItem key={frame.value} value={frame.value} className="text-xs">
            {frame.value}
            {frame.detail ? ` — ${frame.detail}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
