import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeCurrentPolicy, hash, qualifyIdentities } from '../current-policy.mjs';
import { composeAuthority, assertAuthorityFloor, readInputs } from '../authority/compose.mjs';
import { replaceProjection } from '../authority/common.mjs';
import { currentAdmission, DAY, exactReleaseMatch, nullableNumber, validateNativeRatings } from '../../src/data/current-policy.mjs';
import { readBridgeCaptures, verifyBridgeCaptures } from '../authority/bridgebench.mjs';

assert(process.argv.slice(2).every((arg) => arg === '--local'), 'only --local is supported; the saved release gate takes no arguments');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const registry = await read('data/benchmark-registry.json');
const input = await read('data/ingestion.json');
const identities = await read('data/model-identities.json');
const bridge = await read('data/authority/bridgebench.json');
const specs = await read('data/model-policy.json');
assert.deepEqual(await qualifyIdentities(input, specs, { verificationAt: identities.verificationAt }), identities, 'real identities replay exact cached primary hashes/claims');
{
  const wrongVariant = structuredClone(specs);
  const pro = wrongVariant.models.find((model) => model.key === 'gpt-6-1-sol-pro');
  pro.sourceId = 'official-release-openai-1'; pro.claim = 'GPT-6.1 Sol';
  await assert.rejects(qualifyIdentities(input, wrongVariant, { verificationAt: identities.verificationAt }), /another variant\/version/);
  const wrongTier = structuredClone(specs);
  const luna = wrongTier.models.find((model) => model.key === 'gpt-6-luna');
  luna.sourceId = 'openrouter-model-catalog';
  await assert.rejects(qualifyIdentities(input, wrongTier, { verificationAt: identities.verificationAt }), /provider\/evaluator/);
}
assert.equal(identities.rowsSha256, hash(JSON.stringify(identities.models)));
const inputs = await readInputs();
const authority = composeAuthority(inputs, registry);
assertAuthorityFloor(authority); // Existing historical floor stays in force.
const policy = composeCurrentPolicy(identities, authority, registry, bridge);
assert(policy.defaultModels.length >= 8 && policy.defaultModels.length <= 12, '8–12 primary-confirmed comparison candidates, independent of their scores');
const byKey = new Map(identities.models.map((model) => [model.key, model]));
for (const key of ['gpt-6-1-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-5-5', 'gpt-5-5-pro', 'muse-spark-1-3', 'deepseek-v4-pro-0813']) assert(byKey.get(key)?.verified, `${key}: cached exact primary confirmation`);
assert(policy.rows.filter((row) => row.modelKey === 'deepseek-v4-pro').every((row) => !row.eligible), '0813 card confirmation cannot transfer to an unsuffixed benchmark identity');
for (const key of ['gpt-6-1-sol-pro', 'gpt-6-luna-pro', 'gpt-6-sol-pro', 'muse-spark-1-3-contributor', 'claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6']) {
  assert.equal(byKey.get(key)?.verified, false, `${key}: unsupported version/variant stays explicit`);
  assert(byKey.get(key).reason);
  assert(!policy.defaultModels.includes(key));
}
for (const row of authority.observations) {
  const { factualProjectionSha256, ...fact } = row;
  assert.equal(factualProjectionSha256, hash(JSON.stringify(fact)), `${row.id}: factual row hash`);
  const source = authority.sources.find((source) => source.id === row.sourceId);
  assert.equal(row.originalSourceSha256, source.sha256);
  assert.equal(row.retrievedAt, source.retrievedAt);
  if (row.provenance === 'publisher-comparison-claim') assert(!row.admitted && !row.matchable);
}
assert.equal(registry.suites.find((s) => s.id === 'bridgebench').metric.min, null);
assert.equal(registry.suites.find((s) => s.id === 'bridgebench').metric.max, null);
assert.equal(bridge.capabilityEligible, false);

// Synthetic fixtures below exercise policy boundaries; they are never site data.
const at = '2026-10-02T00:00:00.000Z';
const now = Date.parse(at);
const fixture = {
  row: { value: .7, primary: true, provenance: 'independent-evaluator', benchmarkVersion: 'v2', rawUnit: 'fraction', unitEvidence: 'declared unit', configuration: { harnessRevision: 'commit:123', conditionsKnown: true } },
  suite: { currentPolicy: { status: 'current', exactVersion: 'v2', saturated: false, maintained: true, maintenanceEvidence: { retrievedAt: at } } },
  identity: { verified: true, evidence: { retrievedAt: at } }, source: { retrievedAt: at },
};
const admission = (f) => currentAdmission(f.row, f.suite, f.identity, f.source, now);
assert.equal(admission(fixture).eligible, true);
for (const [label, mutate] of [
  ['stale model default', (f) => { f.identity.evidence.retrievedAt = new Date(now - 8 * DAY).toISOString(); }],
  ['stale maintenance', (f) => { f.suite.currentPolicy.maintenanceEvidence.retrievedAt = new Date(now - 8 * DAY).toISOString(); }],
  ['saturated version', (f) => { f.suite.currentPolicy.saturated = true; }],
  ['unknown saturation', (f) => { f.suite.currentPolicy.saturated = null; }],
  ['retired version', (f) => { f.suite.currentPolicy.status = 'retired'; }],
  ['wrong version', (f) => { f.row.benchmarkVersion = 'v1'; }],
  ['missing harness', (f) => { f.row.configuration.harnessRevision = null; }],
  ['publisher-own tier mixing', (f) => { f.row.provenance = 'publisher-own'; }],
  ['publisher competitor tier mixing', (f) => { f.row.provenance = 'publisher-comparison-claim'; }],
  ['missing value', (f) => { f.row.value = null; }],
  ['inferred unit', (f) => { f.row.rawUnit = 'unknown'; }],
  ['unverified identity', (f) => { f.identity.verified = false; }],
]) {
  const next = structuredClone(fixture); mutate(next);
  assert.equal(admission(next).eligible, false, label);
  assert(admission(next).reason, `${label}: exclusion reason`);
}
for (const [a, b] of [['GPT-6 Luna Pro', 'GPT-6 Luna'], ['GPT-5.5', 'GPT-6 Sol'], ['Muse Spark 1.3 Contributor', 'Muse Spark 1.3'], ['Claude Haiku 4.5', 'Claude Haiku 4.6']]) assert(!exactReleaseMatch(a, b), `${a} must not conflate with ${b}`);
assert(exactReleaseMatch('OpenAI: GPT-6 Luna', 'GPT-6 Luna'));
assert.equal(nullableNumber(null, 'not reported'), null);
assert.equal(nullableNumber(0, null), 0, 'actual published zero is distinct from missing');
for (const value of ['', undefined, '0', NaN]) assert.throws(() => nullableNumber(value, 'not reported'));
assert.throws(() => nullableNumber(null, null));

const native = {
  status: 'available', snapshotVersion: 'fixture-v1', source: { sha256: 'a'.repeat(64), guideSha256: 'b'.repeat(64), retrievedAt: at }, rowsSha256: 'c'.repeat(64),
  rows: [{ id: 'fixture:luna', modelKey: 'gpt-6-luna', modelLabel: 'GPT-6 Luna', configurationId: 'luna-high', configurationVersion: 'fixture-high-v1', snapshotVersion: 'fixture-v1',
    resultUrl: 'https://www.bridgebench.ai/models/fixture-only', provenance: 'publisher-rating', unit: 'native rating', capabilityEligible: false,
    overall: 123.4, overallReason: null, axes: { reasoning: { value: null, reason: 'not reported' }, speed: { value: 42, reason: null } },
    confidence: null, confidenceReason: 'not reported', methodologyLimit: 'proprietary calculation is not independently verified', costSpeedTreatment: 'overall includes cost/speed; excluded from independent capability' }],
};
assert.equal(validateNativeRatings(native, byKey, now), native);
for (const [label, mutate] of [
  ['accuracy coercion', (d) => { d.rows[0].unit = 'percent'; }],
  ['rating source-tier mixing', (d) => { d.rows[0].provenance = 'benchmark-authority'; }],
  ['cost/speed double count', (d) => { d.rows[0].capabilityEligible = true; }],
  ['version mixing', (d) => { d.rows[0].snapshotVersion = 'fixture-v2'; }],
  ['alias mixing', (d) => { d.rows[0].modelLabel = 'GPT-6 Luna Pro'; }],
  ['generic result link', (d) => { d.rows[0].resultUrl = 'https://www.bridgebench.ai/leaderboard'; }],
  ['absent numeric reason', (d) => { d.rows[0].axes.reasoning.reason = null; }],
  ['unknown value coercion', (d) => { d.rows[0].overall = ''; }],
  ['lost limits', (d) => { d.rows[0].costSpeedTreatment = null; }],
]) { const next = structuredClone(native); mutate(next); assert.throws(() => validateNativeRatings(next, byKey, now), undefined, label); }
const unknown = structuredClone(native); unknown.rows[0].modelKey = null; unknown.rows[0].identityReason = 'publisher label lacks exact primary confirmation';
assert.equal(validateNativeRatings(unknown, byKey, now).rows.length, 1, 'unverified identities remain visible, unscored');
const corrupted = structuredClone(native); corrupted.rowsSha256 = hash(JSON.stringify(corrupted.rows)); corrupted.rows[0].overall = 900;
assert.throws(() => composeCurrentPolicy(identities, authority, registry, corrupted, now), /projection hash/);
const leaderboardBytes = Buffer.from('<a href="/models/fixture-only">fixture model</a>');
const guideBytes = Buffer.from('Fixture only: comparative ratings');
const resultBytes = Buffer.from('GPT-6 Luna | 123.4 | 42');
const span = (bytes, text) => { const start = bytes.toString().indexOf(text); assert(start >= 0); return [start, start + text.length]; };
const capturedNative = structuredClone(native);
capturedNative.source.sha256 = hash(leaderboardBytes);
capturedNative.source.guideSha256 = hash(guideBytes);
capturedNative.source.guideRetrievedAt = at;
capturedNative.source.unitEvidenceSpan = span(guideBytes, 'comparative ratings');
capturedNative.snapshotVersion = `sha256:${capturedNative.source.sha256}`;
const capturedRow = capturedNative.rows[0];
capturedRow.snapshotVersion = capturedNative.snapshotVersion;
capturedRow.configurationVersion = null;
capturedRow.configurationReason = 'not published';
capturedRow.retrievedAt = at;
capturedRow.originalResultSha256 = hash(resultBytes);
capturedRow.sourceCoordinates = { modelLabel: span(resultBytes, 'GPT-6 Luna'), overall: span(resultBytes, '123.4'), axes: { reasoning: null, speed: span(resultBytes, '42') },
  confidence: null, resultLink: span(leaderboardBytes, '/models/fixture-only') };
capturedNative.rowsSha256 = hash(JSON.stringify(capturedNative.rows));
const captures = { leaderboard: { url: 'https://www.bridgebench.ai/leaderboard', httpStatus: 200, retrievedAt: at, bytes: leaderboardBytes },
  guide: { url: 'https://www.bridgebench.ai/blog/how-the-leaderboard-works', httpStatus: 200, retrievedAt: at, bytes: guideBytes },
  results: { 'fixture:luna': { url: capturedRow.resultUrl, httpStatus: 200, retrievedAt: at, bytes: resultBytes } } };
assert.equal(verifyBridgeCaptures(capturedNative, captures, byKey, now), capturedNative, 'only digest-bound actual numeric source cells qualify');
for (const mutate of [
  (d) => { d.rows[0].overall = 124; },
  (d) => { d.rows[0].resultUrl = 'https://www.bridgebench.ai/models/made-up'; },
  (d) => { d.snapshotVersion = 'invented-v2'; d.rows[0].snapshotVersion = d.snapshotVersion; },
  (d) => { d.source.guideSha256 = 'a'.repeat(64); },
  (d) => { d.rows[0].retrievedAt = '2026-09-30T00:00:00Z'; },
]) {
  const next = structuredClone(capturedNative); mutate(next); next.rowsSha256 = hash(JSON.stringify(next.rows));
  assert.throws(() => verifyBridgeCaptures(next, captures, byKey, now), undefined, 'resealing fabricated facts cannot override original bytes');
}

const temp = await mkdtemp(join(tmpdir(), 'axionbench-policy-'));
try {
  const path = join(temp, 'same-source.json');
  const first = { source: { sha256: 'a'.repeat(64), retrievedAt: '2026-09-30T00:00:00.000Z' }, rows: [] };
  await replaceProjection(path, first);
  const next = structuredClone(first); next.source.retrievedAt = at;
  await replaceProjection(path, next);
  const persisted = await read(path);
  assert.equal(persisted.source.retrievedAt, first.source.retrievedAt, 'original retrieval is immutable for unchanged bytes');
  assert.equal(persisted.source.verifiedAt, at, 'later real fetch verification is distinct');
} finally { await rm(temp, { recursive: true, force: true }); }
console.log(`Local current-policy regressions passed. Measured coverage: ${JSON.stringify(policy.coverage)}`);

if (!process.argv.includes('--local')) {
  const publicData = await read('public/data.json');
  assert.deepEqual(publicData.currentPolicy, policy, 'real public current-policy projection must equal validated composition');
  const gaps = [];
  try {
    validateNativeRatings(bridge, byKey);
    verifyBridgeCaptures(bridge, await readBridgeCaptures('evidence/local/bridgebench/captures.json'), byKey);
  } catch (error) { gaps.push(error.message); }
  if (!policy.coverage.currentObservations) gaps.push('No current-default observations qualify: exact maintained benchmark/harness and saturation evidence is missing.');
  for (const key of ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6']) {
    if (!byKey.get(key)?.verified) gaps.push(`${key}: requested primary verification is still missing.`);
  }
  assert.equal(gaps.length, 0, `Current-source acceptance blocked:\n${gaps.join('\n')}`);
  console.log('Current primary snapshot, benchmark admission and public projection qualify.');
} else console.log('--local checks policy logic and available captures only; it is not the saved release acceptance command.');
