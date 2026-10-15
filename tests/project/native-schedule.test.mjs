// Native JadBot daily workflow registration contract. Readbacks are SYNTHETIC
// signed fixtures; nothing here registers, enables or contacts JadBot.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { TEMPLATE, nextDailyRun, parseOptions, validateRegistration, verifyRegistrationReadback } from '../../scripts/automation/jadbot-daily.mjs';
import { findSecrets } from '../../scripts/automation/secrets.mjs';
import { parseTrust } from '../../scripts/project/authority.mjs';
import { hex, registration, sign, trustFile } from './evidence-fixtures.mjs';

const anchors = parseTrust(trustFile(), { allowFixture: true });
const OBSERVED = '2026-10-04T05:00:00.000Z';
const enablement = () => ({ enabledAt: '2026-10-04T04:00:00Z', qualificationReceiptSha256: hex('q'), firstDeploymentReceiptSha256: hex('d') });
const body = (over = {}, require = 'disabled') => {
  const r = registration({ enabled: require === 'enabled', observedAt: OBSERVED, executed: require === 'enabled' ? 1 : 0 });
  if (require === 'enabled') r.body.enablement = enablement();
  over.mutate?.(r.body);
  return r.body;
};
const errors = (mutate, require = 'disabled') => validateRegistration(body({ mutate }, require), { observedAt: OBSERVED, require }).join('\n');

test('template is credential-free, disabled and encodes the contract', () => {
  assert.equal(TEMPLATE.enabled, false);
  assert.equal(TEMPLATE.workerLimit, 1);
  assert.equal(TEMPLATE.collaboration, false);
  assert.equal(TEMPLATE.schedule.cron, '30 6 * * *');
  assert.deepEqual(findSecrets(JSON.stringify(TEMPLATE)), []);
  assert.deepEqual(validateRegistration(body(), { observedAt: OBSERVED, require: 'disabled' }), []);
  assert.deepEqual(validateRegistration(body({}, 'enabled'), { observedAt: OBSERVED, require: 'enabled' }), []);
});

test('next execution is computed, not trusted', () => {
  assert.equal(nextDailyRun('30 6 * * *', '2026-10-04T05:00:00Z'), '2026-10-04T06:30:00.000Z');
  assert.equal(nextDailyRun('30 6 * * *', '2026-10-04T06:30:00Z'), '2026-10-05T06:30:00.000Z', 'strictly after the observation');
  assert.equal(nextDailyRun('30 6 * * *', '2026-12-31T23:59:00Z'), '2027-01-01T06:30:00.000Z');
  for (const cron of ['*/5 * * * *', '30 6 * * 1', '61 6 * * *', '30 6']) assert.throws(() => nextDailyRun(cron, OBSERVED), /unsupported cron|out of range/);
  assert.match(errors((r) => { r.nextRunAt = '2026-10-04T07:30:00.000Z'; }), /computed next execution 2026-10-04T06:30:00.000Z/);
  assert.match(errors((r) => { r.nextRunAt = '2026-10-05T06:30:00.000Z'; }), /computed next execution/, 'a plausible but wrong day is refused');
  assert.match(errors((r) => { delete r.nextRunAt; }), /nextRunAt/);
});

for (const [name, mutate, expected, require] of [
  ['enabled when disabled is required', (r) => { r.enabled = true; }, /must be disabled/],
  ['disabled when enabled is required', (r) => { r.enabled = false; }, /must be enabled/, 'enabled'],
  ['wrong timezone confirmation', (r) => { r.schedule.timezoneConfirmed = false; }, /timezone/],
  ['wrong cron', (r) => { r.schedule.cron = '30 7 * * *'; }, /cron must be/],
  ['no trigger', (r) => { delete r.trigger; }, /trigger/],
  ['non-native trigger', (r) => { r.trigger.kind = 'github'; }, /trigger/],
  ['two workers', (r) => { r.workerLimit = 2; }, /workerLimit/],
  ['collaboration', (r) => { r.collaboration = true; }, /collaboration/],
  ['overlap', (r) => { r.overlap = 'allow'; }, /overlapping/],
  ['other project', (r) => { r.project = 'docstudio'; }, /axionbench project/],
  ['other name', (r) => { r.name = 'weekly'; }, /name must be/],
  ['fast on', (r) => { r.modelPin.fast = true; }, /modelPin\.fast/],
  ['fallback', (r) => { r.effectiveChoice.fallback = 'luna'; }, /effectiveChoice\.fallback/],
  ['other model', (r) => { r.modelChoice.model = 'gpt-6.1-luna'; }, /modelChoice\.model/],
  ['other effort', (r) => { r.modelPin.effort = 'max'; }, /modelPin\.effort/],
  ['pin not scoped to the workflow', (r) => { r.modelPin.workflowId = 'wf_other'; }, /scoped to this workflow/],
  ['global pin', (r) => { r.modelPin.scope = 'global'; }, /scoped to this workflow/],
  ['observation for a session that never ran', (r) => { r.providerObservations = [{ sessionId: 's', model: 'gpt-6.1-sol', effort: 'high', fast: false }]; }, /never ran/],
  ['credential-shaped text', (r) => { r.note = `cfut_${'S'.repeat(40)}`; }, /credential-shaped/],
]) test(`rejects ${name}`, () => assert.match(errors(mutate, require), expected));

test('executed AI stages need one matching provider observation each; enabled jobs cite their qualification', () => {
  const enabled = (mutate) => errors(mutate, 'enabled');
  assert.match(enabled((r) => { r.providerObservations = []; }), /every executed AI stage needs one provider observation/);
  assert.match(enabled((r) => { r.providerObservations[0].model = 'gpt-6.1-luna'; }), /provider observation differs/);
  assert.match(enabled((r) => { r.providerObservations[0].fast = true; }), /provider observation differs/);
  assert.match(enabled((r) => { r.providerObservations.push({ ...r.providerObservations[0] }); }), /one provider observation/);
  assert.match(enabled((r) => { delete r.aiStagesExecuted; }), /aiStagesExecuted/);
  assert.match(enabled((r) => { delete r.enablement; }), /enabledAt/);
  assert.match(enabled((r) => { r.enablement.firstDeploymentReceiptSha256 = 'x'; }), /first-deployment/);
  assert.match(enabled((r) => { r.enablement.qualificationReceiptSha256 = undefined; }), /qualification/);
});

test('readbacks must be authenticated JadBot API evidence', () => {
  const env = (extra, over) => registration({ observedAt: OBSERVED, ...over }).envelope(extra);
  const ok = verifyRegistrationReadback(env(), anchors, { require: 'disabled', now: new Date('2026-10-04T05:30:00Z') });
  assert.equal(ok.body.trigger.id, 'trg_fixture');
  const now = new Date('2026-10-04T05:30:00Z');
  assert.throws(() => verifyRegistrationReadback(env({ endpoint: 'file:///local' }), anchors, { require: 'disabled', now }), /JadBot API endpoint/);
  assert.throws(() => verifyRegistrationReadback(env({ kind: 'something' }), anchors, { require: 'disabled', now }), /not a registration readback/);
  assert.throws(() => verifyRegistrationReadback(env({ daemonVersion: '' }), anchors, { require: 'disabled', now }), /daemon version/);
  assert.throws(() => verifyRegistrationReadback(env(), anchors, { require: 'disabled', now: new Date('2026-10-04T04:00:00Z') }), /future/);
  assert.throws(() => verifyRegistrationReadback(sign(env().payload, 'github'), anchors, { require: 'disabled', now }), /cannot attest/);
  const tampered = env(); tampered.payload.body.enabled = true;
  assert.throws(() => verifyRegistrationReadback(tampered, anchors, { require: 'enabled', now }), /signature is invalid/);
  // Unsigned local assertion JSON, the old receipt shape, proves nothing.
  assert.throws(() => verifyRegistrationReadback(body(), anchors, { require: 'disabled', now }), /signed envelope/);
});

test('option parsing is strict', () => {
  assert.deepEqual(parseOptions(['--require-enabled', '--trust', 't.json']), { '--require-enabled': true, '--trust': 't.json' });
  for (const args of [['--register'], ['--require-enabled', '--require-enabled'], ['--trust'], ['--trust', '--receipt', 'x'], ['--enable']]) assert.throws(() => parseOptions(args), /unsupported option|duplicate|needs a value/);
});

test('CLI: template, exactly one state option, no readback means exit 2 without pretending a session exists', async () => {
  const run = (...args) => spawnSync('node', ['scripts/automation/jadbot-daily.mjs', ...args], { encoding: 'utf8' });
  assert.equal(JSON.parse(run('template').stdout).enabled, false);
  assert.equal(run('template', '--enable').status, 1);
  assert.equal(run('bogus').status, 64);
  const dir = await mkdtemp(join(tmpdir(), 'axionbench-sched-'));
  try {
    assert.match(run('verify-registration', '--receipt', join(dir, 'none.json')).stderr, /exactly one of/);
    assert.match(run('verify-registration', '--require-disabled', '--require-enabled').stderr, /exactly one of/);
    const missing = run('verify-registration', '--require-disabled', '--receipt', join(dir, 'none.json'));
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /nothing is registered, enabled or verified/);
    const readback = join(dir, 'readback.json');
    await writeFile(readback, JSON.stringify(registration({ observedAt: OBSERVED }).envelope()));
    await writeFile(join(dir, 'trust.json'), JSON.stringify(trustFile()));
    const fixtureTrust = run('verify-registration', '--require-disabled', '--receipt', readback, '--trust', join(dir, 'trust.json'), '--now', '2026-10-04T05:30:00Z');
    assert.equal(fixtureTrust.status, 1);
    assert.match(fixtureTrust.stderr, /test fixture/, 'fixture anchors cannot authenticate a registration through the CLI');
    assert.match(run('verify-registration', '--require-disabled', '--receipt', readback).stderr, /trust file/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
