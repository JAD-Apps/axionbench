// Supported owner API observations only. Invalid schema probes cannot execute
// commands or register an automation. Credential values are never recorded.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EVIDENCE, OLD_RUN, PIN, sha256, sourcePaths } from './preflight.mjs';

const sessionId = process.argv[2];
assert.match(sessionId ?? '', /^[a-f0-9-]{36}$/, 'provide the admitted session ID');
const root = resolve('.'), dir = join(root, EVIDENCE);
await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700);
const token = (await readFile(join(homedir(), '.jadbot/token'), 'utf8')).trim();
const start = new Date().toISOString();
async function api(name, route, { method = 'GET', body } = {}) {
  const response = await fetch(`http://127.0.0.1:7900${route}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  const envelope = { schemaVersion: 1, at: new Date().toISOString(), method, route, status: response.status, bodySha256: sha256(Buffer.from(JSON.stringify(data))), body: data };
  await writeFile(join(dir, `${name}.json`), JSON.stringify(envelope, null, 2) + '\n', { mode: 0o600 });
  return envelope;
}
const session = (await api('session', `/v1/sessions/${sessionId}`)).body;
assert.equal(session.origin, 'workflowStep');
// No API mutation is necessary: the owner already applied this supported
// scoped pin. Its persisted audit must precede the actual admission.
const run = (await api('run', `/v1/runs/${session.runId}`)).body;
assert.deepEqual(run.modelPin, PIN, 'report pin mismatch before further work');
const old = (await api('old-run', `/v1/runs/${OLD_RUN}`)).body;
assert.equal(old.status, 'paused'); assert.equal(old.execution.activeWorkers, 0);
assert(old.execution.activeSessions.length === 0 && old.execution.verifyingSteps.length === 0);
const oldStep = old.steps.find(row => row.status === 'failed'); assert(oldStep?.sessionId);
await api('old-session', `/v1/sessions/${oldStep.sessionId}`);
await api('project', `/v1/projects/${session.projectId}`);
await api('quality', '/v1/quality/capabilities');
await api('contract', `/v1/projects/${session.projectId}/contract`);
const health = (await api('health', '/v1/health')).body;
const secrets = (await api('secret-names', '/v1/secrets')).body;
const browser = (await api('browser', '/v1/computer')).body;
await api('automations', '/v1/automations');
const activeRuns = (await api('active-runs', '/v1/runs?status=running&limit=50')).body;
const register = await api('registration-probe', '/v1/automations', { method: 'POST', body: {} });
const record = await api('recording-probe', '/v1/computer/command', { method: 'POST', body: { action: 'record' } });
assert.equal(record.status, 422, 'recording probe unexpectedly ran a command');
const tool = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10_000 });
  return { available: result.status === 0, exitCode: result.status, errorCode: result.error?.code ?? null, detail: result.status === 0 ? result.stdout.trim().split('\n')[0] : null };
};
const tools = Object.fromEntries([['node', ['--version']], ['npm', ['--version']], ['python3', ['--version']], ['git', ['--version']], ['gh', ['--version']], ['curl', ['--version']], ['ffmpeg', ['-version']], ['ffprobe', ['-version']]].map(([cmd, args]) => [cmd, tool(cmd, args)]));
const cachedFfmpeg = join(homedir(), '.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux');
const encoderResult = spawnSync(cachedFfmpeg, ['-encoders'], { encoding: 'utf8', timeout: 10_000 });
const capabilities = {
  schemaVersion: 1, at: start, runtimeVersion: health.version,
  scopedPin: 'observed-run-api', fallback: 'prohibited-by-scoped-pin', isolation: 'container',
  historicalFastMode: 'unavailable', historicalServiceTier: 'unavailable',
  permissions: { posture: session.posture, approvals: session.approvals, cwd: session.cwd, observation: 'supported session API; source grants come from the worker sandbox' },
  secretNames: secrets.items.map(row => row.name ?? row.id).sort(),
  scheduler: { arbitraryRegistration: register.status === 404 ? 'unavailable' : 'unqualified', probeStatus: register.status, available: ['list', 'run', 'enable'], dailyWorkflowRegistered: false },
  browser: { observation: 'supported computer API', connected: browser.browsers.filter(row => row.connected).map(row => ({ id: row.id, kind: row.kind, origins: row.origins, writes: row.writes })), ownerSiteOpened: false },
  recording: { schemaAccepted: !record.body.detail?.some(row => row.path?.includes('action')), probeStatus: record.status, systemFfmpeg: tools.ffmpeg, systemFfprobe: tools.ffprobe, cachedFfmpegAvailable: encoderResult.status === 0, cachedH264Encoder: encoderResult.status === 0 ? /\blibx264\b|\blibopenh264\b/.test(encoderResult.stdout) : null, playableMp4Proven: false },
  review: { performed: false, separateIdentityRequired: true, assignedStage: 9 }, tools,
  activeRunIds: activeRuns.items.map(row => row.id).sort(),
  gaps: [
    ...(register.status === 404 ? ['Native arbitrary automation registration API returns 404; vault routine registration does not register an authenticated fact-validation/publication callback. Resolve for step 8.'] : ['Registration API exists but requires separate qualification before step 8.']),
    'Local secret-name API has no Cloudflare-named binding. Previously authorized Wrangler/GitHub credentials are not disproved or inspected by this observation.',
    'Connected owner desktop grant covers app://jadbot. Production browser origin/navigation/screenshot proof remains for step 11.',
    'Recording action passes deployed schema validation; encoding/playability are unproven. System ffmpeg/ffprobe are unavailable and cached encoder capability is recorded separately.',
    'Old runtime supplied no historical Fast/service-tier provider receipt. Independent reviewer identity/verdict remains for step 9.',
  ],
};
await writeFile(join(dir, 'capabilities.json'), JSON.stringify(capabilities, null, 2) + '\n', { mode: 0o600 });
const files = await Promise.all((await sourcePaths(root)).map(async path => ({ path, sha256: sha256(await readFile(join(root, path))) })));
await writeFile(join(dir, 'source.json'), JSON.stringify({ schemaVersion: 1, at: new Date().toISOString(), files }, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ runtime: health.version, sessionId, runId: run.id, modelPin: run.modelPin, oldRunPaused: true, activeRunIds: capabilities.activeRunIds, arbitraryRegistration: capabilities.scheduler.arbitraryRegistration, gaps: capabilities.gaps }, null, 2));
