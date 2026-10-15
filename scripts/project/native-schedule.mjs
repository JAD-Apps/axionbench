// Contract for the native JadBot daily AxionBench job. Pure validation: it
// registers nothing and calls no API. The job definition is data; the owner's
// scheduler registers it disabled, and enabling needs recorded evidence that the
// candidate qualified and a first deployment was read back from production.
import assert from 'node:assert/strict';
import { PIN } from './policy.mjs';

export const SCHEDULE = Object.freeze({ cron: '17 5 * * *', timezone: 'UTC' });
export const SECRET_NAMES = Object.freeze(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
export const DAILY_COMMAND = 'npm run publish:daily -- --state-dir "$AXIONBENCH_STATE_DIR" --audit-dir "$AXIONBENCH_AUDIT_DIR"';
const CRON = /^(\d|[1-5]\d) (\d|1\d|2[0-3]) \* \* \*$/;

export function buildDailyJob({ stateDir, auditDir }) {
  return {
    name: 'axionbench-daily-update',
    enabled: false,
    schedule: { ...SCHEDULE },
    command: DAILY_COMMAND,
    env: { AXIONBENCH_STATE_DIR: stateDir, AXIONBENCH_AUDIT_DIR: auditDir },
    secrets: [...SECRET_NAMES],
    modelPin: { ...PIN },
    fallback: 'none',
    fastMode: 'off',
    publishTarget: { project: 'axionbench', branch: 'main', hostname: 'axionbench.jadapps.app' },
  };
}

// Throws on the first violated rule. The registration must be disabled.
export function validateJob(job, { requireDisabled = true } = {}) {
  assert.equal(job?.name, 'axionbench-daily-update', 'unexpected job name');
  assert.equal(job.schedule?.timezone, 'UTC', 'schedule must name its timezone (UTC)');
  assert.match(job.schedule?.cron ?? '', CRON, 'schedule must be one fixed daily time');
  assert.equal(job.command, DAILY_COMMAND, 'command must be the documented daily publication command');
  assert.deepEqual(job.modelPin, PIN, 'every AI stage must be codex/gpt-6.1-sol/high');
  assert.equal(job.fallback, 'none', 'no model fallback');
  assert.equal(job.fastMode, 'off', 'Fast mode must be off');
  assert.deepEqual([...(job.secrets ?? [])].sort(), [...SECRET_NAMES].sort(), 'secrets are referenced by name only');
  assert.deepEqual(job.publishTarget, { project: 'axionbench', branch: 'main', hostname: 'axionbench.jadapps.app' }, 'wrong publication target');
  for (const [key, value] of Object.entries(job.env ?? {})) {
    assert.ok(/^AXIONBENCH_(STATE|AUDIT)_DIR$/.test(key), `unexpected environment entry ${key}`);
    assert.ok(typeof value === 'string' && value.startsWith('/') && !value.includes('..'), `${key} must be an absolute path`);
  }
  assert.deepEqual(Object.keys(job.env ?? {}).sort(), ['AXIONBENCH_AUDIT_DIR', 'AXIONBENCH_STATE_DIR'], 'state and audit directories are required');
  if (requireDisabled) assert.equal(job.enabled, false, 'register the job disabled');
  return job;
}

// Enabling needs a verified qualification and a first read-back deployment.
export function validateEnablement(job, { qualification, firstDeployment }) {
  validateJob(job, { requireDisabled: false });
  assert.equal(qualification?.passed, true, 'candidate has not qualified');
  assert.equal(firstDeployment?.status, 'published', 'first deployment is not published');
  assert.equal(firstDeployment.readback, 'verified', 'first deployment was not read back over HTTPS');
  assert.equal(firstDeployment.hostname, job.publishTarget.hostname, 'deployment is for another host');
  assert.match(firstDeployment.snapshotSha256 ?? '', /^[a-f0-9]{64}$/, 'deployment needs a snapshot digest');
  return { enable: true };
}
