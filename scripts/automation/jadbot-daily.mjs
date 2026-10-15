// Operator tool for the native JadBot daily workflow. It prints the registration
// template and verifies a signed API readback; it never registers, enables,
// schedules or contacts JadBot, and it needs no credentials.
//   node scripts/automation/jadbot-daily.mjs template
//   node scripts/automation/jadbot-daily.mjs verify-registration (--require-disabled | --require-enabled)
//        --trust <trust file> [--receipt <file>] [--now <ISO time>]
// A readback is an envelope signed by a trusted `jadbot` key (see scripts/project/authority.mjs):
//   payload: { kind: "registration-readback", observedAt, endpoint, daemonVersion, body: <registration> }
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadTrust, verifyEnvelope } from '../project/authority.mjs';
import { findSecrets } from './secrets.mjs';

export const DEFAULT_RECEIPT = 'evidence/local/jadbot-registration-readback.json';
export const CHOICE = Object.freeze({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high', fast: false, fallback: 'none' });
const HEX64 = /^[a-f0-9]{64}$/;

export const TEMPLATE = Object.freeze({
  name: 'axionbench-daily-update',
  project: 'axionbench',
  enabled: false,
  schedule: { cron: '30 6 * * *', timezone: 'UTC', description: 'Daily at 06:30 UTC' },
  isolation: 'project',
  workerLimit: 1,
  collaboration: false,
  overlap: 'forbid',
  steps: [{ id: 'publish-daily', command: 'npm run publish:daily -- --state-dir <state-dir> --audit-dir <audit-dir>', ai: false }],
  aiStages: ['plan', 'worker', 'review', 'retry', 'debug'],
  modelChoice: CHOICE,
  modelPin: { ...CHOICE, scope: 'workflow' },
  credentials: 'JadBot local secret storage: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (never in this file)',
});

/** Next occurrence strictly after `from` of a daily `M H * * *` cron in UTC. */
export function nextDailyRun(cron, from) {
  const match = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(cron);
  assert.ok(match, `unsupported cron ${JSON.stringify(cron)}: only daily "M H * * *" in UTC is supported`);
  const [minute, hour] = [Number(match[1]), Number(match[2])];
  assert.ok(minute < 60 && hour < 24, 'cron field out of range');
  const start = new Date(from);
  assert.ok(Number.isFinite(start.getTime()), 'valid reference time required');
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), hour, minute));
  if (next <= start) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

const choiceErrors = (label, value) => {
  const v = value ?? {};
  return Object.entries(CHOICE).filter(([k, expected]) => (v[k] ?? (k === 'fallback' ? 'none' : undefined)) !== expected)
    .map(([k]) => `${label}.${k} must be ${CHOICE[k]} (codex/gpt-6.1-sol/high, Fast off, no fallback)`);
};

/** Returns the contract violations in a registration; empty means it conforms. */
export function validateRegistration(body, { observedAt, require }) {
  assert.ok(['disabled', 'enabled'].includes(require), 'state requirement must be disabled or enabled');
  const errors = [];
  const r = body ?? {};
  if (typeof r.id !== 'string' || !r.id) errors.push('missing native workflow id');
  if (r.name !== TEMPLATE.name) errors.push(`name must be ${TEMPLATE.name}`);
  if (r.project !== TEMPLATE.project) errors.push('not scoped to the axionbench project');
  if (r.isolation !== 'project') errors.push('isolation must be project');
  if (typeof r.enabled !== 'boolean') errors.push('enabled state missing');
  else if (require === 'disabled' && r.enabled) errors.push('workflow must be disabled');
  else if (require === 'enabled' && !r.enabled) errors.push('workflow must be enabled');
  if (r.schedule?.cron !== TEMPLATE.schedule.cron) errors.push('cron must be 30 6 * * *');
  if (r.schedule?.timezone !== 'UTC' || r.schedule?.timezoneConfirmed !== true) errors.push('timezone UTC must be confirmed by the runtime');
  try {
    const expected = nextDailyRun(TEMPLATE.schedule.cron, observedAt);
    if (!Number.isFinite(Date.parse(r.nextRunAt ?? '')) || new Date(r.nextRunAt).toISOString() !== expected) errors.push(`nextRunAt must be the computed next execution ${expected}`);
  } catch (error) { errors.push(`nextRunAt: ${error.message}`); }
  if (typeof r.trigger?.id !== 'string' || !r.trigger.id || r.trigger.kind !== 'native') errors.push('missing native trigger identity');
  if (r.workerLimit !== 1) errors.push('workerLimit must be 1');
  if (r.collaboration !== false) errors.push('collaboration must be disabled');
  if (r.overlap !== 'forbid') errors.push('overlapping project runs must be forbidden');
  errors.push(...choiceErrors('modelChoice', r.modelChoice), ...choiceErrors('modelPin', r.modelPin), ...choiceErrors('effectiveChoice', r.effectiveChoice));
  if (r.modelPin?.scope !== 'workflow' || r.modelPin?.workflowId !== r.id) errors.push('modelPin must be scoped to this workflow id');
  // Provider observations exist only for AI stages that actually ran.
  const executed = r.aiStagesExecuted;
  const observations = r.providerObservations ?? [];
  if (!Number.isSafeInteger(executed) || executed < 0) errors.push('aiStagesExecuted must be a count');
  else if (executed === 0 && observations.length) errors.push('provider observations were recorded for a session that never ran');
  else if (executed > 0 && observations.length !== executed) errors.push('every executed AI stage needs one provider observation');
  for (const o of Array.isArray(observations) ? observations : []) {
    if (o?.model !== CHOICE.model || o?.effort !== CHOICE.effort || o?.fast !== false || typeof o?.sessionId !== 'string') errors.push('provider observation differs from gpt-6.1-sol/high, Fast off');
  }
  if (r.enabled) {
    const e = r.enablement ?? {};
    if (!Number.isFinite(Date.parse(e.enabledAt ?? ''))) errors.push('enablement.enabledAt missing');
    if (!HEX64.test(e.qualificationReceiptSha256 ?? '') || !HEX64.test(e.firstDeploymentReceiptSha256 ?? '')) errors.push('enablement must cite the qualification and first-deployment receipts');
  }
  if (findSecrets(JSON.stringify(r)).length) errors.push('readback contains credential-shaped text');
  return errors;
}

/** Authenticates a signed readback envelope and validates the registration it carries. */
export function verifyRegistrationReadback(envelope, anchors, { require, now = new Date() }) {
  const payload = verifyEnvelope(envelope, anchors, ['jadbot']);
  assert.equal(payload.kind, 'registration-readback', 'not a registration readback');
  assert.ok(typeof payload.endpoint === 'string' && payload.endpoint.startsWith('/v1/'), 'readback must name the JadBot API endpoint it came from');
  assert.ok(typeof payload.daemonVersion === 'string' && payload.daemonVersion, 'daemon version missing');
  const observedAt = Date.parse(payload.observedAt);
  assert.ok(Number.isFinite(observedAt), 'observedAt missing');
  assert.ok(observedAt <= new Date(now).getTime() + 5 * 60_000, 'readback is dated in the future');
  const errors = validateRegistration(payload.body, { observedAt: payload.observedAt, require });
  assert.deepEqual(errors, [], `registration readback violates the contract:\n${errors.join('\n')}`);
  return payload;
}

const FLAGS = { '--require-disabled': false, '--require-enabled': false, '--receipt': true, '--trust': true, '--now': true };
export function parseOptions(args, allowed = FLAGS) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    assert.ok(Object.hasOwn(allowed, flag), `unsupported option ${flag}`);
    assert.ok(!Object.hasOwn(options, flag), `duplicate option ${flag}`);
    if (allowed[flag]) {
      i += 1;
      assert.ok(args[i] !== undefined && !args[i].startsWith('--'), `${flag} needs a value`);
      options[flag] = args[i];
    } else options[flag] = true;
  }
  return options;
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'template') { assert.equal(rest.length, 0, 'template takes no options'); console.log(JSON.stringify(TEMPLATE, null, 2)); return 0; }
  if (command !== 'verify-registration') { console.error('usage: jadbot-daily.mjs template | verify-registration (--require-disabled | --require-enabled) --trust <file> [--receipt <file>] [--now <ISO>]'); return 64; }
  const options = parseOptions(rest);
  assert.ok(Boolean(options['--require-disabled']) !== Boolean(options['--require-enabled']), 'state exactly one of --require-disabled or --require-enabled');
  const path = options['--receipt'] ?? DEFAULT_RECEIPT;
  let text;
  try { text = await readFile(path, 'utf8'); } catch {
    console.error(`FAIL no signed API readback at ${path}.\nThe registration has not been observed: nothing is registered, enabled or verified. See docs/project/QUALIFICATION.md.`);
    return 2;
  }
  const anchors = await loadTrust(options['--trust']);
  const now = options['--now'] ? new Date(options['--now']) : new Date();
  const payload = verifyRegistrationReadback(JSON.parse(text), anchors, { require: options['--require-enabled'] ? 'enabled' : 'disabled', now });
  console.log(`ok  authenticated registration readback conforms (${payload.body.enabled ? 'enabled' : 'disabled'}, 06:30 UTC, workerLimit 1, Sol 6.1/high)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(process.argv.slice(2)); } catch (error) { console.error(`FAIL ${error.message}`); process.exitCode = 1; }
}
