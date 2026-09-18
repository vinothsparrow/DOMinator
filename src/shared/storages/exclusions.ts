import { createStorage, StorageType } from '@src/shared/storages/base';
import { isValidMatchPattern, patternMatchesUrl, sitePattern, siteRuleId } from '@src/shared/lib/matchPattern';

export { isValidMatchPattern, patternMatchesUrl, sitePattern, siteRuleId };

/**
 * A set of match patterns DOMinator must not inject into.
 *
 * Grouped rather than one rule per pattern so a provider that serves its widget
 * from several origins stays a single switch in the UI.
 */
export type ExclusionRule = {
  /** Stable across releases: built-in toggles are persisted against it. */
  id: string;
  label: string;
  patterns: string[];
  enabled: boolean;
  /** Built-ins ship with the extension and can be disabled but not deleted. */
  builtIn?: boolean;
};

/**
 * Widgets that detect tampering with `postMessage` / `addEventListener` and
 * refuse to run once DOMinator has hooked them.
 *
 * These are usually third-party iframes inside an unrelated page, so excluding
 * the site you are on would not cover them — the frame URL has to be matched.
 */
export const BUILT_IN_RULES: readonly ExclusionRule[] = [
  {
    id: 'builtin:recaptcha',
    label: 'Google reCAPTCHA',
    builtIn: true,
    enabled: true,
    patterns: [
      '*://www.google.com/recaptcha/*',
      '*://www.google.com/sorry/*',
      '*://www.gstatic.com/recaptcha/*',
      '*://recaptcha.net/*',
      '*://www.recaptcha.net/*',
    ],
  },
  {
    id: 'builtin:hcaptcha',
    label: 'hCaptcha',
    builtIn: true,
    enabled: true,
    patterns: ['*://hcaptcha.com/*', '*://*.hcaptcha.com/*'],
  },
  {
    id: 'builtin:turnstile',
    label: 'Cloudflare Turnstile',
    builtIn: true,
    enabled: true,
    patterns: ['*://challenges.cloudflare.com/*'],
  },
];

/**
 * Only the built-in *toggles* are persisted, not the built-in rules themselves,
 * so patterns added in a later release show up without clearing user choices.
 */
type ExclusionState = {
  builtInState: Record<string, boolean>;
  custom: ExclusionRule[];
};

const DEFAULT_STATE: ExclusionState = { builtInState: {}, custom: [] };

export const exclusionStorage = createStorage<ExclusionState>('dominator-exclusions', DEFAULT_STATE, {
  storageType: StorageType.Local,
  liveUpdate: true,
});

/** Built-ins first, then the user's own rules. */
export function resolveRules(state: ExclusionState | null): ExclusionRule[] {
  const overrides = state?.builtInState ?? {};
  const builtIns = BUILT_IN_RULES.map(rule => ({
    ...rule,
    patterns: rule.patterns.slice(),
    enabled: overrides[rule.id] ?? rule.enabled,
  }));
  return builtIns.concat(state?.custom ?? []);
}

/** Every pattern belonging to an enabled rule, deduplicated. */
export function enabledPatterns(rules: ExclusionRule[]): string[] {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const pattern of rule.patterns) {
      if (isValidMatchPattern(pattern)) seen.add(pattern);
    }
  }
  return Array.from(seen);
}

export function setRuleEnabled(id: string, enabled: boolean): Promise<void> {
  return exclusionStorage.set(state => {
    if (id.startsWith('builtin:')) {
      return { ...state, builtInState: { ...state.builtInState, [id]: enabled } };
    }
    return { ...state, custom: state.custom.map(rule => (rule.id === id ? { ...rule, enabled } : rule)) };
  });
}

export function removeRule(id: string): Promise<void> {
  return exclusionStorage.set(state => ({ ...state, custom: state.custom.filter(rule => rule.id !== id) }));
}

/** Adds a rule, or re-enables and extends the existing one with the same id. */
export function addRule(rule: Omit<ExclusionRule, 'enabled'> & { enabled?: boolean }): Promise<void> {
  return exclusionStorage.set(state => {
    const existing = state.custom.find(candidate => candidate.id === rule.id);
    if (!existing) {
      return { ...state, custom: state.custom.concat({ enabled: true, ...rule }) };
    }
    const patterns = existing.patterns.concat(rule.patterns.filter(p => existing.patterns.indexOf(p) === -1));
    return {
      ...state,
      custom: state.custom.map(candidate =>
        candidate.id === rule.id ? { ...candidate, patterns, enabled: rule.enabled ?? true } : candidate,
      ),
    };
  });
}

/** The enabled rules that would stop DOMinator running on `url`. */
export function rulesMatchingUrl(rules: ExclusionRule[], url: string): ExclusionRule[] {
  if (!url) return [];
  return rules.filter(rule => rule.enabled && rule.patterns.some(pattern => patternMatchesUrl(pattern, url)));
}
