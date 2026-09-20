#!/usr/bin/env node
/**
 * Captures the store screenshots from a real run of the extension.
 *
 * Chrome is launched with `dist/` loaded, pointed at the deliberately vulnerable
 * demo page next to this file, and the extension's own pages are then opened as
 * background tabs and screenshotted through CDP. Background tabs matter: a
 * DOMinator page outside DevTools resolves its target through
 * `chrome.tabs.query({active: true})`, so the demo tab has to stay the active one
 * for the screenshots to show real captured traffic.
 *
 *   node utils/screenshots/capture.js [--headful]
 *
 * Output: store/screenshots/*.png at 1280x800, the Chrome Web Store size.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const outDir = path.join(rootDir, 'store', 'screenshots');
// Stable Chrome no longer honours --load-extension. Chrome for Testing still does:
//   npx @puppeteer/browsers install chrome@stable --path /tmp/browsers
// then point CHROME_PATH at the binary it prints.
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9333;
const SITE_PORT = 8733;
const WIDTH = 1280;
const HEIGHT = 800;
const headful = process.argv.includes('--headful');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The content script only matches http/https, so the demo has to be served. */
function serveDemo() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url, 'http://x').pathname) || 'demo.html';
    const file = path.join(here, name);
    if (!fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'text/plain' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(SITE_PORT, '127.0.0.1', () => resolve(server)));
}

async function fetchJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      /* Chrome is not listening yet */
    }
    await sleep(250);
  }
  throw new Error(`no response from ${url}`);
}

/** Minimal flat-session CDP client. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.ws.on('message', raw => {
      const msg = JSON.parse(raw);
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      msg.error ? entry.reject(new Error(`${entry.method}: ${msg.error.message}`)) : entry.resolve(msg.result);
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return new Cdp(ws);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  const dist = path.join(rootDir, 'dist');
  if (!fs.existsSync(path.join(dist, 'manifest.json'))) throw new Error('build dist/ first: npm run build');

  // Stale shots from an earlier run would otherwise sit next to the new ones.
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const server = await serveDemo();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dominator-shots-'));
  const args = [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--no-first-run',
    '--no-default-browser-check',
    // Recent Chrome ignores --load-extension unless that kill switch is disabled.
    '--disable-features=DisableLoadExtensionCommandLineSwitch,DialMediaRouteProvider,Translate',
    `http://127.0.0.1:${SITE_PORT}/demo.html#ref=newsletter`,
  ];
  if (!headful) args.unshift('--headless=new');

  const chrome = spawn(CHROME, args, { stdio: 'ignore' });
  const shots = [];

  try {
    const version = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const cdp = await Cdp.connect(version.webSocketDebuggerUrl);

    // An unpacked extension's id is the first 16 bytes of the SHA-256 of its absolute
    // path, each nibble mapped onto a-p. Deriving it beats waiting for the service
    // worker to appear as a target — an idle MV3 worker may never show up.
    const extensionId = [...createHash('sha256').update(dist).digest('hex').slice(0, 32)]
      .map(nibble => String.fromCharCode(97 + parseInt(nibble, 16)))
      .join('');
    console.log(`extension id ${extensionId}`);

    // The content script is registered by the service worker at runtime, so it only
    // reaches pages navigated after that: the demo tab has to be reloaded once.
    let worker = null;
    for (let i = 0; i < 60 && !worker; i++) {
      const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{}] });
      if (process.env.DEBUG_TARGETS) console.log(targetInfos.map(t => `${t.type} ${t.url}`).join('\n'));
      worker = targetInfos.find(t => t.url.startsWith(`chrome-extension://${extensionId}/`));
      if (!worker) await sleep(500);
    }
    if (!worker) {
      throw new Error(
        'the extension never started — stable Chrome ignores --load-extension; ' +
          'install Chrome for Testing and set CHROME_PATH (see the header of this file)',
      );
    }

    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{}] });
    const demo = targetInfos.find(t => t.type === 'page' && t.url.includes('demo.html'));
    const demoSession = (await cdp.send('Target.attachToTarget', { targetId: demo.targetId, flatten: true })).sessionId;
    await cdp.send('Page.enable', {}, demoSession);
    await cdp.send('Page.reload', {}, demoSession);

    // Let the demo page send a few rounds of traffic before anything is captured.
    await sleep(8000);
    const hooked = await cdp.send(
      'Runtime.evaluate',
      {
        expression: 'JSON.stringify(window.__DOMINATOR__ ? window.__DOMINATOR__.dump().messages.length : -1)',
        returnByValue: true,
      },
      demoSession,
    );
    console.log(`messages captured on the demo page: ${hooked.result.value}`);

    const capture = async (name, url, prepare) => {
      const { targetId } = await cdp.send('Target.createTarget', { url, background: true });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
      await sleep(3500);
      if (prepare) await prepare(cdp, sessionId);
      // The page resolved its tab while the demo tab was still the active one, so it
      // can be brought to the front now — a background tab has no surface to capture.
      await cdp.send('Target.activateTarget', { targetId });
      await sleep(750);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      // Hand focus back to the demo tab before this one goes away, or Chrome makes the
      // next screenshot tab the active one and it starts inspecting itself.
      await cdp.send('Target.activateTarget', { targetId: demo.targetId });
      const file = path.join(outDir, `${name}.png`);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      shots.push(path.relative(rootDir, file));
      console.log(`${path.relative(rootDir, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
      await cdp.send('Target.closeTarget', { targetId });
    };

    const click = text => async (client, sessionId) => {
      const expression = `(() => {
        const needle = ${JSON.stringify(text.toLowerCase())};
        const matches = node =>
          node.textContent.trim().toLowerCase().startsWith(needle) ||
          (node.getAttribute('title') || '').toLowerCase().startsWith(needle) ||
          (node.getAttribute('aria-label') || '').toLowerCase().startsWith(needle);
        const el = [...document.querySelectorAll('button, [role="tab"], a')].find(matches);
        if (!el) return 'not found: ' + needle;
        el.click();
        return 'clicked';
      })()`;
      const result = await client.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
      console.log(`  ${text}: ${result.result.value}`);
      await sleep(1500);
    };

    // Replay and Intercept are deliberately left out: both are gated on
    // `chrome.devtools.inspectedWindow`, so their controls do not exist outside a real
    // DevTools panel. See README.md in this folder for capturing those by hand.
    const panel = `chrome-extension://${extensionId}/src/pages/panel/index.html`;
    await capture('1-panel-messages', panel);
    await capture('2-panel-listeners', panel, click('Listeners'));
    await capture('3-panel-findings', panel, click('Findings'));
    await capture('4-options', `chrome-extension://${extensionId}/src/pages/options/index.html`);

    cdp.close();
  } finally {
    chrome.kill();
    server.close();
    await sleep(1000);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }

  console.log(`\n${shots.length} screenshots in store/screenshots/`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
