import React, { useMemo, useState } from 'react';
import { Braces, FlaskConical, Skull, Type } from 'lucide-react';
import { cn } from '@src/lib/utils';
import {
  isPlainObject,
  JsonPath,
  parseJson,
  pathKey,
  setAtPath,
  stringifyJson,
  typeOfJson,
  walkLeaves,
  withProtoKey,
} from '@src/shared/lib/jsonPath';
import { XSS_HTML, XSS_JS, XSS_URL, makeCanary } from '@src/shared/lib/canary';

export function JsonTree({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = useMemo(() => parseJson(value), [value]);
  const [open, setOpen] = useState<Record<string, boolean>>({ '(root)': true });

  if (parsed === undefined) {
    return <p className="text-[11px] text-muted-foreground">Payload is not JSON — switch to text or fix the syntax.</p>;
  }

  const apply = (next: unknown) => onChange(stringifyJson(next));

  const render = (node: unknown, path: JsonPath): React.ReactNode => {
    const type = typeOfJson(node);
    const key = pathKey(path);
    const expanded = open[key] !== false;
    if (type === 'object' && isPlainObject(node)) {
      const keys = Object.keys(node);
      return (
        <div>
          <button
            type="button"
            onClick={() => setOpen(current => ({ ...current, [key]: !expanded }))}
            className="font-mono text-[11px] text-muted-foreground">
            {expanded ? '▼' : '▶'} {path.length === 0 ? 'object' : String(path[path.length - 1])} {`{${keys.length}}`}
          </button>
          {expanded && (
            <div className="ml-3 border-l pl-2">
              {keys.map(child => (
                <div key={child} className="py-0.5">
                  {render(node[child], path.concat(child))}
                </div>
              ))}
              <LeafActions
                onInject={nextValue => apply(setAtPath(parsed, path.concat('_dominator'), nextValue))}
                onProto={() => onChange(withProtoKey(value))}
              />
            </div>
          )}
        </div>
      );
    }
    if (type === 'array' && Array.isArray(node)) {
      return (
        <div>
          <button
            type="button"
            onClick={() => setOpen(current => ({ ...current, [key]: !expanded }))}
            className="font-mono text-[11px] text-muted-foreground">
            {expanded ? '▼' : '▶'} {path.length === 0 ? 'array' : String(path[path.length - 1])} {`[${node.length}]`}
          </button>
          {expanded && (
            <div className="ml-3 border-l pl-2">
              {node.map((child, index) => (
                <div key={index} className="py-0.5">
                  {render(child, path.concat(index))}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    const label = path.length === 0 ? '(root)' : String(path[path.length - 1]);
    const display = type === 'string' ? JSON.stringify(node) : String(node);
    return (
      <div className="flex flex-wrap items-center gap-1 py-0.5">
        <span className="font-mono text-[11px] text-sky-700 dark:text-sky-300">{label}</span>
        <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">{display}</span>
        <LeafActions
          current={node}
          onInject={nextValue => apply(setAtPath(parsed, path, nextValue))}
          onProto={() => onChange(withProtoKey(value))}
        />
      </div>
    );
  };

  const leaves = walkLeaves(parsed).filter(leaf => leaf.type === 'string');

  return (
    <div className="space-y-2">
      <div className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-2">{render(parsed, [])}</div>
      {leaves.length > 0 && (
        <p className="text-[10px] text-muted-foreground">{leaves.length} string leaf{leaves.length === 1 ? '' : 's'} — inject XSS, a canary or a proto key on any of them.</p>
      )}
    </div>
  );
}

function LeafActions({
  current,
  onInject,
  onProto,
}: {
  current?: unknown;
  onInject: (value: unknown) => void;
  onProto?: () => void;
}) {
  return (
    <span className="inline-flex flex-wrap gap-0.5">
      <MiniAction title="Inject HTML XSS" onClick={() => onInject(XSS_HTML)}>
        <Type className="h-2.5 w-2.5" />
        xss
      </MiniAction>
      <MiniAction title="Inject javascript: URL" onClick={() => onInject(XSS_URL)}>
        js
      </MiniAction>
      <MiniAction
        title="Append a unique canary"
        onClick={() => {
          const canary = makeCanary();
          onInject(typeof current === 'string' && current.length ? current + canary : canary);
        }}>
        <FlaskConical className="h-2.5 w-2.5" />
        canary
      </MiniAction>
      <MiniAction title="Inject JS expression" onClick={() => onInject(XSS_JS)}>
        <Braces className="h-2.5 w-2.5" />
      </MiniAction>
      {onProto && (
        <MiniAction title="Set __proto__ on the payload" onClick={onProto}>
          <Skull className="h-2.5 w-2.5" />
          proto
        </MiniAction>
      )}
      <MiniAction title="Set constructor gadget" onClick={() => onInject({ prototype: { dominatorPolluted: true } })}>
        ctor
      </MiniAction>
    </span>
  );
}

function MiniAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-accent hover:text-foreground',
      )}>
      {children}
    </button>
  );
}

export function prettyOrRaw(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
