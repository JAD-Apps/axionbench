// Synthetic regression input only. Never use this module as admission evidence.
import { PIN, PRIVATE_BASE, OLD_RUN, STEP, VERIFY_CMD } from '../../scripts/project/preflight.mjs';

export function admissionFixture(now = Date.now()) {
  const sessionId = 'fixture-new-worker', oldId = 'fixture-old-worker';
  const receipt = { sessionId, pin: { ...PIN }, requested: { ...PIN }, effective: { ...PIN }, violation: null,
    init: { model: PIN.model, effort: PIN.effort, source: 'reported', fastMode: 'off', serviceTier: 'default' },
    configurations: [{ type: 'modelConfigObserved', model: PIN.model, effort: PIN.effort, serviceTier: 'default', source: 'thread' }], observed: [] };
  return {
    run: { id: 'fixture-run', projectId: 'fixture-project', plannerChoice: { ...PIN }, workerChoice: { ...PIN }, reviewerChoice: { ...PIN }, modelPin: { ...PIN }, collaborate: false,
      modelPinAudit: [{ at: now - 3000, pin: { ...PIN } }], modelReceipts: [structuredClone(receipt)], modelCompletionReceipts: [],
      steps: Array.from({ length: 12 }, (_, index) => ({ id: index === 0 ? STEP : `fixture-step-${index}`, index, choice: { ...PIN }, workerChoice: { ...PIN }, workerLimit: 1, sessionId: index === 0 ? sessionId : null, verifyCmd: index === 0 ? VERIFY_CMD : 'fixture-check' })) },
    oldRun: { id: OLD_RUN, status: 'paused', execution: { activeWorkers: 0, activeSessions: [], startingSteps: [], verifyingSteps: [], backgroundSteps: [], authorizedSteps: [], phaseStarting: false }, steps: [{ sessionId: oldId, status: 'failed', exitCode: 1, verifyCmd: 'npm run verify:release' }] },
    oldSession: { id: oldId, status: 'stopped', endedAt: now - 4000 },
    session: { id: sessionId, runId: 'fixture-run', projectId: 'fixture-project', createdAt: now - 2000, choiceSource: 'pin', requestedChoice: { ...PIN }, effectiveChoice: { ...PIN }, modelReceipt: receipt, posture: 'full', approvals: [] },
    project: { id: 'fixture-project', git: { lastCommit: { hash: PRIVATE_BASE } } },
    quality: { docker: { available: true }, sourceMounts: false, inheritedSecrets: false },
    contract: { profiles: ['github-actions', 'node', 'vite'], runtime: { isolation: 'container' } },
    capabilities: { at: new Date(now).toISOString(), activeRunIds: ['fixture-run'], scopedPin: 'observed-run-api', fallback: 'prohibited-by-scoped-pin', isolation: 'container', historicalFastMode: 'unavailable', historicalServiceTier: 'unavailable', permissions: { posture: 'full' }, review: { performed: false, separateIdentityRequired: true }, secretNames: [], scheduler: { arbitraryRegistration: 'unavailable', available: ['list', 'run', 'enable'], dailyWorkflowRegistered: false }, browser: { connected: [], ownerSiteOpened: false }, recording: { schemaAccepted: true, playableMp4Proven: false }, gaps: ['synthetic fixture'] },
  };
}
