import React from 'react';
import { Radar } from 'lucide-react';
import { cn } from '@src/lib/utils';
import { hostOf } from '@src/shared/lib/format';

/** The packaged extension icon, or nothing outside an extension context. */
function iconUrl(): string {
  try {
    return chrome.runtime.getURL('icon128.png');
  } catch (e) {
    return '';
  }
}

/** The extension's own icon, falling back to a mark when it cannot be resolved. */
export function BrandMark({ className }: { className?: string }) {
  const icon = iconUrl();
  if (icon) {
    return <img src={icon} alt="" className={cn('h-7 w-7 shrink-0 rounded-md shadow-sm', className)} />;
  }
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm',
        className,
      )}>
      <Radar className="h-4 w-4" />
    </span>
  );
}

export function Brand({ url, className }: { url: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <BrandMark />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight tracking-tight">DOMinator</p>
        <p className="truncate text-[11px] text-muted-foreground" title={url}>
          {url ? hostOf(url) : 'attaching…'}
        </p>
      </div>
    </div>
  );
}
