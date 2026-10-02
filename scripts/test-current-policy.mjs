// Portable policy and view regressions; no private byte archive or network required.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composeAuthority, readInputs } from './authority/compose.mjs';
import { factualHash, observationFactualHash, validateCurrentEvidence, validateBenchmarkPolicy } from './authority/current-policy.mjs';
import { bridgeRatingRows, currentAuthorityPanel } from '../src/current/logic.ts';
import { DEFAULT_WEIGHTS } from '../src/scoring/index.mjs';
import { buildCatalogue } from '../src/catalogue/logic.ts';
import { sha256 } from './authority/common.mjs';

const read = async path => JSON.parse(await readFile(path));
const [evidence, specs, registry, prices] = await Promise.all([
  read('data/current-source-evidence.json'), read('data/current-source-specs.json'), read('data/benchmark-registry.json'), read('data/public-price-facts.json'),
]);
validateCurrentEvidence(evidence, specs);
validateBenchmarkPolicy(registry, evidence);
const required = ['gpt-5-5', 'gpt-5-6-sol', 'gpt-5-6-terra', 'gpt-5-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6-1-sol', 'gpt-6-luna',
  'claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101', 'claude-sonnet-4-6', 'claude-opus-4-6',
  'claude-sonnet-5-5', 'claude-opus-5-5', 'gemini-3-8-flash', 'muse-spark-1-3', 'grok-4-7', 'deepseek-v4-1-flash', 'qwen3-8-max', 'kimi-k3', 'glm-5-3', 'minimax-m3'];
for (const key of required) {
  const fact = evidence.models.find(m => m.key === key);
  assert(fact, `requested identity disappeared ${key}`);
  const source = evidence.sources.find(s => s.id === fact.sourceId);
  if (source.httpStatus === 200) assert(fact.identityVerified, `primary source did not confirm requested exact identity ${key}`);
  else assert(!fact.identityVerified && fact.identityReason, `primary refusal must remain unverified ${key}`);
}
const tests = [];
const rejects = (name, mutate, validator = validateCurrentEvidence) => {
  const next = structuredClone(validator === validateBenchmarkPolicy ? registry : evidence);
  mutate(next);
  assert.throws(() => validator === validateBenchmarkPolicy ? validator(next, evidence) : validator(next, specs), undefined, name);
  tests.push(name);
};
rejects('alias/version conflation', e => { const m = e.models.find(m => m.key === 'gpt-6-luna'); m.apiId = 'gpt-5.6-luna'; m.factualProjectionSha256 = factualHash(m); });
rejects('exact claim conflation', e => { const m = e.models.find(m => m.key === 'claude-opus-4-6'); m.verifiedClaim = 'claude-opus-4-5'; m.factualProjectionSha256 = factualHash(m); });
rejects('stale model default', e => { const m = e.models.find(m => m.selection === 'default'); m.lifecycle = 'retired'; m.factualProjectionSha256 = factualHash(m); });
rejects('stale source default', e => { e.sources[0].verifiedAt = '2025-01-01T00:00:00Z'; });
rejects('offline byte replay cannot refresh network evidence', e => { e.sources[0].lastRetrievedAt = '2025-01-01T00:00:00Z'; e.sources[0].retrievedAt = '2025-01-01T00:00:00Z'; e.sources[0].verifiedAt = new Date().toISOString(); });
rejects('unknown parameter is not zero', e => { const m = e.models[0]; m.parameters = 0; m.factualProjectionSha256 = factualHash(m); });
rejects('brand is not exact model', e => { const m = e.models.find(m => m.key === 'meta-muse'); m.identityVerified = true; m.verifiedClaim = specs.models.find(m => m.key === 'meta-muse').claim; m.factualProjectionSha256 = factualHash(m); });
rejects('publisher rating is not independent', e => { const r = e.bridgeBench.records[0]; r.provenance = 'independent-evaluator'; r.factualProjectionSha256 = factualHash(r); });
rejects('ratings are not percentages', e => { e.bridgeBench.normalization = 'percent'; });
rejects('cost/speed cannot enter capability', e => { e.bridgeBench.scoringEligible = true; });
rejects('incompatible snapshot versions', e => { const r = e.bridgeBench.records[0]; r.version = 'snapshot:' + 'a'.repeat(64); r.factualProjectionSha256 = factualHash(r); });
rejects('result link must have exact response', e => { const r = e.bridgeBench.records[0]; r.resultUrl = e.bridgeBench.guideUrl; r.factualProjectionSha256 = factualHash(r); });
rejects('missing rating cannot be zero', e => { const r = e.bridgeBench.records[0]; r.missingReasons.ratings.reasoning = 'not reported'; r.ratings.reasoning = 0; r.factualProjectionSha256 = factualHash(r); });
rejects('raw capture injection', e => { e.sources[0].html = '<html>private publisher capture</html>'; });
rejects('saturated version admission', r => { r.suites.find(s => s.currentPolicy.defaultEligible).currentPolicy.saturated = true; }, validateBenchmarkPolicy);
rejects('stale benchmark maintenance', r => { r.suites.find(s => s.currentPolicy.defaultEligible).currentPolicy.maintainedAt = '2024-01-01T00:00:00Z'; }, validateBenchmarkPolicy);
rejects('unversioned harness admission', r => { r.suites.find(s => s.currentPolicy.defaultEligible).currentPolicy.harnessVersion = null; }, validateBenchmarkPolicy);
rejects('family caps cannot change', r => { r.suites[0].currentPolicy.familyId = 'new-independent-family'; }, validateBenchmarkPolicy);

const block = composeAuthority(await readInputs(), registry);
for (const row of block.observations) assert.equal(row.currentPolicy.factualProjectionSha256, observationFactualHash(row));
assert.equal(block.currentPolicy.defaultModelKeys.length, 12);
assert.equal(block.models.find(m => m.key === 'gpt-6-1-sol').currentIdentity.identityVerified, true, 'new Sol remains visible without manufactured independent measurement');
assert.equal(block.models.find(m => m.key === 'meta-muse').currentIdentity.identityVerified, false);
const publicInput = await read('public/data.json');
const library = buildCatalogue({ ...publicInput, authority: block, bridgeBench: evidence.bridgeBench }).benchmarks.find(b => b.id === evidence.bridgeBench.id);
assert.equal(library.reported, 270, 'benchmark library must retain actual publisher ratings');
assert.equal(library.admitted, 0);
assert.equal(library.models, 27);
assert.equal(library.results.length, 27, 'benchmark library must link every exact BridgeBench model result');
const current = currentAuthorityPanel(block, block.currentPolicy.defaultModelKeys, DEFAULT_WEIGHTS);
assert.equal(Object.values(current.result.models ?? {}).filter(m => m.score !== null).length, 0, 'no missing current-domain score becomes zero or a partial composite');
assert.equal(current.result.eligible, false, 'cohort with no comparable current panel stays explicitly unavailable');
assert.equal(current.result.score, null);
assert.equal(current.result.reason, 'no eligible compatible common panel');
const forbidden = structuredClone(block);
for (const row of forbidden.observations) row.currentPolicy.scoringEligible = false;
assert.equal(currentAuthorityPanel(forbidden, ['gpt-6-astra', 'gemini-3-8-flash'], { coding: 1 }).rows.length, 0, 'unqualified facts are excluded from current scoring');
for (const axis of evidence.bridgeBench.axes) {
  const rows = bridgeRatingRows(evidence.bridgeBench, axis.id);
  assert.equal(rows.length, evidence.bridgeBench.records.length, 'unverified identities may not disappear from rating views');
  for (const row of rows) {
    assert.equal(row.value, row.ratings[axis.id]);
    assert.equal(row.scoringEligible, false);
    assert(row.resultUrl.includes('/leaderboard/' + row.modelKey));
    assert(!String(row.value).includes('%'));
  }
}
const missing = structuredClone(evidence.bridgeBench);
missing.records[0].ratings.reasoning = null; missing.records[0].missingReasons.ratings.reasoning = 'not published';
const missingView = bridgeRatingRows(missing, 'reasoning').find(r => r.id === missing.records[0].id);
assert.equal(missingView.value, null); assert.equal(missingView.missingReason, 'not published');
assert.throws(() => bridgeRatingRows(evidence.bridgeBench, 'accuracy'));
assert.equal(bridgeRatingRows(evidence.bridgeBench, 'overall', ['gpt-6-1-sol'])[0].value, 646);
assert.equal(evidence.pricingVerification.originalSourceSha256, prices.source.sha256);
assert.equal(evidence.pricingVerification.factualProjectionSha256, sha256(await readFile('data/public-price-facts.json')));
assert.equal(evidence.pricingVerification.recordCount, prices.records.length);
console.log(`Current policy: ${evidence.models.filter(m => m.identityVerified).length}/${evidence.models.length} primary-confirmed identities; 12 defaults; ${evidence.bridgeBench.records.length} BridgeBench models × ${evidence.bridgeBench.axes.length} axes; ${tests.length} rejected mutations. Current eligible coverage: ${JSON.stringify(block.currentPolicy.coverage)}. Broad qualified historical floor retained: ${block.floor.suites.length} suites / ${block.floor.domains.length} domains.`);
