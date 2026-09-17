import { type PluginOption } from 'vite';
import makeManifest from './plugins/make-manifest';
import addHmr from './plugins/add-hmr';
import watchRebuild from './plugins/watch-rebuild';
import inlineVitePreloadScript from './plugins/inline-vite-preload-script';

export const getPlugins = (isDev: boolean): PluginOption[] => [
  makeManifest({ getCacheInvalidationKey }),
  // NOTE: the former `customDynamicImport` plugin was dropped in the Vite 8 upgrade.
  // Vite 8 bundles with Rolldown, which has no `renderDynamicImport` hook. It was a
  // no-op here (this extension has no dynamic imports in src/), but if `import()` or
  // `React.lazy` is ever added, the Firefox build will need the URL rewrite reinstated.
  // You can toggle enable HMR in background script or view
  addHmr({ background: true, view: true, isDev }),
  isDev && watchRebuild({ afterWriteBundle: regenerateCacheInvalidationKey }),
  // For fix issue#177 (https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite/issues/177)
  inlineVitePreloadScript(),
];

const cacheInvalidationKeyRef = { current: generateKey() };

export function getCacheInvalidationKey() {
  return cacheInvalidationKeyRef.current;
}

function regenerateCacheInvalidationKey() {
  cacheInvalidationKeyRef.current = generateKey();
  return cacheInvalidationKeyRef;
}

function generateKey(): string {
  return `${Date.now().toFixed()}`;
}
