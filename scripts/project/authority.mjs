// Offline authentication of evidence. A receipt is a signed envelope:
//   { payload, authority, keyId, signature }   (Ed25519 over the canonical payload JSON)
// The signer's public key must appear in a trust file the verifier is given
// (kept outside the repository, issued with the daemon/provider collectors).
// Content hashes alone prove bytes; only a valid signature from a trusted,
// non-fixture anchor of the right authority proves who observed them.
import assert from 'node:assert/strict';
import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';

export const TRUST_SCHEMA = 'axionbench-trust-v1';
export const AUTHORITIES = Object.freeze(['daemon', 'reviewer', 'github', 'cloudflare', 'jadbot', 'windows', 'capture']);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  assert.notEqual(typeof value, 'undefined', 'undefined is not canonical JSON');
  return JSON.stringify(value);
}
export const payloadDigest = (payload) => createHash('sha256').update(canonical(payload)).digest('hex');

export async function loadTrust(path, { allowFixture = false, maxBytes = 1024 * 1024 } = {}) {
  assert.ok(path, 'a trust file (--trust) is required: authority cannot be established from the evidence itself');
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= maxBytes, 'trust file must be a bounded regular file');
  return parseTrust(JSON.parse(await readFile(path, 'utf8')), { allowFixture });
}

export function parseTrust(trust, { allowFixture = false } = {}) {
  assert.equal(trust?.schemaVersion, TRUST_SCHEMA, 'unknown trust file schema');
  assert.ok(Array.isArray(trust.anchors) && trust.anchors.length > 0 && trust.anchors.length <= 64, 'trust anchors required');
  const anchors = new Map();
  for (const anchor of trust.anchors) {
    assert.ok(AUTHORITIES.includes(anchor.authority), `unknown authority ${anchor.authority}`);
    assert.match(String(anchor.keyId), /^[A-Za-z0-9._-]{3,80}$/, 'anchor keyId');
    assert.ok(!anchors.has(anchor.keyId), `duplicate anchor ${anchor.keyId}`);
    assert.ok(allowFixture || anchor.fixture !== true, `anchor ${anchor.keyId} is marked as a test fixture and cannot establish authority`);
    const key = createPublicKey(anchor.publicKeyPem);
    assert.equal(key.asymmetricKeyType, 'ed25519', 'anchors must be Ed25519 keys');
    anchors.set(anchor.keyId, { authority: anchor.authority, key });
  }
  return anchors;
}

/** Returns the payload of an envelope after proving a trusted anchor of one of `authorities` signed it. */
export function verifyEnvelope(envelope, anchors, authorities) {
  assert.ok(envelope && typeof envelope === 'object' && envelope.payload && typeof envelope.signature === 'string', 'signed envelope required');
  const anchor = anchors.get(envelope.keyId);
  assert.ok(anchor, `evidence signed by unknown key ${envelope.keyId}`);
  assert.equal(anchor.authority, envelope.authority, 'envelope authority differs from the trusted key authority');
  assert.ok(authorities.includes(envelope.authority), `authority ${envelope.authority} cannot attest this evidence (needs ${authorities.join(' or ')})`);
  const ok = verify(null, Buffer.from(canonical(envelope.payload)), anchor.key, Buffer.from(envelope.signature, 'base64'));
  assert.ok(ok, 'evidence signature is invalid');
  return envelope.payload;
}

/** Collector-side helper (and test fixtures): signs a payload. Never used by the verifiers. */
export function signEnvelope(payload, { keyId, authority, privateKey }) {
  return { payload, authority, keyId, signature: sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64') };
}
