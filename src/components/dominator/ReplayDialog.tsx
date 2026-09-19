import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Send, XCircle } from 'lucide-react';
import { ExtensionPostMessage, OriginSpoofMode, ReplayResult } from '@src/shared/types/message';
import { FrameOption, hostOf } from '@src/shared/lib/format';
import { isResolvableFrame, runReplay } from '@src/shared/lib/replay';
import { injectCanary, makeCanary } from '@src/shared/lib/canary';
import { parseJson } from '@src/shared/lib/jsonPath';
import { prettyJson } from '@src/shared/lib/diff';
import { cn } from '@src/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@src/components/ui/sheet';
import { JsonTree } from './JsonTree';
import { DiffView } from './DiffView';

type Mode = 'json' | 'text';

const MUTATIONS: { label: string; value: string; mode: Mode }[] = [
  { label: 'HTML XSS', value: '<img src=x onerror=alert(document.domain)>', mode: 'text' },
  { label: 'SVG onload', value: '<svg onload=alert(document.domain)>', mode: 'text' },
  { label: 'JS eval', value: 'alert(document.domain)', mode: 'text' },
  { label: 'javascript: URL', value: 'javascript:alert(document.domain)', mode: 'text' },
  { label: '__proto__', value: '{"__proto__":{"dominatorPolluted":true}}', mode: 'json' },
];

const SPOOF: { value: OriginSpoofMode | 'page'; label: string; origin?: string }[] = [
  { value: 'page', label: 'Page origin (real postMessage)' },
  { value: 'evil', label: 'https://evil.com', origin: 'https://evil.com' },
  { value: 'prefix', label: 'https://evil.TARGET' },
  { value: 'suffix', label: 'https://TARGET.evil.com' },
  { value: 'custom', label: 'Custom origin' },
];

const BASE_TARGETS = ['window', 'top', 'parent', 'opener'];

function resolveTarget(message: ExtensionPostMessage): string {
  if (isResolvableFrame(message.toFrame)) return message.toFrame;
  if (isResolvableFrame(message.fromFrame)) return message.fromFrame;
  return 'window';
}

function spoofedOrigin(mode: OriginSpoofMode | 'page', real: string, custom: string): string | undefined {
  if (mode === 'page') return undefined;
  try {
    const url = new URL(real);
    if (mode === 'evil') return 'https://evil.com';
    if (mode === 'prefix') return url.protocol + '//evil.' + url.host;
    if (mode === 'suffix') return url.protocol + '//' + url.hostname + '.evil.com';
    if (mode === 'custom') return custom || 'https://evil.com';
  } catch {
    if (mode === 'custom') return custom || 'https://evil.com';
    return 'https://evil.com';
  }
  return 'https://evil.com';
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
  return (
    <Sheet open={!!message} onOpenChange={open => !open && onClose()}>
      {message && <ReplayForm key={message.id} message={message} frames={frames} />}
    </Sheet>
  );
}

function ReplayForm({ message, frames }: { message: ExtensionPostMessage; frames: FrameOption[] }) {
  const [payload, setPayload] = useState(message.message);
  const [mode, setMode] = useState<Mode>(message.dataType === 'string' ? 'text' : 'json');
  const [target, setTarget] = useState(resolveTarget(message));
  const [targetOrigin, setTargetOrigin] = useState(message.targetOrigin || '*');
  const [spoof, setSpoof] = useState<OriginSpoofMode | 'page'>('page');
  const [customOrigin, setCustomOrigin] = useState('https://evil.com');
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState(message.dataType !== 'string');

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

  const presentedOrigin = spoofedOrigin(spoof, message?.from || 'https://example.com', customOrigin);

  const send = async () => {
    setBusy(true);
    setResult(null);
    const outcome = await runReplay(target, mode, payload, targetOrigin, presentedOrigin);
    setResult(outcome);
    setBusy(false);
  };

  return (
      <SheetContent side="right" className="flex w-[540px] flex-col overflow-y-auto sm:max-w-none">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Send className="h-4 w-4" />
            Replay message
            <span className="font-mono text-xs font-normal text-muted-foreground">{hostOf(message.to)}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payload</span>
              <div className="flex items-center gap-1">
                {mode === 'json' && parseJson(payload) !== undefined && (
                  <button
                    type="button"
                    onClick={() => setTree(value => !value)}
                    className="rounded-md border px-1.5 py-px text-[10px] text-muted-foreground hover:bg-accent">
                    {tree ? 'Raw' : 'Tree'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPayload(prettyJson(payload))}
                  className="rounded-md border px-1.5 py-px text-[10px] text-muted-foreground hover:bg-accent">
                  Pretty
                </button>
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
            </div>
            {tree && mode === 'json' && parseJson(payload) !== undefined ? (
              <JsonTree value={payload} onChange={setPayload} />
            ) : (
              <textarea
                value={payload}
                onChange={event => setPayload(event.target.value)}
                spellCheck={false}
                rows={7}
                className="w-full resize-y rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
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
              <button
                type="button"
                onClick={() => {
                  const next = injectCanary(payload, makeCanary(), mode);
                  setPayload(next.text);
                  setMode(next.mode);
                }}
                className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-px text-[10px] font-medium text-sky-700 dark:text-sky-300">
                Canary all leaves
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayload(message.message);
                  setMode(message.dataType === 'string' ? 'text' : 'json');
                }}
                className="rounded-md border px-1.5 py-px text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent">
                Restore original
              </button>
            </div>
          </div>

          {payload !== message.message && <DiffView before={message.message} after={payload} />}

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

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Origin presented to listeners
            </span>
            <select
              value={spoof}
              onChange={event => setSpoof(event.target.value as OriginSpoofMode | 'page')}
              className="h-8 w-full rounded-md border bg-background px-2 text-[11px] outline-none">
              {SPOOF.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {spoof === 'custom' && (
              <input
                value={customOrigin}
                onChange={event => setCustomOrigin(event.target.value)}
                spellCheck={false}
                className="h-8 w-full rounded-md border bg-background px-2 font-mono text-[11px] outline-none"
              />
            )}
            {presentedOrigin && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Listeners will see <code className="font-mono">{presentedOrigin}</code> — this is how you prove a
                bypassable origin check. Real <code>postMessage</code> cannot spoof origin.
              </p>
            )}
          </label>

          <button
            type="button"
            disabled={busy || !!jsonError}
            onClick={send}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            <Send className="h-4 w-4" />
            {busy ? 'Sending…' : presentedOrigin ? 'Deliver spoofed origin' : 'Send to page'}
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
                ? result.spoofed
                  ? 'Delivered with a spoofed origin. Watch Confirmed for sink flows.'
                  : 'Delivered. The replayed send appears in the capture, and any resulting sink flow is confirmed live.'
                : result.error}
            </div>
          )}
        </div>
      </SheetContent>
  );
}
