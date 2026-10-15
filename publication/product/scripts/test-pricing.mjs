import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validatePriceFacts, estimateTask, DEFAULT_TASK, costRows, decodeTask, encodeTask } from '../src/pricing/logic.ts';
const raw = await readFile('data/public-price-facts.json');
const facts = validatePriceFacts(JSON.parse(raw));
const extracted = spawnSync('python3', ['scripts/pricing/test-capture.py', ...(process.env.AXIONBENCH_PRICE_AUDIT_DIR ? [process.env.AXIONBENCH_PRICE_AUDIT_DIR] : [])], { stdio: 'inherit' });
assert.equal(extracted.status, 0);
const now = Date.parse(facts.source.retrievedAt);
const flash = facts.records.find((row) => row.endpointModelId === 'gemini-3.8-flash');
const pro = facts.records.find((row) => row.endpointModelId === 'gemini-3.1-pro-preview');
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-12, `${actual} != hand-calculated ${expected}`);
// Independent hand arithmetic from original paid USD/1M cells, including storage.
close(estimateTask(flash, DEFAULT_TASK, now).totalUsd, (10000 * .75 + 2000 * 3.75) / 1e6);
close(estimateTask(flash, { ...DEFAULT_TASK, reasoningTokens: 1000 }, now).totalUsd, .01875);
close(estimateTask(flash, { ...DEFAULT_TASK, cachedReadTokens: 50000, cacheStoredTokens: 50000, cacheHours: 1 }, now).totalUsd, .04375);
close(estimateTask(pro, { ...DEFAULT_TASK, inputTokens: 200000 }, now).totalUsd, .424);
close(estimateTask(pro, { ...DEFAULT_TASK, inputTokens: 200001 }, now).totalUsd, .836004);
close(estimateTask(pro, { ...DEFAULT_TASK, inputTokens: 100000, cachedReadTokens: 100001, cacheStoredTokens: 100001, cacheHours: 1 }, now).totalUsd,
  (100000 * 4 + 100001 * .4 + 2000 * 18 + 100001 * 4.5) / 1e6);
assert.equal(estimateTask(flash, { ...DEFAULT_TASK, cachedWriteTokens: 1 }, now).status, 'unsupported');
assert.equal(estimateTask(flash, { ...DEFAULT_TASK, cachedReadTokens: 100 }, now).status, 'unsupported');
assert.equal(estimateTask(null, DEFAULT_TASK, now).totalUsd, null, 'unknown tariff is never zero');
assert.equal(estimateTask(flash, { ...DEFAULT_TASK, inputTokens: -1 }, now).status, 'invalid');
assert.equal(estimateTask(flash, { ...DEFAULT_TASK, inputTokens: .1 }, now).status, 'invalid');
assert.equal(estimateTask(flash, {}, now).status, 'invalid');
assert.equal(estimateTask(flash, DEFAULT_TASK, now + 8 * 86400000).status, 'unsupported');
assert.equal(estimateTask({ ...flash, retrievedAt: 'unknown' }, DEFAULT_TASK, now).status, 'unsupported', 'unknown freshness cannot quote a current tariff');
assert.equal(estimateTask({ ...flash, retrievedAt: '2026-12-31T00:00:00Z' }, DEFAULT_TASK, Date.parse('2027-01-01T00:00:00Z')).status, 'unsupported');
assert.equal(estimateTask({ ...flash, input: 0, output: 0 }, DEFAULT_TASK, now).totalUsd, 0, 'documented zero tariff stays zero');
for (const change of [(x) => x.records[0].input *= 2, (x) => x.source.licence = 'unknown',
  (x) => x.records[0].modelKey = 'gemini-3-9-flash', (x) => x.records[6].tiers[0].minPromptTokens = 200000,
  (x) => x.records[0].expiresAt = null, (x) => x.records.push(x.records[0]),
  (x) => x.records[0].retrievedAt = 'unknown', (x) => x.records[0].effectiveAt = x.source.retrievedAt,
  (x) => x.records[0].provider = 'another endpoint provider']) {
  const copy = structuredClone(facts); change(copy); assert.throws(() => validatePriceFacts(copy));
}
const params = new URLSearchParams(); encodeTask(DEFAULT_TASK, params); assert.deepEqual(decodeTask(params), DEFAULT_TASK);
assert.deepEqual(decodeTask(new URLSearchParams('task={"inputTokens":-1}')), DEFAULT_TASK);
const data = JSON.parse(await readFile('public/data.json'));
const panel = 'epoch-hub|gpqa-diamond|score|Epoch AI run';
const rows = costRows(data.authority, facts, panel, DEFAULT_TASK, now);
assert(rows.filter((row) => row.price).length >= 8, 'real source panel has useful priced coverage');
for (const row of rows.filter((row) => row.cost.totalUsd !== null)) {
  const dominated = rows.some((other) => other.cost.totalUsd !== null && other.cost.totalUsd <= row.cost.totalUsd && other.observation.value >= row.observation.value
    && (other.cost.totalUsd < row.cost.totalUsd || other.observation.value > row.observation.value));
  assert.equal(row.frontier, !dominated, 'every reported frontier mark satisfies two-dimensional dominance');
}
assert(rows.some((row) => row.price === null && row.cost.totalUsd === null));
const misleading = structuredClone(data.authority); const quotedRow = misleading.observations.find((row) => row.id === rows.find((row) => row.price).observation.id);
quotedRow.provenance = 'publisher-reported';
assert(!costRows(misleading, facts, panel, DEFAULT_TASK, now).some((row) => row.observation.id === quotedRow.id), 'publisher self-claims cannot enter an independently evaluated cost panel');
await mkdir('test-results', { recursive: true });
await writeFile('test-results/pricing.json', JSON.stringify({ passed: true, at: new Date().toISOString(), sourceSha256: facts.source.sha256,
  priceFactsSha256: createHash('sha256').update(raw).digest('hex'), records: facts.records.length, pricedPanelModels: rows.filter((row) => row.price).length,
  originalSourceReplay: Boolean(process.env.AXIONBENCH_PRICE_AUDIT_DIR), handChecks: ['thinking counted once', 'explicit cache storage', '200000/200001 boundary', 'cached prompts enter tier', 'missing is not zero', 'promo expires', 'freshness', 'Pareto dominance'] }, null, 2) + '\n');
console.log('Licensed pricing, independent hand calculations, permission/identity/tier regressions and real-panel Pareto passed.');
