// Read-only helpers. Hash verification proves captured bytes, not the authority
// of their author. Callers supply trusted expected identity and command lists.
import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../public/boundary.mjs';
import { scanDist } from '../release/manifest.mjs';
const HEX = /^[a-f0-9]{64}$/;

export async function verifyArtifact(root, descriptor, { maxBytes = 64 * 1024 * 1024 } = {}) {
  assert(descriptor && typeof descriptor.path === 'string', 'artifact descriptor required');
  const parts = descriptor.path.split('/');
  assert(parts.every(part => /^[A-Za-z0-9._@+~-]+$/.test(part) && part !== '.' && part !== '..'), 'unsafe artifact path');
  assert.match(descriptor.sha256, HEX, 'artifact SHA-256 required');
  assert(Number.isSafeInteger(descriptor.bytes) && descriptor.bytes >= 0 && descriptor.bytes <= maxBytes, 'bounded artifact byte count required');
  let path = root;
  for (const part of parts) { path = join(path, part); assert(!(await lstat(path)).isSymbolicLink(), 'artifact symlink refused'); }
  const stat = await lstat(path); assert(stat.isFile(), 'artifact must be regular');
  assert.equal(stat.size, descriptor.bytes, 'artifact byte count mismatch');
  const bytes = await readFile(path);
  assert.equal(sha256(bytes), descriptor.sha256, 'artifact hash mismatch');
  return bytes;
}

export async function readReceiptArtifact(root, descriptor, options) {
  return JSON.parse(await verifyArtifact(root, descriptor, options));
}

export function verifyEvidenceBinding(receipt, expected) {
  assert(expected && Object.keys(expected).length, 'trusted expected evidence binding required');
  for (const [key, value] of Object.entries(expected)) {
    assert(value !== undefined && value !== null, `expected ${key} required`);
    assert.deepEqual(receipt?.[key], value, `evidence binding mismatch: ${key}`);
  }
  return receipt;
}

export async function verifyCommandEvidence(root, receipt, { sourceSha256, commands }) {
  assert.match(sourceSha256, HEX, 'expected current source hash required');
  verifyEvidenceBinding(receipt, { passed: true, publicSourceSha256: sourceSha256 });
  assert(Array.isArray(commands) && commands.length, 'required commands missing');
  assert.deepEqual(receipt.results?.map(row => row.command), commands, 'required command evidence missing or reordered');
  for (const row of receipt.results) {
    assert.equal(row.exitCode, 0, `command failed: ${row.command}`);
    assert(Number.isFinite(row.milliseconds) && row.milliseconds >= 0, 'command duration missing');
    await verifyArtifact(root, { path: row.log, bytes: row.logBytes, sha256: row.logSha256 });
  }
  return receipt;
}

export async function verifyCapturedEvidence(root, receipt) {
  assert(typeof receipt.evidenceRoot === 'string', 'captured evidence root required');
  // Reuse the artifact path validator, including each directory ancestor.
  assert(Array.isArray(receipt.capturedEvidence) && receipt.capturedEvidence.length > 0, 'captured browser evidence required');
  const seen = new Set();
  for (const row of receipt.capturedEvidence) {
    assert(!seen.has(row.path), 'duplicate captured evidence'); seen.add(row.path);
    await verifyArtifact(root, { ...row, path: `${receipt.evidenceRoot}/${row.path}` });
  }
  const capturedRoot = join(root, receipt.evidenceRoot);
  const scanned = await scanDist(capturedRoot);
  assert.deepEqual(scanned.controlFiles, [], 'captured evidence cannot hide control files');
  await assert.rejects(lstat(join(capturedRoot, 'release-manifest.json')), error => error.code === 'ENOENT', 'captured evidence cannot hide a release manifest');
  assert.deepEqual(scanned.files, receipt.capturedEvidence, 'captured evidence list must describe every actual byte');
  for (const name of ['routes','core-views','cost-version-views','cohort-views','acceptance','cost-weights']) {
    assert(seen.has(`${name}/report.json`), `captured ${name} report missing`);
  }
  return receipt.capturedEvidence;
}
