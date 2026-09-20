#!/usr/bin/env node
/**
 * Renders promo.html at the two Chrome Web Store tile sizes.
 *
 * No extension is involved, so this runs on ordinary Chrome — unlike capture.js,
 * which needs a Chrome for Testing build.
 *
 * Output: store/promo/small-promo-tile-440x280.png, marquee-promo-tile-1400x560.png
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const outDir = path.join(rootDir, 'store', 'promo');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9334;

const TILES = [
  { name: 'small-promo-tile-440x280', width: 440, height: 280 },
  { name: 'marquee-promo-tile-1400x560', width: 1400, height: 560 },
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dominator-promo-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--no-first-run',
      '--allow-file-access-from-files',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let version = null;
    for (let i = 0; i < 60 && !version; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      } catch {
        await sleep(250);
      }
    }
    if (!version) throw new Error('Chrome never opened a debugging port');

    const ws = new WebSocket(version.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    let id = 0;
    const pending = new Map();
    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      msg.error ? entry.reject(new Error(`${entry.method}: ${msg.error.message}`)) : entry.resolve(msg.result);
    });
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const next = ++id;
        pending.set(next, { resolve, reject, method });
        ws.send(JSON.stringify({ id: next, method, params, sessionId }));
      });

    fs.mkdirSync(outDir, { recursive: true });
    const url = `file://${path.join(here, 'promo.html')}`;

    for (const tile of TILES) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send(
        'Emulation.setDeviceMetricsOverride',
        { width: tile.width, height: tile.height, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
      await send('Page.navigate', { url }, sessionId);
      await sleep(1500);
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const file = path.join(outDir, `${tile.name}.png`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      console.log(`${path.relative(rootDir, file)} (${tile.width}x${tile.height})`);
      await send('Target.closeTarget', { targetId });
    }
    ws.close();
  } finally {
    chrome.kill();
    await sleep(500);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
