import React, { useMemo, useState } from 'react';
import { Download, FlaskConical } from 'lucide-react';
import { ExtensionListenerMessage } from '@src/shared/types/message';
import { buildPoc, payloadTemplates } from '@src/shared/lib/poc';
import { hostOf } from '@src/shared/lib/format';
import { cn } from '@src/lib/utils';
import { CodeBlock, CopyButton } from './primitives';

/** Generates a copy/paste PoC page for a listener, with sink-aware payloads. */
export function PocPanel({ listener }: { listener: ExtensionListenerMessage }) {
  const templates = useMemo(() => payloadTemplates(listener.sinks), [listener.sinks]);
  const [index, setIndex] = useState(0);
  const template = templates[index] ?? templates[0];
  const poc = useMemo(() => buildPoc(listener, template), [listener, template]);

  const download = () => {
    const blob = new Blob([poc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `dominator-poc-${hostOf(listener.origin)}.html`;
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
            title="Download PoC as .html"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Download className="h-3 w-3" />
          </button>
        </div>
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

      {listener.checksOrigin && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          This listener validates <code>event.origin</code>; serve the PoC from an allowed origin for it to work.
        </p>
      )}

      <CodeBlock className="max-h-72">{poc}</CodeBlock>
    </div>
  );
}
