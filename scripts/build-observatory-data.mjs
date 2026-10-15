import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { assertAuthorityFloor, composeAuthority, readInputs } from './authority/compose.mjs';
import { deriveOpenWeights } from './open-weights/derive.mjs';
import { validatePriceFacts } from '../src/pricing/logic.ts';
import { composeCurrentPolicy, qualifyIdentities } from './current-policy.mjs';
import { exactReleaseMatch } from '../src/data/current-policy.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const cleanText = (value) => typeof value === 'string' ? value : null;
const safeUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};
const unique = (values) => [...new Set(values.filter(Boolean))];

const [ingestionBytes, input, registry, authorityInputs, priceBytes] = await Promise.all([
  readFile(new URL('../data/ingestion.json', import.meta.url)),
  readJson('data/ingestion.json'),
  readJson('data/benchmark-registry.json'),
  readInputs(),
  readFile(new URL('../data/public-price-facts.json', import.meta.url)),
]);
// Original-source admission gate: authority, independent-evaluator and publisher
// facts are re-validated and must meet the capability floor before publication.
const authority = composeAuthority(authorityInputs, registry);
assertAuthorityFloor(authority);
const identities = await readJson('data/model-identities.json');
assert.deepEqual(await qualifyIdentities(input, await readJson('data/model-policy.json'), { verificationAt: identities.verificationAt }), identities,
  'current identity projection must replay the original captures exactly');
const currentPolicy = composeCurrentPolicy(identities, authority, registry, await readJson('data/authority/bridgebench.json'));
const pricing = validatePriceFacts(JSON.parse(priceBytes));
assert(pricing.records.every((price) => authority.models.some((model) => model.key === price.modelKey)), 'public tariffs join exact authority identities only');
assert(Date.now() - Date.parse(pricing.source.retrievedAt) <= 7 * 86400000, 'public tariffs require a fresh licensed capture');
assert.equal(input.schemaVersion, 2, 'the public projection requires validated typed ingestion v2');
for (const key of ['models', 'configurations', 'sources', 'observations', 'pricing', 'sourceConflicts']) {
  assert.ok(Array.isArray(input[key]), 'ingestion.' + key + ' must be an array');
}
assert.ok(input.models.length >= 30 && input.observations.length >= 15, 'the projection must use the broad admitted dataset');
assert.ok(registry.suites.length >= 30 && registry.domains.length >= 11, 'the registry must retain its broad coverage');

const modelIds = new Set(input.models.map((row) => row.id));
const sourceById = new Map(input.sources.map((row) => [row.id, row]));
const configById = new Map(input.configurations.map((row) => [row.id, row]));
const suiteById = new Map(registry.suites.map((row) => [row.id, row]));
for (const model of input.models) {
  assert.ok(model.id && model.name && model.labId && model.labName, 'each model needs a stable identity and lab');
}
for (const observation of input.observations) {
  assert.ok(modelIds.has(observation.modelId), 'observation references an unknown model: ' + observation.id);
  assert.ok(configById.has(observation.configurationId), 'observation references an unknown tested configuration: ' + observation.id);
  assert.ok(suiteById.has(observation.suiteId), 'observation references an unknown registered suite: ' + observation.id);
  assert.ok(Number.isFinite(observation.rawValue), 'observation must preserve its actual raw value: ' + observation.id);
  assert.ok(safeUrl(observation.resultUrl), 'observation must retain an HTTPS source result URL: ' + observation.id);
}
for (const source of input.sources) {
  assert.ok(source.id && source.publisher && source.sourceClass && source.rights, 'source metadata must retain identity, publisher, class, and reuse status');
  assert.ok(source.snapshotSha256 === null || /^[a-f0-9]{64}$/.test(source.snapshotSha256), 'source digest is malformed: ' + source.id);
}

const configurations = Object.fromEntries(input.configurations.map((row) => [row.id, {
  id: row.id,
  modelId: row.modelId,
  revision: row.revision ?? null,
  variant: row.variant ?? null,
  baseOrInstruct: row.baseOrInstruct ?? null,
  reasoningMode: row.reasoningMode ?? null,
  providerEndpoint: row.providerEndpoint ? {
    provider: row.providerEndpoint.provider ?? null,
    endpoint: row.providerEndpoint.endpoint ?? null,
    identitySha256: row.providerEndpoint.identitySha256 ?? null,
  } : null,
  quantization: row.quantization ?? null,
  modalities: row.modalities ?? null,
  harness: row.harness ?? null,
  testedHarness: row.testedHarness ?? null,
  tools: row.tools ?? null,
  toolSupport: row.toolSupport ?? null,
  reasoningBudgetTokens: row.reasoningBudgetTokens ?? null,
  contextWindowTokens: row.contextWindowTokens ?? null,
  testCondition: row.testCondition ?? null,
  sourceIds: unique(row.configurationEvidenceSourceIds),
}]));

const models = input.models.map((row) => {
  const exactIdentity = identities.models.find((model) => model.catalogueId === row.id);
  const correction = exactIdentity ? {
    originalSourceUrl: exactIdentity.evidence?.url ?? null,
    identitySourceId: exactIdentity.evidence?.sourceId ?? row.catalogSourceId,
    identityBasis: exactIdentity.evidence?.scope ?? 'provider catalogue listing; exact primary identity is unverified',
    identityStatus: exactIdentity.verified ? 'Exact publisher product/version identity confirmed; release date and benchmark eligibility are separate.' : exactIdentity.reason,
    identityEvidence: exactIdentity.evidence,
    sourceIds: unique([row.catalogSourceId, ...(row.aliases ?? []).map((alias) => alias.sourceId), exactIdentity.evidence?.sourceId, row.parameterEvidenceId]),
  } : {};
  return {
  id: row.id,
  name: row.name,
  labId: row.labId,
  lab: row.labName,
  catalogId: row.catalogId ?? null,
  revision: row.catalogRevision ?? null,
  releaseDate: row.releaseDate ?? null,
  releaseDateStatus: row.releaseDateStatus ?? 'unknown',
  parameters: row.parameterCount ?? null,
  parameterEvidenceId: row.parameterEvidenceId ?? null,
  activatedParameters: row.activatedParameterCount ?? null,
  weightsAvailability: row.weightsAvailability ?? 'unknown',
  modalities: row.modalities ?? null,
  originalSourceUrl: safeUrl(row.originalSourceUrl),
  identitySourceId: row.sourceEvidence?.sourceId ?? row.catalogSourceId ?? null,
  identityBasis: row.sourceEvidence?.identityBasis ?? null,
  identityVerified: exactIdentity?.verified
    ?? (row.originalSourceStatus === 'exact current model version matched in captured official release/model page'
      && row.sourceEvidence?.primaryReleaseVerified === true && exactReleaseMatch(row.name, row.sourceEvidence?.verifiedClaim ?? '')),
  identityStatus: row.originalSourceStatus ?? 'unknown',
  sourceIds: unique([
    row.catalogSourceId,
    row.sourceEvidence?.sourceId,
    row.parameterEvidenceId,
    ...(row.aliases ?? []).map((alias) => alias.sourceId),
  ]),
  ...correction,
  };
});

const observations = input.observations.map((row) => ({
  id: row.id,
  modelId: row.modelId,
  configurationId: row.configurationId,
  suiteId: row.suiteId,
  familyId: row.benchmarkFamilyId,
  taskId: row.taskId ?? null,
  split: row.split ?? null,
  metric: row.metric,
  direction: row.metricDirection,
  value: row.rawValue,
  valueText: row.rawValueText,
  unit: row.unit ?? null,
  normalization: row.normalization ?? null,
  version: row.benchmarkVersion ?? null,
  evaluatedAt: row.evaluatedAt ?? null,
  retrievedAt: row.retrievedAt,
  grader: row.grader ?? null,
  framework: row.evaluationFramework ?? null,
  budget: row.budget ?? null,
  resultUrl: safeUrl(row.resultUrl),
  leaderboardUrl: safeUrl(row.leaderboardUrl),
  sourceClass: row.sourceClass,
  verified: row.leaderboardVerified === true,
  verificationStatus: row.sourceVerification?.status ?? 'verification state not recorded',
  submission: row.leaderboardSubmission ? {
    author: row.leaderboardSubmission.author ?? null,
    revisionRef: row.leaderboardSubmission.revisionRef ?? null,
    revisionStatus: row.leaderboardSubmission.revisionStatus ?? null,
    verified: row.leaderboardSubmission.verified === true,
  } : null,
  sourceIds: unique([
    row.resultSourceId,
    row.leaderboardSourceId,
    row.claimsEvidenceId,
    row.unit?.sourceIds ?? [],
  ].flat()),
}));

const suites = registry.suites.map((row) => ({
  id: row.id,
  name: row.name,
  domain: row.domain,
  familyId: row.benchmarkFamilyId,
  version: row.version ?? null,
  metric: row.metric ?? null,
  url: safeUrl(row.url),
  state: row.state,
  reason: row.reason,
  currentPolicy: row.currentPolicy,
  observationCount: input.observations.filter((observation) => observation.suiteId === row.id).length,
}));

const projection = {
  schemaVersion: 'axionbench-public-v1',
  sourceDigest: digest(ingestionBytes),
  retrievedAt: input.retrievedAt,
  models,
  configurations,
  observations,
  domains: registry.domains,
  suites,
  sourceIds: unique([...input.sources.map((row) => row.id), ...identities.models.map((model) => model.evidence?.sourceId)]),
  sourceConflicts: input.sourceConflicts.map((row) => ({
    id: row.id,
    modelId: row.modelId,
    suiteId: row.suiteId,
    observationIds: row.observationIds,
    values: row.values ?? null,
    status: row.status,
    comparability: row.comparability ?? null,
    sourceIds: unique(row.observationIds.flatMap((id) => {
      const observation = input.observations.find((candidate) => candidate.id === id);
      return observation ? [observation.resultSourceId, observation.leaderboardSourceId] : [];
    })),
  })),
  sourceLimitations: {
    apiPricesPublished: true,
    apiPriceRowsPublished: pricing.records.length,
    restrictedRoutedPricesPublished: false,
    apiPriceRowsObserved: input.pricing.length,
    apiPriceExclusion: 'Captured routed endpoint payloads and rates remain withheld because reuse terms are not established. A separate licensed original-provider factual tariff projection is published with attribution.',
    verifiedBenchmarkObservations: input.observations.filter((row) => row.leaderboardVerified === true).length,
    identityConfirmedModels: models.filter((row) => row.identityVerified).length,
  },
  authority,
  currentPolicy,
  pricing,
  // Open-weight explorer facts, re-derived from SHA-256-checked repository snapshots.
  openWeights: await deriveOpenWeights(input),
  // Checked-in scoring definition, published verbatim so the methodology page cannot drift from it.
  scoring: await readJson('data/scoring.json'),
};

const sources = input.sources
  .filter((row) => /^https:\/\//i.test(row.url ?? ''))
  .map((row) => ({
    id: row.id,
    url: safeUrl(row.url),
    finalUrl: safeUrl(row.finalUrl),
    publisher: row.publisher,
    sourceClass: row.sourceClass,
    rights: row.rights,
    permittedFields: row.permittedFields ?? null,
    snapshotSha256: row.snapshotSha256 ?? null,
    retrievedAt: row.retrievedAt ?? null,
    httpStatus: row.httpStatus ?? null,
    resolvedRevision: row.resolvedRevision ?? null,
    contentType: row.contentType ?? null,
  }));
for (const identity of identities.models) {
  const evidence = identity.evidence;
  if (!evidence || sources.some((source) => source.id === evidence.sourceId)) continue;
  const original = authority.sources.find((source) => source.id === evidence.sourceId);
  assert(original, 'identity evidence joins an original source');
  sources.push({ id: evidence.sourceId, url: original.url, finalUrl: original.url, publisher: original.publisher,
    sourceClass: original.provenance, rights: original.licence, permittedFields: ['publisher product/version identity'],
    snapshotSha256: original.sha256, retrievedAt: original.retrievedAt, httpStatus: 200, resolvedRevision: null, contentType: null });
}
sources.push({ id: pricing.source.id, url: pricing.source.url, finalUrl: pricing.source.url,
  publisher: pricing.source.publisher, sourceClass: 'original_provider_pricing', rights: pricing.source.licence + ': ' + pricing.source.licenceUrl,
  permittedFields: ['standard paid text tariff facts', 'billing conditions', 'source coordinates', 'source hash'],
  snapshotSha256: pricing.source.sha256, retrievedAt: pricing.source.retrievedAt, httpStatus: 200,
  resolvedRevision: null, contentType: 'text/html' });
const details = {
  schemaVersion: 'axionbench-source-details-v1',
  sourceDigest: projection.sourceDigest,
  sources,
  conflicts: projection.sourceConflicts,
};

const publicDir = new URL('../public/', import.meta.url);
await mkdir(publicDir, { recursive: true });
const projectionBytes = Buffer.from(JSON.stringify(projection));
const detailsBytes = Buffer.from(JSON.stringify(details));
await writeFile(new URL('../public/data.json', import.meta.url), projectionBytes);
await writeFile(new URL('../public/data-details.json', import.meta.url), detailsBytes);
const manifest = {
  schemaVersion: 'axionbench-data-manifest-v1',
  sourceDigest: projection.sourceDigest,
  retrievedAt: input.retrievedAt,
  projection: { path: '/data.json', bytes: projectionBytes.length, sha256: digest(projectionBytes) },
  details: { path: '/data-details.json', bytes: detailsBytes.length, sha256: digest(detailsBytes) },
  counts: {
    models: models.length,
    observations: observations.length,
    verifiedObservations: projection.sourceLimitations.verifiedBenchmarkObservations,
    suites: suites.length,
    domains: registry.domains.length,
    identityConfirmedModels: projection.sourceLimitations.identityConfirmedModels,
    sourceDetails: sources.length,
    sourceConflicts: details.conflicts.length,
    withheldPriceRows: input.pricing.length,
    permittedPriceRows: pricing.records.length,
    authorityObservations: authority.observations.length,
    authorityAdmittedObservations: authority.observations.filter((row) => row.admitted).length,
    authorityModels: authority.models.length,
    openWeightRows: projection.openWeights.rows.length,
    authorityFloorSuites: authority.floor.suites.length,
    authorityFloorDomains: authority.floor.domains.length,
  },
  authorityInputs: authority.inputDigests,
  pricingInput: { path: 'data/public-price-facts.json', sha256: digest(priceBytes) },
};
await writeFile(new URL('../public/data-manifest.json', import.meta.url), JSON.stringify(manifest));
console.log('Prepared validated public projection: ' + models.length + ' models, ' + observations.length
  + ' observations (' + manifest.counts.verifiedObservations + ' source-verified), ' + suites.length
  + ' suites across ' + registry.domains.length + ' domains. Source detail is deferred; '
  + input.pricing.length + ' restricted price rows are withheld. Authority: ' + authority.observations.length
  + ' observations, ' + authority.floor.suites.length + ' admitted capability suites across ' + authority.floor.domains.length + ' domains.');
