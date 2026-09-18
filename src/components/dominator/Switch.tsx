import React from 'react';
import { cn } from '@src/lib/utils';

/**
 * Track is 36x20, knob is 16 inset by 2, so the travel is 16px.
 *
 * The knob needs an explicit `left`: without one an absolutely positioned
 * element falls back to its static position, which sits after the button's
 * default padding, and the translate then carries it past the track.
 */
export function Switch({
  on,
  onChange,
  label,
  className,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border-0 p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        on ? 'bg-emerald-500' : 'bg-muted-foreground/40',
        className,
      )}>
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}
