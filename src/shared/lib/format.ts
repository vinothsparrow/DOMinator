import { ExtensionListenerMessage, ExtensionPostMessage, OriginCheckKind, RiskLevel, SourceLocation } from '@src/shared/types/message';

export function formatTime(time: number): string {
  const date = new Date(time);
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3,
  )}`;
}

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** `https://a.site.com/path?x=1` -> `a.site.com` */
export function hostOf(url: string): string {
  if (!url) return 'unknown';
  if (url === 'null') return 'null (opaque)';
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** `app.js:120:15` */
export function formatLocation(source?: SourceLocation): string {
  if (!source) return '';
  return `${source.fileName}:${source.line}:${source.column}`;
}

export const RISK_ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

export const riskLabel: Record<RiskLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Badge/dot colours per risk level, tuned for both themes. */
export const riskClass: Record<RiskLevel, string> = {
  high: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  low: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
};

export const riskDotClass: Record<RiskLevel, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
};

export function countRisky(messages: ExtensionPostMessage[], listeners: ExtensionListenerMessage[]): number {
  return messages.filter(m => m.risk === 'high').length + listeners.filter(l => l.risk === 'high').length;
}

export function matchesQuery(value: string, query: string): boolean {
  if (!query) return true;
  return value.toLowerCase().includes(query.toLowerCase());
}

/** `postMessage(null)` / empty string — noise, not a finding. */
export function isEmptyMessage(message: ExtensionPostMessage): boolean {
  if (message.dataType === 'null' || message.dataType === 'undefined') return true;
  const text = (message.message || '').trim();
  return text === '' || text === 'undefined';
}

export function messageHaystack(message: ExtensionPostMessage): string {
  return [
    message.message,
    message.from,
    message.to,
    message.fromFrame,
    message.toFrame,
    message.targetOrigin,
    message.source?.raw,
    message.flags.join(' '),
  ]
    .filter(Boolean)
    .join(' ');
}

export function listenerHaystack(listener: ExtensionListenerMessage): string {
  return [
    listener.listener,
    listener.origin,
    listener.frame,
    listener.stack,
    listener.sinks.join(' '),
    listener.originCheck,
    listener.originCheckDetail,
  ]
    .filter(Boolean)
    .join(' ');
}

export function originCheckOf(listener: ExtensionListenerMessage): OriginCheckKind {
  return listener.originCheck || (listener.checksOrigin ? 'strict' : 'none');
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export interface FrameOption {
  /** Frame path as the page sees it, e.g. `top.frames[0]`. */
  value: string;
  /** Hosts observed for that frame. */
  detail: string;
  count: number;
}

/**
 * Frames seen in the capture, mirroring the frame picker in the DevTools
 * console so a listener or message can be traced to one document.
 */
export function collectFrames(messages: ExtensionPostMessage[], listeners: ExtensionListenerMessage[]): FrameOption[] {
  const frames = new Map<string, { hosts: Set<string>; count: number }>();

  const add = (frame: string, url: string) => {
    if (!frame || frame === 'caller' || frame === 'unknown') return;
    const entry = frames.get(frame) ?? { hosts: new Set<string>(), count: 0 };
    entry.count += 1;
    if (url) entry.hosts.add(hostOf(url));
    frames.set(frame, entry);
  };

  for (const message of messages) {
    add(message.toFrame, message.to);
    add(message.fromFrame, message.from);
  }
  for (const listener of listeners) {
    add(listener.frame, listener.origin);
  }

  return [...frames.entries()]
    .map(([value, entry]) => ({ value, detail: [...entry.hosts].join(', '), count: entry.count }))
    .sort((a, b) => (a.value === 'top' ? -1 : b.value === 'top' ? 1 : a.value.localeCompare(b.value)));
}

export function messageInFrame(message: ExtensionPostMessage, frame: string): boolean {
  if (!frame) return true;
  return message.fromFrame === frame || message.toFrame === frame;
}

export function listenerInFrame(listener: ExtensionListenerMessage, frame: string): boolean {
  if (!frame) return true;
  return listener.frame === frame;
}

/** Collapses a wrapper chain such as ['Raven','Raven'] into one labelled entry. */
export function summarizeWrappers(wrappers?: string[]): { name: string; count: number }[] {
  if (!wrappers || wrappers.length === 0) return [];
  const summary: { name: string; count: number }[] = [];
  for (const wrapper of wrappers) {
    const last = summary[summary.length - 1];
    if (last && last.name === wrapper) last.count += 1;
    else summary.push({ name: wrapper, count: 1 });
  }
  return summary;
}

/** Count of messages with a confirmed source-to-sink flow. */
export function countConfirmed(messages: ExtensionPostMessage[]): number {
  return messages.filter(message => message.confirmed).length;
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function formatLocationMapped(source?: SourceLocation): string {
  if (!source) return '';
  if (source.mapped) {
    return `${source.mapped.fileName}:${source.mapped.line}:${source.mapped.column}`;
  }
  return formatLocation(source);
}
