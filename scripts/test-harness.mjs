import assert from 'node:assert/strict';
import { access, constants, mkdtemp, open, readdir, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { cp, mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { sha256, validateManifest } from './release/manifest.mjs';
import { publishableSource } from './release/source-identity.mjs';
import { chromium } from 'playwright-core';
import { createSiteServer } from './serve.mjs';

// Explicit production target; never accepts another origin or sends credentials.
export function parseBrowserTarget(args = process.argv.slice(2)) {
  const at = args.indexOf('--url');
  if (at < 0) { assert(!args.includes('--expect-product'), '--expect-product requires --url'); return null; }
  assert.equal(args.filter(x => x === '--url').length, 1, 'one browser target required');
  const url = new URL(args[at + 1]);
  assert.equal(url.href, 'https://axionbench.jadapps.app/', 'browser target must be the exact approved HTTPS origin');
  const expectedAt = args.indexOf('--expect-product');
  const expected = expectedAt < 0 ? null : args[expectedAt + 1];
  if (expected !== null) assert.match(expected, /^[a-f0-9]{64}$/, 'expected product digest');
  return { origin: url.origin, expected };
}
const selectedTarget = parseBrowserTarget();
async function remoteBytes(path) {
  const response = await fetch(selectedTarget.origin + '/' + path, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `production artifact ${path}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
let targetManifestBytes;
let targetManifest;
if (selectedTarget) {
  targetManifestBytes = await remoteBytes('release-manifest.json');
  targetManifest = validateManifest(JSON.parse(targetManifestBytes));
  assert(publishableSource(targetManifest), 'production code provenance is not publishable');
  if (selectedTarget.expected) assert.equal(targetManifest.productSha256, selectedTarget.expected, 'production changed from selected release');
}
export const browserTarget = selectedTarget ? { url: selectedTarget.origin,
  sourceCommit: targetManifest.sourceCommit, sourceArchiveSha256: targetManifest.sourceArchiveSha256 ?? null,
  productSha256: targetManifest.productSha256, dataSha256: targetManifest.dataSha256,
  controlSha256: targetManifest.controlSha256, dataOverlaySha256: targetManifest.dataOverlay?.overlaySha256 ?? null,
  revisionSha256: targetManifest.publication?.revisionSha256 ?? null, refreshKey: targetManifest.publication?.refreshKey ?? null,
  manifestSha256: sha256(targetManifestBytes), fixtures: false } : null;
export function browserBuild(options = {}) {
  if (selectedTarget) return { status: 0, stdout: 'Remote target selected; no local build. ' + JSON.stringify(browserTarget), stderr: '' };
  return spawnSync('npm', ['run', 'build'], options);
}
export async function readBrowserFile(file, encoding) {
  const path = file instanceof URL ? fileURLPath(file) : file;
  if (!selectedTarget) return readFile(file, encoding);
  const relative = path.replace(/^.*?\/(?:public|dist)\//, '').replace(/^(?:public|dist)\//, '');
  const row = targetManifest.files.find(f => f.path === relative);
  assert(row, `browser target has no declared artifact ${relative}`);
  const bytes = await remoteBytes(relative);
  assert.equal(bytes.length, row.bytes, 'production artifact size changed');
  assert.equal(sha256(bytes), row.sha256, 'production artifact hash changed');
  return encoding ? bytes.toString(encoding) : bytes;
}
const fileURLPath = url => decodeURIComponent(url.pathname);
async function assertTargetUnchanged() {
  if (selectedTarget) assert((await remoteBytes('release-manifest.json')).equals(targetManifestBytes), 'production revision changed during browser checks');
}

export async function retainBrowserEvidence(directory) {
  const path = directory instanceof URL ? decodeURIComponent(directory.pathname) : resolve(directory);
  const history = resolve('test-results/browser-history');
  await mkdir(history, { recursive: true });
  try { await cp(path, join(history, basename(path) + '-' + Date.now()), { recursive: true, errorOnExist: true, force: false }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

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

export async function withBuiltBrowser(run, { reducedMotion = 'reduce', hasTouch = false } = {}) {
  const server = selectedTarget ? null : createSiteServer(new URL('../dist/', import.meta.url).pathname);
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
    const createPage = async () => {
      const p = await browser.newPage(pageOptions);
      if (selectedTarget) {
        p.route = async () => { throw new Error('production browser evidence cannot intercept responses'); };
        p.context().route = async () => { throw new Error('production browser evidence cannot intercept responses'); };
      }
      return p;
    };
    const page = await createPage();
    const newPage = createPage;
    await run({ page, newPage, origin: selectedTarget?.origin ?? `http://127.0.0.1:${server.address().port}`, assert });
    await assertTargetUnchanged();
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
