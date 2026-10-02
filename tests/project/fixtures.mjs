// Synthetic negative/positive fixtures only. Never used as admission receipts.
import { PIN, RUN, OLD_RUN, PROJECT, PIN_AT, HISTORICAL } from '../../scripts/project/preflight.mjs';
export const CURRENT = 'synthetic-post-pin-session';
const choice = () => ({ ...PIN });
const idle = () => ({ activeWorkers: 0, phaseStarting: false, activeSessions: [], startingSteps: [], verifyingSteps: [], backgroundSteps: [], authorizedSteps: [] });
export function admissionFixture(now = Date.now()) {
  const sessions = [...HISTORICAL, CURRENT].map((id, i) => ({ id, projectId: PROJECT, runId: RUN, status: i === 2 ? 'running' : 'stopped', provider: PIN.provider, model: PIN.model, effort: PIN.effort,
    createdAt: PIN_AT + (i === 2 ? 1 : -1), requestedChoice: choice(), effectiveChoice: choice() }));
  return { schemaVersion: 1, at: now, health: { ok: true },
    run: { id: RUN, projectId: PROJECT, modelPin: choice(), modelPinAudit: [{ at: PIN_AT, pin: choice() }],
      plannerChoice: choice(), workerChoice: choice(), reviewerChoice: choice(), collaborate: false,
      steps: Array.from({ length: 12 }, (_, i) => ({ id: `synthetic-step-${i}`, choice: choice(), workerChoice: choice() })), sessions,
      modelReceipts: [{ sessionId: CURRENT, pin: choice(), requested: choice(), effective: choice(), violation: null,
        init: { source: 'reported', model: PIN.model, effort: PIN.effort, fastMode: 'off', serviceTier: 'default' }, observed: [], configurations: [] }], modelCompletionReceipts: [] },
    oldRun: { id: OLD_RUN, status: 'paused', execution: idle(), steps: [{ id: 'step_e73d0dafa559', status: 'failed', exitCode: 1 }] },
    oldSession: { id: '01a0f8bb-65ef-7fa6-9705-692c7a000aaa', status: 'stopped', live: false },
    contract: { runtime: { isolation: 'container' } }, capabilities: { docker: { available: true }, sourceMounts: false, inheritedSecrets: false }, project: { id: PROJECT },
    projectRuns: { items: [{ id: RUN, projectId: PROJECT }, { id: OLD_RUN, projectId: PROJECT, execution: idle() }] },
    sessions: { items: sessions }, sessionDetails: Object.fromEntries(sessions.map(s => [s.id, { ...s, posture: 'full', approvals: [] }])),
    automations: { items: [] }, secrets: { items: [{ name: 'synthetic-name', present: true }] }, computer: { browsers: [] }, recordings: { items: [] } };
}
