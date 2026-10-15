// Read-only verification of the staged qualification chain. It collects no
// evidence, registers no job, builds nothing, publishes nothing and launches no
// reviewer: it only checks signed receipts someone else produced.
//
// A bundle is { schemaVersion, receipts: [envelope, ...] } holding every stage
// up to and including the requested mode, in MODES order. Each envelope is signed
// by a trusted authority (scripts/project/authority.mjs); expected identities
// (run, seals, base commit, worker sessions) come from the caller, never the bundle.
import assert from 'node:assert/strict';
import { verifyRegistrationReadback, CHOICE } from '../automation/jadbot-daily.mjs';
import { findSecrets } from '../automation/secrets.mjs';
import { payloadDigest, verifyEnvelope } from './authority.mjs';

export const BUNDLE_SCHEMA = 'axionbench-evidence-bundle-v1';
export const STAGE_SCHEMA = 'axionbench-stage-receipt-v1';
export const MODES = Object.freeze(['candidate-qualification', 'candidate-review', 'publication', 'native-update', 'deployed-acceptance', 'owner-browser', 'hero-mp4', 'release-handoff']);
export const MODE_OPTIONS = Object.freeze(['--mode', '--bundle', '--trust', '--expect', '--now', '--max-age-hours', '--capture', '--public-source', '--state-dir', '--artifact']);
const AUTHORITY = { 'candidate-qualification': ['daemon'], 'candidate-review': ['reviewer'], publication: ['cloudflare'], 'native-update': ['jadbot'],
  'deployed-acceptance': ['cloudflare'], 'owner-browser': ['windows'], 'hero-mp4': ['capture'], 'release-handoff': ['daemon'] };
const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const SKEW_MS = 5 * 60_000;
const HOSTNAME = 'axionbench.jadapps.app';
const REPO = 'JAD-Apps/axionbench';
const isTime = (v) => Number.isFinite(Date.parse(v ?? ''));
const hex64 = (v, label) => assert.match(String(v), HEX64, `${label} must be a SHA-256`);

export function parseExpected(expected) {
  assert.ok(expected && typeof expected === 'object', 'expected identities required (--expect)');
  assert.ok(typeof expected.runId === 'string' && expected.runId, 'expected.runId required');
  hex64(expected.privateSourceSealSha256, 'expected.privateSourceSealSha256');
  hex64(expected.publicSourceSealSha256, 'expected.publicSourceSealSha256');
  assert.notEqual(expected.privateSourceSealSha256, expected.publicSourceSealSha256, 'private and public source seals must be distinct');
  assert.match(String(expected.publicBaseCommit), HEX40, 'expected.publicBaseCommit');
  assert.match(String(expected.publicCommit), HEX40, 'expected.publicCommit');
  assert.ok(Array.isArray(expected.workerSessionIds) && expected.workerSessionIds.length > 0, 'expected.workerSessionIds required to prove reviewer independence');
  return expected;
}

function checkCommon(payload, mode, expected, previous, state) {
  assert.equal(payload.schemaVersion, STAGE_SCHEMA, 'unknown stage receipt schema');
  assert.equal(payload.mode, mode, `receipt is for ${payload.mode}, not ${mode}`);
  assert.equal(payload.runId, expected.runId, 'receipt belongs to a different run');
  assert.ok(typeof payload.sessionId === 'string' && payload.sessionId, 'receipt session identity missing');
  if (expected.sessions?.[mode]) assert.equal(payload.sessionId, expected.sessions[mode], 'receipt session differs from the expected session');
  assert.ok(isTime(payload.issuedAt), 'issuedAt missing');
  assert.ok(Date.parse(payload.issuedAt) <= state.now + SKEW_MS, `${mode} receipt is dated in the future`);
  if (previous) assert.ok(Date.parse(payload.issuedAt) > Date.parse(previous.issuedAt), `${mode} receipt does not follow the previous stage in time`);
  assert.match(String(payload.nonce), /^[a-f0-9]{32,}$/, 'receipt nonce missing');
  assert.ok(!state.nonces.has(payload.nonce), 'replayed receipt: nonce already used in this chain');
  state.nonces.add(payload.nonce);
  assert.equal(payload.previousReceiptSha256, previous ? previous.digest : null, 'stage transition does not chain from the previous receipt');
  const id = payload.identities ?? {};
  assert.equal(id.privateSourceSealSha256, expected.privateSourceSealSha256, 'private candidate seal differs from the expected candidate');
  assert.equal(id.publicSourceSealSha256, expected.publicSourceSealSha256, 'public candidate seal differs from the expected candidate');
  assert.equal(id.publicCommit, expected.publicCommit, 'public commit differs from the expected revision');
  for (const k of ['source', 'data', 'control', 'product']) hex64(id.manifests?.[k], `manifests.${k}`);
  if (state.first) {
    for (const k of ['source', 'control', 'product']) assert.equal(id.manifests[k], state.first.manifests[k], `${k} manifest changed since qualification`);
    if (id.manifests.data !== state.first.manifests.data) {
      assert.ok(payload.dailyOverlay && payload.dailyOverlay.baseDataSha256 === state.first.manifests.data && HEX64.test(payload.dailyOverlay.overlaySha256 ?? ''),
        'data manifest changed since qualification without a bound daily overlay');
    }
  }
  assert.deepEqual(findSecrets(JSON.stringify(payload)), [], 'receipt contains credential-shaped text');
}

function checkAncestry(ancestry, expected) {
  assert.ok(Array.isArray(ancestry) && ancestry.length > 0 && ancestry.length <= 500, 'public commit ancestry required');
  let parent = expected.publicBaseCommit;
  for (const c of ancestry) {
    assert.match(String(c.sha), HEX40, 'commit sha');
    assert.equal(c.parent, parent, `public commit ${c.sha} does not extend the existing public main ancestry`);
    parent = c.sha;
  }
  assert.equal(parent, expected.publicCommit, 'ancestry does not end at the expected public commit');
}

function aiStageErrors(stages) {
  assert.ok(Array.isArray(stages), 'aiStages required');
  for (const s of stages) {
    assert.equal(typeof s.executed, 'boolean', 'aiStage.executed required');
    for (const k of ['requested', 'effective']) assert.deepEqual({ ...s[k], fallback: s[k]?.fallback ?? 'none' }, CHOICE, `aiStage ${s.stage} ${k} choice`);
    if (!s.executed) assert.equal(s.providerObservation ?? null, null, `aiStage ${s.stage} never ran but has a provider observation`);
    else {
      const o = s.providerObservation;
      assert.ok(o && o.model === CHOICE.model && o.effort === CHOICE.effort && o.fast === false && typeof o.sessionId === 'string' && isTime(o.observedAt), `aiStage ${s.stage} executed without a valid provider observation`);
    }
  }
}

const STAGE = {
  'candidate-qualification'(p, ctx) {
    checkAncestry(p.commits?.ancestry, ctx.expected);
    assert.equal(p.gates?.privateVerifyExit, 0, 'private gate must have exited 0');
    assert.equal(p.gates?.publicVerifyExit, 0, 'public gate must have exited 0');
    const reg = verifyRegistrationReadback(p.registration, ctx.anchors, { require: 'disabled', now: new Date(ctx.state.now) });
    assert.ok(Date.parse(reg.observedAt) <= Date.parse(p.issuedAt), 'registration observed after the receipt');
    aiStageErrors(p.aiStages);
    return { registrationId: reg.body.id, triggerId: reg.body.trigger.id };
  },
  'candidate-review'(p, ctx) {
    const q = ctx.facts['candidate-qualification'];
    const r = p.reviewer ?? {};
    assert.ok(typeof r.identity === 'string' && r.identity && typeof r.sessionId === 'string', 'reviewer identity missing');
    assert.ok(r.sessionId === p.sessionId, 'reviewer session differs from the receipt session');
    assert.ok(!ctx.expected.workerSessionIds.includes(r.sessionId) && r.sessionId !== q.sessionId, 'reviewer is not independent of the workers');
    assert.ok(!(r.workerIdentities ?? []).includes(r.identity), 'reviewer identity matches a worker');
    assert.equal(p.verdict, 'approved', 'review verdict must be approved');
    assert.equal(p.unresolvedFindings, 0, 'review has unresolved findings');
    assert.deepEqual(p.reviewedSeals, { private: ctx.expected.privateSourceSealSha256, public: ctx.expected.publicSourceSealSha256 }, 'reviewed candidates differ from the sealed candidates');
    aiStageErrors(p.aiStages);
  },
  publication(p, ctx) {
    const ci = verifyEnvelope(p.ci, ctx.anchors, ['github']);
    assert.equal(ci.kind, 'ci-run');
    assert.equal(ci.repo, REPO);
    assert.equal(ci.headSha, ctx.expected.publicCommit, 'CI ran on a different commit');
    assert.equal(ci.conclusion, 'success', 'public CI did not succeed');
    assert.equal(ci.event, 'push');
    const d = p.deployment ?? {};
    assert.equal(d.hostname, HOSTNAME);
    assert.equal(d.projectName, 'axionbench');
    assert.equal(d.environment, 'production');
    assert.equal(d.canonical, true, 'deployment is not the provider canonical production deployment');
    assert.ok(typeof d.deploymentId === 'string' && d.deploymentId, 'deployment id missing');
    assert.equal(d.productSha256, p.identities.manifests.product);
    assert.equal(d.controlSha256, p.identities.manifests.control);
    assert.equal(d.dataSha256, p.identities.manifests.data);
    return { deploymentId: d.deploymentId };
  },
  'native-update'(p, ctx) {
    const q = ctx.facts['candidate-qualification'];
    const reg = verifyRegistrationReadback(p.registration, ctx.anchors, { require: 'enabled', now: new Date(ctx.state.now) });
    assert.equal(reg.body.id, q.registrationId, 'a different job was enabled than the one qualified');
    assert.equal(reg.body.trigger.id, q.triggerId, 'trigger identity changed since qualification');
    assert.equal(reg.body.enablement.qualificationReceiptSha256, ctx.digests['candidate-qualification'], 'enablement does not cite the qualification receipt');
    assert.equal(reg.body.enablement.firstDeploymentReceiptSha256, ctx.digests.publication, 'enablement does not cite the first deployment');
    const x = p.execution ?? {};
    assert.equal(x.trigger, 'native');
    assert.equal(x.triggerId, q.triggerId, 'execution came from a different trigger');
    assert.equal(x.status, 'succeeded');
    assert.ok(isTime(x.startedAt) && isTime(x.finishedAt) && Date.parse(x.startedAt) <= Date.parse(x.finishedAt), 'execution times');
    aiStageErrors(p.aiStages);
    const remote = p.remote ?? {};
    for (const k of ['snapshotSha256', 'revisionSha256', 'productSha256', 'dataSha256']) hex64(remote[k], `remote.${k}`);
    assert.ok(typeof remote.deploymentId === 'string' && remote.deploymentId, 'remote deployment id missing');
    assert.match(String(remote.key), /^\d{4}-\d{2}-\d{2}\.r\d+$/, 'idempotency key');
    assert.equal(remote.dataSha256, p.identities.manifests.data, 'remote data differs from the receipt manifests');
    assert.equal(remote.productSha256, p.identities.manifests.product);
    const n = p.negative ?? {};
    assert.equal(n.case, 'last-good-retained', 'negative case missing');
    assert.equal(n.lastGoodRetained, true);
    assert.equal(n.lastGoodDeploymentId, remote.deploymentId, 'last-good is not the deployment the update produced');
    assert.notEqual(n.status, 'published', 'negative case must be a rejected update');
    return { remote };
  },
  'deployed-acceptance'(p, ctx) {
    const h = p.hosted ?? {};
    assert.equal(h.url, `https://${HOSTNAME}`);
    const latest = ctx.facts['native-update'].remote;
    assert.equal(h.deploymentId, latest.deploymentId, 'accepted deployment is not the latest updated one');
    assert.equal(h.canonical, true, 'readback must come from the provider canonical deployment');
    assert.equal(h.viaRetainedSnapshot, true, 'readback must use the retained production snapshot, not the newest listing or a rebuilt dist');
    assert.equal(h.snapshotSha256, latest.snapshotSha256);
    assert.equal(h.productSha256, p.identities.manifests.product);
    assert.equal(h.dataSha256, latest.dataSha256);
    for (const c of ['routes', 'assets', 'data', 'headers']) assert.equal(p.checks?.[c], 'passed', `${c} check not passed`);
    if (latest.dataSha256 !== ctx.first.manifests.data) assert.ok(HEX64.test(h.dataOverlaySha256 ?? ''), 'daily overlay missing from the readback');
  },
  'owner-browser'(p, ctx) {
    const b = p.browser ?? {};
    assert.equal(b.platform, 'windows', 'owner proof must come from the Windows browser');
    const u = new URL(b.url);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.hostname, HOSTNAME);
    assert.ok(typeof b.title === 'string' && b.title.length > 0, 'page title missing');
    assert.equal(b.deploymentId, ctx.facts['native-update'].remote.deploymentId);
    assert.ok(Array.isArray(b.screenshots) && b.screenshots.length > 0, 'screenshots missing');
    for (const s of b.screenshots) { hex64(s.sha256, 'screenshot'); assert.ok(Number.isSafeInteger(s.bytes) && s.bytes > 0); }
  },
  'hero-mp4'(p, ctx) {
    const v = p.video ?? {};
    hex64(v.sha256, 'video.sha256');
    assert.equal(v.codec, 'h264');
    assert.ok(v.width >= 640 && v.height >= 360 && v.durationSeconds >= 2 && v.durationSeconds <= 60, 'video dimensions or duration');
    assert.equal(v.decoded, 'complete');
    assert.ok(v.distinctFrames >= 3, 'video frames do not change');
    assert.ok(v.encoder && typeof v.encoder.identity === 'string' && typeof v.probe?.tool === 'string', 'qualified encoder and probe identities required');
    const a = verifyEnvelope(p.attachment, ctx.anchors, ['jadbot']);
    assert.equal(a.kind, 'attachment');
    assert.equal(a.runId, ctx.expected.runId);
    assert.equal(a.sha256, v.sha256, 'attached file is not the verified video');
    assert.ok(typeof a.attachmentId === 'string' && a.attachmentId, 'attachment id missing');
    assert.equal(p.capture?.deploymentId, ctx.facts['native-update'].remote.deploymentId, 'capture is not of the deployed release');
    ctx.facts.videoSha256 = v.sha256;
  },
  'release-handoff'(p, ctx) {
    assert.equal(p.submission?.ready, true, 'submission is not ready');
    assert.ok(isTime(p.submission?.readyAt));
    assert.deepEqual(p.submission?.receiptDigests, MODES.slice(0, -1).map((m) => ctx.digests[m]), 'submission does not cite the complete verified chain');
    assert.ok(!('evaluatorVerdict' in p) && !('evaluatorVerdict' in (p.submission ?? {})), 'the automatic evaluator verdict is outside this receipt');
  },
};

/**
 * Verifies the bundle for `mode`. `capture` is an optional async callback that
 * deeply verifies the video file (required for hero-mp4 through the CLI).
 */
export async function verifyChain(bundle, { mode, anchors, expected, now = new Date(), maxAgeHours = 24, capture = null }) {
  assert.ok(MODES.includes(mode), `unsupported mode ${JSON.stringify(mode)}`);
  assert.equal(bundle?.schemaVersion, BUNDLE_SCHEMA, 'unknown evidence bundle schema');
  parseExpected(expected);
  const upto = MODES.slice(0, MODES.indexOf(mode) + 1);
  assert.ok(Array.isArray(bundle.receipts) && bundle.receipts.length === upto.length,
    `missing final evidence: ${mode} needs ${upto.length} receipts (${upto.join(', ')}), bundle has ${bundle.receipts?.length ?? 0}`);
  const state = { now: new Date(now).getTime(), nonces: new Set(), first: null };
  const ctx = { anchors, expected, state, facts: {}, digests: {}, get first() { return state.first; } };
  let previous = null;
  for (const [i, m] of upto.entries()) {
    const payload = verifyEnvelope(bundle.receipts[i], anchors, AUTHORITY[m]);
    checkCommon(payload, m, expected, previous, state);
    if (!state.first) state.first = payload.identities;
    ctx.facts[m] = { sessionId: payload.sessionId, ...(STAGE[m](payload, ctx) ?? {}) };
    ctx.digests[m] = payloadDigest(payload);
    previous = { digest: ctx.digests[m], issuedAt: payload.issuedAt };
    if (m === mode) {
      assert.ok(state.now - Date.parse(payload.issuedAt) <= maxAgeHours * 3_600_000, `${mode} receipt is stale (older than ${maxAgeHours}h)`);
      if (m === 'hero-mp4') {
        assert.ok(capture, 'hero-mp4 requires the actual deployed capture and video file (--capture)');
        await capture(payload);
      }
    }
  }
  return { mode, runId: expected.runId, receipts: upto.length, digests: ctx.digests };
}
