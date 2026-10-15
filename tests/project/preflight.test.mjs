import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAdmission, observe, CHOICE, PRIVATE_BASE, PUBLIC_BASE, ARCHIVE_HASH, RUN, OLD_RUN, PROJECT } from '../../scripts/project/preflight.mjs';

const now = 1790911000000;
function fixture() {
  const drained = { activeWorkers: 0, phaseStarting: false, activeSessions: [], startingSteps: [], verifyingSteps: [], backgroundSteps: [], authorizedSteps: [] };
  const session = {
    id: 'session-fixture', runId: RUN, projectId: PROJECT, posture: 'full', requestedChoice: CHOICE, effectiveChoice: CHOICE,
    modelReceipt: { sessionId: 'session-fixture', requested: CHOICE, effective: CHOICE, init: { source: 'reported', model: CHOICE.model, effort: 'high', fastMode: 'off', serviceTier: 'default' }, violation: null, configurations: [] }
  };
  return structuredClone({
    schemaVersion: 1, capturedAt: now,
    run: { id: RUN, projectId: PROJECT, plannerChoice: CHOICE, workerChoice: CHOICE, reviewerChoice: CHOICE, modelPin: CHOICE, modelPinAudit: [{ pin: CHOICE }], collaborate: false, steps: Array.from({ length: 12 }, (_, i) => ({ id: `step-${i}`, choice: CHOICE, workerChoice: CHOICE, workerLimit: 1 })), sessions: [{ id: session.id }] },
    sessions: [session], oldRun: { id: OLD_RUN, status: 'paused', execution: drained, steps: [{ status: 'failed', exitCode: 1 }] }, oldSession: { status: 'stopped', live: false },
    project: { id: PROJECT, git: { lastCommit: { hash: PRIVATE_BASE } } }, projectRuns: { items: [{ id: OLD_RUN, projectId: PROJECT, execution: drained }] },
    contract: { runtime: { isolation: 'container' } }, qualityCapabilities: { docker: { available: true } },
    secrets: { items: [{ name: 'fixture-name', present: true }] }, computer: { browsers: [], desktop: { available: false } },
    capabilities: { scheduler: { registration: 'unavailable' }, recording: { h264: false } },
    recovery: { archiveSha256: ARCHIVE_HASH, privateBaseline: PRIVATE_BASE, publicBaseline: PUBLIC_BASE, verifiedFiles: 526, daemonContentBound: true, publicDraftPreserved: true, nativeExitCode: 1, passedPrivateGates: 21, failedAddedGate: 'verify:public', artifacts: [{ path: 'evidence/local/recovery/private-boundary-source-and-receipts.tar.gz', sha256: ARCHIVE_HASH }] }
  });
}
test('complete synthetic fixture validates; fixtures are not real receipts', () => assert.deepEqual(validateAdmission(fixture(), now), []));

const negatives = [
  ['missing evidence', e => delete e.run, /identity|plannerChoice/],
  ['missing scoped pin', e => e.run.modelPin = null, /modelPin/],
  ['wrong reviewer choice', e => e.run.reviewerChoice.effort = 'max', /reviewerChoice/],
  ['pending step choice mismatch', e => e.run.steps[11].choice.model = 'different', /step-11/],
  ['collaboration', e => e.run.collaborate = true, /Collaboration/],
  ['multiple workers', e => e.run.steps[0].workerLimit = 2, /one worker/],
  ['old run active', e => e.oldRun.execution.activeWorkers = 1, /Older run/],
  ['old run still authorized', e => e.oldRun.execution.authorizedSteps.push('step-old'), /authorizedSteps/],
  ['old session live', e => e.oldSession.live = true, /confirmed stopped/],
  ['false historical pass', e => e.oldRun.steps[0].exitCode = 0, /failed native history/],
  ['another AxionBench run executing', e => e.projectRuns.items.push({ id: 'another', projectId: PROJECT, execution: { activeWorkers: 1 } }), /Another run is working on AxionBench/],
  ['absent project observation', e => delete e.projectRuns, /project-scoped/],
  ['no container', e => e.contract.runtime.isolation = 'host', /container isolation/],
  ['missing stage observation', e => e.sessions = [], /executed stage/],
  ['missing historical provider receipt', e => delete e.sessions[0].modelReceipt, /historical observations unavailable/],
  ['requested model claimed as reported', e => e.sessions[0].modelReceipt.init.source = 'requested', /provider model/],
  ['provider effort mismatch', e => e.sessions[0].modelReceipt.init.effort = 'max', /provider model/],
  ['Fast on', e => e.sessions[0].modelReceipt.init.fastMode = 'on', /Fast OFF/],
  ['tier absent', e => e.sessions[0].modelReceipt.init.serviceTier = null, /default tier/],
  ['provider routing changed', e => e.sessions[0].modelReceipt.configurations.push({ model: 'fallback', effort: 'high', serviceTier: 'default' }), /routing changed/],
  ['secret values exposed', e => e.secrets.items[0].value = 'forbidden', /includes values/],
  ['recovery hash changed', e => e.recovery.archiveSha256 = 'wrong', /recovery missing/],
  ['recovery artifact digest changed', e => e.recovery.artifacts[0].sha256 = 'rewritten', /owner-supplied digest/],
  ['public draft not preserved', e => e.recovery.publicDraftPreserved = false, /recovery missing/],
  ['recovery claims pass', e => e.recovery.nativeExitCode = 0, /misstates original failure/],
  ['stale observations', e => e.capturedAt -= 24 * 3600000, /older than 24/],
];
for (const [label, mutate, diagnostic] of negatives) test(`rejects ${label}`, () => {
  const e = fixture(); mutate(e);
  assert.match(validateAdmission(e, now).join('\n'), diagnostic);
});
test('other projects may run without affecting project isolation', () => {
  const e = fixture();
  e.projectRuns.items.push({ id: 'unrelated', projectId: 'different-project', execution: { activeWorkers: 5, authorizedSteps: ['running'] } });
  assert.deepEqual(validateAdmission(e, now), []);
});
test('authenticated observer always GETs and refuses redirects', async () => {
  let called = false;
  await observe('/v1/health', 'fixture', async (url, options) => {
    called = true;
    assert.match(url, /^http:\/\/127\.0\.0\.1:/);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ ok: true }) };
  });
  assert.equal(called, true);
});
test('control endpoints cannot receive the owner token', async () => {
  for (const path of [`/v1/runs/${RUN}/pause`, `/v1/runs/${RUN}/start`, `/v1/runs/${RUN}/stop`, `/v1/runs/${RUN}/retry`, '/v1/automations/heartbeat/run', 'https://example.org']) {
    await assert.rejects(observe(path, 'fixture', () => { throw new Error('must never reach transport'); }), /Read-only observation path refused/);
  }
});
