// SYNTHETIC fixtures: throwaway keys and invented identities. Anchors are marked
// fixture:true, so the production loader refuses them; tests opt in explicitly.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { CHOICE, nextDailyRun } from '../../scripts/automation/jadbot-daily.mjs';
import { payloadDigest, signEnvelope } from '../../scripts/project/authority.mjs';
import { MODES, STAGE_SCHEMA } from '../../scripts/project/qualification.mjs';

export const AUTH = ['daemon', 'reviewer', 'github', 'cloudflare', 'jadbot', 'windows', 'capture'];
export const keys = Object.fromEntries(AUTH.map((a) => [a, generateKeyPairSync('ed25519')]));
export const trustFile = (fixture = true) => ({
  schemaVersion: 'axionbench-trust-v1',
  anchors: AUTH.map((a) => ({ keyId: `fixture-${a}`, authority: a, fixture, publicKeyPem: keys[a].publicKey.export({ type: 'spki', format: 'pem' }) })),
});
export const sign = (payload, authority, tweak = {}) => ({ ...signEnvelope(payload, { keyId: `fixture-${authority}`, authority, privateKey: keys[authority].privateKey }), ...tweak });

export const hex = (label) => createHash('sha256').update(label).digest('hex');
const sha40 = (label) => hex(label).slice(0, 40);
export const NOW = '2026-10-05T18:00:00.000Z';
export const BASE = 'b6fa8b0376aef8efec44e2399f17120b560f2d0c';
export const expected = () => ({
  runId: 'run_fixture', privateSourceSealSha256: hex('private-seal'), publicSourceSealSha256: hex('public-seal'),
  publicBaseCommit: BASE, publicCommit: sha40('c2'), workerSessionIds: ['worker-1', 'worker-2'],
});
const T = (minutes) => new Date(Date.parse('2026-10-05T10:00:00Z') + minutes * 60_000).toISOString();

export function registration({ enabled = false, observedAt = T(10), executed = 0, tweak } = {}) {
  const body = {
    id: 'wf_fixture', name: 'axionbench-daily-update', project: 'axionbench', isolation: 'project', enabled,
    schedule: { cron: '30 6 * * *', timezone: 'UTC', timezoneConfirmed: true }, nextRunAt: nextDailyRun('30 6 * * *', observedAt),
    trigger: { id: 'trg_fixture', kind: 'native' }, workerLimit: 1, collaboration: false, overlap: 'forbid',
    modelChoice: { ...CHOICE }, modelPin: { ...CHOICE, scope: 'workflow', workflowId: 'wf_fixture' }, effectiveChoice: { ...CHOICE },
    aiStagesExecuted: executed,
    providerObservations: Array.from({ length: executed }, (_, i) => ({ sessionId: `s${i}`, model: CHOICE.model, effort: CHOICE.effort, fast: false, observedAt })),
  };
  return { body, envelope: (extra = {}) => { tweak?.(body); return sign({ kind: 'registration-readback', observedAt, endpoint: '/v1/workflows/wf_fixture', daemonVersion: '0.1.fixture', body, ...extra }, 'jadbot'); } };
}

const stage = (name) => ({ stage: name, executed: false, requested: { ...CHOICE }, effective: { ...CHOICE }, providerObservation: null });
const identities = (data = hex('data')) => ({
  privateSourceSealSha256: expected().privateSourceSealSha256, publicSourceSealSha256: expected().publicSourceSealSha256, publicCommit: expected().publicCommit,
  manifests: { source: hex('source'), data, control: hex('control'), product: hex('product') },
});

export function chain({ upto = 'release-handoff', edit = {}, state = {} } = {}) {
  const want = MODES.slice(0, MODES.indexOf(upto) + 1);
  const ids = identities();
  const out = []; const digests = {};
  let previous = null;
  const q = { ancestry: [{ sha: sha40('c1'), parent: BASE }, { sha: sha40('c2'), parent: sha40('c1') }] };
  for (const [i, mode] of want.entries()) {
    const base = { schemaVersion: STAGE_SCHEMA, mode, runId: 'run_fixture', sessionId: `${mode}-session`, issuedAt: T(20 + i * 20), nonce: hex(`nonce-${mode}`).slice(0, 32), previousReceiptSha256: previous, identities: ids };
    let payload; let authority;
    if (mode === 'candidate-qualification') {
      authority = 'daemon';
      payload = { ...base, commits: q, gates: { privateVerifyExit: 0, publicVerifyExit: 0 }, registration: registration().envelope(), aiStages: ['plan', 'worker', 'review'].map(stage) };
    } else if (mode === 'candidate-review') {
      authority = 'reviewer';
      payload = { ...base, sessionId: 'reviewer-session', reviewer: { identity: 'reviewer-fixture', sessionId: 'reviewer-session', workerIdentities: ['worker-fixture'] }, verdict: 'approved', unresolvedFindings: 0,
        reviewedSeals: { private: ids.privateSourceSealSha256, public: ids.publicSourceSealSha256 }, aiStages: [{ ...stage('review'), executed: true, providerObservation: { sessionId: 'reviewer-session', model: CHOICE.model, effort: CHOICE.effort, fast: false, observedAt: T(30) } }] };
    } else if (mode === 'publication') {
      authority = 'cloudflare';
      payload = { ...base, ci: sign({ kind: 'ci-run', repo: 'JAD-Apps/axionbench', headSha: expected().publicCommit, conclusion: 'success', event: 'push', runId: 42 }, 'github'),
        deployment: { hostname: 'axionbench.jadapps.app', projectName: 'axionbench', environment: 'production', canonical: true, deploymentId: 'dep_1', productSha256: ids.manifests.product, controlSha256: ids.manifests.control, dataSha256: ids.manifests.data } };
    } else if (mode === 'native-update') {
      authority = 'jadbot';
      const reg = registration({ enabled: true, observedAt: T(70), executed: 1 });
      reg.body.enablement = { enabledAt: T(65), qualificationReceiptSha256: digests['candidate-qualification'], firstDeploymentReceiptSha256: digests.publication };
      payload = { ...base, registration: reg.envelope(), execution: { trigger: 'native', triggerId: 'trg_fixture', status: 'succeeded', startedAt: T(71), finishedAt: T(75) },
        aiStages: [{ ...stage('worker'), executed: true, providerObservation: { sessionId: 's0', model: CHOICE.model, effort: CHOICE.effort, fast: false, observedAt: T(72) } }],
        remote: { deploymentId: 'dep_2', snapshotSha256: hex('snap'), revisionSha256: hex('rev'), key: '2026-10-05.r1', productSha256: ids.manifests.product, dataSha256: ids.manifests.data },
        negative: { case: 'last-good-retained', status: 'failed-restored', lastGoodRetained: true, lastGoodDeploymentId: 'dep_2' } };
    } else if (mode === 'deployed-acceptance') {
      authority = 'cloudflare';
      payload = { ...base, hosted: { url: 'https://axionbench.jadapps.app', deploymentId: 'dep_2', canonical: true, viaRetainedSnapshot: true, snapshotSha256: hex('snap'), productSha256: ids.manifests.product, dataSha256: ids.manifests.data },
        checks: { routes: 'passed', assets: 'passed', data: 'passed', headers: 'passed' } };
    } else if (mode === 'owner-browser') {
      authority = 'windows';
      payload = { ...base, browser: { platform: 'windows', browserName: 'fixture', url: 'https://axionbench.jadapps.app/', title: 'AxionBench', deploymentId: 'dep_2', screenshots: [{ sha256: hex('shot'), bytes: 1000 }] } };
    } else if (mode === 'hero-mp4') {
      authority = 'capture';
      const video = { sha256: hex('video'), codec: 'h264', width: 1280, height: 720, durationSeconds: 8, decoded: 'complete', distinctFrames: 40, encoder: { identity: 'libx264' }, probe: { tool: 'ffprobe' } };
      payload = { ...base, video, capture: { deploymentId: 'dep_2' }, attachment: sign({ kind: 'attachment', runId: 'run_fixture', sha256: video.sha256, attachmentId: 'att_1' }, 'jadbot') };
    } else {
      authority = 'daemon';
      payload = { ...base, submission: { ready: true, readyAt: T(200), receiptDigests: MODES.slice(0, -1).map((m) => digests[m]) } };
    }
    payload = edit[mode]?.(payload) ?? payload;
    digests[mode] = payloadDigest(payload);
    previous = digests[mode];
    out.push(sign(payload, authority));
  }
  return { schemaVersion: 'axionbench-evidence-bundle-v1', receipts: out, ...state };
}

// Labelled FIXTURE ffprobe/ffmpeg answers (no real encoder is installed in the test environment).
export const FIXTURE_PROBE_VERSION = 'ffprobe version fixture-1.0';
export const fixtureExec = ({ frames = 40, width = 1280, height = 720, duration = 8 } = {}) => async (file, args) => {
  if (args[0] === '-version') return { code: 0, stdout: `${FIXTURE_PROBE_VERSION}\n`, stderr: '' };
  if (args.includes('-decoders')) return { code: 0, stdout: ' V....D h264                 H.264 / AVC\n', stderr: '' };
  if (args.includes('-show_entries')) return { code: 0, stderr: '', stdout: JSON.stringify({ streams: [{ codec_name: 'h264', width, height, nb_read_frames: String(frames) }], format: { duration: String(duration) } }) };
  return { code: 0, stderr: '', stdout: `#format\n${Array.from({ length: frames }, (_, i) => `0, ${i}, ${i}, 1, 1, ${String(i).padStart(32, '0')}`).join('\n')}\n` };
};
