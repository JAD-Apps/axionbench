// Contract checks for the native JadBot daily schedule readback. Fixtures only;
// no network and no JadBot state is touched.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { checkReadback, checkSchedule, EXPECTED, READBACK_PATH, validateReadback, validateSchedule, sourceDigest, PIN, SCHEDULE_ID, PROJECT } from '../../scripts/automation/jadbot-daily.mjs';

const choice = () => ({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
const schedule = (over = {}) => ({
  id: EXPECTED.id, projectId: EXPECTED.projectId, name: EXPECTED.name, cron: '30 6 * * *', timeZone: 'UTC', enabled: false, overlap: 'skip', nextRunAt: null, updatedAt: NOW - 2000, checkedAt: NOW - 1500,
  template: { plannerChoice: choice(), workerChoice: choice(), reviewerChoice: choice(), modelPin: choice(), workerLimit: 1, collaborate: false,
    steps: [{ verifyCmd: 'npm run publish:daily', choice: choice(), workerChoice: choice(), workerLimit: 1, dependsOn: [] }] },
  ...over,
});
const NOW = 1_800_000_000_000;
const readback = (s = schedule(), over = {}) => {
  const raw = JSON.stringify(s);
  return { schemaVersion: 1, method: 'GET', path: `/v1/workflow-schedules/${EXPECTED.id}`, status: 200, at: NOW - 1000, body: raw, bodySha256: createHash('sha256').update(raw).digest('hex'), ...over };
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
  assert.ok(problems(readback(schedule(), { bodySha256: '0'.repeat(64) })).some((p) => /digest/.test(p)));
  assert.ok(problems(readback(schedule(), { body: JSON.stringify(schedule({ name: 'other' })) })).some((p) => /digest/.test(p)));
  assert.ok(problems(readback(schedule(), { at: NOW - 73 * 3600 * 1000 })).some((p) => /stale/.test(p)));
  assert.ok(problems(readback(schedule(), { at: NOW + 3600 * 1000 })).some((p) => /future/.test(p)));
  assert.ok(problems(readback(schedule(), { status: 404 })).some((p) => /status/.test(p)));
  assert.ok(problems(readback(schedule(), { path: '/v1/workflow-schedules/wfs_other' })).length);
});
test('the stored readback location is git-ignored', async () => {
  assert.match(await readFile('.gitignore', 'utf8'), /^evidence\/local\/$/m);
  assert.equal(READBACK_PATH.startsWith('evidence/local/'), true);
});

const strictSchedule = () => ({ ...schedule(), createdAt: 1, updatedAt: 1, checkedAt: 2 });
const strictRecord = (s = strictSchedule(), extra = {}) => ({ ...readback(s), sourceSha256: 'src', ...extra });
const strictCheck = r => validateReadback(r, { requireDisabled: true, source: 'src', now: NOW });
const shaLocal = t => createHash('sha256').update(Buffer.from(t)).digest('hex');
test('accepts the disabled pinned registration', () => {
  const result = strictCheck(strictRecord());
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
  assert.throws(() => strictCheck(strictRecord(s)), pattern);
});

test('rejects forged, stale, mismatched and non-GET readbacks', () => {
  const forged = strictRecord(); forged.body = forged.body.replace('"enabled":false', '"enabled":true');
  assert.throws(() => strictCheck(forged), /forged or altered/);
  assert.throws(() => strictCheck(strictRecord(strictSchedule(), { at: 1 })), /stale/);
  assert.throws(() => strictCheck(strictRecord(strictSchedule(), { sourceSha256: 'other' })), /current client source/);
  assert.throws(() => strictCheck(strictRecord(strictSchedule(), { method: 'POST' })), /GET/);
  assert.throws(() => strictCheck(strictRecord(strictSchedule(), { path: '/v1/workflow-schedules/wfs_other' })), /path mismatch/);
  assert.throws(() => strictCheck(strictRecord(strictSchedule(), { status: 500 })), /status/);
});

test('enabled state is only tolerated when disabled is not required', () => {
  const s = strictSchedule(); s.enabled = true;
  assert.equal(validateSchedule(s).enabled, true);
});

test('source digest is a sha256 hex string', async () => {
  assert.match(await sourceDigest(), /^[0-9a-f]{64}$/);
});

test('CLI rejects an unknown command', () => {
  const r = spawnSync('node', ['scripts/automation/jadbot-daily.mjs', 'enable'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage/);
});
