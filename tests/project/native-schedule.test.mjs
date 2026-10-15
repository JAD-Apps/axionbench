// Contract checks for the native JadBot daily schedule readback. Fixtures only;
// no network and no JadBot state is touched.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { checkReadback, checkSchedule, EXPECTED, READBACK_PATH, validateReadback, validateSchedule, sourceDigest, PIN, SCHEDULE_ID, PROJECT } from '../../scripts/automation/jadbot-daily.mjs';

const choice = () => ({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
const schedule = (over = {}) => ({
  id: EXPECTED.id, projectId: EXPECTED.projectId, name: EXPECTED.name, cron: '30 6 * * *', timeZone: 'UTC', enabled: false, overlap: 'skip', nextRunAt: null,
  template: { plannerChoice: choice(), workerChoice: choice(), reviewerChoice: choice(), modelPin: choice(), workerLimit: 1, collaborate: false,
    steps: [{ verifyCmd: 'npm run publish:daily', choice: choice(), workerChoice: choice(), workerLimit: 1, dependsOn: [] }] },
  ...over,
});
const NOW = 1_800_000_000_000;
const readback = (s = schedule(), over = {}) => {
  const raw = JSON.stringify(s);
  return { source: 'jadbot-api', endpoint: `/v1/workflow-schedules/${EXPECTED.id}`, httpStatus: 200, fetchedAt: NOW - 1000, raw, rawSha256: createHash('sha256').update(raw).digest('hex'), schedule: s, ...over };
};
const problems = (r, opts = {}) => checkReadback(r, { now: NOW, requireDisabled: true, ...opts });

test('a matching disabled schedule passes', () => assert.deepEqual(problems(readback()), []));
test('an enabled schedule fails when disabled is required', () => {
  assert.ok(problems(readback(schedule({ enabled: true, nextRunAt: 1 }))).some((p) => /enabled/.test(p)));
  assert.deepEqual(checkSchedule(schedule({ enabled: true }), { requireDisabled: false }), []);
});
test('identity, cron, timezone and overlap mismatches fail', () => {
  for (const over of [{ id: 'wfs_other' }, { projectId: 'prj_x' }, { cron: '0 6 * * *' }, { timeZone: 'Europe/London' }, { overlap: 'queue' }]) {
    assert.ok(checkSchedule(schedule(over), { requireDisabled: true }).length, JSON.stringify(over));
  }
});
test('routing, worker limit and collaboration are pinned', () => {
  const t = (mutate) => { const s = schedule(); mutate(s.template); return checkSchedule(s, { requireDisabled: true }); };
  assert.ok(t((x) => { x.modelPin.effort = 'max'; }).length);
  assert.ok(t((x) => { x.workerChoice.model = 'gpt-6.1-luna'; }).length);
  assert.ok(t((x) => { x.reviewerChoice = { ...choice(), fast: true }; }).length);
  assert.ok(t((x) => { x.workerLimit = 2; }).length);
  assert.ok(t((x) => { x.collaborate = true; }).length);
  assert.ok(t((x) => { x.steps[0].verifyCmd = 'npm test'; }).length);
  assert.ok(t((x) => { x.steps.push(x.steps[0]); }).length);
});
test('forged, stale, failed and mismatched readbacks are rejected', () => {
  assert.ok(problems(readback(schedule(), { rawSha256: '0'.repeat(64) })).some((p) => /hash/.test(p)));
  assert.ok(problems(readback(schedule(), { schedule: schedule({ name: 'other' }) })).some((p) => /differs/.test(p)));
  assert.ok(problems(readback(schedule(), { fetchedAt: NOW - 73 * 3600 * 1000 })).some((p) => /stale/.test(p)));
  assert.ok(problems(readback(schedule(), { fetchedAt: NOW + 3600 * 1000 })).some((p) => /future/.test(p)));
  assert.ok(problems(readback(schedule(), { httpStatus: 404 })).some((p) => /HTTP status/.test(p)));
  assert.ok(problems(readback(schedule(), { endpoint: '/v1/workflow-schedules/wfs_other' })).length);
});
test('the stored readback location is git-ignored', async () => {
  assert.match(await readFile('.gitignore', 'utf8'), /^evidence\/local\/$/m);
  assert.equal(READBACK_PATH.startsWith('evidence/local/'), true);
});

const sha = text => createHash('sha256').update(Buffer.from(text)).digest('hex');
const strictSchedule = () => ({
  id: SCHEDULE_ID, projectId: PROJECT, name: 'axionbench-daily-update', cron: '30 6 * * *', timeZone: 'UTC', enabled: false, overlap: 'skip',
  createdAt: 1, updatedAt: 1, checkedAt: 2,
  template: {
    plannerChoice: { ...PIN }, workerChoice: { ...PIN }, reviewerChoice: { ...PIN }, modelPin: { ...PIN }, workerLimit: 1, collaborate: false,
    steps: [{ choice: { ...PIN }, workerChoice: { ...PIN }, workerLimit: 1, verifyCmd: 'npm run publish:daily', dependsOn: [] }],
  },
});
const record = (s = strictSchedule(), extra = {}) => {
  const body = JSON.stringify(s);
  return { schemaVersion: 1, method: 'GET', path: `/v1/workflow-schedules/${SCHEDULE_ID}`, status: 200, at: 3, body, bodySha256: sha(body), sourceSha256: 'src', ...extra };
};
const check = r => validateReadback(r, { requireDisabled: true, source: 'src', now: 3 });

test('accepts the disabled pinned registration', () => {
  const result = check(record());
  assert.equal(result.enabled, false);
  assert.equal(result.cron, '30 6 * * *');
});

const bad = [
  ['wrong id', s => { s.id = 'wfs_other'; }, /id mismatch/],
  ['wrong project', s => { s.projectId = 'prj_other'; }, /project mismatch/],
  ['enabled', s => { s.enabled = true; }, /disabled/],
  ['wrong cron', s => { s.cron = '0 6 * * *'; }, /cron mismatch/],
  ['wrong timezone', s => { s.timeZone = 'Europe/London'; }, /timeZone mismatch/],
  ['overlap allowed', s => { s.overlap = 'queue'; }, /overlap mismatch/],
  ['planner not pinned', s => { s.template.plannerChoice.model = 'gpt-5.6-sol'; }, /plannerChoice/],
  ['pin effort', s => { s.template.modelPin.effort = 'max'; }, /modelPin/],
  ['collaborate', s => { s.template.collaborate = true; }, /collaboration/],
  ['worker limit', s => { s.template.workerLimit = 2; }, /workerLimit/],
  ['two steps', s => { s.template.steps.push({ ...s.template.steps[0] }); }, /exactly one step/],
  ['other command', s => { s.template.steps[0].verifyCmd = 'npm test'; }, /daily transaction/],
  ['fallback key', s => { s.template.fallback = true; }, /routing key/],
];
for (const [name, mutate, pattern] of bad) test(`rejects ${name}`, () => {
  const s = strictSchedule(); mutate(s);
  assert.throws(() => check(record(s)), pattern);
});

test('rejects forged, stale, mismatched and non-GET readbacks', () => {
  const forged = record(); forged.body = forged.body.replace('"enabled":false', '"enabled":true');
  assert.throws(() => check(forged), /forged or altered/);
  assert.throws(() => check(record(strictSchedule(), { at: 1 })), /stale/);
  assert.throws(() => check(record(strictSchedule(), { sourceSha256: 'other' })), /current client source/);
  assert.throws(() => check(record(strictSchedule(), { method: 'POST' })), /GET/);
  assert.throws(() => check(record(strictSchedule(), { path: '/v1/workflow-schedules/wfs_other' })), /path mismatch/);
  assert.throws(() => check(record(strictSchedule(), { status: 500 })), /status/);
});

test('enabled state is only tolerated when disabled is not required', () => {
  const s = strictSchedule(); s.enabled = true;
  assert.equal(validateSchedule(s).enabled, true);
});

test('source digest is a sha256 hex string', async () => {
  assert.match(await sourceDigest(), /^[0-9a-f]{64}$/);
});

test('canonical readbacks reject age, future time, scheduled disabled jobs and step fallback keys', () => {
  const r=record();
  assert.throws(() => validateReadback(r,{now:73*3600_000}), /stale/);
  assert.throws(() => validateReadback({...r,at:120_000},{now:3}), /future/);
  const s=strictSchedule(); s.nextRunAt=10;
  assert.throws(() => validateSchedule(s,{requireDisabled:true}), /nextRunAt/);
  s.nextRunAt=null; s.template.steps[0].fallback=true;
  assert.throws(() => validateSchedule(s), /routing key/);
});

test('CLI rejects an unknown command', () => {
  const r = spawnSync('node', ['scripts/automation/jadbot-daily.mjs', 'enable'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage/);
});
