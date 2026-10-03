// Native JadBot daily schedule client. Read-only: it only issues GET requests
// and never creates, enables, runs or edits a schedule.
//   node scripts/automation/jadbot-daily.mjs readback              fetch and store the schedule
//   node scripts/automation/jadbot-daily.mjs verify-registration [--require-disabled] [--live]
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED = Object.freeze({
  id: 'wfs_361f98ad3bac',
  projectId: 'prj_0e8ffc13d328',
  name: 'axionbench-daily-update',
  cron: '30 6 * * *',
  timeZone: 'UTC',
  overlap: 'skip',
  command: 'npm run publish:daily',
  choice: Object.freeze({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' }),
});
export const READBACK_PATH = 'evidence/local/native-schedule.json'; // git-ignored
export const MAX_AGE_MS = 72 * 60 * 60 * 1000;
const BASE = 'http://127.0.0.1:7900';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const sameChoice = (value) => value && value.provider === EXPECTED.choice.provider && value.model === EXPECTED.choice.model && value.effort === EXPECTED.choice.effort && Object.keys(value).length === 3;

// Returns a list of problems; empty means the schedule matches the contract.
export function checkSchedule(schedule, { requireDisabled = false } = {}) {
  const problems = [];
  const bad = (message) => problems.push(message);
  if (!schedule || typeof schedule !== 'object') return ['schedule is not an object'];
  for (const key of ['id', 'projectId', 'name', 'cron', 'timeZone', 'overlap']) {
    if (schedule[key] !== EXPECTED[key]) bad(`${key} is ${JSON.stringify(schedule[key])}, expected ${JSON.stringify(EXPECTED[key])}`);
  }
  if (typeof schedule.enabled !== 'boolean') bad('enabled is not a boolean');
  else if (requireDisabled && schedule.enabled) bad('schedule is enabled but must stay disabled until the first deployment is proven');
  if (requireDisabled && schedule.nextRunAt != null) bad('a disabled schedule must have no nextRunAt');
  const template = schedule.template;
  if (!template || typeof template !== 'object') return [...problems, 'template is missing'];
  for (const key of ['plannerChoice', 'workerChoice', 'reviewerChoice', 'modelPin']) {
    if (!sameChoice(template[key])) bad(`template.${key} is not codex/gpt-6.1-sol/high`);
  }
  if (template.workerLimit !== 1) bad('template.workerLimit must be 1');
  if (template.collaborate !== false) bad('template.collaborate must be false');
  if (!Array.isArray(template.steps) || template.steps.length !== 1) bad('template must have exactly one step');
  else {
    const [step] = template.steps;
    if (step.verifyCmd !== EXPECTED.command) bad(`step verifyCmd must be ${EXPECTED.command}`);
    if (!sameChoice(step.choice) || !sameChoice(step.workerChoice)) bad('step choices are not codex/gpt-6.1-sol/high');
    if (step.workerLimit !== 1) bad('step workerLimit must be 1');
  }
  return problems;
}

// A readback binds the parsed schedule to the exact bytes returned by the API.
export function checkReadback(readback, { now = Date.now(), requireDisabled = false } = {}) {
  const problems = [];
  if (!readback || typeof readback !== 'object') return ['readback is not an object'];
  if (readback.source !== 'jadbot-api' || readback.endpoint !== `/v1/workflow-schedules/${EXPECTED.id}`) problems.push('readback endpoint/source mismatch');
  if (readback.httpStatus !== 200) problems.push(`readback HTTP status is ${readback.httpStatus}`);
  if (typeof readback.raw !== 'string' || readback.rawSha256 !== sha256(readback.raw ?? '')) problems.push('readback hash does not match its raw response');
  else {
    try {
      if (JSON.stringify(JSON.parse(readback.raw)) !== JSON.stringify(readback.schedule)) problems.push('parsed schedule differs from the raw response');
    } catch { problems.push('raw response is not JSON'); }
  }
  const age = now - readback.fetchedAt;
  if (!Number.isFinite(age) || age < -60_000) problems.push('readback time is invalid or in the future');
  else if (age > MAX_AGE_MS) problems.push(`readback is stale (${Math.round(age / 3600000)} h old; limit ${MAX_AGE_MS / 3600000} h)`);
  return [...problems, ...checkSchedule(readback.schedule, { requireDisabled })];
}

async function get(path) {
  const token = (await readFile(join(homedir(), '.jadbot', 'token'), 'utf8')).trim();
  const response = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  return { status: response.status, text: await response.text() };
}

export async function readback() {
  const endpoint = `/v1/workflow-schedules/${EXPECTED.id}`;
  const { status, text } = await get(endpoint);
  const record = { source: 'jadbot-api', endpoint, httpStatus: status, fetchedAt: Date.now(), raw: text, rawSha256: sha256(text), schedule: status === 200 ? JSON.parse(text) : null };
  await mkdir(dirname(READBACK_PATH), { recursive: true });
  await writeFile(READBACK_PATH, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

// The project must hold exactly one schedule; a duplicate is a failure.
export async function checkNoDuplicates() {
  const { status, text } = await get(`/v1/workflow-schedules?projectId=${EXPECTED.projectId}`);
  if (status !== 200) return [`schedule list returned HTTP ${status}`];
  const items = JSON.parse(text).items ?? [];
  return items.length === 1 && items[0].id === EXPECTED.id ? [] : [`project has ${items.length} schedules: ${items.map((i) => i.id).join(', ')}`];
}

async function main(argv) {
  const [command, ...flags] = argv;
  if (command === 'readback') {
    const record = await readback();
    console.log(`readback HTTP ${record.httpStatus} stored at ${READBACK_PATH} sha256 ${record.rawSha256}`);
    return record.httpStatus === 200 ? 0 : 1;
  }
  if (command === 'verify-registration') {
    let record;
    try { record = JSON.parse(await readFile(READBACK_PATH, 'utf8')); } catch (error) {
      console.error(`missing or unreadable ${READBACK_PATH}: run "node scripts/automation/jadbot-daily.mjs readback" first (${error.message})`);
      return 1;
    }
    const requireDisabled = flags.includes('--require-disabled');
    const problems = checkReadback(record, { requireDisabled });
    if (flags.includes('--live')) problems.push(...await checkNoDuplicates());
    for (const problem of problems) console.error(`FAIL ${problem}`);
    if (!problems.length) console.log(`ok  ${EXPECTED.id} ${EXPECTED.cron} ${EXPECTED.timeZone} enabled=${record.schedule.enabled} overlap=${EXPECTED.overlap} codex/gpt-6.1-sol/high`);
    return problems.length ? 1 : 0;
  }
  console.error('usage: jadbot-daily.mjs readback | verify-registration [--require-disabled] [--live]');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
