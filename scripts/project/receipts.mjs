// Read-only helpers. Hash verification proves captured bytes, not the authority
// of their author. Callers supply trusted expected identity and command lists.
import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../public/boundary.mjs';
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

export async function verifyCommandEvidence(root, receipt, { sourceSha256, commands, bindingKey = 'publicSourceSha256' }) {
  assert.match(sourceSha256, HEX, 'expected current source hash required');
  assert(['publicSourceSha256', 'privateSourceSha256'].includes(bindingKey), 'unknown command source binding');
  verifyEvidenceBinding(receipt, { passed: true, [bindingKey]: sourceSha256 });
  assert(Array.isArray(commands) && commands.length, 'required commands missing');
  assert.deepEqual(receipt.results?.map(row => row.command), commands, 'required command evidence missing or reordered');
  for (const row of receipt.results) {
    assert.equal(row.exitCode, 0, `command failed: ${row.command}`);
    assert(Number.isFinite(row.milliseconds) && row.milliseconds >= 0, 'command duration missing');
    await verifyArtifact(root, { path: row.log, bytes: row.logBytes, sha256: row.logSha256 });
  }
  return receipt;
}
