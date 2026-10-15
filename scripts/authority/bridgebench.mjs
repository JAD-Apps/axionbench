// Offline verifier for a reviewed BridgeBench extraction. It deliberately does
// not guess an endpoint, model slug, rating scale or proprietary calculation.
// Coordinate spans refer to original UTF-8 text, not rewritten page text.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveRaw, replaceProjection, sha256 } from './common.mjs';
import { validateNativeRatings } from '../../src/data/current-policy.mjs';

const URLS = { leaderboard: 'https://www.bridgebench.ai/leaderboard', guide: 'https://www.bridgebench.ai/blog/how-the-leaderboard-works' };
const slice = (capture, span, label) => {
  assert(Array.isArray(span) && span.length === 2 && span.every(Number.isSafeInteger) && span[0] >= 0 && span[1] > span[0], `${label}: exact source coordinate span required`);
  const text = capture.bytes.toString('utf8');
  assert(span[1] <= text.length, `${label}: source coordinates outside capture`);
  return text.slice(...span);
};
const numberCell = (capture, span, value, label) => {
  if (value === null) { assert.equal(span, null, `${label}: missing value cannot claim a numeric source cell`); return; }
  const cell = slice(capture, span, label).trim();
  assert.match(cell, /^-?\d+(?:\.\d+)?$/, `${label}: literal native numeric source cell required`);
  assert.equal(Number(cell), value, `${label}: value differs from original source cell`);
};

export function verifyBridgeCaptures(projection, captures, identities, now = Date.now()) {
  validateNativeRatings(projection, identities, now);
  assert.equal(projection.snapshotVersion, `sha256:${projection.source.sha256}`, 'BridgeBench snapshot identity must bind actual source bytes; no invented publisher version');
  assert.equal(sha256(Buffer.from(JSON.stringify(projection.rows))), projection.rowsSha256, 'BridgeBench factual projection hash mismatch');
  for (const [key, url] of Object.entries(URLS)) {
    const capture = captures[key];
    assert.equal(capture?.url, url, `BridgeBench ${key}: exact original source URL required`);
    assert.equal(capture.httpStatus, 200, `BridgeBench ${key}: successful retrieval required`);
    assert(capture.bytes instanceof Buffer && capture.bytes.length > 0 && capture.bytes.length <= 25_000_000, 'BridgeBench bounded original bytes required');
    assert.equal(sha256(capture.bytes), key === 'guide' ? projection.source.guideSha256 : projection.source.sha256, `BridgeBench ${key}: original-source hash mismatch`);
    assert.equal(capture.retrievedAt, key === 'guide' ? projection.source.guideRetrievedAt : projection.source.retrievedAt, `BridgeBench ${key}: original retrieval date changed`);
  }
  assert.match(slice(captures.guide, projection.source.unitEvidenceSpan, 'BridgeBench guide units'), /rat(?:ing|ings)/i, 'BridgeBench native rating terminology requires publisher guide evidence');
  for (const row of projection.rows) {
    const result = captures.results?.[row.id];
    assert.equal(result?.url, row.resultUrl, `${row.id}: exact original model result capture missing`);
    assert.equal(result.httpStatus, 200, `${row.id}: successful per-model result retrieval required`);
    assert(result.bytes instanceof Buffer && result.bytes.length > 0 && result.bytes.length <= 25_000_000, `${row.id}: bounded original model result bytes required`);
    assert.equal(sha256(result.bytes), row.originalResultSha256, `${row.id}: original model result hash mismatch`);
    assert.equal(result.retrievedAt, row.retrievedAt, `${row.id}: original model retrieval date changed`);
    const literalLink = slice(captures.leaderboard, row.sourceCoordinates.resultLink, `${row.id} model link`);
    assert.equal(new URL(literalLink, URLS.leaderboard).href, row.resultUrl, `${row.id}: fabricated model result URL`);
    assert.equal(slice(result, row.sourceCoordinates.modelLabel, `${row.id} label`), row.modelLabel, `${row.id}: exact model result label mismatch`);
    if (row.configurationVersion !== null) assert.equal(slice(result, row.sourceCoordinates.configurationVersion, `${row.id} configuration version`), row.configurationVersion, `${row.id}: invented configuration version`);
    numberCell(result, row.sourceCoordinates.overall, row.overall, `${row.id} overall`);
    for (const [axis, cell] of Object.entries(row.axes)) numberCell(result, row.sourceCoordinates.axes[axis], cell.value, `${row.id} ${axis}`);
    numberCell(result, row.sourceCoordinates.confidence, row.confidence, `${row.id} confidence`);
  }
  return projection;
}

// Actual captures must be provided explicitly after authorized source retrieval.
// Raw paths belong only in the ignored private receipt, never the projection.
export async function readBridgeCaptures(receiptPath) {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const load = async (record) => ({ ...record, bytes: await readFile(record.path) });
  return { leaderboard: await load(receipt.leaderboard), guide: await load(receipt.guide),
    results: Object.fromEntries(await Promise.all(Object.entries(receipt.results).map(async ([id, record]) => [id, await load(record)]))) };
}

export async function replaceReviewedBridge({ projection, captures, identities, auditDir, output }) {
  verifyBridgeCaptures(projection, captures, identities);
  const auditRelative = relative(fileURLToPath(new URL('../../', import.meta.url)), resolve(auditDir));
  assert(auditRelative.startsWith('..'), 'BridgeBench raw captures require an audit directory outside the repository');
  for (const capture of [captures.leaderboard, captures.guide, ...Object.values(captures.results)]) await archiveRaw(auditDir, capture.bytes, 'html');
  return replaceProjection(output, projection);
}
