import React, { useState } from 'react';
import { RefreshCw, Settings2, ShieldCheck, ShieldOff } from 'lucide-react';
import useStorage from '@src/shared/hooks/useStorage';
import {
  addRule,
  exclusionStorage,
  removeRule,
  resolveRules,
  rulesMatchingUrl,
  sitePattern,
  siteRuleId,
} from '@src/shared/storages/exclusions';
import { hostOf } from '@src/shared/lib/format';
import { Switch } from '@src/components/dominator/Switch';
import { cn } from '@src/lib/utils';

/**
 * Turns DOMinator's hooks off for the current site.
 *
 * The change only takes effect on the next document load, so a reload prompt
 * appears once something has been toggled.
 */
export function SiteToggle({ url, tabId, className }: { url: string; tabId: number; className?: string }) {
  const state = useStorage(exclusionStorage);
  const [dirty, setDirty] = useState(false);

  const rules = resolveRules(state);
  const host = hostOf(url);
  const known = Boolean(url) && host !== 'unknown';
  const siteRule = rules.find(rule => rule.id === siteRuleId(host));
  const siteDisabled = Boolean(siteRule?.enabled);
  // A third-party widget frame can be excluded while the page itself is not.
  const builtInMatches = rulesMatchingUrl(rules, url).filter(rule => rule.builtIn);

  const toggle = async () => {
    if (!known) return;
    if (siteDisabled) {
      await removeRule(siteRuleId(host));
    } else {
      await addRule({ id: siteRuleId(host), label: host, patterns: [sitePattern(host)] });
    }
    setDirty(true);
  };

  const reload = () => {
    if (tabId < 0) return;
    chrome.tabs.reload(tabId);
    window.close();
  };

  return (
    <div className={cn('rounded-md border', className)}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        {siteDisabled ? (
          <ShieldOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium leading-tight" title={host}>
            {known ? host : 'No page attached'}
          </p>
          <p className="truncate text-[10px] leading-tight text-muted-foreground">
            {siteDisabled ? 'Hooks off for this site' : 'Capturing on this site'}
          </p>
        </div>
        <button
          type="button"
          title="Manage exclusions"
          onClick={() => chrome.runtime.openOptionsPage()}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Settings2 className="h-3.5 w-3.5" />
        </button>
        <Switch
          on={!siteDisabled}
          onChange={toggle}
          label={siteDisabled ? `Enable DOMinator on ${host}` : `Disable DOMinator on ${host}`}
        />
      </div>

      {builtInMatches.length > 0 && (
        <p className="border-t px-2 py-1 text-[10px] text-muted-foreground">
          Also excluded by {builtInMatches.map(rule => rule.label).join(', ')}.
        </p>
      )}

      {dirty && (
        <div className="flex items-center gap-2 border-t bg-amber-500/10 px-2 py-1">
          <p className="flex-1 text-[10px] text-amber-700 dark:text-amber-400">Reload the page to apply.</p>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1 rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400">
            <RefreshCw className="h-3 w-3" />
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
