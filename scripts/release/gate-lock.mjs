// One release gate per worktree. Every browser gate rebuilds and serves the
// shared dist/ directory, so two overlapping runs empty it under each other and
// fail at random (the 2026-09-30 receipt: test:head-to-head and test:catalogue).
// The lock is a directory (atomic mkdir) with a heartbeat, so it also works when
// the two runs cannot see each other's process IDs (host and container).
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';

export const GATE_LOCK = 'test-results/.release-gate.lock';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function acquireGateLock({
  path = GATE_LOCK, staleMs = 30_000, heartbeatMs = 5_000, waitMs = 25 * 60_000, pollMs = 2_000, log = console.error,
} = {}) {
  await mkdir(dirname(path), { recursive: true });
  const deadline = Date.now() + waitMs;
  let announced = false;
  for (;;) {
    try {
      await mkdir(path);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const age = await stat(path).then((info) => Date.now() - info.mtimeMs, () => null);
    if (age === null) continue; // released between mkdir and stat
    if (age > staleMs) {
      // Only one waiter can win this rename, so a fresh lock is never removed.
      const grave = `${path}.stale-${process.pid}-${Date.now()}`;
      if (await rename(path, grave).then(() => true, () => false)) {
        log(`Removed a stale release-gate lock (no heartbeat for ${Math.round(age / 1000)} s).`);
        await rm(grave, { recursive: true, force: true });
      }
      continue;
    }
    if (Date.now() >= deadline) {
      const owner = await readFile(`${path}/owner.json`, 'utf8').catch(() => 'unknown owner');
      throw new Error(`Another release gate still holds ${path} after ${Math.round(waitMs / 1000)} s (${owner.trim()}). `
        + 'Two gates cannot share dist/. Wait for it to finish or stop it, then rerun.');
    }
    if (!announced) { log(`Another release gate is running in this worktree; waiting for it to finish (lock: ${path}).`); announced = true; }
    await sleep(pollMs);
  }
  await writeFile(`${path}/owner.json`, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
  const heartbeat = setInterval(() => { const now = new Date(); utimes(path, now, now).catch(() => {}); }, heartbeatMs);
  heartbeat.unref();
  let released = false;
  const releaseSync = () => { if (!released) { released = true; clearInterval(heartbeat); rmSync(path, { recursive: true, force: true }); } };
  process.once('exit', releaseSync);
  return async () => { releaseSync(); process.removeListener('exit', releaseSync); };
}
