// Operator tool for the native JadBot daily workflow. Credential-free: it prints the
// registration template and validates a readback receipt kept in evidence/local/.
//   node scripts/automation/jadbot-daily.mjs template
//   node scripts/automation/jadbot-daily.mjs verify-registration --require-disabled [--receipt <file>]
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { findSecrets } from './secrets.mjs';

export const DEFAULT_RECEIPT = 'evidence/local/jadbot-registration-readback.json';
const CHOICE = { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high', fast: false, fallback: 'none' };

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
  modelPin: CHOICE,
  credentials: 'JadBot local secret storage: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (never in this file)',
});

/** Returns the list of contract violations in an API readback; empty means it conforms. */
export function validateReadback(readback, { requireDisabled = false } = {}) {
  const errors = [];
  const r = readback ?? {};
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (typeof r.id !== 'string' || !r.id) errors.push('missing native workflow id');
  if (r.name !== TEMPLATE.name) errors.push(`name must be ${TEMPLATE.name}`);
  if (r.project !== TEMPLATE.project) errors.push('not scoped to the axionbench project');
  if (r.isolation !== 'project') errors.push('isolation must be project');
  if (requireDisabled && r.enabled !== false) errors.push('workflow must be disabled');
  if (r.schedule?.cron !== TEMPLATE.schedule.cron) errors.push('cron must be 30 6 * * *');
  if (r.schedule?.timezone !== 'UTC' || r.schedule?.timezoneConfirmed !== true) errors.push('timezone UTC must be confirmed by the runtime');
  if (!Number.isFinite(Date.parse(r.nextRunAt ?? ''))) errors.push('missing computed nextRunAt');
  else if (new Date(r.nextRunAt).toISOString().slice(11, 19) !== '06:30:00') errors.push('nextRunAt is not 06:30:00 UTC');
  if (typeof r.trigger?.id !== 'string' || r.trigger?.kind !== 'native') errors.push('missing native trigger identity');
  if (r.workerLimit !== 1) errors.push('workerLimit must be 1');
  if (r.collaboration !== false) errors.push('collaboration must be disabled');
  if (r.overlap !== 'forbid') errors.push('overlapping project runs must be forbidden');
  for (const key of ['modelChoice', 'modelPin', 'effectiveChoice', 'providerReported']) {
    if (!same({ ...r[key], fallback: r[key]?.fallback ?? 'none' }, CHOICE) && key !== 'providerReported') errors.push(`${key} must be codex/gpt-6.1-sol/high, Fast off, no fallback`);
  }
  const reported = r.providerReported;
  if (reported && (reported.model !== CHOICE.model || reported.effort !== CHOICE.effort)) errors.push('providerReported differs from gpt-6.1-sol/high');
  if (findSecrets(JSON.stringify(r)).length) errors.push('readback contains credential-shaped text');
  return errors;
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'template') { console.log(JSON.stringify(TEMPLATE, null, 2)); return 0; }
  if (command !== 'verify-registration') { console.error('usage: jadbot-daily.mjs template | verify-registration [--require-disabled] [--receipt <file>]'); return 64; }
  const at = rest.indexOf('--receipt');
  const path = at >= 0 ? rest[at + 1] : DEFAULT_RECEIPT;
  let text;
  try { text = await readFile(path, 'utf8'); } catch {
    console.error(`FAIL no API readback at ${path}.\nIntegration gap: JadBot 0.1.125 exposes no endpoint to register a project-scoped scheduled workflow (PATCH /v1/automations/:id only toggles built-ins; POST /v1/workflows accepts fixed templates). See docs/AUTOMATION.md.`);
    return 2;
  }
  const errors = validateReadback(JSON.parse(text), { requireDisabled: rest.includes('--require-disabled') });
  if (errors.length) { for (const e of errors) console.error(`FAIL ${e}`); return 1; }
  console.log('ok  registration readback conforms (disabled, 06:30 UTC, workerLimit 1, Sol 6.1/high)');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
