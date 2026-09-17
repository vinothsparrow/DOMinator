import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Send, XCircle } from 'lucide-react';
import { ExtensionPostMessage, ReplayResult } from '@src/shared/types/message';
import { FrameOption, hostOf } from '@src/shared/lib/format';
import { isResolvableFrame, runReplay } from '@src/shared/lib/replay';
import { cn } from '@src/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@src/components/ui/sheet';

type Mode = 'json' | 'text';

/** Quick mutations that turn a captured message into an attack probe. */
const MUTATIONS: { label: string; value: string; mode: Mode }[] = [
  { label: 'HTML XSS', value: '<img src=x onerror=alert(document.domain)>', mode: 'text' },
  { label: 'SVG onload', value: '<svg onload=alert(document.domain)>', mode: 'text' },
  { label: 'JS eval', value: 'alert(document.domain)', mode: 'text' },
  { label: 'javascript: URL', value: 'javascript:alert(document.domain)', mode: 'text' },
  { label: '__proto__', value: '{"__proto__":{"dominatorPolluted":true}}', mode: 'json' },
];

/** Window targets always available in addition to the captured frames. */
const BASE_TARGETS = ['window', 'top', 'parent', 'opener'];

function resolveTarget(message: ExtensionPostMessage): string {
  if (isResolvableFrame(message.toFrame)) return message.toFrame;
  if (isResolvableFrame(message.fromFrame)) return message.fromFrame;
  return 'window';
}

export function ReplayDialog({
  message,
  frames,
  onClose,
}: {
  message: ExtensionPostMessage | null;
  frames: FrameOption[];
  onClose: () => void;
}) {
  const [payload, setPayload] = useState('');
  const [mode, setMode] = useState<Mode>('text');
  const [target, setTarget] = useState('window');
  const [targetOrigin, setTargetOrigin] = useState('*');
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset the editor whenever a different message is opened.
  useEffect(() => {
    if (!message) return;
    setPayload(message.message);
    setMode(message.dataType === 'string' ? 'text' : 'json');
    setTarget(resolveTarget(message));
    setTargetOrigin(message.targetOrigin || '*');
    setResult(null);
    setBusy(false);
  }, [message]);

  const targetOptions = useMemo(() => {
    const fromFrames = frames.map(frame => frame.value).filter(isResolvableFrame);
    return Array.from(new Set([...BASE_TARGETS, ...fromFrames]));
  }, [frames]);

  const jsonError = useMemo(() => {
    if (mode !== 'json') return null;
    try {
      JSON.parse(payload);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [mode, payload]);

  const send = async () => {
    setBusy(true);
    setResult(null);
    const outcome = await runReplay(target, mode, payload, targetOrigin);
    setResult(outcome);
    setBusy(false);
  };

  return (
    <Sheet open={!!message} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="flex w-[540px] flex-col overflow-y-auto sm:max-w-none">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Send className="h-4 w-4" />
            Replay message
            {message && (
              <span className="font-mono text-xs font-normal text-muted-foreground">{hostOf(message.to)}</span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payload</span>
              <div className="inline-flex overflow-hidden rounded-md border text-[11px]">
                {(['text', 'json'] as Mode[]).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    className={cn(
                      'px-2 py-0.5 font-medium uppercase transition-colors',
                      mode === option ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
                    )}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={payload}
              onChange={event => setPayload(event.target.value)}
              spellCheck={false}
              rows={7}
              className="w-full resize-y rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
            {jsonError && (
              <p className="flex items-center gap-1 text-[11px] text-red-500">
                <AlertTriangle className="h-3 w-3" /> Invalid JSON: {jsonError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Quick mutations
            </span>
            <div className="flex flex-wrap gap-1">
              {MUTATIONS.map(mutation => (
                <button
                  key={mutation.label}
                  type="button"
                  onClick={() => {
                    setPayload(mutation.value);
                    setMode(mutation.mode);
                  }}
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300">
                  {mutation.label}
                </button>
              ))}
              {message && (
                <button
                  type="button"
                  onClick={() => {
                    setPayload(message.message);
                    setMode(message.dataType === 'string' ? 'text' : 'json');
                  }}
                  className="rounded-md border px-1.5 py-px text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent">
                  Restore original
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Target frame
              </span>
              <select
                value={target}
                onChange={event => setTarget(event.target.value)}
                className="h-8 w-full rounded-md border bg-background px-2 text-[11px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
                {targetOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                targetOrigin
              </span>
              <input
                value={targetOrigin}
                onChange={event => setTargetOrigin(event.target.value)}
                spellCheck={false}
                className="h-8 w-full rounded-md border bg-background px-2 font-mono text-[11px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={busy || !!jsonError}
            onClick={send}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            <Send className="h-4 w-4" />
            {busy ? 'Sending…' : 'Send to page'}
          </button>

          {result && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs',
                result.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
              )}>
              {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {result.ok
                ? 'Delivered. The replayed send appears in the capture, and any resulting sink flow is confirmed live.'
                : result.error}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The message is dispatched from the inspected page itself, so same-origin frames and the page&apos;s own
            listeners receive it exactly as a real sender would.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
