// Admission schemas for limited factual projections. The raw responses may have
// additional fields; none may be smuggled into public facts or a refresh commit.
import assert from 'node:assert/strict';
import { readJson } from './boundary.mjs';
const keys = (value, allowed, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: object required`);
  assert.deepEqual(Object.keys(value).sort(), allowed.split(' ').sort(), `${label}: unpermitted or missing fact fields`);
};
const metric = value => keys(value, 'unit direction min max', 'metric');
export async function validatePermittedFacts(root) {
  const deep = await readJson(root, 'data/authority-deepswe.json');
  keys(deep, 'schemaVersion benchmark version family domain source provenance independentReplication metrics taskSetSize configurationCount modelCount rows', 'DeepSWE');
  keys(deep.source, 'url resultUrl sha256 retrievedAt generatedAt httpStatus', 'DeepSWE source');
  assert.equal(deep.provenance, 'original benchmark-authority measurement', 'DeepSWE provenance');
  assert.equal(deep.independentReplication, false, 'DeepSWE replication claim');
  assert.equal(deep.source.url, 'https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json');
  keys(deep.metrics, 'passAt1 passAt4', 'DeepSWE metrics'); metric(deep.metrics.passAt1); metric(deep.metrics.passAt4);
  for (const row of deep.rows) {
    keys(row, 'model configurationId harness provider reasoningEffort passAt1 passAt4 counts interval repeatedRunRates resultUrl sourceArtifactUrl', 'DeepSWE result');
    keys(row.counts, 'passed attempted tasksAttempted tasksPassedAny runs', 'DeepSWE counts');
    if (row.interval) keys(row.interval, 'low high method', 'source interval');
  }
  const epoch = await readJson(root, 'data/authority/epoch-hub.json');
  keys(epoch, 'schemaVersion publisher provenance licence source countryDefinition organizations modelAttributions benchmarks', 'Epoch');
  keys(epoch.source, 'url hubUrl sha256 bytes retrievedAt generatedAt generatedAtBasis httpStatus', 'Epoch source');
  assert.equal(epoch.provenance, 'independent evaluator measurement', 'Epoch provenance');
  assert.equal(epoch.source.url, 'https://epoch.ai/data/benchmark_data.zip');
  keys(epoch.licence, 'name url attribution', 'Epoch licence'); assert.equal(epoch.licence.name, 'CC BY 4.0'); assert.equal(epoch.licence.url, 'https://creativecommons.org/licenses/by/4.0/'); assert(epoch.licence.attribution);
  for (const row of epoch.organizations) keys(row, 'organization countries', 'Epoch organization');
  for (const row of epoch.modelAttributions) keys(row, 'modelKey organizations countries files', 'Epoch attribution');
  for (const benchmark of epoch.benchmarks) {
    keys(benchmark, 'benchmark file suiteId name version domain familyId page sourceFile sourceFileSha256 rowCount scale scoreColumn scoreCeiling randomBaseline unit rowsSha256 rows', 'Epoch benchmark');
    keys(benchmark.unit, 'status label evidence', 'Epoch unit'); assert.equal(benchmark.unit.status, 'documented'); assert(benchmark.unit.evidence);
    for (const row of benchmark.rows) keys(row, 'runId modelVersion modelKey setting displayName value meanScore stderr releaseDate organization country startedAt logViewerUrl', 'Epoch run');
  }
  const bfcl = await readJson(root, 'data/authority/bfcl-v4.json');
  keys(bfcl, 'schemaVersion benchmark suiteId version domain familyId publisher provenance metric evaluationCommit source rowCount rowsSha256 rows', 'BFCL');
  keys(bfcl.source, 'url resultUrl sha256 pageSha256 retrievedAt generatedAt generatedAtBasis httpStatus', 'BFCL source');
  assert.equal(bfcl.provenance, 'original benchmark-authority measurement', 'BFCL provenance');
  assert.equal(bfcl.source.url, 'https://gorilla.cs.berkeley.edu/data_overall.csv');
  keys(bfcl.metric, 'name unit direction min max evidence', 'BFCL metric'); assert(bfcl.metric.evidence);
  for (const row of bfcl.rows) keys(row, 'rank model modelKey mode overallPercent organization licence modelLink', 'BFCL row');
  const long = await readJson(root, 'data/authority/longbench-v2.json');
  keys(long, 'schemaVersion benchmark suiteId version domain familyId publisher provenance metric conditions source rowCount rowsSha256 rows', 'LongBench');
  keys(long.source, 'url resultUrl sha256 retrievedAt generatedAt generatedAtBasis httpStatus', 'LongBench source');
  assert.equal(long.provenance, 'original benchmark-authority leaderboard', 'LongBench provenance');
  assert.equal(long.source.url, 'https://longbench2.github.io/');
  keys(long.metric, 'name unit direction min max evidence', 'LongBench metric'); assert(long.metric.evidence);
  for (const row of long.rows) keys(row, 'model modelKey organization reasoningModel baseline parameters context date overallWithoutCotPercent overallWithCotPercent', 'LongBench row');
  const publisher = await readJson(root, 'data/publisher-percentage-facts.json');
  keys(publisher, 'schemaVersion sources', 'publisher projection');
  for (const source of publisher.sources) {
    keys(source, 'schemaVersion sourceId publisher resultUrl retrievedAt sourceSha256 sourceBytes httpStatus cells excludedRows status', 'publisher source');
    for (const cell of source.cells) {
      keys(cell, 'tableIndex rowIndex columnIndex modelLabel benchmarkLabel value unit unitEvidence cellSuffix notes sourceClass modelRelationship independentReplication evaluatedAt strictComparisonEligible', 'publisher cell');
      assert(['publisher-model','publisher-comparison-claim'].includes(cell.modelRelationship)); assert.equal(cell.independentReplication, false); assert.equal(cell.strictComparisonEligible, false);
    }
    for (const row of source.excludedRows) keys(row, 'tableIndex rowIndex reason', 'publisher exclusion');
  }
  const prices = await readJson(root, 'data/public-price-facts.json');
  keys(prices, 'schemaVersion source coverage records', 'price projection');
  keys(prices.source, 'id publisher url sha256 bytes retrievedAt licence licenceUrl attribution permissionBasis', 'price source');
  for (const row of prices.records) {
    keys(row, 'id provider endpointModelId modelKey currency unit serviceTier input output cachedInputRead cachedInputWrite reasoningBilling reasoning cacheStoragePerMillionTokenHour tiers expiresAt effectiveAt retrievedAt sourceUrl evidence limitations', 'price record');
    for (const tier of row.tiers) keys(tier, 'minPromptTokens input output cachedInputRead', 'price tier');
    for (const cell of row.evidence) keys(cell, 'tableSection row column field paidCell', 'price source cell');
  }
}
