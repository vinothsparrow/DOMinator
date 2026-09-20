#!/usr/bin/env node
/**
 * Zips `dist/` into a store-ready archive: `releases/dominator-<target>-<version>.zip`.
 *
 * Both targets build into the same `dist/`, so the manifest is checked against the
 * requested target first — otherwise a `build:firefox` left in the tree would be
 * uploaded to the Chrome Web Store under a Chrome file name.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const releasesDir = path.join(rootDir, 'releases');

const target = process.argv[2];
if (target !== 'chrome' && target !== 'firefox') {
  console.error('usage: node utils/package.js <chrome|firefox>');
  process.exit(1);
}

const manifestPath = path.join(distDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`No build found at ${manifestPath} — run the build for this target first.`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const builtTarget = manifest.background?.service_worker ? 'chrome' : 'firefox';
if (builtTarget !== target) {
  console.error(`dist/ holds a ${builtTarget} build but ${target} was requested — rebuild before packaging.`);
  process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
if (manifest.version !== version) {
  console.error(`dist/manifest.json is version ${manifest.version}, package.json is ${version} — rebuild.`);
  process.exit(1);
}

// The stores reject the upload, not the build, so check the limits here: a rejected
// zip costs a round trip through the dashboard.
const LIMITS = { name: 45, description: 132 };
for (const locale of fs.readdirSync(path.join(distDir, '_locales'))) {
  const messagesPath = path.join(distDir, '_locales', locale, 'messages.json');
  const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  for (const [field, limit] of Object.entries(LIMITS)) {
    const key = field === 'name' ? 'extensionName' : 'extensionDescription';
    const value = messages[key]?.message ?? '';
    if (value.length > limit) {
      console.error(`_locales/${locale}: ${key} is ${value.length} characters, the store limit is ${limit}.`);
      process.exit(1);
    }
  }
}

fs.mkdirSync(releasesDir, { recursive: true });
const zipPath = path.join(releasesDir, `dominator-${target}-${version}.zip`);
fs.rmSync(zipPath, { force: true });

// The store wants the manifest at the root of the archive, so zip the contents of
// dist/ rather than the directory itself. -X drops macOS resource forks.
const result = spawnSync('zip', ['-r', '-X', '-q', zipPath, '.', '-x', '.DS_Store', '*/.DS_Store'], {
  cwd: distDir,
  stdio: 'inherit',
});
if (result.error) {
  console.error('Could not run `zip` — install it, or archive dist/ by hand.', result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`${path.relative(rootDir, zipPath)} (${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB)`);
