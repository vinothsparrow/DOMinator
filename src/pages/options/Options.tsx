import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import withSuspense from '@src/shared/hoc/withSuspense';
import withErrorBoundary from '@src/shared/hoc/withErrorBoundary';
import useStorage from '@src/shared/hooks/useStorage';
import {
  addRule,
  exclusionStorage,
  ExclusionRule,
  isValidMatchPattern,
  removeRule,
  resolveRules,
  setRuleEnabled,
} from '@src/shared/storages/exclusions';
import {
  DEFAULT_INSTRUMENTATION,
  instrumentationStorage,
  mergeInstrumentation,
  SINK_KEYS,
  SINK_LABELS,
  SOURCE_KEYS,
  SOURCE_LABELS,
  SinkKey,
  SourceKey,
} from '@src/shared/storages/instrumentation';
import { ThemeToggle } from '@src/components/dominator/ThemeToggle';
import { BrandMark } from '@src/components/dominator/Brand';
import { Switch } from '@src/components/dominator/Switch';

function RuleRow({ rule, onToggle, onRemove }: { rule: ExclusionRule; onToggle: () => void; onRemove?: () => void }) {
  return (
    <li className="flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{rule.label}</p>
        <ul className="mt-1 space-y-0.5">
          {rule.patterns.map(pattern => (
            <li key={pattern} className="truncate font-mono text-[11px] text-muted-foreground" title={pattern}>
              {pattern}
            </li>
          ))}
        </ul>
      </div>
      {onRemove && (
        <button
          type="button"
          title={`Delete ${rule.label}`}
          onClick={onRemove}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <Switch
        on={rule.enabled}
        onChange={onToggle}
        label={rule.enabled ? `Stop excluding ${rule.label}` : `Exclude ${rule.label}`}
      />
    </li>
  );
}

function InstrumentationSettings() {
  const raw = useStorage(instrumentationStorage);
  const config = mergeInstrumentation(raw);
  const set = (patch: Partial<typeof config>) => {
    void instrumentationStorage.set({ ...config, ...patch });
  };

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instrumentation</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Disable a sink if it breaks the page (eval and setTimeout are the usual suspects). Source toggles control which
        values are seeded into the taint tracker. Live probe / intercept switches also live in the DevTools panel.
      </p>

      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sinks</h3>
      <ul className="mb-4 rounded-lg border">
        {SINK_KEYS.filter(key => key !== 'outerHTML').map(key => (
          <li key={key} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <span className="min-w-0 flex-1 text-sm">{SINK_LABELS[key as SinkKey]}</span>
            <Switch
              on={config.sinks[key as SinkKey] !== false}
              onChange={next => set({ sinks: { ...config.sinks, [key]: next } })}
              label={`Toggle ${SINK_LABELS[key as SinkKey]}`}
            />
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sources</h3>
      <ul className="mb-4 rounded-lg border">
        {SOURCE_KEYS.map(key => (
          <li key={key} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <span className="min-w-0 flex-1 text-sm">{SOURCE_LABELS[key as SourceKey]}</span>
            <Switch
              on={config.sources[key as SourceKey] !== false}
              onChange={next => set({ sources: { ...config.sources, [key]: next } })}
              label={`Toggle ${SOURCE_LABELS[key as SourceKey]}`}
            />
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Min taint length</span>
          <input
            type="number"
            min={1}
            value={config.minTaint}
            onChange={event => set({ minTaint: Number(event.target.value) || DEFAULT_INSTRUMENTATION.minTaint })}
            className="h-9 w-full rounded-md border bg-background px-3 font-mono text-xs outline-none"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Taint TTL (ms)</span>
          <input
            type="number"
            min={1000}
            step={1000}
            value={config.taintTtl}
            onChange={event => set({ taintTtl: Number(event.target.value) || DEFAULT_INSTRUMENTATION.taintTtl })}
            className="h-9 w-full rounded-md border bg-background px-3 font-mono text-xs outline-none"
          />
        </label>
      </div>
    </section>
  );
}

const Options = () => {
  const state = useStorage(exclusionStorage);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const rules = resolveRules(state);
  const builtIns = rules.filter(rule => rule.builtIn);
  const custom = rules.filter(rule => !rule.builtIn);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const pattern = draft.trim();
    if (!pattern) return;
    if (!isValidMatchPattern(pattern)) {
      setError('Not a valid match pattern. Expected something like *://example.com/* or *://*.example.com/path/*');
      return;
    }
    await addRule({ id: 'custom:' + pattern, label: pattern, patterns: [pattern] });
    setDraft('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="mb-6 flex items-start gap-3">
          <BrandMark className="h-9 w-9" />
          <div className="flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">DOMinator</p>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">Settings</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              DOMinator hooks <code className="font-mono text-[12px]">postMessage</code> and{' '}
              <code className="font-mono text-[12px]">addEventListener</code> in the page. Some widgets detect that and
              refuse to run, so they are skipped here. Changes apply on the next page load.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <InstrumentationSettings />

        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Built in exclusions</h2>
          <ul className="rounded-lg border">
            {builtIns.map(rule => (
              <RuleRow key={rule.id} rule={rule} onToggle={() => setRuleEnabled(rule.id, !rule.enabled)} />
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            These widgets usually load in a third-party frame, so excluding the site you are visiting would not cover
            them.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your rules</h2>
          {custom.length > 0 ? (
            <ul className="rounded-lg border">
              {custom.map(rule => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onToggle={() => setRuleEnabled(rule.id, !rule.enabled)}
                  onRemove={() => removeRule(rule.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing excluded yet. Use the switch in the popup to turn DOMinator off for the site you are on.
            </p>
          )}

          <form onSubmit={submit} className="mt-3 flex items-start gap-2">
            <div className="flex-1">
              <input
                value={draft}
                onChange={event => {
                  setDraft(event.target.value);
                  if (error) setError('');
                }}
                placeholder="*://example.com/*"
                aria-label="Match pattern to exclude"
                aria-invalid={Boolean(error)}
                className="h-9 w-full rounded-md border bg-background px-3 font-mono text-xs outline-none ring-offset-background transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-accent">
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default withErrorBoundary(
  withSuspense(
    Options,
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>,
  ),
  <div className="flex h-screen items-center justify-center text-sm text-destructive">Something went wrong.</div>,
);
