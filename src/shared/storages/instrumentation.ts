import { OriginSpoofMode } from '@src/shared/types/message';
import { createStorage, StorageType } from './base';

export const SINK_KEYS = [
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'document.write',
  'eval',
  'Function',
  'setTimeout',
  'location',
  'srcdoc',
  'src',
  'setAttribute',
  'DOMParser',
  'createContextualFragment',
  'jquery',
  'cookie',
  'storage',
  'fetch',
  'script',
] as const;

export const SOURCE_KEYS = ['postMessage', 'location', 'referrer', 'windowName', 'history'] as const;

export type SinkKey = (typeof SINK_KEYS)[number];
export type SourceKey = (typeof SOURCE_KEYS)[number];

export type InstrumentationConfig = {
  sinks: Record<SinkKey, boolean>;
  sources: Record<SourceKey, boolean>;
  autoProbe: boolean;
  intercept: boolean;
  spoofOrigin: OriginSpoofMode;
  spoofCustom: string;
  canaryInjection: boolean;
  minTaint: number;
  taintTtl: number;
};

function allTrue<T extends string>(keys: readonly T[]): Record<T, boolean> {
  const out = {} as Record<T, boolean>;
  for (const key of keys) out[key] = true;
  return out;
}

export const DEFAULT_INSTRUMENTATION: InstrumentationConfig = {
  sinks: allTrue(SINK_KEYS),
  sources: allTrue(SOURCE_KEYS),
  autoProbe: false,
  intercept: false,
  spoofOrigin: 'off',
  spoofCustom: 'https://evil.com',
  canaryInjection: false,
  minTaint: 8,
  taintTtl: 12000,
};

export const SINK_LABELS: Record<SinkKey, string> = {
  innerHTML: 'innerHTML / outerHTML',
  outerHTML: 'outerHTML',
  insertAdjacentHTML: 'insertAdjacentHTML',
  'document.write': 'document.write',
  eval: 'eval',
  Function: 'new Function',
  setTimeout: 'setTimeout / setInterval (string)',
  location: 'location.href / assign / replace',
  srcdoc: 'iframe.srcdoc',
  src: 'element.src / href',
  setAttribute: 'setAttribute (URL attrs)',
  DOMParser: 'DOMParser.parseFromString',
  createContextualFragment: 'Range.createContextualFragment',
  jquery: 'jQuery html / append / extend',
  cookie: 'document.cookie',
  storage: 'localStorage / sessionStorage',
  fetch: 'fetch / XHR',
  script: 'script.src / script.text / import()',
};

export const SOURCE_LABELS: Record<SourceKey, string> = {
  postMessage: 'window.postMessage',
  location: 'location.hash / search / href',
  referrer: 'document.referrer',
  windowName: 'window.name',
  history: 'history.pushState / replaceState',
};

export const instrumentationStorage = createStorage<InstrumentationConfig>(
  'dominator-instrumentation',
  DEFAULT_INSTRUMENTATION,
  { storageType: StorageType.Local, liveUpdate: true },
);

export function mergeInstrumentation(raw: Partial<InstrumentationConfig> | null | undefined): InstrumentationConfig {
  const base = DEFAULT_INSTRUMENTATION;
  if (!raw) return { ...base, sinks: { ...base.sinks }, sources: { ...base.sources } };
  return {
    sinks: { ...base.sinks, ...(raw.sinks || {}) },
    sources: { ...base.sources, ...(raw.sources || {}) },
    autoProbe: Boolean(raw.autoProbe),
    intercept: Boolean(raw.intercept),
    spoofOrigin: raw.spoofOrigin || 'off',
    spoofCustom: raw.spoofCustom || base.spoofCustom,
    canaryInjection: Boolean(raw.canaryInjection),
    minTaint: typeof raw.minTaint === 'number' && raw.minTaint > 0 ? raw.minTaint : base.minTaint,
    taintTtl: typeof raw.taintTtl === 'number' && raw.taintTtl > 0 ? raw.taintTtl : base.taintTtl,
  };
}
