// Private admission gate. Runtime receipts and recovery bytes stay ignored;
// this script never starts an AI stage, changes routing, commits or publishes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PIN = Object.freeze({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
export const PRIVATE_BASE = 'c3a915b717c999321e43148d522d160f4de805de';
export const PUBLIC_BASE = 'b6fa8b0376aef8efec44e2399f17120b560f2d0c';
export const ARCHIVE_SHA = 'd83ba8c9cd0c2982d7728cee27529035f44bf8864f60456f2e67a2824265a71b';
export const OLD_RUN = 'run_a898861f6684';
export const STEP = 'step_3b04f2c81afa';
export const VERIFY_CMD = 'node --test tests/project/preflight.test.mjs && node scripts/project/preflight.mjs --verify';
export const EVIDENCE = 'evidence/local/project-preflight';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const equalPin = (choice, label) => assert.deepEqual(choice, PIN, `${label}: expected codex/gpt-6.1-sol/high`);
const timestamp = (value, label) => { const at = typeof value === 'number' ? value : Date.parse(value); assert(Number.isFinite(at), `${label}: missing time`); return at; };

export function validateAdmission({ run, oldRun, oldSession, session, project, quality, contract, capabilities }, { now = Date.now() } = {}) {
  assert.equal(oldRun.id, OLD_RUN);
  assert.equal(oldRun.status, 'paused', 'old run must remain paused');
  const execution = oldRun.execution;
  assert(execution, 'missing drain evidence');
  assert.equal(execution.activeWorkers, 0, 'old workers have not drained');
  for (const name of ['activeSessions', 'startingSteps', 'verifyingSteps', 'backgroundSteps', 'authorizedSteps']) {
    assert(Array.isArray(execution[name]) && execution[name].length === 0, `old ${name} have not drained`);
  }
  assert.equal(execution.phaseStarting, false, 'old phase still starting');
  const delivered = oldRun.steps.find(step => step.sessionId === oldSession.id);
  assert(delivered && delivered.status === 'failed', 'preserve original failed step');
  assert.equal(delivered.exitCode, 1, 'preserve original native exit 1');
  assert.equal(delivered.verifyCmd, 'npm run verify:release', 'preserve original native command');
  assert.equal(oldSession.status, 'stopped', 'old session not stopped');
  assert(timestamp(oldSession.endedAt, 'old session end') <= timestamp(session.createdAt, 'new admission'), 'new worker admitted before old drain');
  for (const key of ['plannerChoice', 'workerChoice', 'reviewerChoice', 'modelPin']) equalPin(run[key], key);
  assert.equal(run.collaborate, false, 'collaboration must be disabled');
  assert(Array.isArray(run.modelPinAudit) && run.modelPinAudit.some(row => {
    try { equalPin(row.pin, 'pin audit'); return timestamp(row.at, 'pin audit time') <= session.createdAt; } catch { return false; }
  }), 'missing scoped pin audit before admission');
  assert.equal(run.steps.length, 12, 'all 12 project steps must have explicit choices');
  for (const step of run.steps) {
    equalPin(step.choice, `step ${step.index} choice`);
    equalPin(step.workerChoice, `step ${step.index} workerChoice`);
    assert.equal(step.workerLimit, 1, `step ${step.index}: one worker required`);
  }
  const step = run.steps.find(row => row.id === STEP);
  assert(step && step.sessionId === session.id, 'session is not the admitted preflight worker');
  assert.equal(step.verifyCmd, VERIFY_CMD, 'saved verifier changed');
  assert.equal(session.runId, run.id, 'session/run mismatch');
  assert.equal(session.projectId, project.id, 'session/project mismatch');
  assert.equal(run.projectId, project.id, 'run/project mismatch');
  assert.equal(project.git.lastCommit.hash, PRIVATE_BASE, 'private baseline mismatch');
  assert.equal(session.choiceSource, 'pin', 'worker is not using scoped pin');
  equalPin(session.requestedChoice, 'requested'); equalPin(session.effectiveChoice, 'effective');
  const receipt = session.modelReceipt;
  assert(receipt, 'missing provider receipt');
  assert.equal(receipt.sessionId, session.id, 'provider receipt session mismatch');
  for (const key of ['pin', 'requested', 'effective']) equalPin(receipt[key], `provider ${key}`);
  assert.equal(receipt.violation, null, 'model pin violation');
  assert.equal(receipt.init?.source, 'reported', 'provider initialization not reported');
  assert.equal(receipt.init?.model, PIN.model, 'provider model mismatch');
  assert.equal(receipt.init?.effort, PIN.effort, 'provider effort mismatch');
  assert.equal(receipt.init?.fastMode, 'off', 'Fast OFF not observed');
  assert.equal(receipt.init?.serviceTier, 'default', 'default service tier not observed');
  assert(Array.isArray(receipt.configurations) && receipt.configurations.length > 0, 'missing provider execution configuration');
  for (const event of [...receipt.configurations, ...(receipt.observed ?? [])]) {
    assert.equal(event.model, PIN.model, 'executed model mismatch');
    if (event.type === 'modelConfigObserved') {
      assert.equal(event.effort, PIN.effort, 'executed effort mismatch');
      assert.equal(event.serviceTier, 'default', 'executed tier mismatch');
    }
  }
  // A completion/session receipt may arrive while the gate is being prepared.
  // Reject mismatches anywhere in the run, not just in this worker's receipt.
  for (const row of run.modelReceipts ?? []) {
    for (const name of ['pin', 'requested', 'effective']) equalPin(row[name], `run receipt ${name}`);
    assert.equal(row.violation, null, 'run receipt violation');
    assert.equal(row.init?.source, 'reported', 'run provider initialization not reported');
    assert.equal(row.init?.model, PIN.model); assert.equal(row.init?.effort, PIN.effort);
    assert.equal(row.init?.fastMode, 'off'); assert.equal(row.init?.serviceTier, 'default');
    assert(row.configurations?.length > 0, 'run provider execution configuration missing');
    for (const event of [...(row.configurations ?? []), ...(row.observed ?? [])]) {
      assert.equal(event.model, PIN.model);
      if (event.type === 'modelConfigObserved') { assert.equal(event.effort, PIN.effort); assert.equal(event.serviceTier, 'default'); }
    }
  }
  for (const row of run.modelCompletionReceipts ?? []) {
    equalPin(row.pin, 'completion pin'); equalPin(row.requested, 'completion request');
    if (row.state === 'completed') {
      assert(row.events?.some(event => event.type === 'init'), 'completed AI stage lacks provider initialization');
      assert(row.events?.some(event => event.type === 'modelConfigObserved'), 'completed AI stage lacks executed model configuration');
    }
    for (const event of row.events ?? []) {
      if (event.model) assert.equal(event.model, PIN.model);
      if (event.type === 'init') { assert.equal(event.fastMode, 'off'); assert.equal(event.effort, PIN.effort); assert.equal(event.serviceTier, 'default'); }
      if (event.type === 'modelConfigObserved') { assert.equal(event.effort, PIN.effort); assert.equal(event.serviceTier, 'default'); }
    }
  }
  assert.equal(session.posture, 'full', 'focused writing checks need full posture');
  assert(Array.isArray(session.approvals) && !session.approvals.some(row => row.status === 'pending'), 'permission still pending');
  assert.equal(quality.docker?.available, true, 'container isolation unavailable');
  assert.equal(quality.sourceMounts, false); assert.equal(quality.inheritedSecrets, false);
  assert.deepEqual(contract.profiles, ['github-actions', 'node', 'vite'], 'discovered profiles changed');
  assert.equal(contract.runtime.isolation, 'container', 'project contract isolation mismatch');
  assert.equal(capabilities.isolation, 'container');
  assert.deepEqual(capabilities.activeRunIds, [run.id], 'other native workflows are running');
  assert.equal(capabilities.scopedPin, 'observed-run-api');
  assert.equal(capabilities.fallback, 'prohibited-by-scoped-pin');
  assert.equal(capabilities.permissions.posture, session.posture);
  assert.equal(capabilities.historicalFastMode, 'unavailable', 'historical Fast observations must stay unknown');
  assert.equal(capabilities.historicalServiceTier, 'unavailable', 'historical tier observations must stay unknown');
  assert.equal(capabilities.review.performed, false, 'independent review is a later stage');
  assert.equal(capabilities.review.separateIdentityRequired, true);
  assert(Array.isArray(capabilities.secretNames) && capabilities.secretNames.every(name => typeof name === 'string'), 'secret-name availability not captured');
  assert(capabilities.scheduler && capabilities.browser && capabilities.recording, 'missing scheduler/browser/recording observations');
  assert(['unavailable', 'unqualified'].includes(capabilities.scheduler.arbitraryRegistration), 'registration capability not qualified');
  assert.deepEqual(capabilities.scheduler.available, ['list', 'run', 'enable']);
  assert.equal(capabilities.scheduler.dailyWorkflowRegistered, false, 'registration belongs to later stage');
  assert(Array.isArray(capabilities.browser.connected), 'browser grants not recorded');
  assert.equal(capabilities.browser.ownerSiteOpened, false, 'production browser proof belongs to later stage');
  assert.equal(typeof capabilities.recording.schemaAccepted, 'boolean', 'recording schema observation missing');
  assert.equal(capabilities.recording.playableMp4Proven, false, 'MP4 proof belongs to later stage');
  const at = timestamp(capabilities.at, 'capability capture');
  assert(now - at <= 24 * 3600_000 && at <= now + 60_000, 'admission observations stale or future');
  return { admitted: true, historicalNativePass: false, futureReview: 'required', gaps: capabilities.gaps };
}

export function validateRecoverySummary(manifest, receipt, historical) {
  assert.equal(manifest.archiveSha256, ARCHIVE_SHA); assert.equal(manifest.baseCommit, PRIVATE_BASE);
  assert.equal(manifest.runId, OLD_RUN); assert.equal(manifest.status, 'failed');
  assert.equal(manifest.nativeExitCode, 1); assert.equal(manifest.passedPrivateGates, 21); assert.equal(manifest.failedAddedGate, 'verify:public');
  assert.equal(receipt.privateBaseline, PRIVATE_BASE); assert.equal(receipt.publicBaseline, PUBLIC_BASE);
  assert.equal(receipt.archiveSha256, ARCHIVE_SHA); assert.equal(receipt.recoveredFiles, 526);
  assert.equal(receipt.deliveredCommit, null, 'no delivered commit was reported; use archived content hashes');
  assert.equal(receipt.publicDraft.statusUnchanged, true);
  assert.equal(historical.passed, false, 'historical failed release must not become a pass');
  assert.equal(historical.results.length, 22);
  assert.equal(historical.results.filter(row => row.exitCode === 0).length, 21);
  assert.deepEqual(historical.results.filter(row => row.exitCode !== 0).map(row => row.script), ['verify:public']);
}

export function validatePrivateGates(currentGates, historical) {
  // The added public gate was placed before the final build/readback gates.
  // Selecting the first 21 rows would silently drop a retained private gate.
  const privateGates = historical.results.filter(row => row.script !== 'verify:public').map(row => row.script);
  assert.equal(privateGates.length, 21);
  assert.deepEqual(currentGates, privateGates, '21 private release gates changed');
}

export async function readReceipt(root, name) {
  const envelope = JSON.parse(await readFile(join(root, `${name}.json`), 'utf8'));
  assert.equal(envelope.schemaVersion, 1, `${name}: unsupported receipt`);
  assert.equal(envelope.bodySha256, sha256(Buffer.from(JSON.stringify(envelope.body))), `${name}: receipt bytes changed`);
  assert.equal(envelope.status, 200, `${name}: API observation unavailable`);
  assert.equal(envelope.method, 'GET');
  return envelope.body;
}

export async function verify(root = resolve('.')) {
  const dir = join(root, EVIDENCE);
  const names = ['run', 'old-run', 'old-session', 'session', 'project', 'quality', 'contract'];
  const bodies = await Promise.all(names.map(name => readReceipt(dir, name)));
  const capabilities = JSON.parse(await readFile(join(dir, 'capabilities.json'), 'utf8'));
  const endpoints = { run: `/v1/runs/${bodies[0].id}`, 'old-run': `/v1/runs/${OLD_RUN}`, 'old-session': `/v1/sessions/${bodies[2].id}`, session: `/v1/sessions/${bodies[3].id}`, project: `/v1/projects/${bodies[4].id}`, quality: '/v1/quality/capabilities', contract: `/v1/projects/${bodies[4].id}/contract` };
  for (const name of names) {
    const envelope = JSON.parse(await readFile(join(dir, `${name}.json`), 'utf8'));
    assert.equal(envelope.route, endpoints[name], `${name}: API provenance mismatch`);
    assert(Math.abs(timestamp(capabilities.at, 'capture') - timestamp(envelope.at, name)) < 60_000, `${name}: inconsistent capture time`);
  }
  let admitted, admissionError;
  try { admitted = validateAdmission({ run: bodies[0], oldRun: bodies[1], oldSession: bodies[2], session: bodies[3], project: bodies[4], quality: bodies[5], contract: bodies[6], capabilities }); }
  catch (error) { admissionError = error; }
  const observation = async (name, route, method, status) => {
    const value = JSON.parse(await readFile(join(dir, `${name}.json`), 'utf8'));
    assert.equal(value.method, method); assert.equal(value.route, route); assert.equal(value.status, status);
    assert.equal(value.bodySha256, sha256(Buffer.from(JSON.stringify(value.body))), `${name}: observation bytes changed`);
    assert(Math.abs(timestamp(capabilities.at, 'capture') - timestamp(value.at, name)) < 60_000, `${name}: inconsistent observation time`);
    return value.body;
  };
  const namesObservation = await observation('secret-names', '/v1/secrets', 'GET', 200);
  assert.deepEqual(capabilities.secretNames, namesObservation.items.map(row => row.name ?? row.id).sort(), 'secret names differ from supported API');
  const browserObservation = await observation('browser', '/v1/computer', 'GET', 200);
  assert.deepEqual(capabilities.browser.connected, browserObservation.browsers.filter(row => row.connected).map(row => ({ id: row.id, kind: row.kind, origins: row.origins, writes: row.writes })), 'browser grants differ from supported API');
  const schedulerObservation = await observation('registration-probe', '/v1/automations', 'POST', capabilities.scheduler.probeStatus);
  if (capabilities.scheduler.arbitraryRegistration === 'unavailable') {
    assert.equal(capabilities.scheduler.probeStatus, 404); assert.equal(schedulerObservation.error, 'not found');
  }
  await observation('automations', '/v1/automations', 'GET', 200);
  const recordObservation = await observation('recording-probe', '/v1/computer/command', 'POST', 422);
  assert.equal(recordObservation.error, 'validation');
  assert.equal(capabilities.recording.schemaAccepted, !recordObservation.detail.some(row => row.path?.includes('action')));
  const healthObservation = await observation('health', '/v1/health', 'GET', 200);
  assert.equal(capabilities.runtimeVersion, healthObservation.version);
  const activeRunsObservation = await observation('active-runs', '/v1/runs?status=running&limit=50', 'GET', 200);
  assert.deepEqual(capabilities.activeRunIds, activeRunsObservation.items.map(row => row.id).sort(), 'active run observation differs from API');
  const recovery = join(dir, 'recovery');
  const manifest = JSON.parse(await readFile(join(recovery, 'manifest.json'), 'utf8'));
  const receipt = JSON.parse(await readFile(join(recovery, 'receipt.json'), 'utf8'));
  const historical = JSON.parse(await readFile(join(recovery, 'source/test-results/release-verify.json'), 'utf8'));
  validateRecoverySummary(manifest, receipt, historical);
  assert(timestamp(manifest.at, 'coordinator drain receipt') < timestamp(bodies[3].createdAt, 'worker admission'), 'archived drain receipt must predate new admission');
  assert.equal(sha256(await readFile(join(recovery, 'private-boundary-source-and-receipts.tar.gz'))), ARCHIVE_SHA, 'archive hash mismatch');
  assert.equal(sha256(await readFile(join(recovery, 'tracked.patch'))), manifest.trackedPatchSha256);
  assert.equal(new Set(manifest.sourceManifest.map(row => row.path)).size, 526);
  for (const row of manifest.sourceManifest) {
    assert(!row.path.startsWith('/') && !row.path.split('/').includes('..'), 'unsafe recovery path');
    const path = join(recovery, 'source', row.path);
    assert((await lstat(path)).isFile(), 'recovered symlink or nonfile');
    const bytes = await readFile(path);
    assert.equal(bytes.length, row.bytes, `${row.path}: size changed`);
    assert.equal(sha256(bytes), row.sha256, `${row.path}: recovered bytes changed`);
  }
  for (const row of receipt.publicDraft.artifacts) {
    const bytes = await readFile(join(recovery, row.path));
    assert.equal(bytes.length, row.bytes); assert.equal(sha256(bytes), row.sha256, 'public draft artifact changed');
  }
  // Verify the draft archive against its file manifest, including untracked
  // bytes. Python's tar reader is used only for immutable archive inspection.
  const draft = spawnSync('python3', [join(root, 'scripts/project/recover-boundary.py'), '--verify', recovery], { encoding: 'utf8' });
  assert.equal(draft.status, 0, `draft archive verification failed: ${draft.stderr}`);
  const finalLog = await readFile(join(recovery, 'source/publication/product/test-results/public-2026-10-01T19-36-54-513Z/test-boundary.log'), 'utf8');
  assert.match(finalLog, /EROFS: read-only file system, mkdtemp '\/tmp\/axionbench-public-tests-/);
  // Bind the gate to current implementation bytes, rather than an old receipt.
  const source = JSON.parse(await readFile(join(dir, 'source.json'), 'utf8'));
  for (const row of source.files) assert.equal(sha256(await readFile(join(root, row.path))), row.sha256, `${row.path}: captured source changed`);
  assert.deepEqual(source.files.map(row => row.path), await sourcePaths(root), 'source manifest omitted implementation');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.packageManager, 'npm@11.19.0');
  const baselineLock = spawnSync('git', ['show', `${PRIVATE_BASE}:package-lock.json`], { cwd: root });
  assert.equal(baselineLock.status, 0, 'immutable private baseline object unavailable');
  assert.equal(sha256(await readFile(join(root, 'package-lock.json'))), sha256(baselineLock.stdout), 'step 0 changed lockfile');
  const release = await readFile(join(root, 'scripts/release/verify-release.mjs'), 'utf8');
  const currentGates = [...release.matchAll(/^  \['([^']+)',/gm)].map(match => match[1]);
  validatePrivateGates(currentGates, historical);
  const baselineRelease = spawnSync('git', ['show', `${PRIVATE_BASE}:scripts/release/verify-release.mjs`], { cwd: root, encoding: 'utf8' });
  assert.equal(baselineRelease.status, 0, 'immutable release baseline unavailable');
  assert.equal(release, baselineRelease.stdout, 'step 0 changed the qualified private gate implementation');
  const boundary = JSON.parse(await readFile(join(dir, 'boundary-repair.json'), 'utf8'));
  assert.equal(boundary.exitCode, 0, 'repaired portable boundary fixtures not verified');
  assert.equal(boundary.archiveSha256, ARCHIVE_SHA);
  assert.equal(boundary.testSha256, sha256(await readFile(join(root, 'scripts/public/test-boundary.mjs'))));
  assert.equal(boundary.helperSha256, sha256(await readFile(join(root, 'scripts/public/fixture-root.mjs'))));
  assert.equal(boundary.logSha256, sha256(await readFile(join(dir, 'boundary-repair.log'))));
  const originalTest = await readFile(join(recovery, 'source/scripts/public/test-boundary.mjs'), 'utf8');
  for (const row of manifest.sourceManifest.filter(row => row.path.startsWith('scripts/public/') && row.path !== 'scripts/public/test-boundary.mjs')) {
    assert.equal(sha256(await readFile(join(root, row.path))), row.sha256, `${row.path}: step 0 changed a recovered boundary assertion/validator`);
  }
  const expectedLabels = [...originalTest.matchAll(/await fixture\('([^']+)'/g)].map(match => match[1]);
  assert.equal(expectedLabels.length, 16, 'unexpected original boundary fixture count');
  assert.deepEqual(boundary.checks, expectedLabels, 'original portable boundary assertions removed or changed');
  const repairedTest = originalTest
    .replace("import { mkdir, mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';", "import { mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';")
    .replace("import { tmpdir } from 'node:os';\n", '')
    .replace("import { runPublicRefresh } from './refresh.mjs';", "import { runPublicRefresh } from './refresh.mjs';\nimport { fixtureRoot } from './fixture-root.mjs';")
    .replace("// Some execution sandboxes give TMPDIR its own Git repository. These fixtures\n// need an external audit area, so use the system temporary directory on Linux.\nconst base = await mkdtemp(join(process.platform === 'linux' ? '/tmp' : tmpdir(), 'axionbench-public-tests-'));", 'const base = await fixtureRoot(root);');
  assert.equal(await readFile(join(root, 'scripts/public/test-boundary.mjs'), 'utf8'), repairedTest, 'only the fixture-directory setup may differ from archived assertions');
  if (admissionError) {
    console.error('Recovery, current source and original boundary assertions verified; admission remains rejected.');
    throw admissionError;
  }
  console.log(JSON.stringify({ ...admitted, recoveredFiles: 526, publicDraftFiles: receipt.publicDraft.files.length, portableBoundaryChecks: expectedLabels.length, releaseGateCount: 21, daemonFinalVerification: 'required' }, null, 2));
}

export async function sourcePaths(root) {
  const paths = ['package.json', 'package-lock.json', 'jadbot.quality.json', 'scripts/release/verify-release.mjs'];
  for (const dir of ['scripts/project', 'scripts/public', 'tests/project', 'docs/project']) {
    for (const name of await readdir(join(root, dir))) {
      const path = `${dir}/${name}`; assert((await lstat(join(root, path))).isFile(), 'source symlink/directory refused'); paths.push(path);
    }
  }
  return paths.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--verify') throw new Error('usage: node scripts/project/preflight.mjs --verify');
  await verify();
}
