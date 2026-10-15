import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAdmission, validateRecoverySummary, validatePrivateGates, readReceipt, sha256, PRIVATE_BASE, PUBLIC_BASE, ARCHIVE_SHA, OLD_RUN } from '../../scripts/project/preflight.mjs';
import { fixtureRoot } from '../../scripts/public/fixture-root.mjs';
import { admissionFixture } from './preflight-fixtures.mjs';

test('complete scoped admission accepts explicit choices and observed provider configuration', () => {
  assert.equal(validateAdmission(admissionFixture()).admitted, true);
});

const negatives = [
  ['undrained worker', d => { d.oldRun.execution.activeWorkers = 1; }, /drained/],
  ...['activeSessions', 'startingSteps', 'verifyingSteps', 'backgroundSteps', 'authorizedSteps'].map(name => [`undrained ${name}`, d => { d.oldRun.execution[name] = ['still-active']; }, /drained/]),
  ['missing drain field', d => { delete d.oldRun.execution.backgroundSteps; }, /drained/],
  ['old phase starting', d => { d.oldRun.execution.phaseStarting = true; }, /starting/],
  ['old run resumed', d => { d.oldRun.status = 'running'; }, /paused/],
  ['historical failure rewritten', d => { d.oldRun.steps[0].status = 'verified'; }, /original failed/],
  ['native failed exit rewritten', d => { d.oldRun.steps[0].exitCode = 0; }, /native exit/],
  ['old session running', d => { d.oldSession.status = 'running'; }, /stopped/],
  ['admission before drain', d => { d.oldSession.endedAt = Date.now(); }, /before old drain/],
  ...['plannerChoice', 'workerChoice', 'reviewerChoice', 'modelPin'].map(name => [`${name} mismatch`, d => { d.run[name].effort = 'max'; }, /Sol|sol/]),
  ['collaboration enabled', d => { d.run.collaborate = true; }, /collaboration/],
  ['pin applied after admission', d => { d.run.modelPinAudit[0].at = Date.now(); }, /pin audit/],
  ['one missing step choice', d => { delete d.run.steps[7].choice; }, /sol/],
  ['step worker routing mismatch', d => { d.run.steps[4].workerChoice.model = 'gpt-6-luna'; }, /sol/],
  ['fan-out worker limit', d => { d.run.steps[4].workerLimit = 2; }, /one worker/],
  ['saved verification weakened', d => { d.run.steps[0].verifyCmd = 'true'; }, /verifier changed/],
  ['foreign worker receipt', d => { d.session.modelReceipt.sessionId = 'other'; }, /session mismatch/],
  ['unpinned effective choice', d => { d.session.effectiveChoice.model = 'gpt-6-luna'; }, /sol/],
  ['missing provider initialization', d => { delete d.session.modelReceipt.init; }, /not reported/],
  ['unknown provider initialization', d => { d.session.modelReceipt.init.source = 'assumed'; }, /not reported/],
  ['wrong provider effort', d => { d.session.modelReceipt.init.effort = 'medium'; }, /effort mismatch/],
  ['Fast ON', d => { d.session.modelReceipt.init.fastMode = 'on'; }, /Fast OFF/],
  ['unknown Fast', d => { delete d.session.modelReceipt.init.fastMode; }, /Fast OFF/],
  ['priority tier', d => { d.session.modelReceipt.init.serviceTier = 'priority'; }, /service tier/],
  ['missing provider execution', d => { d.session.modelReceipt.configurations = []; }, /execution configuration/],
  ['later executed model changed', d => { d.session.modelReceipt.configurations.push({ type: 'modelConfigObserved', model: 'gpt-6-luna', effort: 'high', serviceTier: 'default' }); }, /executed model/],
  ['later run receipt changed', d => { d.run.modelReceipts[0].init.fastMode = 'on'; }, /off/],
  ['later run execution missing', d => { d.run.modelReceipts[0].configurations = []; }, /execution configuration missing/],
  ['completion model changed', d => { d.run.modelCompletionReceipts.push({ pin: d.run.modelPin, requested: { ...d.run.modelPin, model: 'gpt-6-luna' }, events: [] }); }, /sol/],
  ['completed stage has no provider evidence', d => { d.run.modelCompletionReceipts.push({ state: 'completed', pin: d.run.modelPin, requested: d.run.modelPin, events: [] }); }, /provider initialization/],
  ['fallback permitted', d => { d.capabilities.fallback = 'automatic'; }, /prohibited/],
  ['another workflow running', d => { d.capabilities.activeRunIds.push('another-run'); }, /other native workflows/],
  ['private baseline mismatch', d => { d.project.git.lastCommit.hash = PUBLIC_BASE; }, /baseline mismatch/],
  ['container unavailable', d => { d.quality.docker.available = false; }, /isolation unavailable/],
  ['contract isolation mismatch', d => { d.contract.runtime.isolation = 'host'; }, /isolation mismatch/],
  ['inherited credentials', d => { d.quality.inheritedSecrets = true; }, /false/],
  ['read-only posture', d => { d.session.posture = 'read-only'; }, /full posture/],
  ['pending permission', d => { d.session.approvals = [{ status: 'pending' }]; }, /permission/],
  ['invented historical Fast', d => { d.capabilities.historicalFastMode = 'off'; }, /unknown/],
  ['invented historical tier', d => { d.capabilities.historicalServiceTier = 'default'; }, /unknown/],
  ['invented independent review', d => { d.capabilities.review.performed = true; }, /later stage/],
  ['no separate reviewer requirement', d => { d.capabilities.review.separateIdentityRequired = false; }, /true/],
  ['missing secret-name observation', d => { delete d.capabilities.secretNames; }, /secret-name/],
  ['missing recording capability', d => { delete d.capabilities.recording; }, /observations/],
  ['stale observations', d => { d.capabilities.at = new Date(Date.now() - 25 * 3600_000).toISOString(); }, /stale/],
];
for (const [label, mutate, expected] of negatives) test(`reject ${label}`, () => {
  const data = admissionFixture(); mutate(data); assert.throws(() => validateAdmission(data), expected);
});

test('recovery retains original negative result and exact baselines', () => {
  const manifest = { archiveSha256: ARCHIVE_SHA, baseCommit: PRIVATE_BASE, runId: OLD_RUN, status: 'failed', nativeExitCode: 1, passedPrivateGates: 21, failedAddedGate: 'verify:public' };
  const receipt = { privateBaseline: PRIVATE_BASE, publicBaseline: PUBLIC_BASE, archiveSha256: ARCHIVE_SHA, recoveredFiles: 526, deliveredCommit: null, publicDraft: { statusUnchanged: true } };
  const historical = { passed: false, results: [...Array.from({ length: 21 }, (_, i) => ({ script: `private-${i}`, exitCode: 0 })), { script: 'verify:public', exitCode: 1 }] };
  validateRecoverySummary(manifest, receipt, historical);
  assert.throws(() => validateRecoverySummary({ ...manifest, nativeExitCode: 0 }, receipt, historical));
  assert.throws(() => validateRecoverySummary(manifest, { ...receipt, publicBaseline: PRIVATE_BASE }, historical));
  assert.throws(() => validateRecoverySummary(manifest, { ...receipt, deliveredCommit: 'invented' }, historical));
  assert.throws(() => validateRecoverySummary(manifest, receipt, { ...historical, passed: true }));
  historical.results[21].exitCode = 0; assert.throws(() => validateRecoverySummary(manifest, receipt, historical));
});

test('interleaved failed public gate never displaces retained build/readback gates', () => {
  const privateGates = [...Array.from({ length: 19 }, (_, i) => `private-${i}`), 'build:release', 'release:check'];
  const historical = { results: [...privateGates.slice(0, 19).map(script => ({ script })), { script: 'verify:public' }, ...privateGates.slice(19).map(script => ({ script }))] };
  validatePrivateGates(privateGates, historical);
  assert.throws(() => validatePrivateGates(privateGates.slice(0, -1), historical), /private release gates changed/);
  assert.throws(() => validatePrivateGates(historical.results.slice(0, 21).map(row => row.script), historical), /private release gates changed/);
});

test('hash-bound API receipt rejects altered bytes and unavailable observations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axionbench-preflight-test-'));
  try {
    const body = { choice: 'synthetic' }, envelope = { schemaVersion: 1, method: 'GET', status: 200, body, bodySha256: sha256(Buffer.from(JSON.stringify(body))) };
    const write = data => writeFile(join(dir, 'fixture.json'), JSON.stringify(data));
    await write(envelope); assert.deepEqual(await readReceipt(dir, 'fixture'), body);
    await write({ ...envelope, body: { choice: 'changed' } }); await assert.rejects(readReceipt(dir, 'fixture'), /bytes changed/);
    await write({ ...envelope, status: 403 }); await assert.rejects(readReceipt(dir, 'fixture'), /unavailable/);
    await assert.rejects(readReceipt(dir, 'missing'), /ENOENT/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('boundary fixtures honour writable TMPDIR including an enclosing Git marker', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'axionbench-temp-regression-'));
  try {
    await mkdir(join(sandbox, '.git'));
    const path = await fixtureRoot(sandbox, { candidates: [sandbox] });
    assert(path.startsWith(join(sandbox, 'axionbench-public-tests-')));
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test('native EROFS retries a writable fixture directory without skipping assertions', async () => {
  const attempts = [];
  const path = await fixtureRoot('/fixture-product', { candidates: ['/read-only-tmp', '/writable-tmp'], prepare: async () => {}, make: async path => {
    attempts.push(path); if (attempts.length === 1) throw Object.assign(new Error('native read-only tmp'), { code: 'EROFS' }); return path + 'fixture';
  } });
  assert.equal(attempts.length, 2); assert.match(path, /^\/writable-tmp\//);
});

test('all unavailable fixture roots fail; unexpected errors never become a pass', async () => {
  await assert.rejects(fixtureRoot('/fixture-product', { candidates: ['/denied'], prepare: async () => {}, make: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } }), /No writable fixture directory/);
  await assert.rejects(fixtureRoot('/fixture-product', { candidates: ['/full'], prepare: async () => {}, make: async () => { throw Object.assign(new Error('full'), { code: 'ENOSPC' }); } }), /full/);
});
