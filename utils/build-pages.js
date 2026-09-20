#!/usr/bin/env node
/**
 * Renders the repository's markdown into the static site published at
 * https://vinothsparrow.github.io/DOMinator/ — the home of the privacy policy URL
 * the extension stores require.
 *
 * README.md -> index.html, PRIVACY.md -> privacy.html, CHANGELOG.md -> changelog.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, '_site');

const PAGES = [
  { source: 'README.md', out: 'index.html', title: 'DOMinator' },
  { source: 'PRIVACY.md', out: 'privacy.html', title: 'Privacy Policy — DOMinator' },
  { source: 'CHANGELOG.md', out: 'changelog.html', title: 'Changelog — DOMinator' },
];

/** Links between the markdown files have to become links between the rendered pages. */
const REWRITES = [
  [/href="(\.\/)?PRIVACY\.md"/g, 'href="privacy.html"'],
  [/href="(\.\/)?CHANGELOG\.md"/g, 'href="changelog.html"'],
  [/href="(\.\/)?README\.md"/g, 'href="index.html"'],
];

const template = (title, body) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="icon" href="public/icon128.png" />
    <style>
      :root { color-scheme: light dark; --fg: #1a1c21; --bg: #ffffff; --muted: #5b6270; --line: #e3e6ec; --code-bg: #f4f5f8; --link: #2c53c4; }
      @media (prefers-color-scheme: dark) {
        :root { --fg: #e7e9ee; --bg: #14161a; --muted: #9aa2b1; --line: #2a2e36; --code-bg: #1d2026; --link: #8fb0ff; }
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      main { max-width: 46rem; margin: 0 auto; padding: 3rem 1rem 5rem; }
      h1, h2, h3 { line-height: 1.25; margin-top: 2.2rem; }
      h1 { font-size: 2rem; } h2 { font-size: 1.35rem; } h3 { font-size: 1.1rem; }
      a { color: var(--link); }
      code { background: var(--code-bg); padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }
      pre { background: var(--code-bg); padding: 1rem; border-radius: 8px; overflow-x: auto; }
      pre code { background: none; padding: 0; }
      table { border-collapse: collapse; width: 100%; margin: 1.5rem 0; display: block; overflow-x: auto; }
      th, td { border: 1px solid var(--line); padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
      th { background: var(--code-bg); }
      img { max-width: 100%; }
      nav { border-bottom: 1px solid var(--line); padding-bottom: 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
      nav a { margin-right: 1.25rem; text-decoration: none; }
      footer { margin-top: 4rem; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.85rem; }
    </style>
  </head>
  <body>
    <main>
      <nav>
        <a href="index.html">Overview</a><a href="privacy.html">Privacy</a><a href="changelog.html">Changelog</a>
        <a href="https://github.com/vinothsparrow/DOMinator">GitHub</a>
      </nav>
      ${body}
      <footer>DOMinator — MIT licensed. Test only what you are authorised to test.</footer>
    </main>
  </body>
</html>
`;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'public'), { recursive: true });

for (const icon of fs.readdirSync(path.join(rootDir, 'public')).filter(f => f.endsWith('.png'))) {
  fs.copyFileSync(path.join(rootDir, 'public', icon), path.join(outDir, 'public', icon));
}

for (const page of PAGES) {
  const markdown = fs.readFileSync(path.join(rootDir, page.source), 'utf8');
  const body = REWRITES.reduce((html, [from, to]) => html.replace(from, to), marked.parse(markdown));
  fs.writeFileSync(path.join(outDir, page.out), template(page.title, body));
  console.log(`${page.source} -> _site/${page.out}`);
}
