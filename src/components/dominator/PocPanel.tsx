import React, { useMemo, useState } from 'react';
import { Download, FlaskConical } from 'lucide-react';
import { ExtensionListenerMessage, ExtensionPostMessage } from '@src/shared/types/message';
import { buildPoc, capturedPayloadFor, payloadTemplates, PocKind } from '@src/shared/lib/poc';
import { hostOf } from '@src/shared/lib/format';
import { cn } from '@src/lib/utils';
import { CodeBlock, CopyButton } from './primitives';

const KINDS: { value: PocKind; label: string }[] = [
  { value: 'iframe', label: 'iframe' },
  { value: 'opener', label: 'opener / popup' },
  { value: 'snippet', label: 'console / Burp' },
];

/** Generates a copy/paste PoC page for a listener, with sink-aware payloads. */
export function PocPanel({
  listener,
  messages = [],
}: {
  listener: ExtensionListenerMessage;
  messages?: ExtensionPostMessage[];
}) {
  const captured = capturedPayloadFor(listener, messages);
  const templates = useMemo(() => payloadTemplates(listener.sinks, captured), [listener.sinks, captured]);
  const [index, setIndex] = useState(0);
  const [kind, setKind] = useState<PocKind>('iframe');
  const template = templates[index] ?? templates[0];
  const poc = useMemo(() => buildPoc(listener, template, kind), [listener, template, kind]);

  const download = () => {
    const blob = new Blob([poc], { type: kind === 'snippet' ? 'text/javascript' : 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      kind === 'snippet'
        ? `dominator-poc-${hostOf(listener.origin)}.js`
        : `dominator-poc-${hostOf(listener.origin)}.html`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <FlaskConical className="h-3 w-3" />
          Proof of concept
        </span>
        <div className="flex items-center gap-1">
          <CopyButton value={poc} label="Copy PoC" />
          <button
            type="button"
            onClick={download}
            title="Download PoC"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Download className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {KINDS.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            className={cn(
              'rounded-md border px-1.5 py-px text-[10px] font-medium transition-colors',
              kind === option.value ? 'border-primary/40 bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
            )}>
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {templates.map((option, optionIndex) => (
          <button
            key={option.label + optionIndex}
            type="button"
            onClick={() => setIndex(optionIndex)}
            title={option.hint}
            className={cn(
              'rounded-md border px-1.5 py-px text-[10px] font-medium transition-colors',
              optionIndex === index
                ? 'border-primary/40 bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}>
            {option.label}
          </button>
        ))}
      </div>

      {listener.originCheck === 'strict' || (listener.checksOrigin && listener.originCheck !== 'bypassable' && listener.originCheck !== 'none' && listener.originCheck !== 'source') ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          This listener validates <code>event.origin</code> strictly; serve the PoC from an allowed origin.
        </p>
      ) : listener.originCheck === 'bypassable' ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Origin check looks bypassable ({listener.originCheckDetail}). Try a prefix/suffix origin in Replay.
        </p>
      ) : listener.originCheck === 'source' ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          This listener checks <code>event.source</code>. Prefer the opener PoC.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">No origin check — any page can drive this listener.</p>
      )}

      <CodeBlock className="max-h-72">{poc}</CodeBlock>
    </div>
  );
}
