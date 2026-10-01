import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { authorityPanel, weightSensitivity, rankResult } from '../src/scoring/authority.ts';
import { DEFAULT_WEIGHTS, decodeWeightSettings, encodeWeightSettings } from '../src/scoring/index.mjs';
const data = JSON.parse(await readFile('public/data.json'));
const authority = data.authority;
const cohort = ['gpt-6-astra', 'gemini-3-8-flash'];
const defaultResult = authorityPanel(authority, cohort, DEFAULT_WEIGHTS);
assert(defaultResult.coveredDomains.length >= 2, 'real default models share measured domain panels');
assert.equal(rankResult(defaultResult.result).length, 0, 'incomplete equal eleven-domain index stays unavailable');
const weights = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((domain) => [domain, defaultResult.coveredDomains.includes(domain) ? 1 : 0]));
const custom = authorityPanel(authority, cohort, weights);
assert.equal(rankResult(custom.result).length, 2, 'user-selected covered domains produce a useful real custom comparison');
// Independently recompute each real score from selected source rows: family means,
// then domain means, then one shared weight denominator. No scoring helper reused.
for (const key of cohort) {
  const domains = new Map();
  for (const row of custom.rows.filter((row) => row.modelKey === key)) {
    const suite = authority.suites.find((suite) => suite.id === row.suiteId);
    const families = domains.get(row.domain) ?? new Map();
    families.set(suite.familyId, [...(families.get(suite.familyId) ?? []), row.value]);
    domains.set(row.domain, families);
  }
  const domainMeans = [...domains].map(([domain, families]) => [domain,
    [...families.values()].reduce((sum, values) => sum + values.reduce((s, v) => s + v, 0) / values.length, 0) / families.size]);
  const numerator = domainMeans.reduce((sum, [domain, mean]) => sum + mean * weights[domain], 0);
  const denominator = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  assert(Math.abs(custom.result.models[key].score - numerator / denominator) < 1e-12);
}
assert.deepEqual(decodeWeightSettings('?' + encodeWeightSettings(weights)).weights, weights);
const fixture = {
  ...authority,
  models: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }],
  suites: [{ id: 'c1', version: '1', domain: 'coding', familyId: 'c' }, { id: 'c2', version: '1', domain: 'coding', familyId: 'c' },
    { id: 'r', version: '1', domain: 'reasoning', familyId: 'r' }],
  observations: [],
};
for (const [modelKey, suiteId, value] of [['a', 'c1', .9], ['a', 'c2', .7], ['a', 'r', .6], ['b', 'c1', .5], ['b', 'c2', .7], ['b', 'r', .7]]) fixture.observations.push({
  id: `${modelKey}:${suiteId}`, sourceId: 'source', suiteId, domain: suiteId === 'r' ? 'reasoning' : 'coding', metric: 'score', value,
  modelKey, primary: true, admitted: true, provenance: 'independent-evaluator', configuration: { id: modelKey, setting: 'high', condition: 'same harness', conditionsKnown: true },
});
const compare = (block, w = { coding: 1, reasoning: 1 }) => authorityPanel(block, ['a', 'b'], w).result;
assert(Math.abs(compare(fixture).models.a.score - .7) < 1e-12, 'related coding suites share one family cap');
assert(Math.abs(compare(fixture).models.b.score - .65) < 1e-12);
const duplicate = structuredClone(fixture); duplicate.observations.push({ ...duplicate.observations[0], id: 'duplicate' });
assert.equal(compare(duplicate).panelSize, 2, 'ambiguous duplicate panel is excluded, never chosen by array order');
const mismatch = structuredClone(fixture); mismatch.observations = mismatch.observations.map((row) => row.modelKey === 'b' ? { ...row, configuration: { ...row.configuration, setting: 'low' } } : row);
assert.equal(compare(mismatch).panelSize, 0, 'reasoning settings must match exactly across the cohort');
const unknown = structuredClone(fixture); unknown.observations = unknown.observations.map((row) => ({ ...row, configuration: { ...row.configuration, conditionsKnown: false } }));
assert.equal(compare(unknown).panelSize, 0, 'unknown conditions are not compatibility evidence');
const publisher = structuredClone(fixture); publisher.observations = publisher.observations.map((row) => ({ ...row, provenance: 'publisher-own' }));
assert.equal(compare(publisher).panelSize, 0, 'raw publisher claims cannot enter a strict common panel');
assert.equal(rankResult(compare(fixture, { coding: 1, reasoning: 1, factuality: 1 })).length, 0, 'missing selected domain is never zero-filled or reweighted');
assert.equal(compare(fixture, { coding: 1, reasoning: 0 }).models.a.score, .8);
assert.throws(() => compare(fixture, { astrology: 1 }));
assert.throws(() => compare(fixture, { coding: 0 }));
const sensitivity = weightSensitivity(authority, cohort, weights);
assert.equal(sensitivity.omissions.length, new Set(custom.rows.map((row) => row.suiteId)).size);
assert.equal(sensitivity.weightRuns.length, 2 + 2 * defaultResult.coveredDomains.length);
assert.equal(rankResult(sensitivity.independent).length, 0, 'independent-only check preserves the missing coding domain for this real pair');
await mkdir('test-results', { recursive: true });
await writeFile('test-results/weights.json', JSON.stringify({ passed: true, at: new Date().toISOString(), cohort,
  customWeights: weights, defaultScoresAvailable: false, coveredDomains: defaultResult.coveredDomains,
  commonPanels: custom.result.panelSize, independentlyRecomputedScores: custom.result.models,
  weightScenarios: sensitivity.weightRuns.length, leaveSuiteScenarios: sensitivity.omissions.length,
  checks: ['family caps', 'strict shared reasoning setting', 'unknown conditions', 'duplicate rejection', 'no missing zero', 'weight URLs', 'independent-only missingness'] }, null, 2) + '\n');
console.log('Real common-panel weight arithmetic, default missingness, family caps and sensitivity regressions passed.');
