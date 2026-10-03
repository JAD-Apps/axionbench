// Contract checks for the native JadBot daily schedule readback. Fixtures only;
// no network and no JadBot state is touched.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkReadback, checkSchedule, EXPECTED, READBACK_PATH } from '../../scripts/automation/jadbot-daily.mjs';

const choice = () => ({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
const schedule = (over = {}) => ({
  id: EXPECTED.id, projectId: EXPECTED.projectId, name: EXPECTED.name, cron: '30 6 * * *', timeZone: 'UTC', enabled: false, overlap: 'skip', nextRunAt: null,
  template: { plannerChoice: choice(), workerChoice: choice(), reviewerChoice: choice(), modelPin: choice(), workerLimit: 1, collaborate: false,
    steps: [{ verifyCmd: 'npm run publish:daily', choice: choice(), workerChoice: choice(), workerLimit: 1 }] },
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
