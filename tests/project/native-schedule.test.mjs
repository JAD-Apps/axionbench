import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateReadback, validateSchedule, sourceDigest, PIN, SCHEDULE_ID, PROJECT } from '../../scripts/automation/jadbot-daily.mjs';

const sha = text => createHash('sha256').update(Buffer.from(text)).digest('hex');
const schedule = () => ({
  id: SCHEDULE_ID, projectId: PROJECT, name: 'axionbench-daily-update', cron: '30 6 * * *', timeZone: 'UTC', enabled: false, overlap: 'skip',
  createdAt: 1, updatedAt: 1, checkedAt: 2,
  template: {
    plannerChoice: { ...PIN }, workerChoice: { ...PIN }, reviewerChoice: { ...PIN }, modelPin: { ...PIN }, workerLimit: 1, collaborate: false,
    steps: [{ choice: { ...PIN }, workerChoice: { ...PIN }, workerLimit: 1, verifyCmd: 'npm run publish:daily', dependsOn: [] }],
  },
});
const record = (s = schedule(), extra = {}) => {
  const body = JSON.stringify(s);
  return { schemaVersion: 1, method: 'GET', path: `/v1/workflow-schedules/${SCHEDULE_ID}`, status: 200, at: 3, body, bodySha256: sha(body), sourceSha256: 'src', ...extra };
};
const check = r => validateReadback(r, { requireDisabled: true, source: 'src' });

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
  const s = schedule(); mutate(s);
  assert.throws(() => check(record(s)), pattern);
});

test('rejects forged, stale, mismatched and non-GET readbacks', () => {
  const forged = record(); forged.body = forged.body.replace('"enabled":false', '"enabled":true');
  assert.throws(() => check(forged), /forged or altered/);
  assert.throws(() => check(record(schedule(), { at: 1 })), /stale/);
  assert.throws(() => check(record(schedule(), { sourceSha256: 'other' })), /current client source/);
  assert.throws(() => check(record(schedule(), { method: 'POST' })), /GET/);
  assert.throws(() => check(record(schedule(), { path: '/v1/workflow-schedules/wfs_other' })), /path mismatch/);
  assert.throws(() => check(record(schedule(), { status: 500 })), /status/);
});

test('enabled state is only tolerated when disabled is not required', () => {
  const s = schedule(); s.enabled = true;
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
