import assert from 'node:assert/strict';
import { access, constants, mkdir, mkdtemp, open, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createSiteServer } from './serve.mjs';

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

export async function withBuiltBrowser(run, { reducedMotion = 'reduce' } = {}) {
  const server = createSiteServer(new URL('../dist/', import.meta.url).pathname);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  let runtimeDirectory;
  let runtimeHandle;
  try {
    const env = { ...process.env };
    if (process.platform === 'linux') {
      const artifacts = new URL('../test-artifacts/', import.meta.url).pathname;
      await mkdir(artifacts, { recursive: true });
      runtimeDirectory = await mkdtemp(join(artifacts, 'browser-'));
      runtimeHandle = await open(runtimeDirectory, 'r');
      // Keep all writes in the permitted candidate directory. A live directory
      // descriptor gives Chromium a short socket pathname despite long worktrees.
      const shortPath = `/proc/${process.pid}/fd/${runtimeHandle.fd}`;
      Object.assign(env, { TMPDIR: shortPath, TMP: shortPath, TEMP: shortPath });
    }
    browser = await chromium.launch({ executablePath: await browserExecutable(), args: ['--no-sandbox'], env });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion });
    await run({ page, origin: `http://127.0.0.1:${server.address().port}`, assert });
  } finally {
    await browser?.close();
    await runtimeHandle?.close();
    if (runtimeDirectory) await rm(runtimeDirectory, { recursive: true, force: true });
    await new Promise(resolve => server.close(resolve));
  }
}
