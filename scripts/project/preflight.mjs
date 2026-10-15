// Private admission audit. This module never controls a run or global routing.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, chmod, lstat, readdir, realpath } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHOICE = Object.freeze({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
export const PRIVATE_BASE = 'c3a915b717c999321e43148d522d160f4de805de';
export const PUBLIC_BASE = 'b6fa8b0376aef8efec44e2399f17120b560f2d0c';
export const ARCHIVE_HASH = 'd83ba8c9cd0c2982d7728cee27529035f44bf8864f60456f2e67a2824265a71b';
export const RUN = 'run_ec6c62962fc6';
export const OLD_RUN = 'run_a898861f6684';
export const PROJECT = 'prj_0e8ffc13d328';
export const EVIDENCE = 'evidence/local/preflight';
const boundFiles = ['scripts/project/preflight.mjs', 'scripts/project/recover.py', 'tests/project/preflight.test.mjs', 'docs/project/PREFLIGHT.md', 'package.json', 'package-lock.json', 'jadbot.quality.json', 'scripts/release/verify-release.mjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim();
export const sameChoice = choice => choice?.provider === CHOICE.provider && choice?.model === CHOICE.model && choice?.effort === CHOICE.effort && (!choice.serviceTier || choice.serviceTier === 'default');

// The only authenticated transport accepts enumerated GET paths, never URLs or
// verbs supplied by a caller. Redirects are refused to protect the owner token.
export async function observe(path, token, fetcher = fetch) {
  if (!/^\/v1\/(?:health|automations|secrets|computer|quality\/capabilities|bridge\/capabilities|projects\/prj_0e8ffc13d328(?:\/contract)?|runs(?:\?projectId=prj_0e8ffc13d328&limit=500|\/run_(?:ec6c62962fc6|a898861f6684)(?:\/learning)?)?|sessions\/[0-9a-f-]+)$/.test(path)) throw new Error('Read-only observation path refused');
  const response = await fetcher(`http://127.0.0.1:${process.env.JADBOT_PORT || '7900'}${path}`, { method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`);
  return response.json();
}

export function validateAdmission(e, now = Date.now()) {
  const errors = [];
  const require = (condition, diagnostic) => { if (!condition) errors.push(diagnostic); };
  require(e.schemaVersion === 1, 'Missing admission schema');
  require(Number.isFinite(e.capturedAt) && e.capturedAt <= now + 30000 && now - e.capturedAt < 24 * 3600000, 'Admission observations absent or older than 24 hours');
  const run = e.run;
  require(run?.id === RUN && run?.projectId === PROJECT, 'Run/project identity mismatch');
  for (const key of ['plannerChoice', 'workerChoice', 'reviewerChoice', 'modelPin']) require(sameChoice(run?.[key]), `${key} must explicitly select codex/gpt-6.1-sol/high, standard tier`);
  require(run?.collaborate === false, 'Collaboration must be disabled');
  require(Array.isArray(run?.modelPinAudit) && run.modelPinAudit.some(row => sameChoice(row.pin)), 'Missing persisted scoped pin audit; no fallback assurance');
  require(Array.isArray(run?.steps) && run.steps.length === 12, 'Missing complete persisted step roster');
  for (const step of run?.steps || []) {
    require(sameChoice(step.choice) && sameChoice(step.workerChoice), `${step.id}: explicit step choices mismatch`);
    require(step.workerLimit === 1, `${step.id}: one worker per step required`);
    for (const key of ['requestedChoice', 'effectiveChoice']) if (step[key]) require(sameChoice(step[key]), `${step.id}: ${key} mismatch`);
  }
  const old = e.oldRun;
  require(old?.id === OLD_RUN && old?.status === 'paused', 'Older run is not captured as paused');
  require(old?.execution?.activeWorkers === 0 && old.execution.phaseStarting === false, 'Older run has active or starting execution');
  for (const key of ['activeSessions', 'startingSteps', 'verifyingSteps', 'backgroundSteps', 'authorizedSteps']) require(Array.isArray(old?.execution?.[key]) && old.execution[key].length === 0, `Older run has missing/nonempty ${key}`);
  require(e.oldSession?.status === 'stopped' && e.oldSession?.live === false, 'Older worker is not confirmed stopped');
  require(old?.steps?.[0]?.status === 'failed' && old.steps[0].exitCode === 1, 'Original failed native history must remain failed/exit 1');
  require(e.contract?.runtime?.isolation === 'container' && e.qualityCapabilities?.docker?.available === true, 'Project container isolation evidence missing');
  require(e.project?.id === PROJECT && e.project?.git?.lastCommit?.hash === PRIVATE_BASE, 'Private baseline identity mismatch');
  require(Array.isArray(e.projectRuns?.items), 'Missing project-scoped run observation');
  for (const other of e.projectRuns?.items || []) {
    // Unrelated projects may execute concurrently. Inspect only this project.
    if (other.projectId !== PROJECT || other.id === RUN) continue;
    const x = other.execution;
    require(x && x.activeWorkers === 0 && x.phaseStarting === false && ['activeSessions', 'startingSteps', 'verifyingSteps', 'backgroundSteps', 'authorizedSteps'].every(k => Array.isArray(x[k]) && x[k].length === 0), `Another run is working on AxionBench: ${other.id}`);
  }
  require(Array.isArray(e.sessions) && e.sessions.length > 0, 'Missing executed-stage session observations');
  for (const listed of run?.sessions || []) {
    const session = e.sessions?.find(row => row.id === listed.id);
    require(!!session, `${listed.id}: executed stage observation missing`);
    if (!session) continue;
    require(session.runId === RUN && session.projectId === PROJECT, `${session.id}: session ownership mismatch`);
    require(sameChoice(session.requestedChoice) && sameChoice(session.effectiveChoice), `${session.id}: requested/effective choices mismatch`);
    const receipt = session.modelReceipt;
    require(!!receipt && receipt.sessionId === session.id, `${session.id}: mandatory provider model receipt missing (historical observations unavailable)`);
    if (!receipt) continue;
    require(sameChoice(receipt.requested) && sameChoice(receipt.effective), `${session.id}: receipt choice mismatch`);
    const init = receipt.init;
    require(init?.source === 'reported' && init?.model === CHOICE.model && init?.effort === 'high', `${session.id}: provider model/effort observation missing or mismatched`);
    require(init?.fastMode === 'off' && init?.serviceTier === 'default', `${session.id}: provider Fast OFF/default tier not observed`);
    require(receipt.violation === null, `${session.id}: model pin violation`);
    for (const config of receipt.configurations || []) require(config.model === CHOICE.model && config.effort === 'high' && config.serviceTier === 'default', `${session.id}: observed routing changed`);
    require(typeof session.posture === 'string', `${session.id}: permission posture missing`);
  }
  require(e.capabilities?.scheduler?.registration === 'unavailable' || e.capabilities?.scheduler?.registration === 'supported', 'Scheduler registration capability not inspected');
  require(Array.isArray(e.secrets?.items) && e.secrets.items.every(row => typeof row.name === 'string' && typeof row.present === 'boolean' && Object.keys(row).every(k => ['name', 'present'].includes(k))), 'Secret-name-only availability observation missing or includes values');
  require(Array.isArray(e.computer?.browsers) && typeof e.computer?.desktop?.available === 'boolean', 'Browser capabilities not observed');
  require(typeof e.capabilities?.recording?.h264 === 'boolean', 'Recording capability not inspected');
  require(e.recovery?.archiveSha256 === ARCHIVE_HASH && e.recovery?.privateBaseline === PRIVATE_BASE && e.recovery?.publicBaseline === PUBLIC_BASE && e.recovery?.verifiedFiles === 526 && e.recovery?.daemonContentBound === true && e.recovery?.publicDraftPreserved === true, 'Hashed immutable boundary/public-draft recovery missing or mismatched');
  require(e.recovery?.artifacts?.some(row => row.path === 'evidence/local/recovery/private-boundary-source-and-receipts.tar.gz' && row.sha256 === ARCHIVE_HASH), 'Original recovery archive artifact must have the owner-supplied digest');
  require(e.recovery?.nativeExitCode === 1 && e.recovery?.passedPrivateGates === 21 && e.recovery?.failedAddedGate === 'verify:public', 'Recovery misstates original failure');
  return errors;
}

export async function sourceBinding() {
  const files = [];
  for (const path of boundFiles) files.push({ path, sha256: hash(await readFile(path)) });
  return { head: git(['rev-parse', 'HEAD']), files };
}

async function save(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await chmod(path, 0o600);
}

async function capabilities() {
  const toolchain = {};
  for (const [name, args] of Object.entries({ node: ['--version'], npm: ['--version'], python3: ['--version'], git: ['--version'], gh: ['--version'], curl: ['--version'], ffmpeg: ['-version'], ffprobe: ['-version'] })) {
    const r = spawnSync(name, args, { encoding: 'utf8', timeout: 10000 });
    toolchain[name] = { available: r.status === 0, version: r.status === 0 ? r.stdout.split('\n')[0] : null };
  }
  const cache = '../../../.cache/ms-playwright';
  const names = await readdir(cache).catch(() => []);
  const browsers = [];
  const encoders = [];
  for (const name of names) {
    if (name.startsWith('chromium-')) for (const layout of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const path = `${cache}/${name}/${layout}`;
      if ((await lstat(path).catch(() => null))?.isFile()) browsers.push(path);
    }
    if (name.startsWith('ffmpeg-')) {
      const path = `${cache}/${name}/ffmpeg-linux`;
      const r = spawnSync(path, ['-encoders'], { encoding: 'utf8', timeout: 10000 });
      encoders.push({ path, available: r.status === 0, h264: r.status === 0 && /\bh264\b|libx264/.test(r.stdout) });
    }
  }
  const system = spawnSync('ffmpeg', ['-encoders'], { encoding: 'utf8', timeout: 10000 });
  const inspectedSource = '../../../src/jad/jadbot/apps/daemon/src/modules/automations.ts';
  const bytes = await readFile(inspectedSource);
  const registration = /app\.post\("\/v1\/automations",/.test(bytes.toString()) ? 'supported' : 'unavailable';
  return {
    toolchain, chromium: { available: browsers.length > 0, paths: browsers },
    scheduler: { registration, inspectedSource, sourceSha256: hash(bytes), deployedRegistrationProof: null, basis: 'GET list plus local route inspection; no write probing. Deployed registration is not proven.' },
    recording: { h264: (system.status === 0 && /\bh264\b|libx264/.test(system.stdout)) || encoders.some(row => row.h264), cachedEncoders: encoders, systemFfmpeg: toolchain.ffmpeg, systemFfprobe: toolchain.ffprobe, claim: 'Encoding inventory only; no browser opening or recording claimed.' },
    permissions: { source: 'GET session posture. Workspace write boundaries are declared in the assigned task context; no broader grant inferred.' }
  };
}

export async function capture(observationsOnly = false) {
  const token = (await readFile('../../token', 'utf8')).trim();
  const paths = { run: `/v1/runs/${RUN}`, oldRun: `/v1/runs/${OLD_RUN}`, oldLearning: `/v1/runs/${OLD_RUN}/learning`, oldSession: '/v1/sessions/01a0f8bb-65ef-7fa6-9705-692c7a000aaa', projectRuns: `/v1/runs?projectId=${PROJECT}&limit=500`, project: `/v1/projects/${PROJECT}`, contract: `/v1/projects/${PROJECT}/contract`, qualityCapabilities: '/v1/quality/capabilities', secrets: '/v1/secrets', computer: '/v1/computer', automations: '/v1/automations', health: '/v1/health' };
  const e = { schemaVersion: 1, capturedAt: Date.now(), sessions: [] };
  for (const [name, path] of Object.entries(paths)) {
    const data = await observe(path, token);
    if (name === 'secrets' && (!Array.isArray(data.items) || data.items.some(row => Object.keys(row).some(k => !['name', 'present'].includes(k))))) throw new Error('Secret listing includes unexpected fields; refusing persistence');
    await save(`${EVIDENCE}/api-${name}.json`, { method: 'GET', path, observedAt: Date.now(), data });
    e[name] = data;
  }
  for (const row of e.run.sessions) {
    const session = await observe(`/v1/sessions/${row.id}`, token);
    const { messages, approvals, usage, ...observation } = session;
    e.sessions.push(observation);
  }
  e.capabilities = await capabilities();
  e.capabilities.historicalObservations = e.sessions.filter(row => !row.modelReceipt).map(row => ({ sessionId: row.id, providerReportedModel: null, effort: null, fastMode: null, serviceTier: null, reason: 'Historical provider modelReceipt unavailable in supported session GET; requested/effective choices are retained separately.' }));
  await save(`${EVIDENCE}/capabilities.json`, e.capabilities);
  if (observationsOnly) {
    console.log(`Saved read-only observations in ${EVIDENCE}; this is not admission qualification.`);
    return e;
  }
  e.recovery = JSON.parse(await readFile('evidence/local/recovery/receipt.json', 'utf8'));
  e.source = await sourceBinding();
  await save(`${EVIDENCE}/admission.json`, e);
  console.log(`Captured read-only admission observations in ${EVIDENCE}/admission.json`);
  return e;
}

export async function verifyEvidence() {
  const e = JSON.parse(await readFile(`${EVIDENCE}/admission.json`, 'utf8'));
  const errors = validateAdmission(e);
  if (JSON.stringify(e.source) !== JSON.stringify(await sourceBinding())) errors.push('Admission is not bound to current verifier/source bytes');
  for (const item of e.recovery?.artifacts || []) {
    const path = item.path;
    if (typeof path !== 'string' || !path.startsWith('evidence/local/recovery/') || relative(await realpath('evidence/local/recovery'), await realpath(path)).startsWith('..') || (await lstat(path)).isSymbolicLink()) errors.push('Unsafe private recovery artifact path');
    else if (hash(await readFile(path)) !== item.sha256) errors.push(`Private recovery artifact changed: ${path}`);
  }
  if (!e.recovery?.artifacts?.length) errors.push('Missing recoverable private artifact digests');
  const recovery = JSON.parse(await readFile('evidence/local/recovery/receipt.json', 'utf8'));
  if (JSON.stringify(recovery) !== JSON.stringify(e.recovery)) errors.push('Admission recovery fields differ from preserved receipt');
  const native = JSON.parse(await readFile('evidence/local/recovery/native-negative-receipt.json', 'utf8'));
  const manifest = JSON.parse(await readFile('evidence/local/recovery/original-manifest.json', 'utf8'));
  if (native.source !== recovery.daemonSource || native.head !== PRIVATE_BASE || native.exitCode !== 1 || native.status !== 'failed') errors.push('Preserved native verifier identity/result mismatch');
  const nativeFiles = new Map(native.pre?.files?.map(row => [row.path, row.sha256]) || []);
  for (const path of ['scripts/public/boundary.mjs', 'scripts/public/test-boundary.mjs', 'scripts/release/verify-release.mjs', 'scripts/public-snapshot.mjs']) {
    if (!nativeFiles.get(path) || manifest.sourceManifest?.find(row => row.path === path)?.sha256 !== nativeFiles.get(path)) errors.push(`Recovered source differs from daemon capture: ${path}`);
  }
  if (errors.length) throw new Error(`Admission NOT qualified:\n${errors.map(x => `- ${x}`).join('\n')}`);
  console.log('Admission and immutable recovery verified against current source; no deployment or independent-review claim.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).join(' ') === '--observe') await capture(true);
    else if (process.argv.slice(2).join(' ') === '--capture') await capture();
    else if (process.argv.slice(2).join(' ') === '--verify') await verifyEvidence();
    else throw new Error('Usage: node scripts/project/preflight.mjs --observe|--capture|--verify');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
