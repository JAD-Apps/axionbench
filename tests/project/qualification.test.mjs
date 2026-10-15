// Strict qualification contracts. All evidence here is SYNTHETIC (throwaway keys,
// invented identities, labelled fixture anchors); it proves the verifier's rules,
// not that any real stage ran.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { loadTrust, parseTrust, signEnvelope } from '../../scripts/project/authority.mjs';
import { MODES, verifyChain } from '../../scripts/project/qualification.mjs';
import { parseArgs, verifyMode } from '../../scripts/project/verify-receipts.mjs';
import { FIXTURE_PROBE_VERSION, NOW, chain, expected, fixtureExec, hex, registration, sign, trustFile } from './evidence-fixtures.mjs';
import { createHash } from 'node:crypto';

const anchors = parseTrust(trustFile(), { allowFixture: true });
const check = (bundle, mode = 'release-handoff', extra = {}) => verifyChain(bundle, { mode, anchors, expected: expected(), now: new Date(NOW), capture: async () => {}, ...extra });
const dirs = [];
const scratch = async () => { const d = await mkdtemp(join(tmpdir(), 'axionbench-qual-')); dirs.push(d); return d; };
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });

test('every mode verifies its complete synthetic chain', async () => {
  for (const mode of MODES) {
    const report = await check(chain({ upto: mode }), mode);
    assert.equal(report.receipts, MODES.indexOf(mode) + 1);
  }
});

test('missing final evidence, extra evidence and unsupported modes fail', async () => {
  await assert.rejects(check(chain({ upto: 'publication' }), 'native-update'), /missing final evidence/);
  await assert.rejects(check(chain({ upto: 'native-update' }), 'publication'), /missing final evidence/);
  await assert.rejects(check(chain(), 'hero-mp4'), /missing final evidence/);
  await assert.rejects(check(chain(), 'release-handoff-2'), /unsupported mode/);
  await assert.rejects(check({ ...chain(), receipts: [] }), /missing final evidence/);
  await assert.rejects(check(chain({ upto: 'hero-mp4' }), 'hero-mp4', { capture: null }), /actual deployed capture/);
});

test('authority: unsigned, forged, wrong-authority, unknown-key and fixture anchors establish nothing', async () => {
  const good = chain({ upto: 'candidate-review' });
  const forged = structuredClone(good); forged.receipts[1].payload.verdict = 'approved '; // changes signed bytes
  await assert.rejects(check(forged, 'candidate-review'), /signature is invalid/);
  const tampered = structuredClone(good); tampered.receipts[0].payload.gates.publicVerifyExit = 1;
  await assert.rejects(check(tampered, 'candidate-review'), /signature is invalid/);
  const unsigned = structuredClone(good); delete unsigned.receipts[0].signature;
  await assert.rejects(check(unsigned, 'candidate-review'), /signed envelope required/);
  const unknown = structuredClone(good); unknown.receipts[0].keyId = 'someone-else';
  await assert.rejects(check(unknown, 'candidate-review'), /unknown key/);
  // A trusted key of the wrong authority cannot attest the stage (review signed by the daemon).
  const bad = chain({ upto: 'candidate-review' }); const payload = bad.receipts[1].payload;
  bad.receipts[1] = sign(payload, 'daemon');
  await assert.rejects(check(bad, 'candidate-review'), /cannot attest/);
  // A signature by the attacker's own key, labelled with a trusted key id.
  const attacker = generateKeyPairSync('ed25519');
  const own = signEnvelope(payload, { keyId: 'fixture-reviewer', authority: 'reviewer', privateKey: attacker.privateKey });
  const swapped = chain({ upto: 'candidate-review' }); swapped.receipts[1] = own;
  await assert.rejects(check(swapped, 'candidate-review'), /signature is invalid/);
  // Fixture anchors cannot be loaded as real trust.
  assert.throws(() => parseTrust(trustFile(true)), /test fixture/);
  const dir = await scratch(); await writeFile(join(dir, 'trust.json'), JSON.stringify(trustFile(true)));
  await assert.rejects(loadTrust(join(dir, 'trust.json')), /test fixture/);
  await assert.rejects(loadTrust(undefined), /trust file/);
});

test('replayed, stale, future and out-of-order receipts are rejected', async () => {
  const dup = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, nonce: hex('nonce-candidate-qualification').slice(0, 32) }) } });
  await assert.rejects(check(dup, 'candidate-review'), /replayed receipt/);
  await assert.rejects(check(chain({ upto: 'candidate-review' }), 'candidate-review', { now: new Date('2026-10-07T00:00:00Z') }), /stale/);
  await assert.rejects(check(chain({ upto: 'candidate-review' }), 'candidate-review', { now: new Date('2026-10-05T09:00:00Z') }), /future/);
  const early = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, issuedAt: '2026-10-05T10:05:00.000Z' }) } });
  await assert.rejects(check(early, 'candidate-review'), /does not follow/);
  const reordered = chain({ upto: 'candidate-review' }); reordered.receipts.reverse();
  await assert.rejects(check(reordered, 'candidate-review'));
  const broken = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, previousReceiptSha256: hex('x') }) } });
  await assert.rejects(check(broken, 'candidate-review'), /chain from the previous/);
});

test('wrong run, session, revision and changed candidates are rejected', async () => {
  await assert.rejects(check(chain({ upto: 'candidate-review', edit: { 'candidate-qualification': (p) => ({ ...p, runId: 'run_other' }) } }), 'candidate-review'), /different run/);
  await assert.rejects(check(chain({ upto: 'candidate-review' }), 'candidate-review', { expected: { ...expected(), sessions: { 'candidate-review': 'someone' } } }), /expected session/);
  await assert.rejects(check(chain({ upto: 'candidate-review' }), 'candidate-review', { expected: { ...expected(), publicCommit: 'd'.repeat(40) } }), /public commit differs|does not end/);
  await assert.rejects(check(chain({ upto: 'candidate-review' }), 'candidate-review', { expected: { ...expected(), privateSourceSealSha256: hex('other') } }), /private candidate seal/);
  await assert.rejects(check(chain({ upto: 'candidate-review' }), 'candidate-review', { expected: { ...expected(), publicSourceSealSha256: hex('other') } }), /public candidate seal/);
  await assert.rejects(check(chain({ upto: 'candidate-review' }), 'candidate-review', { expected: { ...expected(), publicSourceSealSha256: expected().privateSourceSealSha256 } }), /must be distinct/);
  // Review of a different candidate than the one sealed.
  await assert.rejects(check(chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, reviewedSeals: { ...p.reviewedSeals, public: hex('changed') } }) } }), 'candidate-review'), /reviewed candidates differ/);
  // Product manifest changed after qualification.
  const changed = chain({ upto: 'publication', edit: { publication: (p) => ({ ...p, identities: { ...p.identities, manifests: { ...p.identities.manifests, product: hex('new-product') } } }) } });
  await assert.rejects(check(changed, 'publication'), /product manifest changed/);
});

test('public commit ancestry must extend the existing public main', async () => {
  const fork = chain({ upto: 'candidate-qualification', edit: { 'candidate-qualification': (p) => ({ ...p, commits: { ancestry: [{ sha: 'e'.repeat(40), parent: 'f'.repeat(40) }, p.commits.ancestry[1]] } }) } });
  await assert.rejects(check(fork, 'candidate-qualification'), /does not extend/);
  const gap = chain({ upto: 'candidate-qualification', edit: { 'candidate-qualification': (p) => ({ ...p, commits: { ancestry: [p.commits.ancestry[0]] } }) } });
  await assert.rejects(check(gap, 'candidate-qualification'), /does not end/);
  const none = chain({ upto: 'candidate-qualification', edit: { 'candidate-qualification': (p) => ({ ...p, commits: {} }) } });
  await assert.rejects(check(none, 'candidate-qualification'), /ancestry required/);
});

test('reviewer identity must exist and be independent of the workers', async () => {
  const gone = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => { const { reviewer, ...rest } = p; return rest; } } });
  await assert.rejects(check(gone, 'candidate-review'), /reviewer identity missing/);
  const worker = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, sessionId: 'worker-1', reviewer: { ...p.reviewer, sessionId: 'worker-1' } }) } });
  await assert.rejects(check(worker, 'candidate-review'), /not independent/);
  const same = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, sessionId: 'candidate-qualification-session', reviewer: { ...p.reviewer, sessionId: 'candidate-qualification-session' } }) } });
  await assert.rejects(check(same, 'candidate-review'), /not independent/);
  const rejected = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, verdict: 'changes-requested' }) } });
  await assert.rejects(check(rejected, 'candidate-review'), /must be approved/);
  const open = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, unresolvedFindings: 2 }) } });
  await assert.rejects(check(open, 'candidate-review'), /unresolved findings/);
});

test('provider observations exist exactly for AI stages that executed', async () => {
  const missing = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, aiStages: [{ ...p.aiStages[0], providerObservation: null }] }) } });
  await assert.rejects(check(missing, 'candidate-review'), /without a valid provider observation/);
  const wrongModel = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, aiStages: [{ ...p.aiStages[0], providerObservation: { ...p.aiStages[0].providerObservation, model: 'gpt-6.1-luna' } }] }) } });
  await assert.rejects(check(wrongModel, 'candidate-review'), /without a valid provider observation/);
  const invented = chain({ upto: 'candidate-qualification', edit: { 'candidate-qualification': (p) => ({ ...p, aiStages: [{ ...p.aiStages[0], providerObservation: { sessionId: 'x', model: 'gpt-6.1-sol', effort: 'high', fast: false, observedAt: p.issuedAt } }] }) } });
  await assert.rejects(check(invented, 'candidate-qualification'), /never ran but has a provider observation/);
  const fallback = chain({ upto: 'candidate-qualification', edit: { 'candidate-qualification': (p) => ({ ...p, aiStages: [{ ...p.aiStages[0], effective: { ...p.aiStages[0].effective, fallback: 'luna' } }] }) } });
  await assert.rejects(check(fallback, 'candidate-qualification'), /effective choice/);
});

test('registration evidence: missing, unauthenticated, enabled-at-qualification and wrong-job cases', async () => {
  const none = chain({ upto: 'candidate-qualification', edit: { 'candidate-qualification': (p) => { const { registration: _r, ...rest } = p; return rest; } } });
  await assert.rejects(check(none, 'candidate-qualification'), /signed envelope required/);
  const local = registration().envelope(); local.signature = Buffer.alloc(64).toString('base64');
  await assert.rejects(check(chain({ upto: 'candidate-qualification', edit: { 'candidate-qualification': (p) => ({ ...p, registration: local }) } }), 'candidate-qualification'), /signature is invalid/);
  const asDaemon = sign(registration().envelope().payload, 'daemon');
  await assert.rejects(check(chain({ upto: 'candidate-qualification', edit: { 'candidate-qualification': (p) => ({ ...p, registration: asDaemon }) } }), 'candidate-qualification'), /cannot attest/);
  const enabledEarly = registration({ enabled: true }); enabledEarly.body.enablement = { enabledAt: '2026-10-05T10:00:00Z', qualificationReceiptSha256: hex('a'), firstDeploymentReceiptSha256: hex('b') };
  await assert.rejects(check(chain({ upto: 'candidate-qualification', edit: { 'candidate-qualification': (p) => ({ ...p, registration: enabledEarly.envelope() }) } }), 'candidate-qualification'), /must be disabled/);
  // Historical disabled qualification stays valid after the same job is enabled (the full chain contains both).
  await check(chain({ upto: 'native-update' }), 'native-update');
  const otherJob = registration({ enabled: true, observedAt: '2026-10-05T11:10:00.000Z', executed: 1 });
  otherJob.body.id = 'wf_other'; otherJob.body.modelPin.workflowId = 'wf_other';
  otherJob.body.enablement = { enabledAt: '2026-10-05T11:05:00Z', qualificationReceiptSha256: hex('a'), firstDeploymentReceiptSha256: hex('b') };
  await assert.rejects(check(chain({ upto: 'native-update', edit: { 'native-update': (p) => ({ ...p, registration: otherJob.envelope() }) } }), 'native-update'), /different job/);
  const unbound = registration({ enabled: true, observedAt: '2026-10-05T11:10:00.000Z', executed: 1 });
  unbound.body.enablement = { enabledAt: '2026-10-05T11:05:00Z', qualificationReceiptSha256: hex('a'), firstDeploymentReceiptSha256: hex('b') };
  await assert.rejects(check(chain({ upto: 'native-update', edit: { 'native-update': (p) => ({ ...p, registration: unbound.envelope() }) } }), 'native-update'), /does not cite the qualification/);
  await assert.rejects(check(chain({ upto: 'native-update', edit: { 'native-update': (p) => ({ ...p, execution: { ...p.execution, triggerId: 'trg_other' } }) } }), 'native-update'), /different trigger/);
  await assert.rejects(check(chain({ upto: 'native-update', edit: { 'native-update': (p) => { const { negative, ...rest } = p; return rest; } } }), 'native-update'), /negative case missing/);
  await assert.rejects(check(chain({ upto: 'native-update', edit: { 'native-update': (p) => ({ ...p, negative: { ...p.negative, lastGoodDeploymentId: 'dep_0' } }) } }), 'native-update'), /last-good/);
});

test('publication needs a successful CI run on the exact commit and the canonical deployment', async () => {
  const ci = (over) => sign({ kind: 'ci-run', repo: 'JAD-Apps/axionbench', headSha: expected().publicCommit, conclusion: 'success', event: 'push', runId: 1, ...over }, 'github');
  await assert.rejects(check(chain({ upto: 'publication', edit: { publication: (p) => ({ ...p, ci: ci({ conclusion: 'failure' }) }) } }), 'publication'), /did not succeed/);
  await assert.rejects(check(chain({ upto: 'publication', edit: { publication: (p) => ({ ...p, ci: ci({ headSha: 'd'.repeat(40) }) }) } }), 'publication'), /different commit/);
  await assert.rejects(check(chain({ upto: 'publication', edit: { publication: (p) => ({ ...p, ci: sign({ kind: 'ci-run', repo: 'JAD-Apps/axionbench', headSha: expected().publicCommit, conclusion: 'success', event: 'push' }, 'cloudflare') }) } }), 'publication'), /cannot attest/);
  await assert.rejects(check(chain({ upto: 'publication', edit: { publication: (p) => ({ ...p, deployment: { ...p.deployment, canonical: false } }) } }), 'publication'), /canonical/);
  await assert.rejects(check(chain({ upto: 'publication', edit: { publication: (p) => ({ ...p, deployment: { ...p.deployment, hostname: 'axionbench.pages.dev' } }) } }), 'publication'));
});

test('daily data overlays must be bound; deployed acceptance reads the retained canonical snapshot', async () => {
  const newData = hex('daily-data'); const overlay = { baseDataSha256: hex('data'), overlaySha256: hex('overlay') };
  const mv = (p) => ({ ...p, identities: { ...p.identities, manifests: { ...p.identities.manifests, data: newData } } });
  const remote = (p) => ({ ...p, remote: { ...p.remote, dataSha256: newData }, dailyOverlay: overlay });
  const withOverlay = { 'native-update': (p) => remote(mv(p)), 'deployed-acceptance': (p) => ({ ...mv(p), dailyOverlay: overlay, hosted: { ...p.hosted, dataSha256: newData, dataOverlaySha256: overlay.overlaySha256 } }) };
  await check(chain({ upto: 'deployed-acceptance', edit: withOverlay }), 'deployed-acceptance');
  const unbound = { ...withOverlay, 'native-update': (p) => ({ ...mv(p), remote: { ...p.remote, dataSha256: newData } }) };
  await assert.rejects(check(chain({ upto: 'deployed-acceptance', edit: unbound }), 'deployed-acceptance'), /without a bound daily overlay/);
  const noReadbackOverlay = { ...withOverlay, 'deployed-acceptance': (p) => ({ ...mv(p), dailyOverlay: overlay, hosted: { ...p.hosted, dataSha256: newData } }) };
  await assert.rejects(check(chain({ upto: 'deployed-acceptance', edit: noReadbackOverlay }), 'deployed-acceptance'), /overlay missing from the readback/);
  await assert.rejects(check(chain({ upto: 'deployed-acceptance', edit: { 'deployed-acceptance': (p) => ({ ...p, hosted: { ...p.hosted, viaRetainedSnapshot: false } }) } }), 'deployed-acceptance'), /retained production snapshot/);
  await assert.rejects(check(chain({ upto: 'deployed-acceptance', edit: { 'deployed-acceptance': (p) => ({ ...p, hosted: { ...p.hosted, deploymentId: 'dep_listing_newest' } }) } }), 'deployed-acceptance'), /not the latest/);
  await assert.rejects(check(chain({ upto: 'deployed-acceptance', edit: { 'deployed-acceptance': (p) => ({ ...p, checks: { ...p.checks, assets: 'failed' } }) } }), 'deployed-acceptance'), /assets check/);
});

test('owner browser, hero video and handoff evidence', async () => {
  await assert.rejects(check(chain({ upto: 'owner-browser', edit: { 'owner-browser': (p) => ({ ...p, browser: { ...p.browser, platform: 'linux' } }) } }), 'owner-browser'), /Windows/);
  await assert.rejects(check(chain({ upto: 'owner-browser', edit: { 'owner-browser': (p) => ({ ...p, browser: { ...p.browser, url: 'https://example.com/' } }) } }), 'owner-browser'));
  await assert.rejects(check(chain({ upto: 'owner-browser', edit: { 'owner-browser': (p) => ({ ...p, browser: { ...p.browser, title: '' } }) } }), 'owner-browser'), /title/);
  await assert.rejects(check(chain({ upto: 'hero-mp4', edit: { 'hero-mp4': (p) => ({ ...p, video: { ...p.video, codec: 'vp9' } }) } }), 'hero-mp4'));
  await assert.rejects(check(chain({ upto: 'hero-mp4', edit: { 'hero-mp4': (p) => ({ ...p, video: { ...p.video, distinctFrames: 1 } }) } }), 'hero-mp4'), /frames do not change/);
  await assert.rejects(check(chain({ upto: 'hero-mp4', edit: { 'hero-mp4': (p) => ({ ...p, video: (({ encoder, ...rest }) => rest)(p.video) }) } }), 'hero-mp4'), /canonical|encoder/);
  await assert.rejects(check(chain({ upto: 'hero-mp4', edit: { 'hero-mp4': (p) => ({ ...p, attachment: sign({ kind: 'attachment', runId: 'run_fixture', sha256: hex('other'), attachmentId: 'a' }, 'jadbot') }) } }), 'hero-mp4'), /not the verified video/);
  await assert.rejects(check(chain({ upto: 'hero-mp4', edit: { 'hero-mp4': (p) => ({ ...p, attachment: sign({ kind: 'attachment', runId: 'run_fixture', sha256: p.video.sha256, attachmentId: 'a' }, 'capture') }) } }), 'hero-mp4'), /cannot attest/);
  // Release handoff: needs the whole chain, but never an evaluator verdict.
  await assert.rejects(check(chain({ edit: { 'release-handoff': (p) => ({ ...p, submission: { ...p.submission, ready: false } }) } })), /not ready/);
  await assert.rejects(check(chain({ edit: { 'release-handoff': (p) => ({ ...p, submission: { ...p.submission, receiptDigests: [hex('x')] } }) } })), /complete verified chain/);
  await assert.rejects(check(chain({ edit: { 'release-handoff': (p) => ({ ...p, evaluatorVerdict: 'passed' }) } })), /evaluator verdict/);
  assert.equal((await check(chain())).receipts, 8, 'readiness holds without any evaluator verdict');
});

test('credential-shaped text in a receipt is refused', async () => {
  const leaky = chain({ upto: 'candidate-review', edit: { 'candidate-review': (p) => ({ ...p, note: `token cfut_${'S'.repeat(40)}` }) } });
  await assert.rejects(check(leaky, 'candidate-review'), /credential-shaped/);
});

test('CLI: strict options and modes; fixture anchors never authenticate; verification writes nothing', async () => {
  const run = (script, args) => spawnSync('node', [script, ...args], { encoding: 'utf8' });
  const v = 'scripts/project/verify-receipts.mjs';
  for (const [args, pattern] of [
    [['--mode', 'bogus', '--bundle', 'a', '--trust', 'b', '--expect', 'c'], /unsupported mode/],
    [['--mode', 'publication', '--bundle', 'a'], /requires --trust/],
    [['--bundle', 'a'], /requires --mode/],
    [['--mode', 'publication', '--bundle', 'a', '--trust', 'b', '--expect', 'c', '--capture', 'd'], /only to --mode hero-mp4/],
    [['--mode', 'publication', '--bundle', 'a', '--trust', 'b', '--expect', 'c', '--public-source', 'd'], /only to --mode candidate-qualification/],
    [['--mode', 'publication', '--mode', 'publication'], /duplicate option/],
    [['--rebuild', 'x'], /unsupported option/],
    [['--state-dir'], /needs a value/],
    [[], /usage|--state-dir/],
  ]) { const out = run(v, args); assert.equal(out.status, 1, args.join(' ')); assert.match(out.stderr, pattern); }
  assert.doesNotThrow(() => parseArgs(['--artifact', 'x:y', '--artifact', 'u:v', '--state-dir', 'z']), 'the original --state-dir and --artifact interfaces remain accepted');
});

test('verifyMode reads files; qualify-public is verify-only; hero-mp4 requires the genuine capture file', async () => {
  const dir = await scratch();
  const put = async (name, value) => { await writeFile(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value)); return join(dir, name); };
  const trust = await put('trust.json', trustFile());
  const expect = await put('expect.json', expected());
  const base = ['--trust', trust, '--expect', expect, '--now', NOW];
  const bundle = await put('bundle.json', chain({ upto: 'publication' }));
  const parsed = parseArgs(['--mode', 'publication', '--bundle', bundle, ...base]);
  assert.equal((await verifyMode(parsed, { allowFixtureAnchors: true })).mode, 'publication');
  await assert.rejects(verifyMode(parsed), /test fixture/, 'the CLI path refuses fixture anchors');
  await assert.rejects(verifyMode(parseArgs(['--mode', 'publication', '--bundle', bundle, ...base, '--max-age-hours', '0'])), /max-age-hours/);
  // qualify-public: never collects, registers or builds.
  const q = (args) => spawnSync('node', ['scripts/project/qualify-public.mjs', ...args], { encoding: 'utf8' });
  assert.match(q(['--bundle', bundle, ...base]).stderr, /only --verify-only is supported/);
  assert.match(q(['--verify-only', '--register', 'x']).stderr, /unsupported option/);
  assert.match(q(['--verify-only', '--bundle', bundle, ...base]).stderr, /test fixture/);

  // hero-mp4: the capture's video must be the receipt's video and pass the tool checks.
  const heroBundle = await put('hero.json', chain({ upto: 'hero-mp4' }));
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(12)]);
  const png = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png); png.writeUInt32BE(1440, 16); png.writeUInt32BE(900, 20);
  await mkdir(join(dir, 'cap'), { recursive: true });
  await writeFile(join(dir, 'cap', 'hero.mp4'), mp4); await writeFile(join(dir, 'cap', 'home.png'), png);
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const record = { schemaVersion: 'axionbench-capture-v1', url: 'https://axionbench.jadapps.app/', capturedAt: NOW, productSha256: hex('product'), dataSha256: hex('data'),
    files: [{ path: 'home.png', kind: 'screenshot', sha256: sha(png), bytes: png.length, viewport: { width: 1440, height: 900 } },
      { path: 'hero.mp4', kind: 'video', sha256: sha(mp4), bytes: mp4.length, viewport: { width: 1280, height: 720 }, durationSeconds: 8, encoder: { identity: 'libx264' }, probe: { tool: 'ffprobe', version: FIXTURE_PROBE_VERSION } }] };
  const cap = await put('cap/capture.json', record);
  const heroArgs = ['--mode', 'hero-mp4', '--bundle', heroBundle, ...base];
  await assert.rejects(verifyMode(parseArgs(heroArgs), { allowFixtureAnchors: true }), /actual deployed capture/);
  // The receipt's video hash is a placeholder, so a real file whose hash differs is refused.
  await assert.rejects(verifyMode(parseArgs([...heroArgs, '--capture', cap]), { allowFixtureAnchors: true, videoTools: { exec: fixtureExec() } }), /differs from the receipt video/);
  const matching = await put('hero-ok.json', chain({ upto: 'hero-mp4', edit: { 'hero-mp4': (p) => ({ ...p, video: { ...p.video, sha256: sha(mp4) }, attachment: sign({ kind: 'attachment', runId: 'run_fixture', sha256: sha(mp4), attachmentId: 'att_1' }, 'jadbot') }) } }));
  const ok = await verifyMode(parseArgs(['--mode', 'hero-mp4', '--bundle', matching, ...base, '--capture', cap]), { allowFixtureAnchors: true, videoTools: { exec: fixtureExec() } });
  assert.equal(ok.mode, 'hero-mp4');
  await assert.rejects(verifyMode(parseArgs(['--mode', 'hero-mp4', '--bundle', matching, ...base, '--capture', cap]), { allowFixtureAnchors: true, videoTools: { exec: fixtureExec({ frames: 2 }) } }), /too few frames/);
  assert.equal((await readFile(cap, 'utf8')).includes('cfut_'), false);
});
