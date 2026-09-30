import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { endpointIdentitySha256, endpointPriceSha256, parseEvalResults, parseNonnegativeRate } from './data-adapters.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const registry = await readJson('data/benchmark-registry.json');
const oldManifest = await readJson('data/source-snapshots/manifest.json');
const oldSnapshot = await readFile(oldManifest.path);
const oldHash = createHash('sha256').update(oldSnapshot).digest('hex');
assert.equal(oldHash, oldManifest.sha256, 'discovery snapshot hash mismatch');
const data = await readJson('data/ingestion.json');
assert.equal(data.schemaVersion, 2, 'typed ingestion schema must be version 2');
for (const field of ['models', 'configurations', 'sources', 'observations', 'pricing']) assert.ok(Array.isArray(data[field]), `${field} must be an array`);
assert.ok(data.retrievedAt && Number.isFinite(Date.parse(data.retrievedAt)), 'dataset retrieval time is required');

const unique = (rows, key, label) => {
  const ids = new Set();
  for (const row of rows) {
    assert.ok(typeof row[key] === 'string' && row[key], `${label} requires ${key}`);
    assert.ok(!ids.has(row[key]), `duplicate ${label} ${row[key]}`);
    ids.add(row[key]);
  }
  return ids;
};
const modelIds = unique(data.models, 'id', 'model');
const configurationIds = unique(data.configurations, 'id', 'configuration');
const sourceIds = unique(data.sources, 'id', 'source');
const observationIds = unique(data.observations, 'id', 'observation');
const priceIds = unique(data.pricing, 'id', 'price');
const suites = new Map(registry.suites.map((suite) => [suite.id, suite]));
assert.equal(suites.size, registry.suites.length, 'duplicate registry suite id');
for (const suite of registry.suites) assert.ok(suite.benchmarkFamilyId, `benchmark family identity missing ${suite.id}`);
const sourceById = new Map(data.sources.map((source) => [source.id, source]));

const iso = (value, label) => {
  assert.ok(typeof value === 'string' && Number.isFinite(Date.parse(value)), `invalid ${label}`);
  return Date.parse(value);
};
const now = Date.now();
const freshnessMs = 7 * 24 * 60 * 60 * 1000;
function verifyFresh(value, label) {
  const at = iso(value, label);
  assert.ok(at <= now + 5 * 60 * 1000, `${label} is in the future`);
  assert.ok(now - at <= freshnessMs, `${label} is older than seven days`);
}
function verifyHttps(url, label) {
  let parsed;
  try { parsed = new URL(url); } catch { assert.fail(`invalid ${label} URL ${url}`); }
  assert.equal(parsed.protocol, 'https:', `${label} must use HTTPS`);
}

for (const source of data.sources) {
  assert.ok(source.publisher && source.sourceClass && source.rights, `source ${source.id} lacks publisher/class/reuse status`);
  assert.ok(source.snapshotSha256 === null || /^[a-f0-9]{64}$/.test(source.snapshotSha256), `bad source snapshot hash ${source.id}`);
  assert.ok(source.snapshotPath === null || source.snapshotPath.startsWith('data/source-snapshots/'), `source snapshot must be project-relative ${source.id}`);
  assert.ok((source.snapshotPath === null) === (source.snapshotSha256 === null), `source path/hash mismatch ${source.id}`);
  verifyFresh(source.retrievedAt, `source retrieval ${source.id}`);
  if (source.url.startsWith('https://')) verifyHttps(source.url, `source ${source.id}`);
  else assert.ok(['retrieval-receipts','registry-url-audit'].includes(source.id) && source.url.startsWith('internal://'), `unexpected non-HTTPS source URL ${source.id}`);
  if (source.snapshotPath) {
    const bytes = await readFile(source.snapshotPath);
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, source.snapshotSha256, `captured source bytes do not match ${source.id}`);
  } else {
    assert.ok(source.unavailableReason && source.httpStatus !== 200, `unavailable source needs honest state ${source.id}`);
  }
}

const requiredLabs = ['openai','anthropic','google','xai','meta','deepseek','alibaba-qwen','moonshot-kimi','zai-glm','minimax','mistral','cohere','ai21','nvidia','allenai-olmo','ibm-granite','microsoft'];
const modelsById = new Map(data.models.map((model) => [model.id, model]));
for (const model of data.models) {
  assert.ok(model.labId && model.name && Object.hasOwn(model, 'releaseDate'), `incomplete canonical model identity ${model.id}`);
  assert.ok(model.releaseDate === null || /^\d{4}-\d{2}-\d{2}$/.test(model.releaseDate), `invalid release date ${model.id}`);
  assert.ok(typeof model.releaseDateStatus === 'string', `unknown release-date status must be explicit ${model.id}`);
  assert.ok(Array.isArray(model.aliases), `model aliases must be an array ${model.id}`);
  assert.ok(sourceIds.has(model.catalogSourceId), `unknown model catalogue source ${model.id}`);
  assert.ok(model.sourceEvidence?.sourceId && sourceIds.has(model.sourceEvidence.sourceId), `model identity claim has no evidence ${model.id}`);
  if (model.sourceEvidence?.primaryReleaseVerified) {
    const originalEvidence = sourceById.get(model.sourceEvidence.sourceId);
    assert.ok(originalEvidence?.snapshotPath, `primary release/card bytes missing ${model.id}`);
    const evidenceText = await readFile(originalEvidence.snapshotPath, 'utf8');
    if (model.sourceEvidence.verifiedClaim) {
      assert.ok(evidenceText.toLowerCase().includes(model.sourceEvidence.verifiedClaim.toLowerCase()), `official release page does not contain claimed version ${model.id}`);
    } else {
      assert.equal(originalEvidence.sourceClass, 'original_model_card_bytes', `primary model source must be an original card or explicit vendor release page ${model.id}`);
      assert.ok(originalEvidence.url.includes(new URL(model.originalSourceUrl).pathname.split('/').filter(Boolean).slice(0, 2).join('/')), `model card URL does not match canonical repository alias ${model.id}`);
    }
  }
  if (model.originalSourceUrl !== null) verifyHttps(model.originalSourceUrl, `model original source ${model.id}`);
  for (const alias of model.aliases) {
    assert.ok(alias.name && alias.aliasType && sourceIds.has(alias.sourceId), `unsubstantiated alias ${model.id}`);
  }
  if (model.parameterCount !== null) {
    assert.ok(Number.isFinite(model.parameterCount) && model.parameterCount > 0, `invalid parameter count ${model.id}`);
    assert.ok(model.parameterEvidenceId && sourceIds.has(model.parameterEvidenceId), `parameter count lacks source ${model.id}`);
  } else assert.equal(model.parameterEvidenceId, null, `unknown parameter count must have no evidence claim ${model.id}`);
  assert.ok(model.activatedParameterCount === null || Number.isFinite(model.activatedParameterCount), `invalid activated parameter count ${model.id}`);
  assert.ok(typeof model.originalSourceStatus === 'string', `missing original release/card availability state ${model.id}`);
  const bannedKeys = new Set(['authorprofile','avatarurl','followercount','plan','quota','subscription','apikey','access_token','tokenizer_secret']);
  const scan = (value) => {
    if (Array.isArray(value)) return value.forEach(scan);
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      assert.ok(!bannedKeys.has(key.toLowerCase()), `private profile/plan/quota field ${key} in model ${model.id}`);
      scan(child);
    }
  };
  scan(model);
}

// Verify model identity strings against captured provider/model repository
// payloads instead of trusting normalized records by themselves.
const openRouterCatalog = data.sources.find((source) => source.id === 'openrouter-model-catalog');
assert.ok(openRouterCatalog?.snapshotPath, 'OpenRouter current model catalogue snapshot is required');
const openRouterRows = JSON.parse(await readFile(openRouterCatalog.snapshotPath, 'utf8')).data;
for (const model of data.models.filter((row) => row.id.startsWith('or:'))) {
  const catalogueRow = openRouterRows.find((row) => row.canonical_slug === model.catalogRevision && row.id === model.catalogId);
  assert.ok(catalogueRow, `model version does not join to exact provider catalogue row ${model.id}`);
  assert.equal(model.name, catalogueRow.name, `provider catalogue name mismatch ${model.id}`);
  assert.ok(model.aliases.some((alias) => alias.name === catalogueRow.id), `provider ID alias missing ${model.id}`);
  for (const serviceId of model.aliases.filter((alias) => alias.aliasType.includes('route id') || alias.aliasType === 'provider model id').map((alias) => alias.name)) {
    assert.ok(openRouterRows.some((row) => row.id === serviceId && row.canonical_slug === model.catalogRevision), `provider service alias is not in captured catalogue ${model.id}/${serviceId}`);
  }
}
for (const labId of requiredLabs) assert.ok(data.models.some((model) => model.labId === labId), `required named lab missing from catalogue: ${labId}`);
assert.ok(data.models.some((model) => model.labId === 'meta'), 'Meta must have a current catalogue entry');
for (const labId of requiredLabs) assert.ok(data.models.some((model) => model.labId === labId && model.sourceEvidence?.primaryReleaseVerified === true), `no exact original model card/release evidence for named lab ${labId}`);

for (const configuration of data.configurations) {
  assert.ok(modelIds.has(configuration.modelId), `unknown configuration model ${configuration.id}`);
  const model = modelsById.get(configuration.modelId);
  for (const field of ['revision','variant','baseOrInstruct','reasoningMode','providerEndpoint','quantization','modalities','harness','testedHarness','tools','toolSupport','reasoningBudgetTokens','contextWindowTokens']) {
    assert.ok(Object.hasOwn(configuration, field), `configuration requires explicit ${field} (null is allowed): ${configuration.id}`);
  }
  assert.ok(configuration.revision && typeof configuration.revision === 'object', `missing exact revision ${configuration.id}`);
  assert.ok(Array.isArray(configuration.configurationEvidenceSourceIds) && configuration.configurationEvidenceSourceIds.length > 0, `configuration lacks provenance ${configuration.id}`);
  for (const id of configuration.configurationEvidenceSourceIds) assert.ok(sourceIds.has(id), `unknown config source ${configuration.id}/${id}`);
  assert.ok(configuration.sourceClass && model, `configuration source class missing ${configuration.id}`);
  if (configuration.providerEndpoint?.provider !== null && configuration.providerEndpoint?.provider !== undefined) {
    assert.ok(/^[a-f0-9]{64}$/.test(configuration.providerEndpoint.identitySha256 ?? ''), `provider configuration needs exact route identity fingerprint ${configuration.id}`);
  }
  if (configuration.reasoningBudgetTokens !== null) assert.ok(Number.isFinite(configuration.reasoningBudgetTokens) && configuration.reasoningBudgetTokens >= 0, `invalid reasoning budget ${configuration.id}`);
}

const observedSuites = new Set();
const observedDomains = new Set();
const observedFamilies = new Set();
for (const observation of data.observations) {
  assert.ok(modelIds.has(observation.modelId), `unknown result model ${observation.id}`);
  assert.ok(configurationIds.has(observation.configurationId), `unknown tested config ${observation.id}`);
  const configuration = data.configurations.find((x) => x.id === observation.configurationId);
  assert.equal(configuration.modelId, observation.modelId, `configuration/model join mismatch ${observation.id}`);
  assert.ok(sourceIds.has(observation.resultSourceId), `unknown result payload source ${observation.id}`);
  const resultSource = data.sources.find((source) => source.id === observation.resultSourceId);
  assert.ok(resultSource.snapshotPath && resultSource.httpStatus === 200, `result payload must be captured and accessible ${observation.id}`);
  assert.equal(observation.resultUrl, resultSource.url, `result URL and captured source differ ${observation.id}`);
  assert.ok(resultSource.resolvedRevision === null || /^[a-f0-9]{40}$/i.test(resultSource.resolvedRevision), `result source has invalid repository revision ${observation.id}`);
  const resultText = await readFile(resultSource.snapshotPath, 'utf8');
  const parsedClaims = parseEvalResults(resultText);
  assert.ok(parsedClaims.some((claim) => claim.datasetId === observation.resultDatasetId && claim.taskId === observation.resultTaskId && claim.value === observation.rawValue && claim.valueRaw === observation.rawValueText && claim.date === observation.evaluatedAt), `numeric observation absent from captured model-card payload ${observation.id}`);
  verifyHttps(observation.resultUrl, `result ${observation.id}`);
  verifyFresh(observation.retrievedAt, `observation retrieval ${observation.id}`);
  assert.ok(observation.evaluatedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(observation.evaluatedAt), `invalid evaluation date ${observation.id}`);
  assert.ok(observation.split === null || typeof observation.split === 'string', `invalid split ${observation.id}`);
  assert.ok(observation.budget === null || typeof observation.budget === 'object', `budget must be structured or explicitly unknown ${observation.id}`);
  assert.ok(observation.grader === null || typeof observation.grader === 'string', `grader must be text or explicitly unknown ${observation.id}`);
  assert.ok(Number.isFinite(observation.rawValue), `score must retain actual numeric value ${observation.id}`);
  assert.equal(typeof observation.rawValueText, 'string', `original numeric representation missing ${observation.id}`);
  assert.ok(observation.unit && ['documented','inferred','unknown'].includes(observation.unit.status), `original unit state missing ${observation.id}`);
  assert.ok(typeof observation.unit.statement === 'string' && observation.unit.statement, `unit provenance statement missing ${observation.id}`);
  for (const id of observation.unit.sourceIds) assert.ok(sourceIds.has(id), `unknown unit evidence ${observation.id}/${id}`);
  assert.ok(observation.normalization && ['normalized','unavailable'].includes(observation.normalization.status), `normalization state missing ${observation.id}`);
  if (observation.unit.status === 'unknown') {
    assert.equal(observation.unit.label, null, `unknown unit must stay null ${observation.id}`);
    assert.equal(observation.normalization.status, 'unavailable', `unknown unit cannot be normalized ${observation.id}`);
    assert.equal(observation.normalization.normalizedValue, null, `unknown unit cannot claim normalized score ${observation.id}`);
  } else {
    assert.ok(observation.unit.label, `documented/inferred unit label required ${observation.id}`);
    assert.ok(observation.normalization.status === 'normalized' && Number.isFinite(observation.normalization.normalizedValue), `unit conversion missing ${observation.id}`);
    const expected = observation.normalization.formula === 'identity' ? observation.rawValue : observation.normalization.formula === 'x / 100' ? observation.rawValue / 100 : NaN;
    assert.equal(observation.normalization.normalizedValue, expected, `normalization formula mismatch ${observation.id}`);
    const metric = suites.get(observation.suiteId)?.metric;
    assert.ok(observation.normalization.normalizedValue >= metric.min && observation.normalization.normalizedValue <= metric.max, `normalized value outside benchmark metric scale ${observation.id}`);
  }
  const suite = suites.get(observation.suiteId);
  assert.ok(suite, `unknown observed benchmark suite ${observation.suiteId}`);
  assert.equal(observation.metric, suite.metric.name, `metric identity mismatch ${observation.id}`);
  assert.equal(observation.metricDirection, suite.metric.direction, `metric direction mismatch ${observation.id}`);
  assert.equal(observation.benchmarkFamilyId, suite.benchmarkFamilyId, `family id mismatch ${observation.id}`);
  assert.equal(observation.benchmarkVersion, suite.version, `benchmark version mismatch ${observation.id}`);
  assert.ok(observation.claimsEvidenceId === observation.resultSourceId, `numeric score claim does not point to its evidence ${observation.id}`);
  assert.ok(observation.sourceClass && observation.sourceVerification?.status, `source class / verification state missing ${observation.id}`);
  assert.equal(observation.sourceVerification.independentReplication, false, 'unverified community scores must not be described as independently replicated');
  if (observation.leaderboardSourceId) {
    assert.ok(sourceIds.has(observation.leaderboardSourceId), `unknown leaderboard source ${observation.id}`);
    const boardSource = data.sources.find((x) => x.id === observation.leaderboardSourceId);
    assert.ok(boardSource.snapshotPath && boardSource.httpStatus === 200, `board payload unavailable ${observation.id}`);
    assert.equal(observation.leaderboardUrl, boardSource.url, `leaderboard URL/source mismatch ${observation.id}`);
    assert.equal(observation.rawValue, observation.leaderboardValue, `model-card and leaderboard values conflict without a conflict record ${observation.id}`);
    assert.equal(observation.leaderboardVerified, observation.sourceVerification.huggingFaceVerified, `verified flag mismatch ${observation.id}`);
    const resultPathParts = new URL(observation.resultUrl).pathname.split('/').filter(Boolean);
    assert.equal(observation.leaderboardModelId, observation.resultModelRepository, `result model repository/leaderboard model mismatch ${observation.id}`);
    assert.equal(resultPathParts.slice(0, 2).join('/').toLowerCase(), observation.resultModelRepository.toLowerCase(), `result URL does not use the reported model repository ${observation.id}`);
    const boardPayload = JSON.parse(await readFile(boardSource.snapshotPath, 'utf8'));
    assert.ok(boardPayload.rows.some((row) => row.modelId === observation.leaderboardModelId && row.filename === observation.leaderboardFilename && Number(row.value) === observation.rawValue && row.verified === observation.leaderboardVerified), `leaderboard row absent from captured filtered payload ${observation.id}`);
  } else {
    assert.equal(observation.leaderboardValue, null, `no leaderboard join means no board value ${observation.id}`);
    assert.equal(observation.leaderboardUrl, null, `no leaderboard join means no board URL ${observation.id}`);
  }
  if (observation.externalSourceUrl !== null) verifyHttps(observation.externalSourceUrl, `external result ${observation.id}`);
  observedSuites.add(observation.suiteId);
  observedDomains.add(suite.domain);
  observedFamilies.add(suite.benchmarkFamilyId);
}

assert.ok(Array.isArray(data.sourceConflicts), 'source/configuration disagreements must be retained in sourceConflicts');
for (const conflict of data.sourceConflicts) {
  assert.ok(modelIds.has(conflict.modelId) && suites.has(conflict.suiteId), `conflict has unknown model/suite ${conflict.id}`);
  assert.ok(Array.isArray(conflict.observationIds) && conflict.observationIds.length >= 2, `conflict needs all contributing observations ${conflict.id}`);
  const rows = conflict.observationIds.map((id) => data.observations.find((row) => row.id === id));
  assert.ok(rows.every(Boolean), `conflict contains unknown observation ${conflict.id}`);
  assert.ok(rows.every((row) => row.modelId === conflict.modelId && row.suiteId === conflict.suiteId), `conflict model/suite join mismatch ${conflict.id}`);
  assert.ok(new Set(rows.map((row) => row.rawValue)).size >= 2, `conflict must preserve different numeric values ${conflict.id}`);
  assert.equal(conflict.status, 'retained; values are not collapsed', `conflict must remain visible ${conflict.id}`);
}

for (const price of data.pricing) {
  assert.ok(modelIds.has(price.modelId), `unknown priced model ${price.modelId}`);
  assert.ok(configurationIds.has(price.configurationId), `unknown priced configuration ${price.id}`);
  assert.equal(data.configurations.find((x) => x.id === price.configurationId).modelId, price.modelId, `price/configuration mismatch ${price.id}`);
  assert.ok(price.currency === 'USD' && price.unit === 'per token' && price.sourceUnit === 'USD per token', `price unit mismatch ${price.id}`);
  assert.ok(sourceIds.has(price.sourceId), `unknown price source ${price.id}`);
  assert.equal(price.sourceUrl, data.sources.find((source) => source.id === price.sourceId).url, `price source URL mismatch ${price.id}`);
  verifyFresh(price.retrievedAt, `price retrieval ${price.id}`);
  for (const field of ['input','cachedInputRead','cachedInputWrite','output','reasoning']) assert.ok(price[field] === null || (Number.isFinite(price[field]) && price[field] >= 0), `invalid ${field} price ${price.id}`);
  assert.ok(price.reasoningBilling, `reasoning billing must be known or explicitly unknown ${price.id}`);
  assert.ok(price.cache && Object.hasOwn(price.cache, 'implicitCaching'), `cache metadata/status missing ${price.id}`);
  assert.ok(price.sourceEndpointSha256 === null || /^[a-f0-9]{64}$/.test(price.sourceEndpointSha256), `invalid endpoint price fingerprint ${price.id}`);
  const configuration = data.configurations.find((x) => x.id === price.configurationId);
  const source = sourceById.get(price.sourceId);
  const inputRate = price.input;
  const outputRate = price.output;
  const readRate = price.cachedInputRead;
  const writeRate = price.cachedInputWrite;
  if (source.sourceClass === 'public_provider_endpoint_catalogue') {
    const endpointPayload = JSON.parse(await readFile(source.snapshotPath, 'utf8'));
    const route = endpointPayload.data?.endpoints?.find((endpoint) => endpointIdentitySha256(endpoint) === configuration.providerEndpoint?.identitySha256 && endpointPriceSha256(endpoint) === price.sourceEndpointSha256);
    assert.ok(route, `priced provider endpoint missing from raw endpoint payload ${price.id}`);
    assert.equal(configuration.providerEndpoint.provider, route.provider_name, `provider identity mismatch ${price.id}`);
    assert.equal(configuration.providerEndpoint.endpointTag, route.tag, `provider route tag mismatch ${price.id}`);
    assert.equal(configuration.quantization, route.quantization && route.quantization.toLowerCase() !== 'unknown' ? route.quantization : null, `provider quantization mismatch ${price.id}`);
    assert.deepEqual(configuration.supportedParameters, route.supported_parameters ?? [], `provider supported-parameter list mismatch ${price.id}`);
    assert.equal(price.cache.implicitCaching, route.supports_implicit_caching ?? null, `provider cache-support metadata mismatch ${price.id}`);
    assert.deepEqual(price.tiers, route.pricing?.overrides ?? [], `provider price tiers mismatch ${price.id}`);
    for (const [field, sourceField] of [['input','prompt'],['output','completion'],['cachedInputRead','input_cache_read'],['cachedInputWrite','input_cache_write'],['reasoning','internal_reasoning']]) {
      const upstream = route.pricing?.[sourceField];
      assert.equal(price[field], parseNonnegativeRate(upstream), `price does not match original endpoint payload ${price.id}/${field}`);
    }
  } else if (source.id === 'openrouter-model-catalog') {
    const item = openRouterRows.find((row) => row.canonical_slug === configuration.revision?.canonicalSlug);
    assert.ok(item, `priced route missing from current provider catalogue ${price.id}`);
    assert.equal(inputRate, parseNonnegativeRate(item.pricing?.prompt), `catalog input price mismatch ${price.id}`);
    assert.equal(outputRate, parseNonnegativeRate(item.pricing?.completion), `catalog output price mismatch ${price.id}`);
    assert.equal(readRate, parseNonnegativeRate(item.pricing?.input_cache_read), `catalog cache read price mismatch ${price.id}`);
    assert.equal(writeRate, parseNonnegativeRate(item.pricing?.input_cache_write), `catalog cache write price mismatch ${price.id}`);
  }
}
const pricingConflictGroups = new Map();
for (const price of data.pricing.filter((row) => row.sourceConflictId)) {
  if (!pricingConflictGroups.has(price.sourceConflictId)) pricingConflictGroups.set(price.sourceConflictId, []);
  pricingConflictGroups.get(price.sourceConflictId).push(price);
}
for (const [conflictId, rows] of pricingConflictGroups) {
  assert.ok(rows.length >= 2 && new Set(rows.map((row) => JSON.stringify([row.input,row.cachedInputRead,row.cachedInputWrite,row.output,row.reasoning]))).size >= 2, `pricing conflict not preserved ${conflictId}`);
  assert.equal(new Set(rows.map((row) => row.configurationId)).size, 1, `price conflict has incompatible endpoint identities ${conflictId}`);
}

const receipts = data.receipts;
assert.ok(receipts && sourceIds.has(receipts.sourceId), 'retrieval failure receipts must be retained');
const receiptSource = data.sources.find((source) => source.id === receipts.sourceId);
assert.ok(receiptSource.snapshotPath, 'retrieval receipt snapshot is missing');
const receiptBody = await readFile(receiptSource.snapshotPath);
assert.equal(createHash('sha256').update(receiptBody).digest('hex'), receipts.sha256, 'retrieval receipt hash mismatch');
const receiptPayload = JSON.parse(receiptBody.toString('utf8'));
assert.ok(Array.isArray(receiptPayload.failures) && Array.isArray(receiptPayload.urlAudit), 'failed source receipts/audit missing');
assert.ok(Array.isArray(receiptPayload.sourceUrlChecks), 'observed result links must be directly retrieved and audited');
const checkedUrls = new Map(receiptPayload.sourceUrlChecks.map((check) => [check.url, check]));
for (const observation of data.observations) {
  const source = sourceById.get(observation.resultSourceId);
  const checked = checkedUrls.get(observation.resultUrl);
  assert.ok(checked, `result URL was not actually requested ${observation.id}`);
  assert.equal(checked.status, 200, `result URL is not reachable in the saved retrieval check ${observation.id}`);
  assert.equal(checked.bodySha256, source.snapshotSha256, `linked result bytes changed between capture and direct URL check ${observation.id}`);
  assert.equal(observation.resultUrlCheck?.status, checked.status, `result URL check status mismatch ${observation.id}`);
  if (observation.externalSourceUrl) {
    const external = checkedUrls.get(observation.externalSourceUrl);
    assert.ok(external, `external original source link was not requested ${observation.id}`);
    assert.equal(observation.externalSourceUrlCheck?.status, external.status, `external source availability status mismatch ${observation.id}`);
  }
}
const registryAudit = data.sources.find((source) => source.id === 'registry-url-audit');
assert.ok(registryAudit?.snapshotPath, 'all registry source URLs must have a live retrieval audit snapshot');
const auditPayload = JSON.parse(await readFile(registryAudit.snapshotPath, 'utf8'));
assert.ok(Array.isArray(auditPayload.suites) && Array.isArray(auditPayload.uniqueUrls), 'registry URL audit must retain suite joins and unique retrieval records');
assert.equal(auditPayload.suites.length, registry.suites.length, 'registry URL audit contains stale or unjoined suite references');
const registryUrlSet = new Set(registry.suites.map((suite) => suite.url));
const auditedUrlChecks = new Map(auditPayload.uniqueUrls.map((check) => [check.url, check]));
assert.equal(auditedUrlChecks.size, auditPayload.uniqueUrls.length, 'duplicate URL retrieval audit record');
assert.deepEqual(new Set(auditedUrlChecks.keys()), registryUrlSet, 'registry URL audit must cover exactly all current unique registry references');
for (const suite of registry.suites) {
  const suiteAudit = auditPayload.suites.find((row) => row.suiteId === suite.id && row.url === suite.url);
  assert.ok(suiteAudit, `registry reference not audited ${suite.id}`);
  const check = auditedUrlChecks.get(suite.url);
  assert.ok(check, `registry source URL has no retrieval receipt ${suite.id}`);
  assert.equal(suiteAudit.audit?.url, check.url, `suite URL audit URL mismatch ${suite.id}`);
  assert.equal(suiteAudit.audit?.status, check.status, `suite URL audit status mismatch ${suite.id}`);
  assert.equal(suiteAudit.audit?.bodySha256, check.bodySha256, `suite URL audit body hash mismatch ${suite.id}`);
  const expectedResultUrls = new Set(data.observations.filter((row) => row.suiteId === suite.id).map((row) => row.resultUrl));
  assert.deepEqual(new Set(suiteAudit.actualObservationResultUrls), expectedResultUrls, `suite observation result URL audit mismatch ${suite.id}`);
  verifyFresh(check.retrievedAt, `registry URL retrieval ${suite.id}`);
  assert.ok(check.status === null || Number.isInteger(check.status), `invalid registry URL status ${suite.id}`);
  assert.ok(Number.isInteger(check.bodyBytes) && check.bodyBytes >= 0, `invalid registry URL response size ${suite.id}`);
  assert.ok(check.bodySha256 === null || /^[a-f0-9]{64}$/.test(check.bodySha256), `invalid registry URL response hash ${suite.id}`);
  if (check.status !== null) assert.ok(check.bodySha256, `registry URL response body hash unavailable ${suite.id}`);
}
const coverageReport = await readJson('data/coverage-report.json');
assert.equal(coverageReport.observations.total, data.observations.length, 'published coverage report observation count is stale');
assert.equal(coverageReport.observations.observedSuiteVersions, observedSuites.size, 'published coverage report suite count is stale');
assert.equal(coverageReport.observations.observedFamilies, observedFamilies.size, 'published coverage report family count is stale');
assert.equal(coverageReport.observations.observedDomains, observedDomains.size, 'published coverage report domain count is stale');
assert.equal(coverageReport.models.total, data.models.length, 'published model coverage count is stale');
assert.equal(coverageReport.sourceConflicts.groups, data.sourceConflicts.length, 'published conflict count is stale');
for (const row of coverageReport.suiteVersions) {
  assert.equal(row.observations, data.observations.filter((observation) => observation.suiteId === row.suiteId).length, `stale suite coverage ${row.suiteId}`);
  assert.equal(row.benchmarkFamilyId, suites.get(row.suiteId)?.benchmarkFamilyId, `stale family coverage ${row.suiteId}`);
}

// Reject accidental profile, subscription, quota, credential and local/private
// workflow fields anywhere in the normalized public product dataset.
const privacyKeys = new Set(['authorprofile','avatarurl','followercount','plan','quota','subscription','apikey','access_token','tokenizer_secret','privatequota','workfloweconomics']);
const walkPrivacy = (value, path = 'data') => {
  if (Array.isArray(value)) return value.forEach((child, index) => walkPrivacy(child, `${path}[${index}]`));
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    assert.ok(!privacyKeys.has(key.toLowerCase()), `private profile/plan/quota field ${path}.${key}`);
    walkPrivacy(child, `${path}.${key}`);
  }
};
walkPrivacy(data);

const minimumSuites = 15;
const minimumDomains = 8;
const separatePanels = new Set(['professional', 'safety', 'preference', 'audio-video']);
const capabilityDomains = new Set(registry.domains.filter((domain) => !separatePanels.has(domain)));
assert.ok(capabilityDomains.size >= 11, 'registry needs eleven capability domains excluding separate panels');
const observedCapabilityDomains = new Set([...observedDomains].filter((domain) => capabilityDomains.has(domain)));
const observedCapabilitySuites = new Set([...observedSuites].filter((id) => capabilityDomains.has(suites.get(id).domain)));
console.log(`Integrity checks passed: ${modelIds.size} models, ${configurationIds.size} configurations, ${observationIds.size} observations, ${observedFamilies.size} observed families, ${sourceIds.size} sources, ${priceIds.size} public route prices.`);
console.log(`Captured coverage: ${observedCapabilitySuites.size}/${minimumSuites} capability suites across ${observedCapabilityDomains.size}/${minimumDomains} capability domains; ${observedSuites.size} total suites across ${observedDomains.size} total domains including separate panels. Source trust and scoring admission remain separate requirements.`);
if (observedCapabilitySuites.size < minimumSuites || observedCapabilityDomains.size < minimumDomains) {
  console.error(`Coverage gate failed honestly: ${observedCapabilitySuites.size}/${minimumSuites} capability suites across ${observedCapabilityDomains.size}/${minimumDomains} capability domains.`);
  process.exitCode = 1;
}
const missingLabs = requiredLabs.filter((labId) => !data.models.some((model) => model.labId === labId));
if (missingLabs.length) {
  console.error(`Named lab coverage unavailable: ${missingLabs.join(', ')}`);
  process.exitCode = 1;
}
