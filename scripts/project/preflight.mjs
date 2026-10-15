// Private admission evidence only. No global settings writes, AI calls or publication.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const CHOICE = { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' };
export const PRIVATE_BASE = 'c3a915b717c999321e43148d522d160f4de805de';
export const PUBLIC_BASE = 'b6fa8b0376aef8efec44e2399f17120b560f2d0c';
export const ARCHIVE_HASH = 'd83ba8c9cd0c2982d7728cee27529035f44bf8864f60456f2e67a2824265a71b';
export const COORDINATOR_MANIFEST_HASH = 'dae38b64be7c06a054b566eb2a5b63fa4c281c45c32ff32e49d75caf6553b2bc';
export const OLD_RUN = 'run_a898861f6684';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EVIDENCE = 'evidence/local/admission';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exactChoice = value => value?.provider === CHOICE.provider && value?.model === CHOICE.model
  && value?.effort === CHOICE.effort && !value?.instance && (!value?.serviceTier || value.serviceTier === 'default');
const check = (condition, message) => assert(condition, message);

export function assertDrained(run, session) {
  check(run?.id === OLD_RUN && run.status === 'paused', 'old run is not paused');
  const e = run.execution;
  check(e && e.activeWorkers === 0 && e.phaseStarting === false && e.state === 'paused', 'old run is not drained');
  for (const field of ['activeSessions', 'startingSteps', 'verifyingSteps', 'backgroundSteps', 'authorizedSteps']) {
    check(Array.isArray(e[field]) && e[field].length === 0, `old run has missing/active ${field}`);
  }
  check(run.steps?.some(step => step.id === 'step_e73d0dafa559' && step.status === 'failed'), 'old failed step history is missing');
  check(session?.id === '01a0f8bb-65ef-7fa6-9705-692c7a000aaa' && session.status === 'stopped'
    && session.live === false && session.runId === OLD_RUN, 'old session is not stopped');
}

export function assertModelPolicy(run) {
  for (const field of ['plannerChoice', 'workerChoice', 'reviewerChoice', 'modelPin']) {
    check(exactChoice(run?.[field]), `missing or mismatched ${field}; scoped Sol6.1/high pin is mandatory`);
  }
  check(run.collaborate === false, 'collaboration must be disabled');
  check(run.modelPinAudit?.length > 0 && exactChoice(run.modelPinAudit.at(-1).pin), 'missing scoped pin audit');
  check(run.steps?.length === 12, 'expected all 12 outcome steps');
  for (const step of run.steps) {
    check(exactChoice(step.choice) && exactChoice(step.workerChoice), `step ${step.id} choice mismatch`);
    check(step.workerLimit === 1, `step ${step.id} must have exactly one worker`);
  }
  check(run.modelReceipts?.length > 0, 'provider-reported pinned session receipts are missing');
  for (const receipt of run.modelReceipts) assertProviderReceipt(receipt);
  for (const session of run.sessions ?? []) {
    check(exactChoice(session.requestedChoice) && exactChoice(session.effectiveChoice), `session ${session.id} requested/effective routing mismatch`);
    check(run.modelReceipts.some(r => r.sessionId === session.id), `session ${session.id} has no provider receipt`);
  }
  for (const receipt of run.modelCompletionReceipts ?? []) {
    check(exactChoice(receipt.pin) && exactChoice(receipt.requested) && receipt.state !== 'failed', 'completion pin/routing failure');
    const init = receipt.events?.find(event => event.type === 'init');
    check(init?.modelSource === 'reported' && init.model === CHOICE.model && init.effort === 'high'
      && init.fastMode === 'off' && (init.serviceTier === null || init.serviceTier === 'default'), 'completion lacks reported model/effort/Fast OFF');
    check(receipt.events.some(event => ['modelObserved', 'modelConfigObserved'].includes(event.type)
      && event.model === CHOICE.model), 'completion lacks execution model observation');
  }
}

export function assertProviderReceipt(r) {
  check(exactChoice(r.pin) && exactChoice(r.requested) && exactChoice(r.effective), 'provider receipt requested/effective/pin mismatch');
  check(r.violation === null, 'provider receipt records a violation');
  check(r.init?.source === 'reported' && r.init.model === CHOICE.model && r.init.effort === 'high', 'provider model/effort unreported or mismatched');
  check(r.init.fastMode === 'off' && (r.init.serviceTier === null || r.init.serviceTier === 'default'), 'Fast OFF/standard tier is unverified');
  check(r.observed?.some(o => o.model === CHOICE.model) || r.configurations?.some(c => c.model === CHOICE.model
    && c.effort === 'high' && (c.serviceTier === null || c.serviceTier === 'default')), 'no provider execution observation');
  for (const o of r.observed ?? []) check(o.model === CHOICE.model, 'observed model changed; fallback prohibited');
  for (const c of r.configurations ?? []) check(c.model === CHOICE.model && c.effort === 'high'
    && (c.serviceTier === null || c.serviceTier === 'default'), 'execution effort/tier changed; fallback prohibited');
}

export function assertRecovery(r, release) {
  check(r.privateBaseline === PRIVATE_BASE && r.publicBaseline === PUBLIC_BASE, 'recovery baseline mismatch');
  check(r.archiveSha256 === ARCHIVE_HASH && r.sourceFilesVerified === 526, 'recovery hash/inventory mismatch');
  check(r.coordinatorManifestSha256 === COORDINATOR_MANIFEST_HASH, 'coordinator manifest hash mismatch');
  check(r.gitWrites === 0 && r.oldNativeReleasePassed === false && r.oldNativeExitCode === 1, 'recovery mislabels failure or changed Git');
  check(release.passed === false && release.results.length === 22, 'native failure receipt missing');
  check(release.results.filter(row => row.exitCode === 0).length === 21, 'original 21 passed private gates missing');
  const failed = release.results.filter(row => row.exitCode !== 0);
  check(failed.length === 1 && failed[0].script === 'verify:public' && failed[0].exitCode === 1, 'original public failure was not preserved');
}

async function sourceFiles(root) {
  const files = ['package.json', 'package-lock.json', '.gitignore', 'jadbot.quality.json', 'scripts/release/verify-release.mjs', 'docs/PROJECT-PREFLIGHT.md',
    'scripts/public-snapshot.mjs', 'scripts/verify-public.mjs', 'scripts/pricing/verify-private-capture.mjs'];
  async function visit(dir) {
    for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
      if (entry.isFile()) files.push(`${dir}/${entry.name}`);
      else if (entry.isDirectory() && entry.name !== '__pycache__') await visit(`${dir}/${entry.name}`);
    }
  }
  for (const dir of ['scripts/project', 'tests/project', 'scripts/public', 'scripts/public-content']) await visit(dir);
  return Promise.all(files.sort().map(async path => ({ path, sha256: sha256(await readFile(resolve(root, path))) })));
}

export async function capture({ root = ROOT, base = process.env.JADBOT_API_URL ?? 'http://127.0.0.1:7900',
  tokenFile = process.env.JADBOT_TOKEN_FILE, runId = process.env.JADBOT_RUN_ID,
  sessionId = process.env.JADBOT_SESSION_ID, recoveryPath = process.env.AXIONBENCH_RECOVERY, pin = false } = {}) {
  check(tokenFile && runId && sessionId && recoveryPath, 'capture requires JADBOT_TOKEN_FILE, JADBOT_RUN_ID, JADBOT_SESSION_ID and AXIONBENCH_RECOVERY');
  check(new URL(base).hostname === '127.0.0.1', 'admission capture requires the local supported API');
  const token = (await readFile(tokenFile, 'utf8')).trim();
  const dir = resolve(root, EVIDENCE, `capture-${Date.now()}`); await mkdir(dir, { recursive: true, mode: 0o700 });
  const api = {};
  async function request(label, path, method = 'GET', body) {
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const pathOnDisk = relative(root, resolve(dir, `${label}.json`));
    await writeFile(resolve(root, pathOnDisk), bytes, { mode: 0o600 });
    api[label] = { path: pathOnDisk, sha256: sha256(bytes), status: response.status, endpoint: path, method, capturedAt: new Date().toISOString() };
    return response.ok ? JSON.parse(bytes) : null;
  }
  await request('health', '/v1/health');
  const old = await request('oldRun', `/v1/runs/${OLD_RUN}`);
  const stopped = await request('oldSession', '/v1/sessions/01a0f8bb-65ef-7fa6-9705-692c7a000aaa');
  assertDrained(old, stopped);
  let run = await request('runBeforePin', `/v1/runs/${runId}`);
  if (pin && !exactChoice(run.modelPin)) {
    // This never drains/stops a worker or changes owner/global routing itself.
    check(run.status === 'paused' && run.execution.state === 'paused' && run.execution.activeWorkers === 0,
      'scoped modelPin requires a paused, fully drained run; coordinator must drain this attempt first');
    run = await request('pinPatch', `/v1/runs/${runId}`, 'PATCH', { modelPin: CHOICE, plannerChoice: CHOICE,
      workerChoice: CHOICE, reviewerChoice: CHOICE, collaborate: false });
    check(run && exactChoice(run.modelPin), 'supported scoped modelPin patch/readback failed');
  }
  run = await request('run', `/v1/runs/${runId}`);
  const session = await request('session', `/v1/sessions/${sessionId}`);
  await request('planner', `/v1/sessions/${run.plannerSessionId}`);
  await request('project', `/v1/projects/${run.projectId}`);
  await request('secrets', '/v1/secrets'); // Names/presence only. Never request secret values.
  await request('computer', '/v1/computer');
  await request('automations', '/v1/automations');
  await request('registrationProbe', '/v1/automations', 'POST', {});
  const environmentPath = `${EVIDENCE}/environment.json`;
  const environmentSha256 = sha256(await readFile(resolve(root, environmentPath)));
  const manifest = { schemaVersion: 1, capturedAt: new Date().toISOString(), api, runId, sessionId,
    recoveryPath: relative(root, resolve(root, recoveryPath)), source: await sourceFiles(root),
    policy: { requested: CHOICE, fast: 'off', fallback: 'prohibited', collaboration: false },
    environment: { path: environmentPath, sha256: environmentSha256 },
    observations: { historicalFast: null, historicalServiceTier: null,
      historicalLimit: 'No old-runtime provider Fast/tier observations supplied; never infer OFF from a request.',
      isolation: { projectId: session.projectId, worktree: session.worktreePath, canonicalProject: run.projectId,
        verifierProfile: 'container (supplied outcome contract); not inferred from this host session' },
      permissions: { posture: session.posture, approvals: session.approvals, workspace: session.cwd },
      schedulerRegistration: api.registrationProbe.status === 404 ? 'unavailable at POST /v1/automations' : 'unqualified; inspect deployed contract',
      recording: 'Browser status only; owner browser opening, capture and H.264 MP4 remain later acceptance work.' } };
  await writeFile(resolve(root, EVIDENCE, 'admission.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  console.log(`Captured private admission evidence. Verify: node scripts/project/preflight.mjs --verify`);
  return manifest;
}

export async function verify(root = ROOT) {
  const m = JSON.parse(await readFile(resolve(root, EVIDENCE, 'admission.json'), 'utf8'));
  check(m.schemaVersion === 1 && Date.now() - Date.parse(m.capturedAt) < 86400000
    && Date.parse(m.capturedAt) <= Date.now(), 'admission evidence missing/stale/future');
  assert.deepEqual(m.source, await sourceFiles(root), 'admission evidence does not bind current source');
  check(m.environment?.path === `${EVIDENCE}/environment.json`
    && sha256(await readFile(resolve(root, m.environment.path))) === m.environment.sha256, 'environment capability evidence missing/changed');
  const replies = {};
  for (const label of ['health', 'oldRun', 'oldSession', 'run', 'session', 'planner', 'project', 'secrets', 'computer', 'automations', 'registrationProbe']) {
    const row = m.api[label]; check(row?.path.startsWith(EVIDENCE + '/') && !row.path.includes('..'), `missing/unsafe API evidence ${label}`);
    const bytes = await readFile(resolve(root, row.path)); check(sha256(bytes) === row.sha256, `API evidence hash mismatch ${label}`);
    check(row.status === 200 || label === 'registrationProbe' && [400, 404].includes(row.status), `API evidence unavailable ${label}: HTTP ${row.status}`);
    replies[label] = JSON.parse(bytes);
  }
  assertDrained(replies.oldRun, replies.oldSession);
  assertModelPolicy(replies.run);
  const s = replies.session;
  check(s.id === m.sessionId && s.runId === m.runId && s.projectId === replies.project.id
    && s.cwd === resolve(root) && s.worktreePath === resolve(root), 'project/session isolation mismatch');
  check(exactChoice(s.requestedChoice) && exactChoice(s.effectiveChoice), 'worker routing mismatch');
  const planner = replies.planner;
  check(exactChoice(planner.requestedChoice) && exactChoice(planner.effectiveChoice), 'actual planner routing mismatch');
  check(replies.run.modelReceipts.some(row => row.sessionId === planner.id), 'actual planner provider receipt missing');
  check(replies.secrets.items?.every(item => typeof item.name === 'string' && typeof item.present === 'boolean'), 'secret-name availability missing');
  check(Array.isArray(replies.computer.browsers) && Array.isArray(replies.automations.items), 'browser/scheduler capability observations missing');
  check(m.observations.historicalFast === null && m.observations.historicalServiceTier === null, 'unavailable historical Fast/tier must remain unknown');
  const recoveryRoot = resolve(root, m.recoveryPath);
  check(m.recoveryPath.startsWith('evidence/local/recovery/') && !m.recoveryPath.includes('..'), 'recovery must remain private');
  const recovery = JSON.parse(await readFile(resolve(recoveryRoot, 'recovery.json')));
  const release = JSON.parse(await readFile(resolve(recoveryRoot, 'source/test-results/release-verify.json')));
  assertRecovery(recovery, release);
  for (const [path, hash] of [['drained-source.tar.gz', ARCHIVE_HASH], ['public-draft.tar.gz', recovery.publicDraftArchiveSha256],
    ['coordinator-manifest.json', COORDINATOR_MANIFEST_HASH], ['public-baseline.tar', recovery.publicBaselineArchiveSha256],
    ['worktree.patch', recovery.patches.worktree], ['staged.patch', recovery.patches.staged]]) {
    check(sha256(await readFile(resolve(recoveryRoot, path))) === hash, `private recovery byte mismatch ${path}`);
  }
  const original = JSON.parse(await readFile(resolve(recoveryRoot, 'coordinator-manifest.json')));
  for (const row of original.sourceManifest) {
    const bytes = await readFile(resolve(recoveryRoot, 'source', row.path));
    check(bytes.length === row.bytes && sha256(bytes) === row.sha256, `immutable recovered source mismatch ${row.path}`);
  }
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json')));
  check(pkg.packageManager === 'npm@11.19.0', 'exact packageManager must be preserved');
  const baseline = execFileSync('git', ['show', `${PRIVATE_BASE}:scripts/release/verify-release.mjs`], { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).toString();
  const gateNames = text => [...text.matchAll(/^  \['([^']+)',/gm)].map(match => match[1]);
  const current = gateNames(await readFile(resolve(root, 'scripts/release/verify-release.mjs'), 'utf8'));
  check(gateNames(baseline).length === 21 && gateNames(baseline).every(name => current.includes(name)), 'original 21 private gates must remain');
  console.log('Preflight passed for current source and captured supported-API evidence. Daemon admission/release verification remains authoritative.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--capture' && process.argv.slice(3).every(arg => arg === '--pin')) await capture({ pin: process.argv.includes('--pin') });
    else if (process.argv.length === 3 && process.argv[2] === '--verify') await verify();
    else throw new Error('usage: preflight.mjs --capture [--pin] | --verify');
  } catch (error) { console.error(`Admission FAILED: ${error.message}`); process.exitCode = 1; }
}
