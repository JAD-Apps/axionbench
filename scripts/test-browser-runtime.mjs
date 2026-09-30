import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withBuiltBrowser } from './test-harness.mjs';

// Exercise real Chromium in a long sandbox-style TMPDIR. Its transient symlinks
// must stay outside the candidate, and both failure paths must remove them.
const scratch = await mkdtemp(join(tmpdir(), 'axionbench-runtime-test-'));
const runtimeRoot = join(scratch, 'long-session-directory-'.repeat(5), 'tmp');
const previousTmpdir = process.env.TMPDIR;
await mkdir(runtimeRoot, { recursive: true });
process.env.TMPDIR = runtimeRoot;
try {
  const callbackFailure = new Error('expected browser callback failure');
  await assert.rejects(withBuiltBrowser(async ({ page }) => {
    await page.goto('about:blank');
    assert.equal((await readdir(runtimeRoot)).filter(name => name.startsWith('axionbench-browser-')).length, 1);
    throw callbackFailure;
  }), error => error === callbackFailure);
  assert.deepEqual(await readdir(runtimeRoot), [], 'callback failure removes Chromium runtime files');

  const closeFailure = new Error('expected browser shutdown failure');
  await assert.rejects(withBuiltBrowser(async ({ page }) => {
    const browser = page.context().browser();
    const close = browser.close.bind(browser);
    browser.close = async (...args) => {
      await close(...args);
      throw closeFailure;
    };
  }), error => error === closeFailure);
  assert.deepEqual(await readdir(runtimeRoot), [], 'shutdown failure still removes Chromium runtime files');
  console.log('Browser runtime regression passed: long temporary paths, callback failure and shutdown failure leave no source scratch.');
} finally {
  if (previousTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previousTmpdir;
  await rm(scratch, { recursive: true, force: true });
}
