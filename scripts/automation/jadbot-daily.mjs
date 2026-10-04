<<<<<<< HEAD
// Native JadBot daily schedule client. Read-only: it only issues GET requests
// and never creates, enables, runs or edits a schedule.
//   node scripts/automation/jadbot-daily.mjs readback              fetch and store the schedule
//   node scripts/automation/jadbot-daily.mjs verify-registration [--require-disabled] [--live]
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED = Object.freeze({
  id: 'wfs_361f98ad3bac',
  projectId: 'prj_0e8ffc13d328',
  name: 'axionbench-daily-update',
  cron: '30 6 * * *',
  timeZone: 'UTC',
  overlap: 'skip',
  command: 'npm run publish:daily',
  choice: Object.freeze({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' }),
});
export const READBACK_PATH = 'evidence/local/native-schedule.json'; // git-ignored
export const MAX_AGE_MS = 72 * 60 * 60 * 1000;
const BASE = 'http://127.0.0.1:7900';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const sameChoice = (value) => value && value.provider === EXPECTED.choice.provider && value.model === EXPECTED.choice.model && value.effort === EXPECTED.choice.effort && Object.keys(value).length === 3;

// Returns a list of problems; empty means the schedule matches the contract.
export function checkSchedule(schedule, { requireDisabled = false } = {}) {
  const problems = [];
  const bad = (message) => problems.push(message);
  if (!schedule || typeof schedule !== 'object') return ['schedule is not an object'];
  for (const key of ['id', 'projectId', 'name', 'cron', 'timeZone', 'overlap']) {
    if (schedule[key] !== EXPECTED[key]) bad(`${key} is ${JSON.stringify(schedule[key])}, expected ${JSON.stringify(EXPECTED[key])}`);
  }
  if (typeof schedule.enabled !== 'boolean') bad('enabled is not a boolean');
  else if (requireDisabled && schedule.enabled) bad('schedule is enabled but must stay disabled until the first deployment is proven');
  if (requireDisabled && schedule.nextRunAt != null) bad('a disabled schedule must have no nextRunAt');
  const template = schedule.template;
  if (!template || typeof template !== 'object') return [...problems, 'template is missing'];
  for (const key of ['plannerChoice', 'workerChoice', 'reviewerChoice', 'modelPin']) {
    if (!sameChoice(template[key])) bad(`template.${key} is not codex/gpt-6.1-sol/high`);
  }
  if (template.workerLimit !== 1) bad('template.workerLimit must be 1');
  if (template.collaborate !== false) bad('template.collaborate must be false');
  if (!Array.isArray(template.steps) || template.steps.length !== 1) bad('template must have exactly one step');
  else {
    const [step] = template.steps;
    if (step.verifyCmd !== EXPECTED.command) bad(`step verifyCmd must be ${EXPECTED.command}`);
    if (!sameChoice(step.choice) || !sameChoice(step.workerChoice)) bad('step choices are not codex/gpt-6.1-sol/high');
    if (step.workerLimit !== 1) bad('step workerLimit must be 1');
  }
  return problems;
}

// A readback binds the parsed schedule to the exact bytes returned by the API.
export function checkReadback(readback, { now = Date.now(), requireDisabled = false } = {}) {
  const problems = [];
  if (!readback || typeof readback !== 'object') return ['readback is not an object'];
  if (readback.source !== 'jadbot-api' || readback.endpoint !== `/v1/workflow-schedules/${EXPECTED.id}`) problems.push('readback endpoint/source mismatch');
  if (readback.httpStatus !== 200) problems.push(`readback HTTP status is ${readback.httpStatus}`);
  if (typeof readback.raw !== 'string' || readback.rawSha256 !== sha256(readback.raw ?? '')) problems.push('readback hash does not match its raw response');
  else {
    try {
      if (JSON.stringify(JSON.parse(readback.raw)) !== JSON.stringify(readback.schedule)) problems.push('parsed schedule differs from the raw response');
    } catch { problems.push('raw response is not JSON'); }
  }
  const age = now - readback.fetchedAt;
  if (!Number.isFinite(age) || age < -60_000) problems.push('readback time is invalid or in the future');
  else if (age > MAX_AGE_MS) problems.push(`readback is stale (${Math.round(age / 3600000)} h old; limit ${MAX_AGE_MS / 3600000} h)`);
  return [...problems, ...checkSchedule(readback.schedule, { requireDisabled })];
}

async function get(path) {
  const token = (await readFile(join(homedir(), '.jadbot', 'token'), 'utf8')).trim();
  const response = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  return { status: response.status, text: await response.text() };
}

export async function readback() {
  const endpoint = `/v1/workflow-schedules/${EXPECTED.id}`;
  const { status, text } = await get(endpoint);
  const record = { source: 'jadbot-api', endpoint, httpStatus: status, fetchedAt: Date.now(), raw: text, rawSha256: sha256(text), schedule: status === 200 ? JSON.parse(text) : null };
  await mkdir(dirname(READBACK_PATH), { recursive: true });
  await writeFile(READBACK_PATH, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

// The project must hold exactly one schedule; a duplicate is a failure.
export async function checkNoDuplicates() {
  const { status, text } = await get(`/v1/workflow-schedules?projectId=${EXPECTED.projectId}`);
  if (status !== 200) return [`schedule list returned HTTP ${status}`];
  const items = JSON.parse(text).items ?? [];
  return items.length === 1 && items[0].id === EXPECTED.id ? [] : [`project has ${items.length} schedules: ${items.map((i) => i.id).join(', ')}`];
}

async function main(argv) {
  const [command, ...flags] = argv;
  if (command === 'readback') {
    const record = await readback();
    console.log(`readback HTTP ${record.httpStatus} stored at ${READBACK_PATH} sha256 ${record.rawSha256}`);
    return record.httpStatus === 200 ? 0 : 1;
  }
  if (command === 'verify-registration') {
    let record;
    try { record = JSON.parse(await readFile(READBACK_PATH, 'utf8')); } catch (error) {
      console.error(`missing or unreadable ${READBACK_PATH}: run "node scripts/automation/jadbot-daily.mjs readback" first (${error.message})`);
      return 1;
    }
    const requireDisabled = flags.includes('--require-disabled');
    const problems = checkReadback(record, { requireDisabled });
    if (flags.includes('--live')) problems.push(...await checkNoDuplicates());
    for (const problem of problems) console.error(`FAIL ${problem}`);
    if (!problems.length) console.log(`ok  ${EXPECTED.id} ${EXPECTED.cron} ${EXPECTED.timeZone} enabled=${record.schedule.enabled} overlap=${EXPECTED.overlap} codex/gpt-6.1-sol/high`);
    return problems.length ? 1 : 0;
  }
  console.error('usage: jadbot-daily.mjs readback | verify-registration [--require-disabled] [--live]');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
=======
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
>>>>>>> 28be14e6c8fbc593cb693089956e3a8f14a0cdb4
