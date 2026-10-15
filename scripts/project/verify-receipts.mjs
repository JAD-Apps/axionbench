// node scripts/project/verify-receipts.mjs [--state-dir <publication state>] [--artifact <file>:<sha256>:<bytes>]...
// node scripts/project/verify-receipts.mjs --mode <candidate-qualification|candidate-review|publication|native-update|
//     deployed-acceptance|owner-browser|hero-mp4|release-handoff> --bundle <file> --trust <file> --expect <file>
//     [--now <ISO>] [--max-age-hours <n>] [--capture <record>] [--public-source <dir>]
// Named modes verify signed stage receipts (see qualification.mjs); they collect nothing.
// Unsupported options or modes, and options that do not belong to the chosen mode, are rejected.
// Read-only verification of publication receipts and evidence artifacts.
// Publication state: every receipt is content-addressed, schema-valid and
// credential-free; last-success.json is consistent; the current and previous
// snapshots are retained and byte-exact; the current deployment has a
// published transaction and a matching published receipt. Artifacts: exact
// regular file, size and SHA-256 (for dependency/evidence descriptors).
// Hash checks prove captured bytes, not who produced them.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat } from 'node:fs/promises';
import { findSecrets } from '../automation/secrets.mjs';
import { sha256 } from '../release/manifest.mjs';
import { RECEIPT_SCHEMA, TRANSACTION_SCHEMA, readLastSuccess, readTransaction, verifySnapshot } from '../release/publication.mjs';
import { verifyCapture } from '../release/verify-capture.mjs';
import { validateSource } from '../public/boundary.mjs';
import { loadTrust } from './authority.mjs';
import { verifyArtifact } from './receipts.mjs';
import { MODES, MODE_OPTIONS, verifyChain } from './qualification.mjs';

export const RECEIPT_STATUSES = new Set(['published', 'already-published', 'rejected-key-conflict', 'rejected-retry-limit', 'failed-before-start', 'failed-qualification',
  'failed-before-deploy', 'failed-restored', 'failed-no-last-good', 'failed-restore-unverified', 'rolled-back', 'rollback-unverified']);

export async function verifyPublicationReceipts(stateDir) {
  const receipts = [];
  for (const name of (await readdir(join(stateDir, 'receipts'))).sort()) {
    const match = /^\d{4}-\d{2}-\d{2}T[\d-]+Z-([a-f0-9]{12})\.json$/.exec(name);
    assert.ok(match, `unexpected receipt file name ${name}`);
    const bytes = await readFile(join(stateDir, 'receipts', name));
    assert.equal(sha256(bytes).slice(0, 12), match[1], `receipt ${name} does not match its content address`);
    const text = bytes.toString('utf8');
    assert.deepEqual(findSecrets(text), [], `receipt ${name} contains credential-shaped text`);
    const receipt = JSON.parse(text);
    assert.equal(receipt.schemaVersion, RECEIPT_SCHEMA, `receipt ${name} schema`);
    assert.ok(RECEIPT_STATUSES.has(receipt.status), `receipt ${name} has unknown status ${receipt.status}`);
    assert.ok(Number.isFinite(Date.parse(receipt.at)), `receipt ${name} time`);
    receipts.push(receipt);
  }
  const ledger = await readLastSuccess(stateDir);
  const summary = { receipts: receipts.length, statuses: Object.fromEntries([...new Set(receipts.map((r) => r.status))].map((s) => [s, receipts.filter((r) => r.status === s).length])), current: null };
  if (!ledger) return summary;
  const ledgerText = await readFile(join(stateDir, 'last-success.json'), 'utf8');
  assert.deepEqual(findSecrets(ledgerText), [], 'last-success.json contains credential-shaped text');
  await verifySnapshot(stateDir, ledger.current.snapshotSha256);
  if (ledger.previous) await verifySnapshot(stateDir, ledger.previous.snapshotSha256);
  const tx = await readTransaction(stateDir, ledger.current.key);
  assert.ok(tx, `no transaction journal for the current key ${ledger.current.key}`);
  assert.equal(tx.schemaVersion, TRANSACTION_SCHEMA);
  assert.equal(tx.state, 'published', `current key ${ledger.current.key} journal is ${tx.state}`);
  assert.equal(tx.deploymentId, ledger.current.deploymentId, 'journal deployment differs from last-success');
  assert.equal(tx.revisionSha256, ledger.current.revisionSha256, 'journal revision differs from last-success');
  assert.ok(receipts.some((r) => r.status === 'published' && r.key === ledger.current.key && r.deploymentId === ledger.current.deploymentId),
    'no published receipt for the current deployment');
  return { ...summary, current: { key: ledger.current.key, deploymentId: ledger.current.deploymentId, snapshotSha256: ledger.current.snapshotSha256 }, previous: ledger.previous?.key ?? null };
}

export async function verifyArtifactSpec(spec) {
  const match = /^(.+):([a-f0-9]{64}):(\d+)$/.exec(spec);
  assert.ok(match, `artifact must be <file>:<sha256>:<bytes>, got ${spec}`);
  const [, file, digest, bytes] = match;
  await verifyArtifact(dirname(resolve(file)), { path: basename(file), sha256: digest, bytes: Number(bytes) });
  return { file: resolve(file), sha256: digest, bytes: Number(bytes) };
}

const VALUE_OPTIONS = new Set(MODE_OPTIONS);
const MODE_ONLY = ['--bundle', '--trust', '--expect', '--now', '--max-age-hours', '--capture', '--public-source'];

export function parseArgs(args) {
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    assert.ok(VALUE_OPTIONS.has(flag), `unsupported option ${flag}`);
    assert.ok(args[i + 1] !== undefined && !String(args[i + 1]).startsWith('--'), `${flag} needs a value`);
    assert.ok(flag === '--artifact' || !options.has(flag), `duplicate option ${flag}`);
    options.set(flag, [...(options.get(flag) ?? []), args[i + 1]]);
  }
  const one = (name) => options.get(name)?.[0];
  const mode = one('--mode');
  if (mode === undefined) {
    for (const name of MODE_ONLY) assert.ok(!options.has(name), `${name} requires --mode`);
    assert.ok(options.has('--state-dir') || options.has('--artifact'), 'usage: verify-receipts.mjs [--state-dir <dir>] [--artifact <file>:<sha256>:<bytes>]... | --mode <mode> --bundle <file> --trust <file> --expect <file>');
  } else {
    assert.ok(MODES.includes(mode), `unsupported mode ${JSON.stringify(mode)} (supported: ${MODES.join(', ')})`);
    for (const name of ['--bundle', '--trust', '--expect']) assert.ok(options.has(name), `--mode ${mode} requires ${name}`);
    assert.ok(!options.has('--capture') || mode === 'hero-mp4', '--capture applies only to --mode hero-mp4');
    assert.ok(!options.has('--public-source') || mode === 'candidate-qualification', '--public-source applies only to --mode candidate-qualification');
  }
  return { options, one, many: (name) => options.get(name) ?? [], mode };
}

async function readBoundedJson(path, label, maxBytes = 8 * 1024 * 1024) {
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= maxBytes, `${label} must be a bounded regular file`);
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function verifyMode(parsed, { videoTools = {}, allowFixtureAnchors = false } = {}) {
  const { one, mode } = parsed;
  const bundle = await readBoundedJson(one('--bundle'), 'bundle');
  const expected = await readBoundedJson(one('--expect'), 'expected identities');
  const maxAgeHours = one('--max-age-hours') === undefined ? 24 : Number(one('--max-age-hours'));
  assert.ok(Number.isFinite(maxAgeHours) && maxAgeHours > 0 && maxAgeHours <= 24 * 30, '--max-age-hours must be 1..720 hours');
  const now = one('--now') === undefined ? new Date() : new Date(one('--now'));
  assert.ok(Number.isFinite(now.getTime()), '--now must be an ISO time');
  const anchors = await loadTrust(one('--trust'), { allowFixture: allowFixtureAnchors });
  const capture = mode !== 'hero-mp4' ? null : async (payload) => {
    assert.ok(parsed.one('--capture'), 'hero-mp4 requires the actual deployed capture and video file (--capture)');
    const record = await readBoundedJson(parsed.one('--capture'), 'capture record');
    const result = await verifyCapture(record, { root: dirname(resolve(parsed.one('--capture'))), hostname: 'axionbench.jadapps.app', videoTools });
    assert.equal(result.videos.length, 1, 'the capture must contain exactly one hero video');
    const [video] = result.videos;
    assert.equal(video.sha256, payload.video.sha256, 'capture video differs from the receipt video');
    assert.equal(record.productSha256, payload.identities.manifests.product, 'capture is of a different product release');
    assert.equal(record.dataSha256, payload.identities.manifests.data, 'capture is of different data');
    for (const k of ['codec', 'width', 'height', 'distinctFrames']) assert.equal(video[k], payload.video[k], `receipt video ${k} differs from the file`);
  };
  const report = await verifyChain(bundle, { mode, anchors, expected, now, maxAgeHours, capture });
  if (one('--public-source')) {
    const manifest = await validateSource(resolve(one('--public-source')));
    assert.equal(manifest.sourceSha256, expected.publicSourceSealSha256, 'the public source directory is not the sealed public candidate');
  }
  return report;
}

export async function main(args) {
  const parsed = parseArgs(args);
  const stateDir = parsed.one('--state-dir');
  const report = { publication: stateDir ? await verifyPublicationReceipts(resolve(stateDir)) : null, artifacts: [], stage: null };
  for (const spec of parsed.many('--artifact')) report.artifacts.push(await verifyArtifactSpec(spec));
  if (parsed.mode) report.stage = await verifyMode(parsed);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2)); } catch (error) { console.error(`FAIL ${error.message}`); process.exitCode = 1; }
}
