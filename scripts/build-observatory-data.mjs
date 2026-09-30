import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { assertAuthorityFloor, composeAuthority, readInputs } from './authority/compose.mjs';
import { deriveOpenWeights } from './open-weights/derive.mjs';

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

const [ingestionBytes, input, registry, authorityInputs] = await Promise.all([
  readFile(new URL('../data/ingestion.json', import.meta.url)),
  readJson('data/ingestion.json'),
  readJson('data/benchmark-registry.json'),
  readInputs(),
]);
// Original-source admission gate: authority, independent-evaluator and publisher
// facts are re-validated and must meet the capability floor before publication.
const authority = composeAuthority(authorityInputs, registry);
assertAuthorityFloor(authority);
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

const models = input.models.map((row) => ({
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
  identityVerified: row.originalSourceStatus === 'exact current model version matched in captured official release/model page'
    && row.sourceEvidence?.primaryReleaseVerified === true,
  identityStatus: row.originalSourceStatus ?? 'unknown',
  sourceIds: unique([
    row.catalogSourceId,
    row.sourceEvidence?.sourceId,
    row.parameterEvidenceId,
    ...(row.aliases ?? []).map((alias) => alias.sourceId),
  ]),
}));

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
  sourceIds: input.sources.map((row) => row.id),
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
    apiPricesPublished: false,
    apiPriceRowsObserved: input.pricing.length,
    apiPriceExclusion: 'All captured API rate sources explicitly exclude redistribution because terms are not established; values and endpoint payloads are withheld.',
    verifiedBenchmarkObservations: input.observations.filter((row) => row.leaderboardVerified === true).length,
    identityConfirmedModels: models.filter((row) => row.identityVerified).length,
  },
  authority,
  // Open-weight explorer facts, re-derived from SHA-256-checked repository snapshots.
  openWeights: await deriveOpenWeights(input),
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
    authorityObservations: authority.observations.length,
    authorityAdmittedObservations: authority.observations.filter((row) => row.admitted).length,
    authorityModels: authority.models.length,
    openWeightRows: projection.openWeights.rows.length,
    authorityFloorSuites: authority.floor.suites.length,
    authorityFloorDomains: authority.floor.domains.length,
  },
  authorityInputs: authority.inputDigests,
};
await writeFile(new URL('../public/data-manifest.json', import.meta.url), JSON.stringify(manifest));
console.log('Prepared validated public projection: ' + models.length + ' models, ' + observations.length
  + ' observations (' + manifest.counts.verifiedObservations + ' source-verified), ' + suites.length
  + ' suites across ' + registry.domains.length + ' domains. Source detail is deferred; '
  + input.pricing.length + ' restricted price rows are withheld. Authority: ' + authority.observations.length
  + ' observations, ' + authority.floor.suites.length + ' admitted capability suites across ' + authority.floor.domains.length + ' domains.');
