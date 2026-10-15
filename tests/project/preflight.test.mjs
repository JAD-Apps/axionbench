import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CHOICE, PRIVATE_BASE, PUBLIC_BASE, ARCHIVE_HASH, COORDINATOR_MANIFEST_HASH, OLD_RUN,
  assertDrained, assertModelPolicy, assertProviderReceipt, assertRecovery } from '../../scripts/project/preflight.mjs';
import { createFixtureTemp } from '../../scripts/public/fixture-temp.mjs';
import { outsideRepository, assertSafePath } from '../../scripts/public/boundary.mjs';

// Synthetic fixtures exercise rejection logic. They are never admission receipts.
const provider = () => ({ sessionId: 'fixture-worker', pin: { ...CHOICE }, requested: { ...CHOICE },
  effective: { ...CHOICE }, init: { source: 'reported', model: CHOICE.model, effort: 'high', fastMode: 'off', serviceTier: 'default' },
  configurations: [{ model: CHOICE.model, effort: 'high', serviceTier: 'default' }], observed: [], violation: null });
const policy = () => ({ plannerChoice: { ...CHOICE }, workerChoice: { ...CHOICE }, reviewerChoice: { ...CHOICE },
  modelPin: { ...CHOICE }, collaborate: false, modelPinAudit: [{ pin: { ...CHOICE } }],
  steps: Array.from({ length: 12 }, (_, index) => ({ id: `fixture-${index}`, choice: { ...CHOICE }, workerChoice: { ...CHOICE }, workerLimit: 1 })),
  modelReceipts: [provider()], sessions: [{ id: 'fixture-worker', requestedChoice: { ...CHOICE }, effectiveChoice: { ...CHOICE } }], modelCompletionReceipts: [] });
const drained = () => ({ id: OLD_RUN, status: 'paused', execution: { state: 'paused', activeWorkers: 0, phaseStarting: false,
  activeSessions: [], startingSteps: [], verifyingSteps: [], backgroundSteps: [], authorizedSteps: [] },
  steps: [{ id: 'step_e73d0dafa559', status: 'failed' }] });
const stopped = () => ({ id: '01a0f8bb-65ef-7fa6-9705-692c7a000aaa', runId: OLD_RUN, status: 'stopped', live: false });

test('synthetic complete drain and model receipts satisfy policy predicates', () => {
  assertDrained(drained(), stopped()); assertModelPolicy(policy()); assertProviderReceipt(provider());
});

for (const field of ['activeSessions', 'startingSteps', 'verifyingSteps', 'backgroundSteps', 'authorizedSteps']) {
  test(`drain rejects active or missing ${field}`, () => {
    const run = drained(); run.execution[field] = ['fixture-active']; assert.throws(() => assertDrained(run, stopped()), new RegExp(field));
    delete run.execution[field]; assert.throws(() => assertDrained(run, stopped()), new RegExp(field));
  });
}
test('drain rejects live stopped session and erased failed history', () => {
  const session = stopped(); session.live = true; assert.throws(() => assertDrained(drained(), session), /not stopped/);
  const run = drained(); run.steps[0].status = 'passed'; assert.throws(() => assertDrained(run, stopped()), /failed step history/);
});

for (const field of ['plannerChoice', 'workerChoice', 'reviewerChoice', 'modelPin']) {
  test(`policy rejects missing and off-policy ${field}`, () => {
    const run = policy(); run[field] = null; assert.throws(() => assertModelPolicy(run), new RegExp(field));
    run[field] = { ...CHOICE, effort: 'max' }; assert.throws(() => assertModelPolicy(run), new RegExp(field));
  });
}
test('policy rejects missing pin audit, collaboration and any step escalation', () => {
  for (const mutate of [r => { r.modelPinAudit = []; }, r => { r.collaborate = true; },
    r => { r.steps[7].workerChoice.model = 'fallback-model'; }, r => { r.steps[9].workerLimit = 2; }, r => { r.modelReceipts = []; }]) {
    const r = policy(); mutate(r); assert.throws(() => assertModelPolicy(r));
  }
});
test('provider request echoes, missing effort/Fast/tier and fallback observations fail closed', () => {
  for (const mutate of [r => { r.init.source = 'requested'; }, r => { r.init.effort = null; },
    r => { r.init.fastMode = null; }, r => { r.init.fastMode = 'on'; }, r => { r.init.serviceTier = 'priority'; },
    r => { r.effective.model = 'fallback-model'; }, r => { r.configurations = []; },
    r => { r.observed.push({ model: 'fallback-model' }); }, r => { r.violation = { reason: 'model mismatch' }; }]) {
    const r = provider(); mutate(r); assert.throws(() => assertProviderReceipt(r));
  }
});
test('each executed session must have its own reported model receipt', () => {
  const r = policy(); r.sessions.push({ id: 'fixture-unreported-reviewer', requestedChoice: CHOICE, effectiveChoice: CHOICE });
  assert.throws(() => assertModelPolicy(r), /fixture-unreported-reviewer has no provider receipt/);
});
test('completion stages cannot hide unreported or off-policy execution', () => {
  const r = policy(); r.modelCompletionReceipts = [{ pin: CHOICE, requested: CHOICE, state: 'started', events: [] }];
  assert.throws(() => assertModelPolicy(r), /completion lacks reported/);
});
test('native failure and both baselines remain mandatory', () => {
  const r = { privateBaseline: PRIVATE_BASE, publicBaseline: PUBLIC_BASE, archiveSha256: ARCHIVE_HASH, coordinatorManifestSha256: COORDINATOR_MANIFEST_HASH, sourceFilesVerified: 526,
    gitWrites: 0, oldNativeReleasePassed: false, oldNativeExitCode: 1 };
  const release = { passed: false, results: [...Array.from({ length: 21 }, (_, i) => ({ script: `private-${i}`, exitCode: 0 })), { script: 'verify:public', exitCode: 1 }] };
  assertRecovery(r, release);
  assert.throws(() => assertRecovery({ ...r, publicBaseline: PRIVATE_BASE }, release), /baseline/);
  assert.throws(() => assertRecovery({ ...r, archiveSha256: 'altered' }, release), /hash/);
  assert.throws(() => assertRecovery({ ...r, coordinatorManifestSha256: 'altered' }, release), /manifest hash/);
  assert.throws(() => assertRecovery(r, { ...release, passed: true }), /failure receipt/);
});
test('boundary fixtures use the permitted temp directory and propagate errors', async () => {
  let requested;
  await createFixtureTemp({ directory: '/fixture/writable-temp', create: async path => { requested = path; return path; } });
  assert.equal(requested, '/fixture/writable-temp/axionbench-public-tests-');
  const error = Object.assign(new Error('fixture EROFS'), { code: 'EROFS' });
  await assert.rejects(createFixtureTemp({ directory: '/fixture/read-only', create: async () => { throw error; } }), { code: 'EROFS' });
  const source = await readFile(new URL('../../scripts/public/test-boundary.mjs', import.meta.url), 'utf8');
  assert.match(source, /const base = await createFixtureTemp\(\)/);
  assert.doesNotMatch(source, /process\.platform === 'linux' \? '\/tmp'/);
});
test('writable temp under an enclosing Git boundary keeps audits outside each fixture', async () => {
  const base = await mkdtemp(join(tmpdir(), 'axionbench-preflight-'));
  try {
    await mkdir(join(base, '.git')); const dir = await createFixtureTemp({ directory: base });
    const fixture = join(dir, 'fixture'); await mkdir(fixture); await mkdir(join(fixture, '.git'));
    assert.equal(await outsideRepository(fixture, join(dir, 'audit')), join(dir, 'audit'));
    await assert.rejects(outsideRepository(fixture, join(fixture, 'audit')), /outside the repository/);
  } finally { await rm(base, { recursive: true, force: true }); }
});
test('immutable recovery rejects corrupt archive and traversal before reading a draft', async () => {
  const base = await mkdtemp(join(tmpdir(), 'axionbench-recovery-negative-'));
  try {
    await writeFile(join(base, 'archive.gz'), 'corrupted'); await writeFile(join(base, 'manifest.json'), JSON.stringify({ archiveSha256: ARCHIVE_HASH }));
    const result = spawnSync('python3', ['scripts/project/recover.py', '--archive', join(base, 'archive.gz'), '--manifest', join(base, 'manifest.json'),
      '--draft', join(base, 'must-not-read'), '--output', join(base, 'out')], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /coordinator archive SHA256 mismatch/);
    const paths = spawnSync('python3', ['-c', "from scripts.project.recover import safe_path\nfor p in ['../escape', '/absolute', 'a/../escape', 'a//b']:\n try: safe_path(p)\n except ValueError: continue\n raise AssertionError(p)\n"], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(paths.status, 0, paths.stderr);
  } finally { await rm(base, { recursive: true, force: true }); }
});
test('public boundary rejects private admission code, tests, docs and recovery receipts', () => {
  for (const path of ['scripts/project/preflight.mjs', 'tests/project/preflight.test.mjs', 'docs/PROJECT-PREFLIGHT.md',
    'evidence/local/recovery/drained-boundary-v1/recovery.json']) {
    assert.throws(() => assertSafePath(path), /private/);
  }
  assertSafePath('scripts/public/fixture-temp.mjs');
});
