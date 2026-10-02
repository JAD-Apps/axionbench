import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { PIN_AT, validateAdmission, observe } from '../../scripts/project/preflight.mjs';
import { outsideRepository, assertSafePath } from '../../scripts/public/boundary.mjs';
import { boundaryTestDirectory } from '../../scripts/public/temp-directory.mjs';
import { admissionFixture, CURRENT } from './fixtures.mjs';
import { checkRows, archiveCommit } from '../../scripts/project/recovery.mjs';
import { sha256 } from '../../scripts/project/preflight.mjs';
const verify = evidence => validateAdmission(evidence, { currentSessionId: CURRENT });

test('allows the two named historical exceptions without inventing observations', () => {
  const result = verify(admissionFixture());
  assert.equal(result.historical.length, 2);
  for (const row of result.historical) {
    assert.equal(row.providerReportedModel, 'unavailable (pre-pin)');
    assert.equal(row.fastMode, 'unavailable (pre-pin)');
    assert.equal(row.serviceTier, 'unavailable (pre-pin)');
  }
});
const negatives = [
  ['missing admission observations', d => { delete d.health; }, /daemon unavailable/],
  ['missing scoped pin', d => { delete d.run.modelPin; }, /pinned choice mismatch/],
  ['planner routing mismatch', d => { d.run.plannerChoice.effort = 'max'; }, /plannerChoice/],
  ['reviewer routing mismatch', d => { d.run.reviewerChoice.model = 'another-model'; }, /reviewerChoice/],
  ['missing owner pin audit', d => { d.run.modelPinAudit = []; }, /modelPinAudit/],
  ['implicit pending step choice', d => { d.run.steps[1].choice = null; }, /pinned choice mismatch/],
  ['worker fallback choice', d => { d.run.steps[0].workerChoice.provider = 'claude'; }, /pinned choice mismatch/],
  ['collaboration enabled', d => { d.run.collaborate = true; }, /collaboration/],
  ['old authorized step', d => { d.oldRun.execution.authorizedSteps.push('step'); }, /not drained/],
  ['old active session', d => { d.oldRun.execution.activeSessions.push('session'); }, /not drained/],
  ['old verifying process', d => { d.oldRun.execution.verifyingSteps.push('step'); }, /not drained/],
  ['old starting worker', d => { d.oldRun.execution.startingSteps.push('step'); }, /not drained/],
  ['old background process', d => { d.oldRun.execution.backgroundSteps.push('step'); }, /not drained/],
  ['old phase starting', d => { d.oldRun.execution.phaseStarting = true; }, /phase starting/],
  ['old failure rewritten to pass', d => { d.oldRun.steps[0].exitCode = 0; }, /failure exit lost/],
  ['old worker live', d => { d.oldSession.live = true; }, /still live/],
  ['project isolation missing', d => { d.contract.runtime.isolation = 'host'; }, /container isolation/],
  ['another AxionBench run is authorized', d => { d.projectRuns.items[1].execution.authorizedSteps.push('step'); }, /not drained/],
  ['unscoped project runs', d => { d.projectRuns.items[0].projectId = 'another-project'; }, /incorrectly scoped/],
  ['post-pin provider receipt missing', d => { d.run.modelReceipts = []; }, /missing post-pin/],
  ['receipt request merely echoed', d => { d.run.modelReceipts[0].init.source = 'requested'; }, /must be reported/],
  ['provider model differs', d => { d.run.modelReceipts[0].init.model = 'another-model'; }, /provider model mismatch/],
  ['Fast on', d => { d.run.modelReceipts[0].init.fastMode = 'on'; }, /Fast must be off/],
  ['Fast unobserved', d => { d.run.modelReceipts[0].init.fastMode = null; }, /Fast must be off/],
  ['provider effort differs', d => { d.run.modelReceipts[0].init.effort = 'max'; }, /provider effort mismatch/],
  ['tier missing', d => { d.run.modelReceipts[0].init.serviceTier = null; }, /tier must be default/],
  ['receipt violation', d => { d.run.modelReceipts[0].violation = { reason: 'mismatch' }; }, /provider violation/],
  ['later response model mismatch', d => { d.run.modelReceipts[0].observed.push({ model: 'another-model' }); }, /observed model mismatch/],
  ['later configuration effort mismatch', d => { d.run.modelReceipts[0].configurations.push({ model: 'gpt-6.1-sol', effort: 'max', serviceTier: 'default' }); }, /configuration effort/],
  ['effective routing mismatch', d => { d.sessions.items[2].effectiveChoice.effort = 'max'; }, /pinned choice mismatch/],
  ['historical exception dated after pin', d => { d.sessions.items[0].createdAt = PIN_AT; }, /must predate/],
  ['historical exception resumed', d => { d.sessions.items[0].status = 'running'; }, /stay stopped/],
  ['unnamed pre-pin session', d => { d.sessions.items[2].createdAt = PIN_AT - 1; }, /unnamed pre-pin/],
  ['omitted historical session', d => { d.sessions.items.shift(); }, /session omitted|missing named/],
  ['permission observations missing', d => { delete d.sessionDetails[CURRENT]; }, /permissions\/detail/],
  ['scheduler missing', d => { delete d.automations; }, /scheduler observation/],
  ['secret value returned', d => { d.secrets.items[0].value = 'synthetic'; }, /secret values prohibited/],
  ['browser observation missing', d => { delete d.computer; }, /browser capability/],
  ['recording observation missing', d => { delete d.recordings; }, /recording capability/],
  ['self review', d => { d.run.evaluation = { sessionId: CURRENT }; d.run.steps[0].sessionId = CURRENT; }, /independent/],
  ['unreceipted background AI', d => { d.run.modelCompletionReceipts.push({ pin: { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' }, requested: { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' }, events: [] }); }, /missing completion provider/],
  ['stale receipt', d => { d.at -= 86400001; }, /stale\/future/],
  ['future receipt', d => { d.at += 86400000; }, /stale\/future/],
];
for (const [label, mutate, pattern] of negatives) test(`rejects ${label}`, () => {
  const fixture = admissionFixture(); mutate(fixture); assert.throws(() => verify(fixture), pattern);
});
test('unrelated workflow activity is outside the scoped observation and does not block admission', () => {
  const fixture = admissionFixture(); fixture.unrelatedWorkflows = [{ projectId: 'another-project', status: 'running' }];
  assert.doesNotThrow(() => verify(fixture));
});
test('owner credentials cannot be sent to another host', async () => {
  await assert.rejects(observe({ baseUrl: 'https://example.invalid' }), /restricted to local daemon/);
});
test('public source rejects private admission code, fixtures and documentation', () => {
  for (const path of ['scripts/project/preflight.mjs', 'tests/project/fixtures.mjs', 'docs/project/PREFLIGHT.md']) {
    assert.throws(() => assertSafePath(path), /private project admission/);
  }
});
test('temporary-directory failures propagate without bypassing assertions or selecting a hidden fallback', async () => {
  const error = Object.assign(new Error('read-only verifier scratch'), { code: 'EROFS' });
  await assert.rejects(boundaryTestDirectory({ create: async () => { throw error; } }), e => e === error);
});
test('recovery rejects tampered bytes, wrong sizes, traversal and symlink files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'preflight-hashes-'));
  try {
    const bytes = Buffer.from('synthetic archive fixture');
    const row = { path: 'source.txt', bytes: bytes.length, sha256: sha256(bytes) };
    await writeFile(join(root, row.path), bytes);
    await checkRows(root, [row]);
    await assert.rejects(checkRows(root, [{ ...row, bytes: 0 }]), /byte count mismatch/);
    await assert.rejects(checkRows(root, [{ ...row, sha256: '0'.repeat(64) }]), /digest mismatch/);
    await assert.rejects(checkRows(root, [{ ...row, path: '../source.txt' }]), /unsafe archive/);
    await symlink(join(root, row.path), join(root, 'alias.txt'));
    await assert.rejects(checkRows(root, [{ ...row, path: 'alias.txt' }]), /not regular/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('immutable Git tar identity reads bounded header without EPIPE on large archives', () => {
  const result = spawnSync('git', ['archive', '--format=tar', 'HEAD', 'package.json'], { maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0);
  const large = Buffer.concat([result.stdout, Buffer.alloc(4 * 1024 * 1024)]);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  assert.equal(archiveCommit(large), head.stdout.trim());
});
test('native read-only /tmp regression uses supplied scratch and retains exact external-audit rejection', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'preflight-temp-'));
  try {
    await mkdir(join(scratch, '.git')); // mirrors verifier scratch within a repository
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { boundaryTestDirectory } from './scripts/public/temp-directory.mjs';
      console.log(await boundaryTestDirectory());
    `], { env: { ...process.env, TMPDIR: scratch }, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const base = child.stdout.trim(); assert(base.startsWith(join(scratch, 'axionbench-public-tests-')));
    const fixture = join(base, 'fixture'); await mkdir(join(fixture, '.git'), { recursive: true });
    const sibling = join(base, 'external-audit');
    assert.equal(await outsideRepository(fixture, sibling), sibling);
    await assert.rejects(outsideRepository(fixture, join(fixture, 'audit')), /outside the repository/);
    const alias = join(base, 'alias'); await symlink(fixture, alias, 'dir');
    await assert.rejects(outsideRepository(fixture, join(alias, 'audit')), /outside the repository/);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
