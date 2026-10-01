// Regression for the 2026-09-30 release receipt: two overlapping verify:release
// runs shared dist/ and failed test:head-to-head and test:catalogue. The gate
// now serialises on a heartbeat lock; these cases pin that behaviour.
import { mkdir, mkdtemp, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { acquireGateLock } from '../scripts/release/gate-lock.mjs';

let dir;
let path;
const quiet = { log: () => {} };
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'axionbench-lock-')); path = join(dir, 'results', 'gate.lock'); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

test('a second gate waits until the first releases, never overlapping', async () => {
  const events = [];
  const first = await acquireGateLock({ path, ...quiet });
  events.push('first acquired');
  const second = acquireGateLock({ path, pollMs: 10, ...quiet }).then((release) => { events.push('second acquired'); return release; });
  await new Promise((resolve) => setTimeout(resolve, 60));
  expect(events).toEqual(['first acquired']);
  events.push('first released');
  await first();
  await (await second)();
  expect(events).toEqual(['first acquired', 'first released', 'second acquired']);
  await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('a live holder that outlasts the wait fails with an actionable message', async () => {
  const first = await acquireGateLock({ path, ...quiet });
  await expect(acquireGateLock({ path, waitMs: 40, pollMs: 10, ...quiet })).rejects.toThrow(/Another release gate still holds .*"pid":\d+.*cannot share dist/s);
  await first();
});

test('a lock without a heartbeat is taken over; a fresh one is not', async () => {
  await mkdir(path, { recursive: true });
  const old = new Date(Date.now() - 120_000);
  await utimes(path, old, old);
  const messages = [];
  const release = await acquireGateLock({ path, staleMs: 30_000, pollMs: 10, log: (message) => messages.push(message) });
  expect(messages.join()).toMatch(/stale release-gate lock/);
  await expect(acquireGateLock({ path, staleMs: 30_000, waitMs: 30, pollMs: 10, ...quiet })).rejects.toThrow(/still holds/);
  await release();
});

test('the heartbeat keeps a long-running holder fresh', async () => {
  const release = await acquireGateLock({ path, heartbeatMs: 10, ...quiet });
  const old = new Date(Date.now() - 120_000);
  await utimes(path, old, old);
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(Date.now() - (await stat(path)).mtimeMs).toBeLessThan(5_000);
  await release();
});
