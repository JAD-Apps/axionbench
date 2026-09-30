import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { addedSuites, extendRegistry, hfDatasetToSuite } from './registry-coverage.mjs';
import { endpointIdentitySha256, endpointPriceSha256, fetchSnapshot, labForModelId, normalizeScore, parseEvalResults, parseNonnegativeRate, projectLeaderboardRows, readJson, saveBlob, sha256 } from './data-adapters.mjs';

const date = new Date().toISOString().slice(0, 10);
const stamp = date.replaceAll('-', '');
// Source bytes live once in content-addressed storage (data/source-snapshots/blobs);
// this per-run directory holds only small run metadata and failure receipts.
const sourceRoot = `data/source-snapshots/runs/${stamp}-${Date.now()}`;
const writeAtomic = async (path, text) => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, path);
};
const registryPath = 'data/benchmark-registry.json';
const ingestionPath = 'data/ingestion.json';
let previousData = null;
try {
  const old = await readJson(ingestionPath);
  if (old.schemaVersion === 2 && Array.isArray(old.observations) && old.observations.length) previousData = old;
} catch { /* first ingestion run has no last-good dataset */ }
const previousSourceByUrl = new Map();
const previousRetrievalByUrlHash = new Map();
const previousPathByHash = new Map();
const previousReceiptChecks = new Map();
const previousRegistryAudit = new Map();
const cacheIsFresh = (at) => Number.isFinite(Date.parse(at)) && Date.now() - Date.parse(at) <= 6 * 24 * 60 * 60 * 1000;
if (previousData) {
  for (const source of previousData.sources) {
    if (source.snapshotPath && source.snapshotSha256 && !previousPathByHash.has(source.snapshotSha256)) previousPathByHash.set(source.snapshotSha256, source.snapshotPath);
    if (source.url && source.snapshotSha256 && source.retrievedAt) previousRetrievalByUrlHash.set(`${source.url}\n${source.snapshotSha256}`, source.retrievedAt);
  }
  const previousSourceById = new Map(previousData.sources.map((source) => [source.id, source]));
  for (const source of previousData.sources) {
    if (!source.url?.startsWith('https://') || !cacheIsFresh(source.retrievedAt)) continue;
    if (!previousSourceByUrl.has(source.url)) previousSourceByUrl.set(source.url, source);
  }
  for (const observation of previousData.observations) {
    const source = previousSourceById.get(observation.resultSourceId);
    const configuration = previousData.configurations.find((row) => row.id === observation.configurationId);
    if (!source?.url || !configuration?.revision?.ref || !configuration.revision.repository || !cacheIsFresh(source.retrievedAt)) continue;
    const segments = new URL(source.url).pathname.split('/').filter(Boolean);
    const resolveAt = segments.indexOf('resolve');
    if (resolveAt < 0 || !segments.slice(resolveAt + 2).join('/').includes('.eval_results/')) continue;
    const filename = segments.slice(resolveAt + 2).map(decodeURIComponent).join('/');
    const branchUrl = `https://huggingface.co/${configuration.revision.repository}/resolve/${encodeURIComponent(configuration.revision.ref)}/${filename.split('/').map(encodeURIComponent).join('/')}`;
    if (!previousSourceByUrl.has(branchUrl)) previousSourceByUrl.set(branchUrl, source);
  }
  try {
    const receipt = JSON.parse(await readFile(previousData.receipts.path, 'utf8'));
    for (const check of receipt.sourceUrlChecks ?? []) if (cacheIsFresh(check.retrievedAt)) previousReceiptChecks.set(check.url, check);
  } catch { /* an absent previous receipt simply disables this cache */ }
  const auditSource = previousSourceById.get('registry-url-audit');
  if (auditSource?.snapshotPath) {
    try {
      const audit = JSON.parse(await readFile(auditSource.snapshotPath, 'utf8'));
      for (const check of audit.uniqueUrls ?? []) if (cacheIsFresh(check.retrievedAt)) previousRegistryAudit.set(check.url, check);
    } catch { /* a missing prior audit simply triggers fresh GET requests */ }
  }
}
const registry = extendRegistry(await readJson(registryPath));
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
const suiteById = new Map(registry.suites.map((suite) => [suite.id, suite]));
const labNames = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', xai: 'xAI', meta: 'Meta', deepseek: 'DeepSeek',
  'alibaba-qwen': 'Alibaba / Qwen', 'moonshot-kimi': 'Moonshot / Kimi', 'zai-glm': 'Z.ai / GLM', minimax: 'MiniMax',
  mistral: 'Mistral', cohere: 'Cohere', ai21: 'AI21', nvidia: 'NVIDIA / Nemotron', 'allenai-olmo': 'AllenAI / OLMo',
  'ibm-granite': 'IBM / Granite', microsoft: 'Microsoft', other: 'Other public source models',
};
const namedLabs = Object.keys(labNames).filter((x) => x !== 'other');
const sources = [];
const receipts = [];
const sourceById = new Map();
const observations = [];
const models = [];
const configurations = [];
const pricing = [];
const pricingIds = new Set();
const snapshotEntries = [];
let sourceCacheHits = 0;
let receiptCacheHits = 0;
let registryAuditCacheHits = 0;
const setSource = (record) => {
  if (sourceById.has(record.id)) return sourceById.get(record.id);
  sourceById.set(record.id, record);
  sources.push(record);
  return record;
};
const safeName = (value) => {
  const original = String(value);
  const slug = original.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '').slice(0, 96) || 'source';
  return `${slug}-${sha256(Buffer.from(original)).slice(0, 8)}`;
};
const safeJson = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sourceForSaved = async ({ id, url, publisher, sourceClass, bytes, retrievedAt: observedAt, httpStatus = 200, contentType = 'application/json', reuseStatus, projectedFrom, permittedFields, resolvedRevision = null, finalUrl = url }) => {
  let retrievedAt = observedAt;
  const hash = sha256(bytes);
  const extension = url.includes('/.eval_results/') || url.endsWith('/eval.yaml') ? 'yaml' : url.endsWith('/README.md') ? 'md' : contentType?.includes('text/html') ? 'html' : 'json';
  // Reuse the already-committed object for identical bytes (verified, never
  // copied); only genuinely new bytes create a new content-addressed file.
  const reusablePath = previousPathByHash.get(hash);
  let saved = null;
  if (reusablePath) {
    try { if (sha256(await readFile(reusablePath)) === hash) saved = { path: reusablePath, sha256: hash, bytes: bytes.length }; } catch { /* missing object falls through to fresh storage */ }
  }
  saved ??= await saveBlob(bytes, extension);
  // Identical bytes keep the retrieval date on which they were first captured;
  // this run's retrieval is recorded separately as lastVerifiedAt.
  const originalRetrievedAt = previousRetrievalByUrlHash.get(`${url}\n${hash}`);
  const lastVerifiedAt = originalRetrievedAt && originalRetrievedAt !== retrievedAt ? retrievedAt : undefined;
  if (originalRetrievedAt) retrievedAt = originalRetrievedAt;
  snapshotEntries.push({ id, path: saved.path, sha256: saved.sha256, bytes: saved.bytes, url, retrievedAt, httpStatus, contentType });
  return setSource({
    id, url, publisher, sourceClass, rights: reuseStatus,
    snapshotPath: saved.path, snapshotSha256: saved.sha256, retrievedAt, httpStatus, contentType,
    projectionOf: projectedFrom ?? null, permittedFields: permittedFields ?? null, resolvedRevision, finalUrl,
    ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
  });
};
const sourceForFailure = (id, url, publisher, sourceClass, result, reuseStatus) => {
  receipts.push({ id, url, status: result.status ?? null, finalUrl: result.finalUrl ?? null, retrievedAt: result.retrievedAt ?? new Date().toISOString(), error: result.error ?? null, httpStatus: result.status ?? null, contentType: result.contentType ?? null, bodyBytes: result.bytes?.length ?? 0, bodySha256: result.sha256 ?? null });
  return setSource({ id, url, publisher, sourceClass, rights: reuseStatus, snapshotPath: null, snapshotSha256: null, retrievedAt: result.retrievedAt ?? new Date().toISOString(), httpStatus: result.status ?? null, unavailableReason: result.error ?? `HTTP ${result.status}`, finalUrl: result.finalUrl ?? null });
};
async function safeFetch(url, options = {}) {
  const cached = previousSourceByUrl.get(url);
  if (cached && cacheIsFresh(cached.retrievedAt)) {
    try {
      let bytes = cached.snapshotPath ? await readFile(cached.snapshotPath) : Buffer.alloc(0);
      if (cached.sourceClass === 'public_leaderboard_structured_projection' && bytes.length) {
        const projection = JSON.parse(bytes.toString('utf8'));
        bytes = Buffer.from(JSON.stringify(projection.rows));
      }
      sourceCacheHits++;
      return { url, finalUrl: cached.finalUrl ?? cached.url, status: cached.httpStatus, contentType: cached.contentType ?? null, retrievedAt: cached.retrievedAt, bytes, sha256: cached.snapshotSha256, repoCommit: cached.resolvedRevision ?? null, error: cached.unavailableReason ?? null, cachedFromSnapshot: true };
    } catch { /* corrupted cache is ignored and the public source is retried */ }
  }
  let attempt = 0;
  while (attempt < 3) {
    try {
      const result = await fetchSnapshot(url, options);
      if (result.status === 429 || result.status === 503) {
        const retryReceipt = { id: `retry-${sha256(Buffer.from(`${url}:${attempt}`)).slice(0,12)}`, url, status: result.status, finalUrl: result.finalUrl, retrievedAt: result.retrievedAt, error: 'Transient public-source rate limit/service unavailable; bounded backoff scheduled.', httpStatus: result.status, contentType: result.contentType, bodyBytes: result.bytes.length, bodySha256: result.sha256, attempt: attempt + 1 };
        await preserveFailureReceipt(retryReceipt);
        const retryHeader = Number(result.retryAfter);
        const delay = Number.isFinite(retryHeader) && retryHeader > 0 ? Math.min(retryHeader * 1000, 30000) : Math.min(1500 * (2 ** attempt), 15000);
        attempt++;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, delay));
        else {
          return { ...result, error: `HTTP ${result.status}; retry limit reached after ${attempt} attempts` };
        }
        continue;
      }
      if (result.status === null || result.status >= 400) await preserveFailureReceipt({ id: `failed-${sha256(Buffer.from(url)).slice(0,12)}`, url, status: result.status, finalUrl: result.finalUrl, retrievedAt: result.retrievedAt, error: result.error ?? `HTTP ${result.status}`, httpStatus: result.status, contentType: result.contentType, bodyBytes: result.bytes.length, bodySha256: result.sha256 });
      return result;
    } catch (error) {
      const failure = { url, finalUrl: null, status: null, contentType: null, retrievedAt: new Date().toISOString(), bytes: Buffer.alloc(0), sha256: null, error: `${error.name}: ${error.message}` };
      await preserveFailureReceipt({ id: `failed-${sha256(Buffer.from(url)).slice(0,12)}`, url, status: null, finalUrl: null, retrievedAt: failure.retrievedAt, error: failure.error, httpStatus: null, contentType: null, bodyBytes: 0, bodySha256: null });
      return failure;
    }
  }
  return { url, finalUrl: null, status: null, contentType: null, retrievedAt: new Date().toISOString(), bytes: Buffer.alloc(0), sha256: null, error: 'Retry limit exhausted' };
}
async function mapLimit(items, limit, fn) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}
let failureReceiptWrite = Promise.resolve();
function preserveFailureReceipt(record) {
  if (!receipts.some((entry) => entry.id === record.id)) receipts.push(record);
  failureReceiptWrite = failureReceiptWrite.then(async () => {
    await mkdir(sourceRoot, { recursive: true });
    const bytes = safeJson({ recordedAt: new Date().toISOString(), attemptCount: receipts.length, failures: receipts });
    await writeFile(`${sourceRoot}/failed-retrievals.json`, bytes);
  });
  return failureReceiptWrite;
}
const providerContributors = new Map();

// OpenRouter's public structured catalogue includes provider route identifiers,
// date-stamped service revisions, modalities and public API price fields.
const openRouterUrl = 'https://openrouter.ai/api/v1/models';
const openRouterResult = await safeFetch(openRouterUrl, { timeout: 30000 });
if (openRouterResult.status !== 200) throw new Error(`OpenRouter catalogue retrieval failed: ${openRouterResult.status} ${openRouterResult.error ?? ''}`);
const openRouterSource = await sourceForSaved({ id: 'openrouter-model-catalog', url: openRouterUrl, publisher: 'OpenRouter', sourceClass: 'public_provider_catalogue', bytes: openRouterResult.bytes, retrievedAt: openRouterResult.retrievedAt, httpStatus: openRouterResult.status, contentType: openRouterResult.contentType, reuseStatus: 'Public structured provider metadata; redistribution terms not established. Excluded from compiled UI output.' });
const openRouterPayload = JSON.parse(openRouterResult.bytes.toString('utf8'));
if (!Array.isArray(openRouterPayload.data)) throw new Error('OpenRouter catalogue data[] missing');
const byCanonical = new Map();
for (const row of openRouterPayload.data) {
  const group = byCanonical.get(row.canonical_slug) ?? [];
  group.push(row);
  byCanonical.set(row.canonical_slug, group);
}
const providerRows = [...byCanonical.values()].map((group) => {
  const primary = group.find((row) => !row.id.endsWith(':batch')) ?? group[0];
  const hfIds = [...new Set(group.map((row) => row.hugging_face_id).filter(Boolean))];
  return { ...primary, hugging_face_id: hfIds[0] ?? null, hugging_face_ids: hfIds, serviceIds: group.map((row) => row.id) };
});
console.log(`OpenRouter catalogue captured: ${openRouterPayload.data.length} routes, ${providerRows.length} canonical versions; fetching exact route configurations.`);
const providerModelByAlias = new Map();
const modelRecords = new Map();
for (const row of providerRows) {
  const originId = row.hugging_face_id || row.id.replace(/:batch$/, '');
  const labId = labForModelId(originId);
  const modelId = `or:${row.canonical_slug}`;
  const aliases = row.serviceIds.map((serviceId) => ({ name: serviceId, sourceId: openRouterSource.id, aliasType: serviceId.endsWith(':batch') ? 'batch route id' : 'provider model id' }));
  for (const hfId of row.hugging_face_ids) aliases.push({ name: hfId, sourceId: openRouterSource.id, aliasType: 'Hugging Face model repository id' });
  aliases.push({ name: row.canonical_slug, sourceId: openRouterSource.id, aliasType: 'date-stamped OpenRouter canonical slug' });
  const record = {
    id: modelId, catalogId: row.id, catalogRevision: row.canonical_slug,
    labId, labName: labNames[labId] ?? labNames.other,
    name: row.name, releaseDate: null,
    releaseDateStatus: 'unknown; provider catalogue created timestamp is not treated as model release date',
    catalogListedAt: Number.isFinite(row.created) ? new Date(row.created * 1000).toISOString() : null,
    parameterCount: null, activatedParameterCount: null, parameterEvidenceId: null,
    originalSourceUrl: row.hugging_face_id ? `https://huggingface.co/${row.hugging_face_id}` : null,
    originalSourceStatus: row.hugging_face_id ? 'catalogue alias; card retrieval recorded separately' : 'not located in provider metadata; release identity beyond catalog fields unknown',
    catalogSourceId: openRouterSource.id,
    aliases,
    modalities: { input: row.architecture?.input_modalities ?? null, output: row.architecture?.output_modalities ?? null, raw: row.architecture?.modality ?? null },
    baseOrInstruct: row.architecture?.instruct_type ?? (/(?:^|[- ])instruct(?:$|[- ])/i.test(row.name) ? 'instruct' : /(?:^|[- ])base(?:$|[- ])/i.test(row.name) ? 'base' : null),
    thinking: row.reasoning ? { supported: true, mandatory: row.reasoning.mandatory ?? null, defaultEnabled: row.reasoning.default_enabled ?? null, supportedEfforts: row.reasoning.supported_efforts ?? null, defaultEffort: row.reasoning.default_effort ?? null } : { supported: null, mandatory: null, defaultEnabled: null, supportedEfforts: null, defaultEffort: null },
    weightsAvailability: row.hugging_face_id ? 'repository referenced; access/license metadata not yet checked here' : 'unknown',
    sourceEvidence: { sourceId: openRouterSource.id, identityBasis: 'provider catalogue id/name/canonical slug', primaryReleaseVerified: false },
  };
  modelRecords.set(modelId, record);
  models.push(record);
  for (const alias of aliases) providerModelByAlias.set(alias.name.toLowerCase(), modelId);
  const parameters = row.supported_parameters ?? [];
  if (['openai','anthropic','google','xai','meta','deepseek','alibaba-qwen','moonshot-kimi','zai-glm','minimax','mistral','cohere','nvidia','microsoft','ibm-granite'].includes(labId)) providerContributors.set(labId, (providerContributors.get(labId) ?? 0) + 1);
}

const endpointResults = new Map();
await mapLimit(providerRows, 7, async (row) => {
  const url = `https://openrouter.ai/api/v1/models/${row.canonical_slug}/endpoints`;
  const result = await safeFetch(url, { timeout: 25000 });
  const modelId = `or:${row.canonical_slug}`;
  const endpoints = result.status === 200 ? JSON.parse(result.bytes.toString('utf8'))?.data?.endpoints : null;
  let source;
  if (result.status === 200 && Array.isArray(endpoints)) {
    source = await sourceForSaved({ id: `openrouter-endpoints-${safeName(row.canonical_slug)}`, url, publisher: 'OpenRouter', sourceClass: 'public_provider_endpoint_catalogue', bytes: result.bytes, retrievedAt: result.retrievedAt, httpStatus: result.status, contentType: result.contentType, reuseStatus: 'Public endpoint and price metadata; redistribution terms not established. Excluded from compiled UI output.' });
    endpointResults.set(modelId, { result, endpoints, source });
  } else {
    source = sourceForFailure(`openrouter-endpoints-${safeName(row.canonical_slug)}`, url, 'OpenRouter', 'public_provider_endpoint_catalogue', result, 'Public endpoint lookup attempted; unavailable response retained.');
    endpointResults.set(modelId, { result, endpoints: [], source });
  }
});
console.log(`Provider endpoint retrieval complete: ${[...endpointResults.values()].filter((x) => x.result.status === 200).length}/${providerRows.length} public responses.`);

const hfAliasIds = [...new Set(providerRows.flatMap((row) => row.hugging_face_ids))];
const hfModelProjectionFields = ['id', 'sha', 'lastModified', 'createdAt', 'private', 'gated', 'pipeline_tag', 'library_name', 'tags', 'cardData', 'config', 'safetensors', 'usedStorage'];
const hfModelMetadata = new Map();
const hfReadmePromises = new Map();
async function fetchHfModel(hfId) {
  if (hfModelMetadata.has(hfId)) return hfModelMetadata.get(hfId);
  const apiUrl = `https://huggingface.co/api/models/${hfId}?blobs=false`;
  const result = await safeFetch(apiUrl, { timeout: 25000 });
  if (result.status !== 200) {
    const failure = sourceForFailure(`hf-model-metadata-${safeName(hfId)}`, apiUrl, 'Hugging Face Hub', 'public_model_card_metadata', result, 'Public metadata lookup attempted; returned response retained as receipt.');
    const out = { failure, metadata: null, source: failure };
    hfModelMetadata.set(hfId, out);
    return out;
  }
  const raw = JSON.parse(result.bytes.toString('utf8'));
  const projection = Object.fromEntries(hfModelProjectionFields.filter((key) => Object.hasOwn(raw, key)).map((key) => [key, raw[key]]));
  projection._projection = 'Filtered public model repository metadata. Author account fields, follower counts, avatars, access tokens and unrelated repository file lists are excluded.';
  const source = await sourceForSaved({ id: `hf-model-metadata-${safeName(hfId)}`, url: apiUrl, publisher: 'Hugging Face Hub', sourceClass: 'public_model_card_metadata_projection', bytes: safeJson(projection), retrievedAt: result.retrievedAt, httpStatus: result.status, contentType: 'application/json', reuseStatus: 'Filtered public model metadata; original redistribution terms unknown.', projectedFrom: apiUrl, permittedFields: hfModelProjectionFields });
  const readmeUrl = `https://huggingface.co/${hfId}/resolve/${encodeURIComponent(raw.sha ?? 'main')}/README.md`;
  const readmeResult = await safeFetch(readmeUrl, { timeout: 25000 });
  let readmeSource;
  if (readmeResult.status === 200) {
    readmeSource = await sourceForSaved({ id: `hf-model-card-${safeName(hfId)}`, url: readmeUrl, publisher: 'Hugging Face Hub / model author', sourceClass: 'original_model_card_bytes', bytes: readmeResult.bytes, retrievedAt: readmeResult.retrievedAt, httpStatus: readmeResult.status, contentType: readmeResult.contentType, reuseStatus: 'Exact public model card bytes retained as source evidence; redistribution licence is model-specific and not presumed.', finalUrl: readmeResult.finalUrl });
  } else {
    readmeSource = sourceForFailure(`hf-model-card-${safeName(hfId)}`, readmeUrl, 'Hugging Face Hub / model author', 'original_model_card_bytes', readmeResult, 'Model card retrieval attempted; unavailable state retained.');
  }
  const out = { metadata: raw, source, readmeSource };
  hfModelMetadata.set(hfId, out);
  return out;
}
await mapLimit(hfAliasIds, 6, async (id) => { await fetchHfModel(id); });
console.log(`Original HF model cards/metadata attempted for ${hfAliasIds.length} catalogue aliases.`);
for (const row of providerRows) {
  if (!row.hugging_face_ids.length) continue;
  const model = modelRecords.get(`or:${row.canonical_slug}`);
  if (!model) continue;
  const capturedEvidenceIds = [];
  for (const hfId of row.hugging_face_ids) {
    const evidence = hfModelMetadata.get(hfId);
    if (!evidence) continue;
    const sourceId = evidence.readmeSource?.snapshotPath ? evidence.readmeSource.id : evidence.source.id;
    capturedEvidenceIds.push(sourceId);
    if (!model.aliases.some((alias) => alias.name === hfId && alias.sourceId === sourceId)) model.aliases.push({ name: hfId, sourceId, aliasType: 'captured original model card repository id' });
    const totalParameters = evidence.metadata?.safetensors?.total;
    if (model.parameterCount === null && Number.isFinite(totalParameters) && totalParameters > 0) {
      model.parameterCount = totalParameters;
      model.parameterEvidenceId = evidence.source.id;
      model.parameterCountMethod = 'Hugging Face safetensors metadata total; exact architecture total/active parameters not inferred from quantized tensor count';
    }
    const originalPipeline = evidence.metadata?.pipeline_tag ?? null;
    if (originalPipeline && !model.modalities.raw) model.modalities = { ...model.modalities, raw: originalPipeline };
  }
  model.originalSourceEvidenceIds = capturedEvidenceIds;
  const matchingEvidence = row.hugging_face_ids.map((hfId) => [hfId, hfModelMetadata.get(hfId)]).find(([, evidence]) => evidence?.readmeSource?.snapshotPath);
  if (matchingEvidence) {
    const [hfId, evidence] = matchingEvidence;
    const sourceId = evidence.readmeSource.id;
    model.originalSourceUrl = `https://huggingface.co/${hfId}`;
    model.originalSourceStatus = 'public original model card bytes captured';
    model.sourceEvidence = { sourceId, identityBasis: 'provider catalogue namespace plus captured model repository/card', primaryReleaseVerified: labForModelId(hfId) === model.labId };
  }
}

// Capture current HF model namespace listings for the two named labs absent
// from the provider route catalogue. Their repo IDs stay separate from API models.
const supplementalHfIds = [];
const supplementalAuthorSnapshots = [];
for (const author of ['ai21labs', 'allenai']) {
  const url = `https://huggingface.co/api/models?author=${author}&sort=lastModified&limit=100`;
  const result = await safeFetch(url, { timeout: 25000 });
  let authorSource;
  let entries = [];
  if (result.status === 200) {
    const payload = JSON.parse(result.bytes.toString('utf8'));
    entries = payload.filter((row) => row.private !== true && row.id && row.lastModified);
    const projection = entries.map((row) => ({ id: row.id, sha: row.sha ?? null, lastModified: row.lastModified, pipeline_tag: row.pipeline_tag ?? null, tags: row.tags ?? [] }));
    authorSource = await sourceForSaved({ id: `hf-author-catalog-${author}`, url, publisher: 'Hugging Face Hub', sourceClass: 'public_author_model_catalogue_projection', bytes: safeJson(projection), retrievedAt: result.retrievedAt, httpStatus: result.status, contentType: 'application/json', reuseStatus: 'Filtered public model catalogue projection; not a model release-date source.', projectedFrom: url, permittedFields: ['id','sha','lastModified','pipeline_tag','tags'] });
    for (const row of entries) supplementalHfIds.push({ ...row, authorSourceId: authorSource.id, author });
  } else {
    authorSource = sourceForFailure(`hf-author-catalog-${author}`, url, 'Hugging Face Hub', 'public_author_model_catalogue_projection', result, 'Public author catalogue lookup attempted; unavailable response retained.');
  }
  supplementalAuthorSnapshots.push(authorSource.id);
}

const observedModelIds = new Set();
const configsByKey = new Map();
const modelEvidenceSources = new Map();
const rawCardCache = new Map();
function modelByHfAlias(hfId) {
  const exact = providerModelByAlias.get(hfId.toLowerCase());
  return exact ?? null;
}
async function addSupplementalHfModel(item) {
  const hfId = item.id;
  let source = hfModelMetadata.get(hfId);
  if (!source) source = await fetchHfModel(hfId);
  if (!source.metadata) return;
  const existing = modelByHfAlias(hfId);
  if (existing) return;
  const modelId = `hf:${hfId}`;
  const meta = source.metadata;
  const sourceId = source.readmeSource?.snapshotPath ? source.readmeSource.id : source.source.id;
  const record = {
    id: modelId, catalogId: hfId, catalogRevision: meta.sha ?? null,
    labId: labForModelId(hfId), labName: labNames[labForModelId(hfId)] ?? labNames.other,
    name: hfId.split('/').at(-1), releaseDate: null,
    releaseDateStatus: 'unknown; Hub repository creation/update time is not represented as model release date',
    catalogListedAt: meta.lastModified ?? item.lastModified ?? null,
    parameterCount: Number.isFinite(meta.safetensors?.total) ? meta.safetensors.total : null,
    activatedParameterCount: null, parameterEvidenceId: Number.isFinite(meta.safetensors?.total) ? source.source.id : null,
    originalSourceUrl: `https://huggingface.co/${hfId}`, originalSourceStatus: 'public repository API and model card retrieval attempted',
    catalogSourceId: item.authorSourceId, aliases: [{ name: hfId, sourceId: source.source.id, aliasType: 'Hugging Face model repository id' }],
    modalities: { input: null, output: null, raw: meta.pipeline_tag ?? null },
    baseOrInstruct: null, thinking: { supported: null, mandatory: null, defaultEnabled: null, supportedEfforts: null, defaultEffort: null },
    weightsAvailability: meta.gated ? 'gated; not downloaded' : 'public repository; weights not downloaded',
    sourceEvidence: { sourceId, identityBasis: 'Hugging Face model repository metadata/card', primaryReleaseVerified: Boolean(source.readmeSource?.snapshotPath) },
  };
  models.push(record);
  modelRecords.set(modelId, record);
  providerModelByAlias.set(hfId.toLowerCase(), modelId);
  const id = `${modelId}::checkpoint::${meta.sha ?? 'revision-unknown'}`;
  const c = {
    id, modelId, revision: { repository: hfId, commit: meta.sha ?? null }, variant: 'repository checkpoint',
    baseOrInstruct: null, reasoningMode: null, providerEndpoint: null,
    quantization: meta.config?.quantization_config?.quant_method ?? null,
    modalities: [], harness: null, testedHarness: null, tools: null, toolSupport: null,
    reasoningBudgetTokens: null, contextWindowTokens: null, testCondition: null,
    configurationEvidenceSourceIds: [source.source.id, ...(source.readmeSource ? [source.readmeSource.id] : [])],
    identitySourceId: source.source.id, sourceClass: 'public model repository; not a benchmark test configuration',
  };
  configurations.push(c); configsByKey.set(id, c);
  modelEvidenceSources.set(modelId, source);
}
await mapLimit(supplementalHfIds, 6, addSupplementalHfModel);

// Original official pages for current hosted flagships that do not publish a
// first-party Hugging Face model card. A page only verifies the exact named
// model when the captured body contains that model version string.
const officialReleasePages = [
  { labId: 'openai', url: 'https://developers.openai.com/api/docs/changelog', needles: ['GPT-6.1 Sol'], currentName: 'GPT-6.1 Sol' },
  { labId: 'anthropic', url: 'https://www.anthropic.com/claude-sonnet-5-5', needles: ['Claude Sonnet 5.5'], currentName: 'Claude Sonnet 5.5' },
  { labId: 'google', url: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash', needles: ['Gemini 3.8 Flash'], currentName: 'Gemini 3.8 Flash' },
  { labId: 'xai', url: 'https://docs.x.ai/docs/models', needles: ['grok-4.7', 'Grok 4.7'], currentName: 'Grok 4.7' },
  { labId: 'cohere', url: 'https://docs.cohere.com/docs/models', needles: ['Command A+'], currentName: 'Command A+' },
  { labId: 'minimax', url: 'https://platform.minimax.io/docs/guides/models-intro', needles: ['MiniMax M2-her'], currentName: 'MiniMax M2-her' },
  { labId: 'meta', url: 'https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/', needles: ['Muse Spark 1.1', 'Muse Spark'], currentName: 'Muse Spark 1.1' },
  { labId: 'meta', url: 'https://ai.meta.com/events/', needles: ['Muse Spark 1.3'], currentName: 'Muse Spark 1.3' },
  { labId: 'ibm-granite', url: 'https://research.ibm.com/blog/introducing-granite-4-2', needles: ['Granite 4.2'], currentName: 'Granite 4.2' },
];
const officialPageEvidence = [];
await mapLimit(officialReleasePages, 4, async (page, index) => {
  const result = await safeFetch(page.url, { timeout: 25000, headers: { accept: 'text/html' } });
  const sourceId = `official-release-${page.labId}-${index + 1}`;
  let source;
  if (result.status === 200) {
    source = await sourceForSaved({ id: sourceId, url: page.url, publisher: `${labNames[page.labId]} official site`, sourceClass: 'original_official_model_release_page', bytes: result.bytes, retrievedAt: result.retrievedAt, httpStatus: result.status, contentType: result.contentType, reuseStatus: 'Original public vendor release/model page retained as evidence; redistribution licence not presumed.', finalUrl: result.finalUrl });
  } else source = sourceForFailure(sourceId, page.url, `${labNames[page.labId]} official site`, 'original_official_model_release_page', result, 'Official release-page retrieval attempted; unavailable state retained.');
  const text = result.status === 200 ? result.bytes.toString('utf8').toLowerCase() : '';
  const matchedNeedle = page.needles.find((needle) => text.includes(needle.toLowerCase()));
  officialPageEvidence.push({ ...page, sourceId: source.id, source, matchedNeedle: matchedNeedle ?? null, retrievedAt: result.retrievedAt, status: result.status });
});
for (const page of officialPageEvidence) {
  if (!page.matchedNeedle || !page.source.snapshotPath) continue;
  const exact = models.find((model) => model.labId === page.labId && model.name.toLowerCase().includes(page.currentName.toLowerCase()));
  if (exact) {
    exact.originalSourceUrl = page.url;
    exact.originalSourceStatus = 'exact current model version matched in captured official release/model page';
    exact.sourceEvidence = { sourceId: page.source.id, identityBasis: 'captured original vendor release/model page', primaryReleaseVerified: true, verifiedClaim: page.matchedNeedle };
    if (!exact.aliases.some((alias) => alias.name === exact.catalogRevision && alias.sourceId === page.source.id)) exact.aliases.push({ name: exact.catalogRevision, sourceId: page.source.id, aliasType: 'version corroborated by original vendor release page' });
    continue;
  }
  if (page.labId === 'meta') {
    const version = page.currentName.replace(/^Muse Spark\s*/i, '');
    const id = `meta:muse-spark-${version.replaceAll('.', '-')}`;
    if (modelRecords.has(id)) continue;
    const model = {
      id, catalogId: `meta/muse-spark-${version}`, catalogRevision: `Muse Spark ${version}`,
      labId: 'meta', labName: 'Meta', name: `Muse Spark ${version}`,
      releaseDate: null, releaseDateStatus: 'official page confirms version label; release date not extracted', catalogListedAt: null,
      parameterCount: null, activatedParameterCount: null, parameterEvidenceId: null,
      originalSourceUrl: page.url, originalSourceStatus: 'exact version string found in captured Meta page',
      catalogSourceId: page.source.id, aliases: [{ name: `Muse Spark ${version}`, sourceId: page.source.id, aliasType: 'Meta official product/model name' }],
      modalities: { input: null, output: null, raw: null }, baseOrInstruct: null,
      thinking: { supported: null, mandatory: null, defaultEnabled: null, supportedEfforts: null, defaultEffort: null },
      weightsAvailability: 'unknown; parameters and weights are not disclosed in captured source',
      sourceEvidence: { sourceId: page.source.id, identityBasis: 'captured original Meta model page', primaryReleaseVerified: true, verifiedClaim: page.matchedNeedle },
    };
    models.push(model); modelRecords.set(id, model);
  }
}

for (const row of providerRows) {
  const modelId = `or:${row.canonical_slug}`;
  const model = modelRecords.get(modelId);
  const endpointRecord = endpointResults.get(modelId);
  const endpoints = endpointRecord?.endpoints ?? [];
  const usedEndpoints = endpoints.length ? endpoints : [null];
  for (const endpoint of usedEndpoints) {
    const providerName = endpoint?.provider_name ?? null;
    const tag = endpoint?.tag ?? null;
    const quantization = endpoint?.quantization && endpoint.quantization.toLowerCase() !== 'unknown' ? endpoint.quantization : null;
    const endpointIdentity = endpoint ? endpointIdentitySha256(endpoint) : null;
    const configId = `${modelId}::${safeName(`${providerName ?? 'provider-unknown'}-${tag ?? row.id}-${quantization ?? 'unknown'}-${endpointIdentity ?? ''}`)}`;
    const config = {
      id: configId, modelId,
      revision: { canonicalSlug: row.canonical_slug, serviceId: row.id },
      variant: row.id.endsWith(':batch') ? 'batch service alias' : 'provider API route',
      baseOrInstruct: model.baseOrInstruct,
      reasoningMode: model.thinking,
      providerEndpoint: endpoint ? { gateway: 'OpenRouter', provider: providerName, modelRouteId: endpoint.model_id ?? row.id, endpointTag: tag, identitySha256: endpointIdentity, endpointSourceUrl: endpointRecord.source.url } : { gateway: 'OpenRouter', provider: null, modelRouteId: row.id, endpointTag: null, identitySha256: null, endpointSourceUrl: endpointRecord?.source?.url ?? null },
      quantization,
      modalities: model.modalities,
      harness: null, testedHarness: null, tools: null,
      toolSupport: Array.isArray(endpoint?.supported_parameters) ? endpoint.supported_parameters.includes('tools') : (row.supported_parameters ?? []).includes('tools'),
      supportedParameters: endpoint?.supported_parameters ?? row.supported_parameters ?? [],
      reasoningBudgetTokens: null, contextWindowTokens: endpoint?.context_length ?? row.context_length ?? null,
      testCondition: null,
      configurationEvidenceSourceIds: [openRouterSource.id, ...(endpointRecord?.source?.snapshotPath ? [endpointRecord.source.id] : [])],
      sourceClass: 'provider API route metadata; not a tested benchmark harness',
    };
    if (!configsByKey.has(configId)) { configurations.push(config); configsByKey.set(configId, config); }
    const rates = endpoint?.pricing ?? row.pricing ?? {};
    const priceSource = endpoints.length > 0 && endpointRecord?.source?.snapshotPath ? endpointRecord.source : openRouterSource;
    const routePriceSha = endpoint ? endpointPriceSha256(endpoint) : sha256(Buffer.from(JSON.stringify({ prompt: rates.prompt ?? null, completion: rates.completion ?? null, cacheRead: rates.input_cache_read ?? null, cacheWrite: rates.input_cache_write ?? null, reasoning: rates.internal_reasoning ?? null })));
    const priceId = `price:${configId}:${routePriceSha.slice(0, 12)}`;
    if (pricingIds.has(priceId)) continue;
    pricingIds.add(priceId);
    pricing.push({
      id: priceId, modelId, configurationId: configId,
      provider: providerName, currency: 'USD', unit: 'per token', sourceUnit: 'USD per token',
      input: parseNonnegativeRate(rates.prompt), cachedInputRead: parseNonnegativeRate(rates.input_cache_read),
      cachedInputWrite: parseNonnegativeRate(rates.input_cache_write), output: parseNonnegativeRate(rates.completion),
      reasoning: parseNonnegativeRate(rates.internal_reasoning), reasoningBilling: rates.internal_reasoning === undefined || parseNonnegativeRate(rates.internal_reasoning) === null ? 'unknown; source has no separate nonnegative reasoning rate' : 'separate source rate field',
      cache: { implicitCaching: endpoint?.supports_implicit_caching ?? null, readPriceSourceField: rates.input_cache_read === undefined ? null : 'input_cache_read', writePriceSourceField: rates.input_cache_write === undefined ? null : 'input_cache_write' },
      tiers: Array.isArray(rates.overrides) ? rates.overrides : [],
      sourceEndpointSha256: endpoint ? routePriceSha : null,
      sourceConflictId: null,
      sourceId: priceSource.id, sourceUrl: priceSource.url, retrievedAt: priceSource.retrievedAt, effectiveAt: null,
      sourceClass: 'OpenRouter routed provider API price; not origin-provider direct list price',
    });
  }
}
const pricesByConfiguration = new Map();
for (const row of pricing) {
  if (!pricesByConfiguration.has(row.configurationId)) pricesByConfiguration.set(row.configurationId, []);
  pricesByConfiguration.get(row.configurationId).push(row);
}
for (const [configurationId, rows] of pricesByConfiguration) {
  if (new Set(rows.map((row) => row.sourceEndpointSha256 ?? JSON.stringify([row.input,row.cachedInputRead,row.cachedInputWrite,row.output,row.reasoning]))).size < 2) continue;
  const conflictId = `price-conflict:${sha256(Buffer.from(configurationId)).slice(0, 12)}`;
  for (const row of rows) row.sourceConflictId = conflictId;
}

const benchmarkCatalogUrl = 'https://huggingface.co/api/datasets?filter=benchmark:official&limit=100';
const benchmarkCatalogResult = await safeFetch(benchmarkCatalogUrl, { timeout: 30000 });
if (benchmarkCatalogResult.status !== 200) throw new Error(`Hugging Face benchmark catalog retrieval failed: ${benchmarkCatalogResult.status}`);
const benchmarkCatalogSource = await sourceForSaved({ id: 'hf-official-benchmark-catalog', url: benchmarkCatalogUrl, publisher: 'Hugging Face Hub', sourceClass: 'public_benchmark_source_catalogue', bytes: benchmarkCatalogResult.bytes, retrievedAt: benchmarkCatalogResult.retrievedAt, httpStatus: 200, contentType: benchmarkCatalogResult.contentType, reuseStatus: 'Public benchmark discovery metadata; descriptions not copied into product results.' });
const benchmarkCatalog = JSON.parse(benchmarkCatalogResult.bytes.toString('utf8'));
const datasetEntries = new Map(benchmarkCatalog.map((row) => [row.id, row]));
const mappedDatasetIds = Object.keys(hfDatasetToSuite).filter((id) => datasetEntries.has(id));
console.log(`HF public benchmark catalogue has ${benchmarkCatalog.length} official-tagged datasets; checking ${mappedDatasetIds.length} mapped registered identities.`);
const leaderboardRows = new Map();
const leaderboardSources = new Map();
const evalSpecSources = new Map();
await mapLimit(mappedDatasetIds, 6, async (datasetId) => {
  const suiteId = hfDatasetToSuite[datasetId].suiteId;
  const boardUrl = `https://huggingface.co/api/datasets/${datasetId}/leaderboard`;
  const result = await safeFetch(boardUrl, { timeout: 30000 });
  if (result.status === 200) {
    const originalPayload = JSON.parse(result.bytes.toString('utf8'));
    const projected = projectLeaderboardRows(originalPayload, datasetId);
    const bytes = safeJson({ datasetId, retrievedAt: result.retrievedAt, projectionOf: boardUrl, fields: ['rank','filename','value','verified','source','modelId','pullRequest','notes','lower_is_better','num_parameters'], rows: projected });
    const source = await sourceForSaved({ id: `hf-leaderboard-${safeName(datasetId)}`, url: boardUrl, publisher: 'Hugging Face Hub benchmark dataset', sourceClass: 'public_leaderboard_structured_projection', bytes, retrievedAt: result.retrievedAt, httpStatus: result.status, contentType: 'application/json', reuseStatus: 'Filtered structured score rows. Author account/profile fields, follower counts, avatars and service plans are excluded.', projectedFrom: boardUrl, permittedFields: ['rank','filename','value','verified','source','modelId','pullRequest','notes','lower_is_better','num_parameters'] });
    leaderboardRows.set(datasetId, projected);
    leaderboardSources.set(datasetId, source);
  } else {
    const source = sourceForFailure(`hf-leaderboard-${safeName(datasetId)}`, boardUrl, 'Hugging Face Hub benchmark dataset', 'public_leaderboard_structured_projection', result, 'Leaderboard lookup attempted; unavailable response retained.');
    leaderboardRows.set(datasetId, []); leaderboardSources.set(datasetId, source);
  }
  const specUrl = `https://huggingface.co/datasets/${datasetId}/resolve/main/eval.yaml`;
  const spec = await safeFetch(specUrl, { timeout: 20000 });
  if (spec.status === 200) {
    const source = await sourceForSaved({ id: `hf-eval-spec-${safeName(datasetId)}`, url: specUrl, publisher: 'Hugging Face Hub benchmark dataset', sourceClass: 'original_benchmark_evaluation_spec', bytes: spec.bytes, retrievedAt: spec.retrievedAt, httpStatus: spec.status, contentType: spec.contentType, reuseStatus: 'Original public task/split specification; licence/redistribution remains source-specific.' });
    evalSpecSources.set(datasetId, { source, text: spec.bytes.toString('utf8') });
  } else {
    const source = sourceForFailure(`hf-eval-spec-${safeName(datasetId)}`, specUrl, 'Hugging Face Hub benchmark dataset', 'original_benchmark_evaluation_spec', spec, 'Evaluation specification lookup attempted; access/result status retained.');
    evalSpecSources.set(datasetId, { source, text: null });
  }
});

function splitFromSpec(text, taskId) {
  if (!text) return { split: null, framework: null, taskId: taskId ?? null };
  const framework = text.match(/^evaluation_framework:\s*([^\s#]+)/m)?.[1] ?? null;
  const tasks = [...text.matchAll(/^\s*- id:\s*([^\s#]+)[\s\S]*?^\s*split:\s*([^\s#]+)/gm)];
  const task = tasks.find((m) => !taskId || m[1] === taskId) ?? tasks[0];
  return { split: task?.[2] ?? null, framework, taskId: task?.[1] ?? taskId ?? null };
}
function sourceBlockEvidenceMatches(parsed, boardRow) {
  return parsed.value === Number(boardRow.value);
}
function cardUrl(modelId, revision, filename) {
  return `https://huggingface.co/${modelId}/resolve/${encodeURIComponent(revision)}/${filename.split('/').map(encodeURIComponent).join('/')}`;
}
const modelCardTasks = new Map();
async function fetchResultCard(row) {
  const ref = Number.isInteger(row.pullRequest) ? `refs/pr/${row.pullRequest}` : 'main';
  const cacheKey = `${row.modelId}|${ref}|${row.filename}`;
  if (modelCardTasks.has(cacheKey)) return modelCardTasks.get(cacheKey);
  const task = (async () => {
    const url = cardUrl(row.modelId, ref, row.filename);
    const result = await safeFetch(url, { timeout: 25000 });
    if (result.status !== 200) {
      const source = sourceForFailure(`hf-result-${safeName(`${row.modelId}-${ref}-${row.filename}`)}`, url, 'Hugging Face Hub model repository', 'original_model_card_eval_results', result, 'Public model-card result file retrieval attempted; unavailable state retained.');
      return { source, result, parsed: [], text: null, ref };
    }
    let actualResult = result;
    let actualUrl = url;
    if (/^[a-f0-9]{40}$/i.test(result.repoCommit ?? '')) {
      const pinnedUrl = cardUrl(row.modelId, result.repoCommit, row.filename);
      const pinnedResult = await safeFetch(pinnedUrl, { timeout: 25000 });
      if (pinnedResult.status === 200 && pinnedResult.sha256 === result.sha256) {
        actualResult = pinnedResult;
        actualUrl = pinnedUrl;
      } else {
        receipts.push({ id: `hf-result-pin-${safeName(`${row.modelId}-${ref}-${row.filename}`)}`, url: pinnedUrl, status: pinnedResult.status, finalUrl: pinnedResult.finalUrl, retrievedAt: pinnedResult.retrievedAt, error: pinnedResult.status === 200 ? 'Pinned commit bytes differed from branch retrieval; original branch snapshot retained.' : pinnedResult.error ?? `HTTP ${pinnedResult.status}`, httpStatus: pinnedResult.status, contentType: pinnedResult.contentType, bodyBytes: pinnedResult.bytes.length, bodySha256: pinnedResult.sha256 });
      }
    }
    const text = actualResult.bytes.toString('utf8');
    const parsed = parseEvalResults(text);
    const saved = await sourceForSaved({ id: `hf-result-${safeName(`${row.modelId}-${ref}-${row.filename}`)}`, url: actualUrl, publisher: 'Hugging Face Hub model repository', sourceClass: 'original_model_card_eval_results', bytes: actualResult.bytes, retrievedAt: actualResult.retrievedAt, httpStatus: actualResult.status, contentType: actualResult.contentType, reuseStatus: 'Exact public structured model-card evaluation payload retained; redistribution licence is model-specific and not presumed.', resolvedRevision: actualResult.repoCommit ?? result.repoCommit ?? null, finalUrl: actualResult.finalUrl });
    return { source: saved, result: actualResult, parsed, text, ref };
  })();
  modelCardTasks.set(cacheKey, task);
  return task;
}

const selectedRows = [];
await mapLimit(mappedDatasetIds, 5, async (datasetId) => {
  const suiteInfo = hfDatasetToSuite[datasetId];
  const rows = leaderboardRows.get(datasetId) ?? [];
  const seenModels = new Set();
  let admittedRows = 0;
  for (const row of rows) {
    if (!row.modelId || typeof row.value !== 'number' || !row.filename?.startsWith('.eval_results/')) continue;
    if (seenModels.has(row.modelId)) continue;
    const card = await fetchResultCard(row);
    const matchingBlocks = card.parsed.filter((block) => block.datasetId.toLowerCase() === datasetId.toLowerCase()
      && (!suiteInfo.taskIds || suiteInfo.taskIds.includes(block.taskId))
      && sourceBlockEvidenceMatches(block, row));
    if (!matchingBlocks.length) continue;
    selectedRows.push({ datasetId, row, suiteId: suiteInfo.suiteId, card, matchingBlocks, boardSource: leaderboardSources.get(datasetId) });
    seenModels.add(row.modelId);
    admittedRows++;
    if (admittedRows >= 2) break;
  }
});
console.log(`Matched ${selectedRows.length} leaderboard rows to exact numeric entries in model-card YAML.`);

// Preserve every mapped result block in the exact retrieved YAML file. A board
// row is joined only when model, file and numeric value match; additional
// values remain model-card claims without a fabricated board join.
const admittedCardIds = new Set();
for (const selection of selectedRows) {
  const { datasetId, row, card, boardSource } = selection;
  const hfId = row.modelId;
  let modelId = modelByHfAlias(hfId);
  if (!modelId) {
    const modelCard = await fetchHfModel(hfId);
    modelId = `hf:${hfId}`;
    if (!modelRecords.has(modelId)) {
      const meta = modelCard.metadata ?? {};
      const evidenceSource = modelCard.readmeSource?.snapshotPath ? modelCard.readmeSource : modelCard.source;
      const model = {
        id: modelId, catalogId: hfId, catalogRevision: meta.sha ?? card.result.repoCommit ?? null,
        labId: labForModelId(hfId), labName: labNames[labForModelId(hfId)] ?? labNames.other, name: hfId.split('/').at(-1),
        releaseDate: null, releaseDateStatus: 'unknown; benchmark card does not declare model release date',
        catalogListedAt: meta.lastModified ?? null,
        parameterCount: Number.isFinite(meta.safetensors?.total) ? meta.safetensors.total : null,
        activatedParameterCount: null, parameterEvidenceId: Number.isFinite(meta.safetensors?.total) ? modelCard.source.id : null,
        originalSourceUrl: `https://huggingface.co/${hfId}`, originalSourceStatus: evidenceSource.snapshotPath ? 'model card captured' : 'model API metadata only or unavailable',
        catalogSourceId: evidenceSource.id, aliases: [{ name: hfId, sourceId: evidenceSource.id, aliasType: 'model repository id' }],
        modalities: { input: null, output: null, raw: meta.pipeline_tag ?? null }, baseOrInstruct: null,
        thinking: { supported: null, mandatory: null, defaultEnabled: null, supportedEfforts: null, defaultEffort: null },
        weightsAvailability: meta.private === false ? (meta.gated ? 'gated; weights not downloaded' : 'public repository; weights not downloaded') : 'unknown',
        sourceEvidence: { sourceId: evidenceSource.id, identityBasis: 'model repository API and public card', primaryReleaseVerified: Boolean(modelCard.readmeSource?.snapshotPath) },
      };
      models.push(model); modelRecords.set(modelId, model); providerModelByAlias.set(hfId.toLowerCase(), modelId); modelEvidenceSources.set(modelId, modelCard);
    }
  }
  observedModelIds.add(modelId);
  const model = modelRecords.get(modelId);
  const modelCardMeta = hfModelMetadata.get(hfId)?.metadata;
  const targetSha = card.result.repoCommit ?? modelCardMeta?.sha ?? null;
  const candidateClaims = card.parsed.filter((block) => Object.hasOwn(hfDatasetToSuite, block.datasetId) || hfDatasetToSuite[block.datasetId]);
  for (const block of candidateClaims) {
    const mapping = hfDatasetToSuite[block.datasetId];
    if (!mapping || (mapping.taskIds && !mapping.taskIds.includes(block.taskId))) continue;
    const suiteId = mapping.suiteId;
    const suite = suiteById.get(suiteId);
    if (!suite) continue;
    const claimBoardRow = (leaderboardRows.get(block.datasetId) ?? []).find((candidate) => candidate.modelId === hfId
      && candidate.filename === row.filename && Number(candidate.value) === block.value);
    const claimBoardSource = claimBoardRow ? leaderboardSources.get(block.datasetId) : null;
    const hasBoardJoin = Boolean(claimBoardRow && claimBoardSource?.snapshotPath);
    const splitInfo = splitFromSpec(evalSpecSources.get(block.datasetId)?.text ?? null, block.taskId);
    const evidenceConfig = {
      harness: null, testedHarness: null, tools: null, testCondition: block.notes ?? claimBoardRow?.notes ?? null,
    };
    if (/with tools/i.test(block.notes ?? claimBoardRow?.notes ?? '')) evidenceConfig.tools = true;
    if (/no tools|without tools/i.test(block.notes ?? claimBoardRow?.notes ?? '')) evidenceConfig.tools = false;
    const harnessText = `${block.notes ?? ''} ${claimBoardRow?.notes ?? ''}`;
    const harnessMatch = harnessText.match(/(?:harness(?:\s*[:=])?\s*)([^,;.]+)/i) ?? harnessText.match(/(mini-swe-agent|inspect-ai|openhands|harbor|deepseek harness)/i);
    evidenceConfig.harness = harnessMatch?.[1]?.trim() ?? null;
    evidenceConfig.testedHarness = evidenceConfig.harness;
    const conditionKey = sha256(Buffer.from(`${block.taskId ?? ''}|${block.notes ?? ''}|${claimBoardRow?.notes ?? ''}`)).slice(0, 10);
    const configId = `${modelId}::${safeName(card.ref)}::${safeName(suiteId)}::${conditionKey}`;
    if (!configsByKey.has(configId)) {
      const config = {
        id: configId, modelId,
        revision: { repository: hfId, ref: card.ref, resolvedCommit: targetSha },
        variant: 'model-card reported evaluation configuration',
        baseOrInstruct: null, reasoningMode: null, providerEndpoint: null, quantization: null,
        modalities: model.modalities, harness: evidenceConfig.harness, testedHarness: evidenceConfig.testedHarness,
        tools: evidenceConfig.tools, toolSupport: null, reasoningBudgetTokens: null, contextWindowTokens: null,
        testCondition: evidenceConfig.testCondition,
        configurationEvidenceSourceIds: [card.source.id, ...(modelEvidenceSources.get(modelId)?.source?.id ? [modelEvidenceSources.get(modelId).source.id] : [])],
        sourceClass: 'reported tested configuration; unspecified fields remain unknown',
      };
      configurations.push(config); configsByKey.set(configId, config);
    }
    const existingObs = observations.find((item) => item.resultSourceId === card.source.id && item.suiteId === suiteId && item.rawValue === block.value && item.configurationId === configId);
    if (existingObs) continue;
    const sourceIdsForUnit = [card.source.id, ...(hasBoardJoin ? [claimBoardSource.id] : []), ...(evalSpecSources.get(block.datasetId)?.source?.snapshotPath ? [evalSpecSources.get(block.datasetId).source.id] : [])];
    let unitEvidence;
    let normalization;
    if (block.value > 1 && block.value <= 100) {
      unitEvidence = { status: 'inferred', label: 'percentage points', statement: 'Inference from a 0–100 public leaderboard/model-card score scale; captured result payload does not label its unit.', sourceIds: sourceIdsForUnit };
      normalization = normalizeScore(block.value, 'percentage points', suite.metric);
    } else if (block.value >= 0 && block.value <= 1 && suite.metric.min === 0 && suite.metric.max === 1) {
      unitEvidence = { status: 'inferred', label: 'fraction', statement: 'Inference from the benchmark registry normalized metric range 0–1; captured result payload does not label its unit.', sourceIds: sourceIdsForUnit };
      normalization = normalizeScore(block.value, 'fraction', suite.metric);
    } else {
      unitEvidence = { status: 'unknown', label: null, statement: 'Captured leaderboard/model-card payload does not label the numeric unit; scale is not safely recoverable.', sourceIds: sourceIdsForUnit };
      normalization = normalizeScore(block.value, null, suite.metric);
    }
    const obsId = `obs:${safeName(modelId)}:${suiteId}:${sha256(Buffer.from(`${card.source.sha256}:${block.value}:${block.taskId ?? ''}:${conditionKey}`)).slice(0, 12)}`;
    observations.push({
      id: obsId, modelId, configurationId: configId, suiteId,
      benchmarkFamilyId: suite.benchmarkFamilyId, benchmarkVersion: suite.version, taskId: splitInfo.taskId ?? block.taskId ?? null,
      metric: suite.metric.name, metricDirection: suite.metric.direction,
      rawValue: block.value, rawValueText: block.valueRaw, unit: unitEvidence,
      normalization: { status: normalization.formula ? 'normalized' : 'unavailable', formula: normalization.formula, targetUnit: normalization.targetUnit, normalizedValue: normalization.normalizedValue },
      resultDatasetId: block.datasetId, resultTaskId: block.taskId, resultModelRepository: hfId,
      split: splitInfo.split, evaluationFramework: splitInfo.framework,
      budget: null, grader: null,
      resultUrl: card.source.url, resultSourceId: card.source.id,
      leaderboardUrl: hasBoardJoin ? claimBoardSource.url : null, leaderboardSourceId: hasBoardJoin ? claimBoardSource.id : null,
      leaderboardValue: hasBoardJoin ? Number(claimBoardRow.value) : null,
      leaderboardModelId: hasBoardJoin ? claimBoardRow.modelId : null,
      leaderboardFilename: hasBoardJoin ? claimBoardRow.filename : null,
      leaderboardVerified: hasBoardJoin ? claimBoardRow.verified === true : null,
      leaderboardSubmission: hasBoardJoin ? {
        author: claimBoardRow.author ?? null,
        pullRequest: claimBoardRow.pullRequest ?? null,
        revisionRef: card.ref,
        revisionStatus: card.ref.startsWith('refs/pr/') ? 'unmerged model-repository pull request' : 'non-PR repository ref; publisher confirmation still required',
        verified: claimBoardRow.verified === true,
      } : null,
      externalSourceUrl: claimBoardRow?.source?.isExternal ? claimBoardRow.source.url ?? null : null,
      evaluatedAt: block.date, retrievedAt: card.source.retrievedAt,
      sourceClass: claimBoardRow?.source?.isExternal ? 'public model-card result; leaderboard also identifies external source' : hasBoardJoin ? 'model-card self-reported result; public leaderboard unverified' : 'model-card-only self-reported result; no matching public leaderboard row',
      sourceVerification: { huggingFaceVerified: claimBoardRow?.verified === true, independentReplication: false, status: !claimBoardRow ? 'No matching leaderboard row; model-card report only' : claimBoardRow.verified === true ? 'Hugging Face verified flag true; independent replication not established' : 'Hugging Face verified flag false' },
      notes: block.notes ?? claimBoardRow?.notes ?? null,
      claimsEvidenceId: card.source.id,
    });
  }
  admittedCardIds.add(card.source.id);
}

// Add an honest public task-price row only where the routed endpoint response
// has a documented rate. Null source fields remain null; no direct-origin rate
// is substituted for the routed price.

const registryLinkUrls = [...new Set(registry.suites.map((suite) => suite.url))];
const urlAudit = [];
await mapLimit(registryLinkUrls, 8, async (url) => {
  const cached = previousRegistryAudit.get(url);
  if (cached && cacheIsFresh(cached.retrievedAt)) registryAuditCacheHits++;
  const result = cached && cacheIsFresh(cached.retrievedAt) ? {
    status: cached.status, finalUrl: cached.finalUrl, contentType: cached.contentType, retrievedAt: cached.retrievedAt,
    bytes: { length: cached.bodyBytes }, sha256: cached.bodySha256, error: cached.error ?? null, cachedFromPreviousAudit: true,
  } : await safeFetch(url, { timeout: 12000, headers: { accept: 'text/html,application/json;q=0.9,*/*;q=0.7' } });
  urlAudit.push({ url, status: result.status, finalUrl: result.finalUrl, contentType: result.contentType, retrievedAt: result.retrievedAt, bodyBytes: result.bytes.length, bodySha256: result.status !== null ? result.sha256 : null, cachedFromPreviousAudit: result.cachedFromPreviousAudit ?? false, error: result.error ?? null, interpretation: result.status >= 200 && result.status < 400 ? 'reachable page; reachability does not establish that a model-specific results table exists' : [401,403].includes(result.status) ? 'blocked/restricted; result location not verified' : 'unavailable or failed; result location not verified' });
  if (result.status === null || result.status >= 400) await preserveFailureReceipt({ id: `registry-url-${sha256(Buffer.from(url)).slice(0, 12)}`, url, status: result.status, finalUrl: result.finalUrl, retrievedAt: result.retrievedAt, error: result.error ?? `HTTP ${result.status}`, httpStatus: result.status, contentType: result.contentType, bodyBytes: result.bytes.length, bodySha256: result.sha256 });
});
urlAudit.sort((a, b) => a.url.localeCompare(b.url));
const auditBytes = safeJson({ capturedAt: new Date().toISOString(), method: 'GET, redirect-following, response body SHA-256; page reachability is not treated as proof of a result table', suites: registry.suites.map((suite) => ({ suiteId: suite.id, url: suite.url, audit: urlAudit.find((x) => x.url === suite.url) ?? null, actualObservationResultUrls: observations.filter((x) => x.suiteId === suite.id).map((x) => x.resultUrl) })), uniqueUrls: urlAudit });
const registryAuditSource = await sourceForSaved({ id: 'registry-url-audit', url: 'internal://registry-url-audit', publisher: 'AxionBench retrieval audit over public source URLs', sourceClass: 'retrieval_audit_metadata', bytes: auditBytes, retrievedAt: new Date().toISOString(), httpStatus: 200, contentType: 'application/json', reuseStatus: 'Project-generated audit of real GET responses; body hashes only for general landing links.' });

// Add exact direct source URL checks for community board rows and external result links.
const usedUrls = new Set(observations.map((x) => x.resultUrl).concat(observations.map((x) => x.externalSourceUrl).filter(Boolean)));
const sourceUrlChecks = [];
await mapLimit([...usedUrls], 6, async (url) => {
  const cached = previousReceiptChecks.get(url);
  if (cached && cacheIsFresh(cached.retrievedAt)) {
    receiptCacheHits++;
    sourceUrlChecks.push({ ...cached, cachedFromPreviousReceipt: true });
  } else {
    const result = await safeFetch(url, { timeout: 20000 });
    sourceUrlChecks.push({ url, status: result.status, finalUrl: result.finalUrl, contentType: result.contentType, retrievedAt: result.retrievedAt, bodyBytes: result.bytes.length, bodySha256: result.sha256, cachedFromPreviousReceipt: false, error: result.error ?? null });
  }
});
const checkedSourceUrls = new Map(sourceUrlChecks.map((check) => [check.url, check]));
for (const observation of observations) {
  observation.resultUrlCheck = checkedSourceUrls.get(observation.resultUrl) ?? null;
  observation.externalSourceUrlCheck = observation.externalSourceUrl ? checkedSourceUrls.get(observation.externalSourceUrl) ?? null : null;
}

// Preserve failed and blocked retrieval receipts separately from successful
// content snapshots so a later rerun cannot erase this attempt's evidence.
const receiptBytes = safeJson({ capturedAt: new Date().toISOString(), failures: receipts, sourceUrlChecks, urlAudit: urlAudit.map(({ url, status, finalUrl, retrievedAt, contentType, bodyBytes, bodySha256, error }) => ({ url, status, finalUrl, retrievedAt, contentType, bodyBytes, bodySha256, error })) });
const receiptSaved = await saveBlob(receiptBytes, 'json');
const receiptSource = setSource({ id: 'retrieval-receipts', url: 'internal://public-source-retrieval-receipts', publisher: 'AxionBench retrieval process', sourceClass: 'retrieval_receipt', rights: 'Project-generated diagnostic evidence', snapshotPath: receiptSaved.path, snapshotSha256: receiptSaved.sha256, retrievedAt: new Date().toISOString(), httpStatus: 200, contentType: 'application/json' });
snapshotEntries.push({ id: receiptSource.id, ...receiptSaved, retrievedAt: receiptSource.retrievedAt, httpStatus: 200, contentType: 'application/json' });

// Every public route price remains attached to its routed provider source. For
// non-routed models the absence of a price is explicit in model coverage docs.
const verifiedLabs = new Set(models.filter((model) => model.sourceEvidence?.primaryReleaseVerified || model.originalSourceStatus === 'model card captured').map((model) => model.labId));
const observedSuiteIds = new Set(observations.map((row) => row.suiteId));
for (const suite of registry.suites) {
  if (observedSuiteIds.has(suite.id)) {
    suite.state = 'available';
    suite.reason = `Captured ${observations.filter((x) => x.suiteId === suite.id).length} public model-card result observation(s); see data/ingestion.json.`;
  }
}
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

const suiteCoverage = [...new Set(observations.map((x) => x.suiteId))].sort();
const familyCoverage = [...new Set(observations.map((x) => x.benchmarkFamilyId))].sort();
const domainCoverage = [...new Set(observations.map((x) => suiteById.get(x.suiteId)?.domain).filter(Boolean))].sort();
const sourceConflicts = [];
const observationsByModelSuite = new Map();
for (const observation of observations) {
  const key = `${observation.modelId}::${observation.suiteId}`;
  if (!observationsByModelSuite.has(key)) observationsByModelSuite.set(key, []);
  observationsByModelSuite.get(key).push(observation);
}
for (const [key, rows] of observationsByModelSuite) {
  const values = [...new Set(rows.map((row) => row.rawValue))];
  if (values.length < 2) continue;
  sourceConflicts.push({
    id: `conflict:${safeName(key)}`,
    modelId: rows[0].modelId,
    suiteId: rows[0].suiteId,
    benchmarkFamilyId: rows[0].benchmarkFamilyId,
    observationIds: rows.map((row) => row.id),
    values,
    configurations: [...new Set(rows.map((row) => row.configurationId))],
    status: 'retained; values are not collapsed',
    comparability: 'conditions differ or are unspecified; do not treat as same-run replication',
  });
}
const labCounts = Object.fromEntries([...new Set(models.map((x) => x.labId))].sort().map((labId) => [labId, models.filter((model) => model.labId === labId).length]));
const payload = {
  schemaVersion: 2,
  retrievedAt: new Date().toISOString(),
  status: suiteCoverage.length >= 15 && domainCoverage.length >= 8 && models.some((x) => x.labId === 'meta') && namedLabs.every((x) => models.some((m) => m.labId === x)) ? 'launch-coverage-reached-with-source-limitations' : 'partial-source-evidence',
  sourceAdapters: [
    { id: 'openrouter-model-catalogue', sourceId: openRouterSource.id, scope: 'full public routed model catalogue; model identity uses exact canonical slugs; service variants are endpoint configurations' },
    { id: 'huggingface-eval-results', sourceId: benchmarkCatalogSource.id, scope: 'public benchmark catalog, leaderboard structured projections and exact model-card .eval_results bytes' },
    { id: 'huggingface-model-cards', scope: 'catalogue aliases with public HF repositories plus benchmark-observation model ids; exact model-card files and filtered metadata are retained' },
  ],
  coverage: {
    registrySuites: registry.suites.length,
    registryFamilies: new Set(registry.suites.map((x) => x.benchmarkFamilyId)).size,
    registryDomains: registry.domains.length,
    observedSuites: suiteCoverage.length,
    observedSuiteIds: suiteCoverage,
    observedFamilies: familyCoverage.length,
    observedFamilyIds: familyCoverage,
    observedDomains: domainCoverage.length,
    observedDomainIds: domainCoverage,
    observations: observations.length,
    sourceConflictGroups: sourceConflicts.length,
    sourceConflictedObservations: sourceConflicts.reduce((sum, row) => sum + row.observationIds.length, 0),
    catalogueModels: models.length,
    modelsWithBenchmarks: observedModelIds.size,
    providerEndpointConfigurations: configurations.filter((x) => x.sourceClass.startsWith('provider API route metadata')).length,
    providerPriceRows: pricing.length,
    pricedEndpointRows: pricing.filter((x) => x.input !== null || x.output !== null).length,
    independentResultReplications: observations.filter((x) => x.sourceVerification.independentReplication).length,
    huggingFaceVerifiedRows: observations.filter((x) => x.sourceVerification.huggingFaceVerified).length,
    namedLabModelCounts: Object.fromEntries(namedLabs.map((labId) => [labId, labCounts[labId] ?? 0])),
    namedLabsWithCapturedOriginalCards: Object.fromEntries(namedLabs.map((labId) => [labId, verifiedLabs.has(labId)])),
    sourceUrlReferencesAudited: registry.suites.length,
    distinctRegistryUrlsAudited: urlAudit.length,
    unavailableRegistryUrls: urlAudit.filter((x) => x.status === null || x.status >= 400).length,
    unavailableObservationResultUrls: [...new Set(observations.filter((x) => x.resultUrlCheck?.status !== 200).map((x) => x.resultUrl))].length,
    unavailableExternalResultUrls: [...new Set(observations.filter((x) => x.externalSourceUrl && x.externalSourceUrlCheck?.status !== 200).map((x) => x.externalSourceUrl))].length,
  },
  providers: {
    openrouter: { sourceId: openRouterSource.id, endpointSources: endpointResults.size, endpointResponses: [...endpointResults.values()].filter((x) => x.result.status === 200).length, priceUnit: 'USD per token', priceScope: 'OpenRouter routed price, not origin-provider direct price' },
    directProviderPricing: 'Not admitted unless original public API price metadata was captured; absent direct prices are null/unavailable.',
  },
  unavailableAndUnknown: {
    modelReleaseDates: 'null unless sourced from an original release record; OpenRouter created is retained only as catalogListedAt',
    parameterCounts: 'null unless supported by public Hugging Face safetensors metadata; activated parameter counts remain null',
    resultUnits: 'unknown when neither eval.yaml, leaderboard projection nor .eval_results labels the unit; no implicit conversion is applied',
    harnessBudgetGraders: 'unknown/null unless reported in the model-card note; no evaluator protocol is invented',
    restrictedEvaluationSpecs: [...evalSpecSources].filter(([, value]) => !value.source.snapshotPath).map(([datasetId, value]) => ({ datasetId, status: value.source.httpStatus, reason: value.source.unavailableReason })),
    originalReleasePagesNotLocatedForProviderRows: models.filter((x) => !x.sourceEvidence?.primaryReleaseVerified && !x.originalSourceUrl).length,
  },
  models, configurations, sources, observations, sourceConflicts, pricing,
  receipts: { sourceId: receiptSource.id, path: receiptSource.snapshotPath, sha256: receiptSource.snapshotSha256 },
};
const countRows = (rows, key) => Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [value, rows.filter((row) => row[key] === value).length]));
const suiteCoverageDetail = registry.suites.filter((suite) => observations.some((observation) => observation.suiteId === suite.id)).map((suite) => ({
  suiteId: suite.id, benchmarkFamilyId: suite.benchmarkFamilyId, domain: suite.domain,
  observations: observations.filter((row) => row.suiteId === suite.id).length,
  distinctModels: new Set(observations.filter((row) => row.suiteId === suite.id).map((row) => row.modelId)).size,
  verifiedRows: observations.filter((row) => row.suiteId === suite.id && row.sourceVerification.huggingFaceVerified).length,
  independentReplications: observations.filter((row) => row.suiteId === suite.id && row.sourceVerification.independentReplication).length,
}));
const familyCoverageDetail = familyCoverage.map((familyId) => ({
  benchmarkFamilyId: familyId,
  suiteVariants: suiteCoverageDetail.filter((row) => row.benchmarkFamilyId === familyId).map((row) => row.suiteId),
  observations: observations.filter((row) => row.benchmarkFamilyId === familyId).length,
}));
const coverageReport = {
  retrievedAt: payload.retrievedAt,
  datasetStatus: payload.status,
  thresholds: { observedSuites: 15, observedDomains: 8, registrySuites: 30, registryDomains: 11 },
  registry: { suiteVersions: registry.suites.length, benchmarkFamilies: new Set(registry.suites.map((row) => row.benchmarkFamilyId)).size, capabilityDomains: registry.domains.length },
  observations: { total: observations.length, observedSuiteVersions: suiteCoverage.length, observedFamilies: familyCoverage.length, observedDomains: domainCoverage.length, byDomain: countRows(observations.map((row) => ({ domain: suiteById.get(row.suiteId).domain })), 'domain'), byUnitStatus: countRows(observations.map((row) => ({ status: row.unit.status })), 'status'), normalized: observations.filter((row) => row.normalization.status === 'normalized').length, unitUnavailable: observations.filter((row) => row.unit.status === 'unknown').length, independentlyReplicated: observations.filter((row) => row.sourceVerification.independentReplication).length, huggingFaceVerifiedFlag: observations.filter((row) => row.sourceVerification.huggingFaceVerified).length },
  suiteVersions: suiteCoverageDetail,
  benchmarkFamilies: familyCoverageDetail,
  models: { total: models.length, withObservations: observedModelIds.size, byLab: labCounts, labsWithOriginalCards: Object.fromEntries(namedLabs.map((id) => [id, verifiedLabs.has(id)])), primaryCardLabs: verifiedLabs.size },
  providerApi: { endpointConfigurations: configurations.filter((row) => row.sourceClass.startsWith('provider API route metadata')).length, priceRows: pricing.length, rowsWithAnyPrice: pricing.filter((row) => row.input !== null || row.output !== null).length, nullCounts: Object.fromEntries(['input','cachedInputRead','cachedInputWrite','output','reasoning'].map((field) => [field, pricing.filter((row) => row[field] === null).length])), sourceUnit: 'USD per token; prices are OpenRouter routes, not direct origin-provider tariffs' },
  sourceClasses: countRows(sources, 'sourceClass'),
  sourceConflicts: { groups: sourceConflicts.length, observations: sourceConflicts.reduce((sum, row) => sum + row.observationIds.length, 0), ids: sourceConflicts.map((row) => row.id) },
  sourceAvailability: { registryUrlReferences: registry.suites.length, distinctRegistryUrls: urlAudit.length, unavailableDistinctRegistryUrls: urlAudit.filter((row) => row.status === null || row.status >= 400).map((row) => ({ url: row.url, status: row.status, error: row.error })), resultUrlRechecksFailed: sourceUrlChecks.filter((row) => row.status !== 200).map((row) => ({ url: row.url, status: row.status, error: row.error })), specsUnavailable: payload.unavailableAndUnknown.restrictedEvaluationSpecs },
};
const manifestPath = `${sourceRoot}/manifest.json`;
const missingLastGoodSuites = previousData?.coverage?.observedSuiteIds?.filter((suiteId) => !suiteCoverage.includes(suiteId)) ?? [];
const manifest = { schemaVersion: 1, capturedAt: payload.retrievedAt, adapterRun: 'scripts/ingest-data.mjs', sourceCount: sources.length, snapshotCount: snapshotEntries.length, snapshots: snapshotEntries, receiptPath: receiptSource.snapshotPath, receiptSha256: receiptSource.snapshotSha256, status: missingLastGoodSuites.length ? 'candidate-not-promoted-last-good-retained' : 'current-capture-promoted', retainedPreviousDatasetStatus: previousData ? 'present' : 'none', missingPreviouslyObservedSuites: missingLastGoodSuites };
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (missingLastGoodSuites.length) {
  const candidateBytes = safeJson(payload);
  const candidatePath = `${sourceRoot}/candidate-ingestion-${sha256(candidateBytes).slice(0, 12)}.json`;
  await writeFile(candidatePath, candidateBytes);
  const candidateReportPath = `${sourceRoot}/candidate-coverage-report-${sha256(safeJson(coverageReport)).slice(0, 12)}.json`;
  await writeFile(candidateReportPath, safeJson(coverageReport));
  manifest.candidatePath = candidatePath;
  manifest.candidateCoverageReportPath = candidateReportPath;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.error(`Refresh incomplete; retained last-good data/ingestion.json. Candidate capture omitted ${missingLastGoodSuites.length} previously observed suites: ${missingLastGoodSuites.join(', ')}.`);
  process.exitCode = 1;
} else {
  await writeAtomic(ingestionPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeAtomic('data/coverage-report.json', `${JSON.stringify(coverageReport, null, 2)}\n`);
  console.log(`Captured ${models.length} models, ${configurations.length} configurations, ${pricing.length} prices, ${observations.length} observations from ${suiteCoverage.length} suites / ${familyCoverage.length} families / ${domainCoverage.length} domains.`);
  console.log(`Named labs in catalogue: ${namedLabs.filter((x) => models.some((model) => model.labId === x)).length}/${namedLabs.length}; primary-card coverage ${verifiedLabs.size}/${namedLabs.length}.`);
  console.log(`Fresh snapshot/receipt reuse: ${sourceCacheHits} source payloads, ${registryAuditCacheHits} registry URL checks, ${receiptCacheHits} result URL checks.`);
}
