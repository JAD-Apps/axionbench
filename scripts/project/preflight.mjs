import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PIN, RUN, OLD_RUN, PROJECT, PIN_AT, HISTORICAL, LOCAL } from './policy.mjs';
import { sha256 } from './policy.mjs';
export { PIN, RUN, OLD_RUN, PROJECT, PIN_AT, HISTORICAL, BASELINES, ARCHIVE_SHA, LOCAL, sha256 } from './policy.mjs';
const pinned = (value, where) => assert.deepEqual(value, PIN, `${where}: pinned choice mismatch`);
const empty = (value, where) => { assert(Array.isArray(value), `${where}: missing observation`); assert.equal(value.length, 0, `${where}: not drained`); };
const EXECUTION_ARRAYS = ['activeSessions', 'startingSteps', 'verifyingSteps', 'backgroundSteps', 'authorizedSteps'];
export function drained(run) {
  assert(run?.execution, 'missing execution observations');
  assert.equal(run.execution.activeWorkers, 0, 'active workers remain');
  assert.equal(run.execution.phaseStarting, false, 'phase starting');
  for (const key of EXECUTION_ARRAYS) empty(run.execution[key], key);
}
export function validateReceipt(receipt, sessionId) {
  assert(receipt, `${sessionId}: missing post-pin provider receipt`);
  assert.equal(receipt.sessionId, sessionId, 'receipt session mismatch');
  for (const key of ['pin', 'requested', 'effective']) pinned(receipt[key], `${sessionId}.${key}`);
  assert.equal(receipt.violation, null, `${sessionId}: provider violation`);
  assert.equal(receipt.init?.source, 'reported', `${sessionId}: provider model must be reported`);
  assert.equal(receipt.init?.model, PIN.model, `${sessionId}: provider model mismatch`);
  assert.equal(receipt.init?.effort, PIN.effort, `${sessionId}: provider effort mismatch`);
  assert.equal(receipt.init?.fastMode, 'off', `${sessionId}: Fast must be off`);
  assert.equal(receipt.init?.serviceTier, 'default', `${sessionId}: provider tier must be default`);
  assert(Array.isArray(receipt.observed), 'missing model observations');
  for (const event of receipt.observed) assert.equal(event.model, PIN.model, `${sessionId}: observed model mismatch`);
  assert(Array.isArray(receipt.configurations), 'missing provider configuration observations');
  for (const event of receipt.configurations) {
    assert.equal(event.model, PIN.model, 'configuration model mismatch');
    assert.equal(event.effort, PIN.effort, 'configuration effort mismatch');
    assert.equal(event.serviceTier, 'default', 'configuration tier mismatch');
  }
}
function validateCompletion(receipt) {
  pinned(receipt.pin, 'completion pin'); pinned(receipt.requested, 'completion requested');
  assert(Array.isArray(receipt.events), 'missing completion events');
  const init = receipt.events.find(event => event.type === 'init');
  assert(init, 'missing completion provider receipt');
  assert.equal(init.modelSource, 'reported', 'completion model echoed');
  assert.equal(init.model, PIN.model, 'completion model mismatch');
  assert.equal(init.effort, PIN.effort, 'completion effort mismatch');
  assert.equal(init.fastMode, 'off', 'completion Fast mismatch');
  assert.equal(init.serviceTier, 'default', 'completion tier mismatch');
  for (const event of receipt.events.filter(e => ['init', 'modelConfigObserved', 'assistant', 'usage'].includes(e.type))) {
    if (event.model != null) assert.equal(event.model, PIN.model, 'completion observed model mismatch');
    if (event.type === 'modelConfigObserved') {
      assert.equal(event.effort, PIN.effort, 'completion observed effort mismatch');
      assert.equal(event.serviceTier, 'default', 'completion observed tier mismatch');
    }
  }
}
export function validateAdmission(evidence, { now = Date.now(), currentSessionId } = {}) {
  assert.equal(evidence.schemaVersion, 1, 'missing admission evidence');
  assert(Number.isFinite(evidence.at) && now >= evidence.at && now - evidence.at < 86400000, 'stale/future admission evidence');
  assert.equal(evidence.health?.ok, true, 'daemon unavailable');
  const run = evidence.run;
  assert.equal(run?.id, RUN); assert.equal(run.projectId, PROJECT);
  for (const key of ['modelPin', 'plannerChoice', 'workerChoice', 'reviewerChoice']) pinned(run[key], key);
  assert.equal(run.collaborate, false, 'collaboration must be disabled');
  const audit = run.modelPinAudit?.find(item => item.at === PIN_AT);
  pinned(audit?.pin, 'owner modelPinAudit');
  assert(Array.isArray(run.steps) && run.steps.length >= 12, 'missing explicit step choices');
  for (const step of run.steps) for (const key of ['choice', 'workerChoice']) pinned(step[key], `${step.id}.${key}`);
  assert.equal(evidence.oldRun?.id, OLD_RUN); assert.equal(evidence.oldRun.status, 'paused'); drained(evidence.oldRun);
  const failed = evidence.oldRun.steps?.find(step => step.id === 'step_e73d0dafa559');
  assert.equal(failed?.status, 'failed', 'old failure history lost'); assert.equal(failed.exitCode, 1, 'old native failure exit lost');
  assert.equal(evidence.oldSession?.status, 'stopped'); assert.equal(evidence.oldSession.live, false, 'old worker still live');
  assert.equal(evidence.oldSession.id, '01a0f8bb-65ef-7fa6-9705-692c7a000aaa');
  assert.equal(evidence.contract?.runtime?.isolation, 'container', 'project container isolation missing');
  assert.equal(evidence.capabilities?.docker?.available, true, 'container capability missing');
  assert.equal(evidence.capabilities?.sourceMounts, false); assert.equal(evidence.capabilities?.inheritedSecrets, false);
  assert.equal(evidence.project?.id, PROJECT);
  assert(Array.isArray(evidence.projectRuns?.items), 'missing project run observations');
  assert(evidence.projectRuns.items.some(item => item.id === RUN), 'current project run missing');
  // Only AxionBench isolation matters. Unrelated native workflows are allowed.
  for (const other of evidence.projectRuns.items) {
    assert.equal(other.projectId, PROJECT, 'incorrectly scoped project run list');
    if (other.id !== RUN) drained(other);
  }
  assert(Array.isArray(evidence.sessions?.items) && evidence.sessions.items.length, 'missing session observations');
  for (const item of run.sessions ?? []) assert(evidence.sessions.items.some(s => s.id === item.id), 'session omitted from observation');
  const historical = [];
  for (const session of evidence.sessions.items) {
    assert.equal(session.runId, RUN); assert.equal(session.projectId, PROJECT);
    pinned(session.requestedChoice, `${session.id}.requested`); pinned(session.effectiveChoice, `${session.id}.effective`);
    assert.equal(session.provider, PIN.provider); assert.equal(session.model, PIN.model); assert.equal(session.effort, PIN.effort);
    assert(Number.isFinite(session.createdAt), 'session admission time missing');
    if (HISTORICAL.includes(session.id)) {
      assert(session.createdAt < PIN_AT, 'historical exception must predate pin');
      assert.equal(session.status, 'stopped', 'historical session must stay stopped');
      historical.push({ sessionId: session.id, requested: session.requestedChoice, effective: session.effectiveChoice,
        providerReportedModel: 'unavailable (pre-pin)', fastMode: 'unavailable (pre-pin)', serviceTier: 'unavailable (pre-pin)' });
    } else {
      assert(session.createdAt >= PIN_AT, 'unnamed pre-pin session requires owner decision');
      const receipt = run.modelReceipts?.find(row => row.sessionId === session.id);
      validateReceipt(receipt, session.id);
    }
    const detail = evidence.sessionDetails?.[session.id];
    assert(detail && detail.id === session.id, 'missing session permissions/detail evidence');
    pinned(detail.requestedChoice, `${session.id}.detail.requested`);
    pinned(detail.effectiveChoice, `${session.id}.detail.effective`);
    assert.equal(typeof detail.posture, 'string'); assert(Array.isArray(detail.approvals), 'missing permission observations');
    for (const receipt of detail.modelCompletionReceipts ?? []) validateCompletion(receipt);
  }
  assert.deepEqual(historical.map(row => row.sessionId).sort(), [...HISTORICAL].sort(), 'missing named historical sessions');
  assert(evidence.sessions.items.some(row => row.id === currentSessionId), 'current session absent');
  validateReceipt(run.modelReceipts?.find(row => row.sessionId === currentSessionId), currentSessionId);
  for (const receipt of run.modelCompletionReceipts ?? []) validateCompletion(receipt);
  if (run.evaluation?.sessionId) {
    assert(!run.steps.some(step => step.sessionId === run.evaluation.sessionId), 'reviewer must be independent of workers');
    assert(evidence.sessions.items.some(session => session.id === run.evaluation.sessionId), 'reviewer receipt missing');
  }
  assert(Array.isArray(evidence.automations?.items), 'scheduler observation missing');
  assert(Array.isArray(evidence.secrets?.items), 'secret-name availability missing');
  assert(evidence.secrets.items.every(item => typeof item.name === 'string' && typeof item.present === 'boolean' && Object.keys(item).every(k => ['name', 'present'].includes(k))), 'secret values prohibited');
  assert(Array.isArray(evidence.computer?.browsers), 'browser capability observation missing');
  assert(Array.isArray(evidence.recordings?.items), 'recording capability observation missing');
  return { historical, fallback: 'prohibited by scoped modelPin; no routing/receipt mismatch observed', independentReview: run.evaluation ? 'recorded' : 'pending separate stage' };
}
export const SOURCE_FILES = ['scripts/project/preflight.mjs', 'scripts/project/policy.mjs', 'scripts/project/recovery.mjs', 'scripts/project/preserve-public.py', 'scripts/project/test-recovered-boundary.mjs', 'scripts/public/boundary.mjs', 'scripts/public-snapshot.mjs', 'scripts/public/temp-directory.mjs', 'scripts/public/test-boundary.mjs', 'tests/project/preflight.test.mjs', 'tests/project/fixtures.mjs', 'docs/project/PREFLIGHT.md'];
export async function sourceIdentity() {
  const files = [];
  for (const path of SOURCE_FILES) files.push({ path, sha256: sha256(await readFile(path)) });
  return files;
}
export async function observe({ baseUrl = 'http://127.0.0.1:7900', tokenPath = '../../token', currentSessionId = basename(process.cwd()) } = {}) {
  // Restrict credentials to the local daemon. No control method is implemented.
  assert.equal(baseUrl, 'http://127.0.0.1:7900', 'owner token restricted to local daemon');
  const token = (await readFile(tokenPath, 'utf8')).trim();
  const observations = [];
  async function get(path) {
    const response = await fetch(baseUrl + path, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    const bytes = Buffer.from(await response.text());
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    observations.push({ method: 'GET', path, status: response.status, sha256: sha256(bytes), at: Date.now() });
    return JSON.parse(bytes);
  }
  const evidence = { schemaVersion: 1, at: Date.now(), currentSessionId, observations };
  const endpoints = { health: '/v1/health', run: `/v1/runs/${RUN}`, oldRun: `/v1/runs/${OLD_RUN}`, oldSession: '/v1/sessions/01a0f8bb-65ef-7fa6-9705-692c7a000aaa',
    project: `/v1/projects/${PROJECT}`, contract: `/v1/projects/${PROJECT}/contract`, capabilities: '/v1/quality/capabilities', projectRuns: `/v1/runs?projectId=${PROJECT}&limit=100`,
    sessions: `/v1/sessions?runId=${RUN}&limit=100`, automations: '/v1/automations', secrets: '/v1/secrets', computer: '/v1/computer', recordings: '/v1/computer/runs' };
  for (const [key, endpoint] of Object.entries(endpoints)) evidence[key] = await get(endpoint);
  evidence.sessionDetails = {};
  for (const session of evidence.sessions.items) {
    const detail = await get(`/v1/sessions/${encodeURIComponent(session.id)}`);
    // Keep real requested/effective/model receipts and permission decisions,
    // without retaining duplicated chat prompts in the admission record.
    const { turns, messages, ...fields } = detail;
    evidence.sessionDetails[session.id] = fields;
  }
  evidence.runtimeSources = [];
  for (const path of ['modules/automations.ts', 'modules/conductor.ts', 'sessions/adapters.ts', 'sessions/manager.ts']) {
    const bytes = await readFile(`../../../src/jad/jadbot/apps/daemon/src/${path}`);
    evidence.runtimeSources.push({ path, sha256: sha256(bytes) });
  }
  evidence.localTools = {};
  for (const tool of ['node', 'npm', 'python3', 'git', 'gh', 'curl', 'ffmpeg', 'ffprobe']) {
    const result = spawnSync('bash', ['-c', 'command -v "$1"', 'preflight', tool], { encoding: 'utf8' });
    evidence.localTools[tool] = { available: result.status === 0, path: result.status === 0 ? result.stdout.trim() : null };
  }
  const cachedChromium = '../../../.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
  try { await access(cachedChromium); evidence.localTools.cachedChromium = { available: true, path: cachedChromium }; }
  catch { evidence.localTools.cachedChromium = { available: false, path: null }; }
  const encoder = spawnSync('../../../.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux', ['-encoders'], { encoding: 'utf8' });
  const encoderText = (encoder.stdout ?? '') + (encoder.stderr ?? '');
  evidence.localTools.cachedVideoEncoder = { available: encoder.status === 0, h264: encoder.status === 0 && /^\s*V\S*\s+\S*(?:264|avc)\S*\s/m.test(encoderText), exitCode: encoder.status, encoderListSha256: sha256(Buffer.from(encoderText)) };
  evidence.capabilityGaps = {
    modelPin: 'Scoped pin and owner audit observed through deployed GET. Owner already applied it; no control endpoint called.',
    scheduler: 'Deployed GET lists registered automations. Audited route implementation exposes list/run/enable only, no arbitrary registration. No AxionBench daily job registered; later scheduling stage must resolve this gap.',
    browser: evidence.computer.browsers.some(b => (b.kind ?? 'browser') === 'browser' && b.connected && b.origins?.includes('https://axionbench.jadapps.app')) ? 'paired site browser observed; acceptance pending' : 'No connected browser grant for axionbench.jadapps.app; desktop JadBot application grant cannot prove owner browser opening.',
    recording: 'Deployed GET recording list observed; no recording run exists for this project. Cached Playwright video encoder is not an H.264 proof. System ffmpeg/ffprobe availability recorded separately.',
    permissions: 'Session posture and approval observations captured through supported API. Filesystem sandbox is supplied by worker environment; the session API does not attest its writable-root policy.',
    reviewerIdentity: 'No review executed in this step. Separate reviewer and final verdict required by later qualification stage.',
  };
  evidence.sourceIdentity = await sourceIdentity();
  let result;
  try { result = { passed: true, ...validateAdmission(evidence, { currentSessionId }) }; }
  catch (error) { result = { passed: false, diagnostic: error.message }; }
  evidence.result = result;
  await mkdir(LOCAL, { recursive: true, mode: 0o700 });
  await writeFile(`${LOCAL}/admission.json`, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  assert(result.passed, result.diagnostic);
  return evidence;
}
export async function verify() {
  const evidence = JSON.parse(await readFile(`${LOCAL}/admission.json`));
  assert.deepEqual(evidence.sourceIdentity, await sourceIdentity(), 'admission evidence does not bind current source');
  assert.equal(evidence.currentSessionId, basename(process.cwd()), 'admission belongs to another worker worktree');
  const result = validateAdmission(evidence, { currentSessionId: basename(process.cwd()) });
  const { verifyRecovery } = await import('./recovery.mjs');
  const recovery = await verifyRecovery();
  console.log(`Preflight evidence verified: ${evidence.run.steps.length} explicit pinned steps; ${evidence.run.modelReceipts.length} post-pin receipts; ${result.historical.length} named pre-pin exceptions; ${recovery.archiveFiles} recovered files. Independent review remains ${result.independentReview}.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--observe')) await observe();
    else if (process.argv.includes('--verify')) await verify();
    else throw new Error('usage: node scripts/project/preflight.mjs --observe | --verify');
  } catch (error) { console.error(`Preflight FAILED: ${error.message}`); process.exitCode = 1; }
}
