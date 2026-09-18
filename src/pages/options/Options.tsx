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
            <h1 className="text-lg font-semibold leading-tight tracking-tight">Exclusions</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              DOMinator hooks <code className="font-mono text-[12px]">postMessage</code> and{' '}
              <code className="font-mono text-[12px]">addEventListener</code> in the page. Some widgets detect that and
              refuse to run, so they are skipped here. Changes apply on the next page load.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Built in</h2>
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
