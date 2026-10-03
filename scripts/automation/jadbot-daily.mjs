// Native JadBot daily-schedule client and registration verifier.
//
//   node scripts/automation/jadbot-daily.mjs observe              GET the schedule and save ignored local readback
//   node scripts/automation/jadbot-daily.mjs verify-registration [--require-disabled] [--live]
//
// Only GET requests are made. The schedule is never enabled, run or edited here.
// The bearer token is read from the owner token file and is never stored.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEDULE_ID = 'wfs_361f98ad3bac';
export const PROJECT = 'prj_0e8ffc13d328';
export const PIN = Object.freeze({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
export const EXPECTED = Object.freeze({ name: 'axionbench-daily-update', cron: '30 6 * * *', timeZone: 'UTC', overlap: 'skip', command: 'npm run publish:daily' });
export const BASE_URL = 'http://127.0.0.1:7900';
export const READBACK = 'evidence/local/schedule/readback.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const pinned = (value, where) => assert.deepEqual(value, PIN, `${where}: model choice must be codex/gpt-6.1-sol/high`);

export function validateSchedule(schedule, { requireDisabled = false } = {}) {
  assert(schedule && typeof schedule === 'object', 'schedule readback missing');
  assert.equal(schedule.id, SCHEDULE_ID, 'schedule id mismatch');
  assert.equal(schedule.projectId, PROJECT, 'schedule project mismatch');
  for (const key of ['name', 'cron', 'timeZone', 'overlap']) assert.equal(schedule[key], EXPECTED[key], `schedule ${key} mismatch`);
  assert.equal(typeof schedule.enabled, 'boolean', 'schedule enabled state missing');
  if (requireDisabled) assert.equal(schedule.enabled, false, 'schedule must stay disabled until owner enablement');
  const t = schedule.template;
  assert(t && typeof t === 'object', 'schedule template missing');
  for (const key of ['plannerChoice', 'workerChoice', 'reviewerChoice', 'modelPin']) pinned(t[key], key);
  assert.equal(t.workerLimit, 1, 'workerLimit must be 1');
  assert.equal(t.collaborate, false, 'collaboration must be off');
  assert(Array.isArray(t.steps) && t.steps.length === 1, 'template must hold exactly one step');
  const [step] = t.steps;
  assert.equal(step.verifyCmd, EXPECTED.command, 'step must run the qualified daily transaction');
  pinned(step.choice, 'step.choice');
  pinned(step.workerChoice, 'step.workerChoice');
  assert.equal(step.workerLimit, 1, 'step workerLimit must be 1');
  assert.deepEqual(step.dependsOn, [], 'step must have no dependencies');
  for (const key of Object.keys(t)) assert(!/fallback|fast/i.test(key), `unexpected routing key ${key}`);
  return { id: schedule.id, enabled: schedule.enabled, cron: schedule.cron, timeZone: schedule.timeZone, overlap: schedule.overlap };
}

export async function sourceDigest() {
  return sha256(await readFile(fileURLToPath(import.meta.url)));
}

// Validates a saved readback record: the stored response bytes must hash to the
// recorded digest, parse to the expected schedule, and bind this client source.
export function validateReadback(record, { requireDisabled = false, source } = {}) {
  assert.equal(record?.schemaVersion, 1, 'readback schema mismatch');
  assert.equal(record.method, 'GET', 'readback must come from a GET');
  assert.equal(record.path, `/v1/workflow-schedules/${SCHEDULE_ID}`, 'readback path mismatch');
  assert.equal(record.status, 200, 'readback status must be 200');
  assert.equal(typeof record.body, 'string', 'readback body missing');
  assert.equal(record.bodySha256, sha256(Buffer.from(record.body)), 'readback body does not match recorded digest (forged or altered)');
  if (source !== undefined) assert.equal(record.sourceSha256, source, 'readback does not bind the current client source');
  let schedule;
  try { schedule = JSON.parse(record.body); } catch { assert.fail('readback body is not JSON'); }
  assert(Number.isFinite(record.at) && record.at >= schedule.checkedAt, 'readback predates the schedule check (stale)');
  assert(Number.isFinite(schedule.updatedAt) && schedule.updatedAt <= schedule.checkedAt, 'schedule timestamps inconsistent');
  return { schedule, ...validateSchedule(schedule, { requireDisabled }) };
}

async function fetchSchedule() {
  assert.equal(BASE_URL, 'http://127.0.0.1:7900', 'owner token restricted to local daemon');
  const token = (await readFile(resolve(process.env.JADBOT_TOKEN_PATH ?? '../../token'), 'utf8')).trim();
  const path = `/v1/workflow-schedules/${SCHEDULE_ID}`;
  const response = await fetch(BASE_URL + path, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  const body = await response.text();
  return { schemaVersion: 1, method: 'GET', path, status: response.status, at: Date.now(), body, bodySha256: sha256(Buffer.from(body)) };
}

export async function observe() {
  const record = await fetchSchedule();
  record.sourceSha256 = await sourceDigest();
  validateReadback(record, { source: record.sourceSha256 });
  await mkdir('evidence/local/schedule', { recursive: true, mode: 0o700 });
  await writeFile(READBACK, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  return record;
}

export async function verifyRegistration({ requireDisabled = false, live = false } = {}) {
  const record = JSON.parse(await readFile(READBACK, 'utf8'));
  const result = validateReadback(record, { requireDisabled, source: await sourceDigest() });
  if (live) {
    const fresh = await fetchSchedule();
    assert.equal(fresh.status, 200, 'live schedule readback failed');
    const current = JSON.parse(fresh.body);
    assert.equal(current.updatedAt, result.schedule.updatedAt, 'saved readback is stale: schedule changed since observation');
    validateSchedule(current, { requireDisabled });
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...flags] = process.argv.slice(2);
  try {
    if (command === 'observe') {
      const record = await observe();
      console.log(`Observed ${SCHEDULE_ID}: body ${record.bodySha256}`);
    } else if (command === 'verify-registration') {
      const r = await verifyRegistration({ requireDisabled: flags.includes('--require-disabled'), live: flags.includes('--live') });
      console.log(`Native schedule ${r.id} verified: cron "${r.cron}" ${r.timeZone}, enabled=${r.enabled}, overlap=${r.overlap}, codex/gpt-6.1-sol/high pinned.`);
    } else throw new Error('usage: jadbot-daily.mjs observe | verify-registration [--require-disabled] [--live]');
  } catch (error) { console.error(error.message); process.exit(1); }
}
