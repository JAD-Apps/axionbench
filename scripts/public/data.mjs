import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { composeAuthority, assertAuthorityFloor, readInputs } from '../authority/compose.mjs';
import { validatePriceFacts } from '../../src/pricing/logic.ts';
import { bandFor } from '../../src/open-weights/logic.ts';
import { sha256, readJson, jsonBytes } from './boundary.mjs';
import { validatePermittedFacts } from './permissions.mjs';

const unique = (rows, key, label) => { const ids = rows.map(row => row[key]); assert(ids.every(Boolean) && new Set(ids).size === ids.length, `${label}: duplicate/missing identity`); return new Map(rows.map(row => [row[key], row])); };
const https = (value, label) => { const url = new URL(value); assert.equal(url.protocol, 'https:', `${label}: original HTTPS URL required`); assert(!url.username && !url.password, `${label}: URL credentials`); };
const time = (value, label, now) => { assert(Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 300000, `${label}: invalid/future retrieval date`); };

export async function derivePublic(root, { now = Date.now(), requireFreshPrices = true } = {}) {
  await validatePermittedFacts(root);
  const frozen = await readJson(root, 'data/frozen-catalogue.json');
  const details = await readJson(root, 'data/frozen-source-details.json');
  const contract = await readJson(root, 'FROZEN-SNAPSHOT.json');
  for (const path of Object.keys(contract.files)) assert.equal(sha256(await readFile(join(root, path))), contract.files[path], `frozen snapshot changed: ${path}`);
  assert.equal(frozen.schemaVersion, 'axionbench-public-v1');
  assert.equal(details.schemaVersion, 'axionbench-source-details-v1');
  assert.equal(frozen.sourceDigest, contract.sourceDigest);
  assert.equal(details.sourceDigest, frozen.sourceDigest);
  time(frozen.retrievedAt, 'catalogue', now);
  const models = unique(frozen.models, 'id', 'frozen models');
  const sources = unique(details.sources, 'id', 'frozen sources');
  const suites = unique(frozen.suites, 'id', 'frozen suites');
  const observations = unique(frozen.observations, 'id', 'frozen observations');
  assert.deepEqual(frozen.sourceIds.slice().sort(), [...sources.keys()].sort(), 'frozen source ID set must match source metadata');
  assert.equal(models.size, contract.counts.models); assert.equal(observations.size, contract.counts.observations);
  assert.equal(Object.keys(frozen.configurations).length, contract.counts.configurations);
  assert.equal(frozen.openWeights.rows.length, contract.counts.openWeights);
  assert.equal(sources.size, contract.counts.sources);
  assert.equal(suites.size, contract.counts.suites);
  assert(models.size >= 30 && suites.size >= 30 && frozen.domains.length >= 11, 'catalogue/registry breadth');
  assert([...models.values()].some(model => model.labId === 'meta'), 'Meta remains in the supported catalogue');
  assert([...models.values()].some(model => model.parameters === null && model.releaseDate === null), 'source unknowns retained');
  for (const source of sources.values()) {
    https(source.url, source.id); time(source.retrievedAt, source.id, now);
    assert(source.rights && source.sourceClass && source.publisher, `${source.id}: original rights/class required`);
    if (source.snapshotSha256 !== null) assert.match(source.snapshotSha256, /^[a-f0-9]{64}$/);
    assert(!Object.hasOwn(source, 'snapshotPath'), `${source.id}: raw audit path is private`);
  }
  const refs = (ids, label) => { for (const id of ids ?? []) assert(sources.has(id), `${label}: unknown frozen source ${id}`); };
  for (const model of models.values()) {
    refs(model.sourceIds, model.id); if (model.identitySourceId) refs([model.identitySourceId], model.id);
    if (model.parameterEvidenceId) refs([model.parameterEvidenceId], model.id);
    if (model.originalSourceUrl) https(model.originalSourceUrl, model.id);
    assert(model.parameters === null || (Number.isFinite(model.parameters) && model.parameters > 0));
  }
  for (const [id, config] of Object.entries(frozen.configurations)) { assert.equal(config.id, id); assert(models.has(config.modelId), `${id}: unknown config model`); refs(config.sourceIds, id); }
  for (const row of observations.values()) {
    assert(models.has(row.modelId) && suites.has(row.suiteId), `${row.id}: model/suite join`);
    assert.equal(frozen.configurations[row.configurationId]?.modelId, row.modelId, `${row.id}: exact config join`);
    assert(Number.isFinite(row.value), `${row.id}: factual observation required`);
    refs(row.sourceIds, row.id); https(row.resultUrl, row.id); time(row.retrievedAt, row.id, now);
  }
  for (const suite of suites.values()) { if (suite.url) https(suite.url, suite.id); assert.equal(suite.observationCount, frozen.observations.filter(row => row.suiteId === suite.id).length, `${suite.id}: coverage count`); }
  assert.deepEqual(details.conflicts, frozen.sourceConflicts, 'frozen conflicts agree');
  for (const conflict of frozen.sourceConflicts) {
    assert(models.has(conflict.modelId) && suites.has(conflict.suiteId)); refs(conflict.sourceIds, conflict.id);
    for (const id of conflict.observationIds) { const row = observations.get(id); assert(row && row.modelId === conflict.modelId && row.suiteId === conflict.suiteId, `${id}: conflict reference`); }
  }
  for (const row of frozen.openWeights.rows) {
    assert(models.has(row.modelId), `${row.modelId}: open-weight model join`);
    assert.equal(row.band, bandFor(row.total.value, row.total.status), `${row.modelId}: total sets parameter band`);
    for (const source of Object.values(row.sources).filter(Boolean)) {
      const original = sources.get(source.id); assert(original, `${source.id}: open-weight source join`);
      assert.equal(source.sha256, original.snapshotSha256); assert.equal(source.url, original.url); assert.equal(source.retrievedAt, original.retrievedAt);
    }
  }
  const registry = await readJson(root, 'data/benchmark-registry.json');
  assert.deepEqual(registry.domains, frozen.domains);
  assert.deepEqual(registry.suites.map(row => row.id), frozen.suites.map(row => row.id));
  const inputs = await readInputs(pathToFileURL(root.replace(/\/$/, '') + '/'));
  const authority = composeAuthority(inputs, registry); assertAuthorityFloor(authority);
  const authorityModels = unique(authority.models, 'key', 'authority models');
  const authoritySuites = unique(authority.suites, 'id', 'authority suites');
  const authoritySources = unique(authority.sources, 'id', 'authority sources');
  unique(authority.observations, 'id', 'authority observations');
  for (const source of authority.sources) { https(source.resultUrl, source.id); time(source.retrievedAt, source.id, now); assert.match(source.sha256, /^[a-f0-9]{64}$/); }
  for (const row of authority.observations) {
    assert(authorityModels.has(row.modelKey) && authoritySuites.has(row.suiteId) && authoritySources.has(row.sourceId), `${row.id}: exact authority join`);
    const epochBenchmark = row.sourceId === 'epoch-hub' ? inputs.epoch.json.benchmarks.find(benchmark => benchmark.suiteId === row.suiteId) : null;
    const epochRow = epochBenchmark?.rows.find(run => run.runId === row.configuration.id);
    if (epochBenchmark) assert(epochRow, `${row.id}: exact Epoch run join`);
    const expectedUrl = epochBenchmark ? epochRow.logViewerUrl ?? epochBenchmark.page : authoritySources.get(row.sourceId).resultUrl;
    assert.equal(row.resultUrl, expectedUrl, `${row.id}: original suite result link`);
    assert.equal(row.domain, authoritySuites.get(row.suiteId).domain);
    if (row.provenance === 'publisher-comparison-claim') assert(!row.admitted && !row.matchable);
    if (!row.configuration.conditionsKnown) assert(!row.matchable);
  }
  // Source retrieval is distinct from the older evaluation/update date. Prices
  // have a stricter seven-day quote window; outdated benchmark results stay dated.
  const pricing = validatePriceFacts(await readJson(root, 'data/public-price-facts.json'));
  time(pricing.source.retrievedAt, 'tariffs', now);
  if (requireFreshPrices) assert(now - Date.parse(pricing.source.retrievedAt) <= 7 * 86400000, 'licensed tariff capture exceeds seven-day freshness window');
  assert(pricing.records.every(row => authorityModels.has(row.modelKey)), 'tariffs join only exact authority model keys');
  const deepSwe = inputs.deepswe.json;
  assert.deepEqual(deepSwe, (await import('./boundary.mjs')).permittedDeepSwe(deepSwe), 'historical benchmark cost/efficiency fields excluded');
  const scoring = await readJson(root, 'data/scoring.json');
  const projection = { ...frozen, sourceLimitations: { ...frozen.sourceLimitations, apiPriceRowsPublished: pricing.records.length }, authority, pricing, scoring };
  assert.equal(projection.sourceLimitations.restrictedRoutedPricesPublished, false);
  const priceSource = { id: pricing.source.id, url: pricing.source.url, finalUrl: pricing.source.url,
    publisher: pricing.source.publisher, sourceClass: 'original_provider_pricing', rights: pricing.source.licence + ': ' + pricing.source.licenceUrl,
    permittedFields: ['standard paid text tariff facts', 'billing conditions', 'source coordinates', 'source hash'],
    snapshotSha256: pricing.source.sha256, retrievedAt: pricing.source.retrievedAt, httpStatus: 200, resolvedRevision: null, contentType: 'text/html' };
  const publicDetails = { ...details, sources: [...details.sources, priceSource] };
  const projectionBytes = Buffer.from(JSON.stringify(projection));
  const detailsBytes = Buffer.from(JSON.stringify(publicDetails));
  const manifest = { schemaVersion: 'axionbench-data-manifest-v1', sourceDigest: frozen.sourceDigest, retrievedAt: frozen.retrievedAt,
    projection: { path: '/data.json', bytes: projectionBytes.length, sha256: sha256(projectionBytes) },
    details: { path: '/data-details.json', bytes: detailsBytes.length, sha256: sha256(detailsBytes) },
    counts: { models: models.size, observations: observations.size, verifiedObservations: frozen.sourceLimitations.verifiedBenchmarkObservations,
      suites: suites.size, domains: frozen.domains.length,
      identityConfirmedModels: frozen.sourceLimitations.identityConfirmedModels,
      sourceDetails: publicDetails.sources.length, sourceConflicts: publicDetails.conflicts.length,
      withheldPriceRows: frozen.sourceLimitations.apiPriceRowsObserved, permittedPriceRows: pricing.records.length,
      authorityObservations: authority.observations.length, authorityAdmittedObservations: authority.observations.filter(row => row.admitted).length,
      authorityModels: authority.models.length, openWeightRows: frozen.openWeights.rows.length,
      authorityFloorSuites: authority.floor.suites.length, authorityFloorDomains: authority.floor.domains.length },
    authorityInputs: authority.inputDigests,
    pricingInput: { path: 'data/public-price-facts.json', sha256: sha256(await readFile(join(root, 'data/public-price-facts.json'))) } };
  return { projection, details: publicDetails, manifest, files: new Map([
    ['public/data.json', projectionBytes], ['public/data-details.json', detailsBytes], ['public/data-manifest.json', jsonBytes(manifest)]]) };
}
export async function validateData(root, options) {
  const expected = await derivePublic(root, options);
  for (const [path, bytes] of expected.files) assert((await readFile(join(root, path))).equals(bytes), `${path}: portable recomputation or byte hash mismatch`);
  return expected;
}
export async function writePublicData(root, options) {
  const expected = await derivePublic(root, options);
  for (const [path, bytes] of expected.files) await writeFile(join(root, path), bytes);
  return expected;
}
