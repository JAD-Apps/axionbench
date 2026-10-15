import assert from 'node:assert/strict';
import { access, constants, mkdtemp, open, readdir, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createSiteServer } from './serve.mjs';
import { parseTarget } from './test-target.mjs';

async function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const entries = await readdir(cache, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter(item => item.isDirectory() && item.name.startsWith('chromium-')).reverse()) {
    for (const relative of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const candidate = join(cache, entry.name, relative);
      try { await access(candidate, constants.X_OK); return candidate; } catch { /* try next known layout */ }
    }
  }
  throw new Error('No cached Playwright Chromium found. Set CHROMIUM_PATH to an installed browser executable.');
}

// Production mode (target.production) opens the hosted origin directly: there is
// no local server, no rebuild and no request interception by this harness.
export async function withBuiltBrowser(run, { reducedMotion = 'reduce', hasTouch = false, target = parseTarget() } = {}) {
  const server = target.production ? null : createSiteServer(new URL('../dist/', import.meta.url).pathname);
  if (server) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  let runtimeDirectory;
  let runtimeHandle;
  try {
    const env = { ...process.env };
    if (process.platform === 'linux') {
      runtimeDirectory = await mkdtemp(join(tmpdir(), 'axionbench-browser-'));
      runtimeHandle = await open(runtimeDirectory, 'r');
      // Use the execution environment's permitted temporary area, outside source
      // evidence. A live descriptor keeps Chromium socket paths short even when
      // the sandbox supplies a long session TMPDIR. Reports and screenshots use
      // the ignored test-results runtime directory.
      const shortPath = `/proc/${process.pid}/fd/${runtimeHandle.fd}`;
      Object.assign(env, { TMPDIR: shortPath, TMP: shortPath, TEMP: shortPath });
    }
    browser = await chromium.launch({ executablePath: await browserExecutable(), args: ['--no-sandbox'], env });
    const pageOptions = { viewport: { width: 1440, height: 1000 }, reducedMotion, hasTouch };
    const page = await browser.newPage(pageOptions);
    const newPage = () => browser.newPage(pageOptions);
    await run({ page, newPage, origin: target.production ? target.url : `http://127.0.0.1:${server.address().port}`, assert, target });
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        await runtimeHandle?.close();
      } finally {
        try {
          if (runtimeDirectory) await rm(runtimeDirectory, { recursive: true, force: true });
        } finally {
          if (server) await new Promise(resolve => server.close(resolve));
        }
      }
    }
  }
}
