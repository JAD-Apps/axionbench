// node scripts/project/verify-receipts.mjs [--state-dir <publication state>] [--artifact <file>:<sha256>:<bytes>]...
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
import { findSecrets } from '../automation/secrets.mjs';
import { sha256 } from '../release/manifest.mjs';
import { RECEIPT_SCHEMA, TRANSACTION_SCHEMA, readLastSuccess, readTransaction, verifySnapshot } from '../release/publication.mjs';
import { verifyArtifact } from './receipts.mjs';

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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const values = (name) => args.flatMap((arg, i) => (arg === name ? [args[i + 1]] : []));
  const [stateDir] = values('--state-dir');
  const artifacts = values('--artifact');
  assert.ok(stateDir || artifacts.length, 'usage: verify-receipts.mjs [--state-dir <dir>] [--artifact <file>:<sha256>:<bytes>]...');
  const report = { publication: stateDir ? await verifyPublicationReceipts(resolve(stateDir)) : null, artifacts: [] };
  for (const spec of artifacts) report.artifacts.push(await verifyArtifactSpec(spec));
  console.log(JSON.stringify(report, null, 2));
}
