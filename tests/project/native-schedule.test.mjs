import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, validateReadback } from '../../scripts/automation/jadbot-daily.mjs';
import { findSecrets } from '../../scripts/automation/secrets.mjs';

const choice = { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high', fast: false, fallback: 'none' };
const good = () => ({
  id: 'wf_fixture', name: 'axionbench-daily-update', project: 'axionbench', isolation: 'project', enabled: false,
  schedule: { cron: '30 6 * * *', timezone: 'UTC', timezoneConfirmed: true }, nextRunAt: '2026-10-04T06:30:00.000Z',
  trigger: { id: 'trg_fixture', kind: 'native' }, workerLimit: 1, collaboration: false, overlap: 'forbid',
  modelChoice: choice, modelPin: choice, effectiveChoice: choice, providerReported: { model: 'gpt-6.1-sol', effort: 'high' },
});

test('template is credential-free and encodes the contract', () => {
  assert.equal(TEMPLATE.enabled, false);
  assert.equal(TEMPLATE.workerLimit, 1);
  assert.equal(TEMPLATE.collaboration, false);
  assert.deepEqual(findSecrets(JSON.stringify(TEMPLATE)), []);
  assert.deepEqual(validateReadback(good(), { requireDisabled: true }), []);
});

for (const [name, mutate, expected] of [
  ['enabled', (r) => { r.enabled = true; }, /disabled/],
  ['wrong timezone', (r) => { r.schedule.timezoneConfirmed = false; }, /timezone/],
  ['wrong next run', (r) => { r.nextRunAt = '2026-10-04T07:30:00Z'; }, /nextRunAt/],
  ['no trigger', (r) => { delete r.trigger; }, /trigger/],
  ['two workers', (r) => { r.workerLimit = 2; }, /workerLimit/],
  ['collaboration', (r) => { r.collaboration = true; }, /collaboration/],
  ['overlap', (r) => { r.overlap = 'allow'; }, /overlapping/],
  ['fast on', (r) => { r.modelPin.fast = true; }, /modelPin/],
  ['fallback', (r) => { r.effectiveChoice.fallback = 'luna'; }, /effectiveChoice/],
  ['other model', (r) => { r.providerReported.model = 'gpt-6.1-luna'; }, /providerReported/],
]) test(`rejects ${name}`, () => {
  const r = good(); mutate(r);
  assert.match(validateReadback(r, { requireDisabled: true }).join('\n'), expected);
});

test('verify-registration fails with the gap when no readback exists', () => {
  const out = spawnSync('node', ['scripts/automation/jadbot-daily.mjs', 'verify-registration', '--require-disabled', '--receipt', 'does/not/exist.json'], { encoding: 'utf8' });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /Integration gap/);
});
