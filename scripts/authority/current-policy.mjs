// Policy overlay for the current product. Historical admission and its audited
// mathematical floor are retained; current eligibility is a separate decision.
import assert from 'node:assert/strict';
import { sha256 } from './common.mjs';

export const HEX = /^[a-f0-9]{64}$/;
export const factualHash = row => {
  const { factualProjectionSha256, ...facts } = row;
  return sha256(Buffer.from(JSON.stringify(facts)));
};
export const observationFactualHash = row => {
  const facts = structuredClone(row);
  if (facts.currentPolicy) delete facts.currentPolicy.factualProjectionSha256;
  return sha256(Buffer.from(JSON.stringify(facts)));
};
const age = (at, now) => now - Date.parse(at);
const https = url => { const parsed = new URL(url); assert.equal(parsed.protocol, 'https:'); assert(!parsed.username && !parsed.password); };
const onlyKeys = (object, allowed, label) => {
  for (const key of Object.keys(object)) assert(allowed.split(' ').includes(key), `${label}: unpermitted fact field ${key}`);
};

export function validateCurrentEvidence(evidence, specs, { now = Date.now(), requireFresh = true } = {}) {
  assert.equal(evidence.schemaVersion, 'axionbench-current-evidence-v1');
  onlyKeys(evidence, 'schemaVersion verifiedAt sources models pricingVerification benchmarkMaintenance bridgeBench', 'current projection');
  const sources = new Map(evidence.sources.map(s => [s.id, s]));
  assert.equal(sources.size, evidence.sources.length, 'duplicate primary source');
  assert.equal(sources.size, specs.sources.length, 'missing primary retrieval outcome');
  for (const spec of specs.sources) {
    const source = sources.get(spec.id);
    onlyKeys(source, 'id url finalUrl httpStatus retrievedAt lastRetrievedAt verifiedAt sha256 bytes rights unavailableReason publisher sourceClass', 'primary response');
    assert(source, `missing primary outcome ${spec.id}`);
    assert.equal(source.url, spec.url, `primary URL changed ${spec.id}`);
    assert.equal(source.publisher, spec.publisher, 'publisher attribution changed');
    assert.equal(source.sourceClass, spec.sourceClass, 'source-tier mixing');
    https(source.url);
    assert(source.sha256 === null || HEX.test(source.sha256), 'malformed original hash');
    assert(Number.isFinite(Date.parse(source.retrievedAt)) && Number.isFinite(Date.parse(source.lastRetrievedAt)) && Number.isFinite(Date.parse(source.verifiedAt)), 'unknown source date');
    assert(age(source.lastRetrievedAt, now) >= -300000 && (!requireFresh || age(source.lastRetrievedAt, now) <= 7 * 86400000), `stale primary retrieval ${spec.id}`);
    assert(age(source.verifiedAt, now) >= -300000, 'verification date is in the future');
    assert(Date.parse(source.lastRetrievedAt) >= Date.parse(source.retrievedAt), 'later network retrieval predates original');
    assert(Date.parse(source.verifiedAt) >= Date.parse(source.lastRetrievedAt), 'byte verification predates last network retrieval');
    assert(Date.parse(source.verifiedAt) >= Date.parse(source.retrievedAt), 'verification predates original retrieval');
    if (source.httpStatus === 200) assert(HEX.test(source.sha256) && source.bytes > 0, 'successful source requires original bytes/hash');
    else assert(source.unavailableReason, 'failed primary retrieval needs a reason');
    assert(source.rights, 'reuse limits missing');
  }
  assert.equal(new Set(evidence.models.map(m => m.key)).size, evidence.models.length, 'alias/version conflation');
  assert.equal(evidence.models.length, specs.models.length, 'requested identities disappeared');
  for (const spec of specs.models) {
    const model = evidence.models.find(m => m.key === spec.key);
    assert(model, `missing request ${spec.key}`);
    onlyKeys(model, 'key name labId apiId selection lifecycle sourceId identityVerified verifiedClaim identityReason originalSourceUrl originalSourceSha256 retrievedAt verifiedAt releaseDate parameters confidence apiPrice missingReasons factualProjectionSha256', 'model projection');
    onlyKeys(model.missingReasons, 'releaseDate parameters confidence apiPrice', 'model unknown reasons');
    for (const field of ['name', 'labId', 'apiId', 'sourceId']) assert.equal(model[field], spec[field], `identity conflation: ${spec.key} ${field}`);
    const source = sources.get(model.sourceId);
    const primaryHosts = { openai: ['developers.openai.com'], anthropic: ['platform.claude.com'], google: ['ai.google.dev'],
      meta: ['dev.meta.ai'], xai: ['docs.x.ai'], deepseek: ['api-docs.deepseek.com'],
      qwen: ['help.aliyun.com', 'huggingface.co'], moonshot: ['platform.moonshot.ai'], zai: ['docs.z.ai'], minimax: ['platform.minimax.io'] };
    assert(primaryHosts[model.labId]?.includes(new URL(source.url).hostname), 'identity is not from the requested lab primary source');
    if (new URL(source.url).hostname === 'huggingface.co') assert(new URL(source.url).pathname.startsWith('/Qwen/'), 'community mirror is not a Qwen primary card');
    assert.equal(model.originalSourceSha256, source.sha256);
    assert.equal(model.originalSourceUrl, source.url);
    assert.equal(model.retrievedAt, source.retrievedAt);
    assert.equal(model.verifiedAt, source.verifiedAt);
    assert.equal(model.factualProjectionSha256, factualHash(model), 'model factual projection altered');
    if (model.identityVerified) {
      assert.equal(source.httpStatus, 200);
      assert.equal(model.verifiedClaim, spec.claim, 'alias/version claim differs from requested exact identity');
      assert.notEqual(spec.lifecycle, 'unverified', 'an unspecified brand cannot verify an exact model');
    } else assert(model.identityReason && model.lifecycle === 'unverified', 'unverified name needs exclusion reason');
    for (const key of ['releaseDate', 'parameters', 'confidence', 'apiPrice']) {
      assert(Object.hasOwn(model, key), `unknown ${key} field disappeared`);
      if (model[key] === null) assert(model.missingReasons[key], `unknown ${key} needs reason`);
      if (['parameters', 'confidence', 'apiPrice'].includes(key)) assert.equal(model[key], null, `${key} cannot be invented by identity capture`);
    }
  }
  const defaults = evidence.models.filter(m => m.selection === 'default');
  assert(defaults.length >= 8 && defaults.length <= 12, 'curated default cohort must contain 8–12 exact models');
  assert(defaults.every(m => m.identityVerified && m.lifecycle === 'current'), 'stale or unverified default identity');
  const bridge = evidence.bridgeBench;
  onlyKeys(bridge, 'id name sourceId guideUrl version unit axes methodology scoringEligible normalization records', 'rating dataset');
  assert.equal(bridge.unit, 'BridgeBench rating');
  assert.equal(bridge.normalization, null, 'ratings are not accuracy or Elo');
  assert.equal(bridge.scoringEligible, false, 'cost/speed must not double-count as capability');
  const snapshot = sources.get(bridge.sourceId);
  assert.equal(bridge.version, 'snapshot:' + snapshot.sha256);
  assert.equal(snapshot.httpStatus, 200);
  assert.equal(sources.get('bridge-guide').url, bridge.guideUrl);
  assert(bridge.methodology.includes('unpublished'));
  assert.equal(new Set(bridge.records.map(r => r.modelKey)).size, bridge.records.length, 'duplicate BridgeBench identity');
  for (const row of bridge.records) {
    onlyKeys(row, 'id modelKey modelLabel modelLab publisher ratings provisional unit provenance version configuration resultUrl originalSourceSha256 snapshotSha256 retrievedAt verifiedAt evaluatedAt confidence identityVerified identityReason scoringEligible exclusion missingReasons factualProjectionSha256', 'rating projection');
    onlyKeys(row.configuration, 'harness revision reasoningEffort reason', 'rating configuration');
    onlyKeys(row.missingReasons, 'evaluatedAt confidence ratings', 'rating unknowns');
    assert.equal(row.version, bridge.version, 'incompatible rating snapshots mixed');
    assert.equal(row.snapshotSha256, snapshot.sha256);
    assert.equal(row.provenance, 'publisher-rating', 'publisher/measurement source-tier mixing');
    assert.equal(row.publisher, 'BridgeMind / BridgeBench', 'rating publisher is not the model lab');
    assert.equal(row.unit, bridge.unit);
    assert.equal(row.scoringEligible, false);
    assert(row.exclusion && row.configuration.reason);
    assert.equal(row.configuration.revision, null, 'unpublished harness must remain unknown');
    assert.equal(row.confidence, null, 'unpublished confidence must remain unknown');
    assert.equal(row.evaluatedAt, null, 'retrieval is not an evaluation date');
    https(row.resultUrl);
    const result = evidence.sources.find(s => s.url === row.resultUrl);
    assert(result?.httpStatus === 200 && result.sha256 === row.originalSourceSha256, 'exact per-model result response missing');
    assert.equal(row.retrievedAt, result.retrievedAt);
    assert.equal(row.verifiedAt, result.verifiedAt);
    assert.equal(row.factualProjectionSha256, factualHash(row), 'rating factual projection altered');
    const model = evidence.models.find(m => m.key === row.modelKey);
    assert.equal(row.identityVerified, model?.identityVerified === true);
    if (!row.identityVerified) assert(row.identityReason, 'unverified rating identity needs visible reason');
    assert.deepEqual(Object.keys(row.ratings).sort(), bridge.axes.map(a => a.id).sort());
    for (const [axis, value] of Object.entries(row.ratings)) {
      if (value === null) assert(row.missingReasons.ratings[axis], 'unknown rating needs reason');
      else {
        assert(Number.isFinite(value) && value >= 0, 'invalid native rating');
        assert(!Object.hasOwn(row.missingReasons.ratings, axis), 'missing-value zero or invented rating');
      }
    }
  }
  const price = evidence.pricingVerification;
  onlyKeys(price, 'sourceId originalSourceSha256 verificationSourceSha256 originalRetrievedAt verifiedAt recordCount factualProjectionSha256 outcome', 'tariff verification');
  assert.equal(price.sourceId, 'google-pricing');
  assert.equal(price.verificationSourceSha256, sources.get(price.sourceId).sha256);
  assert(HEX.test(price.originalSourceSha256) && HEX.test(price.factualProjectionSha256));
  assert(price.recordCount > 0 && price.outcome);
  for (const fact of evidence.benchmarkMaintenance) {
    onlyKeys(fact, 'sourceId versionId harnessVersion maintainedAt originalSourceSha256', 'maintenance projection');
    assert.equal(fact.originalSourceSha256, sources.get(fact.sourceId)?.sha256);
    assert(fact.versionId && fact.harnessVersion && Number.isFinite(Date.parse(fact.maintainedAt)));
  }
  return evidence;
}

export function validateBenchmarkPolicy(registry, evidence, { now = Date.now(), requireFresh = true } = {}) {
  const sources = new Map(evidence.sources.map(s => [s.id, s]));
  assert.equal(registry.currentPolicy.version, 'current-version-retired-v1');
  for (const suite of registry.suites) {
    const policy = suite.currentPolicy;
    assert(policy && ['current', 'version', 'retired', 'unverified'].includes(policy.lifecycle), `missing policy ${suite.id}`);
    assert(policy.reason && Object.hasOwn(policy, 'harnessVersion'), 'version/configuration status required');
    assert.equal(policy.familyId, suite.benchmarkFamilyId, 'policy must preserve family caps');
    if (policy.defaultEligible) {
      assert.equal(policy.lifecycle, 'current', 'historical benchmark admitted by default');
      assert.equal(policy.saturated, false, 'saturated version admitted by default');
      assert(policy.versionId && policy.harnessVersion, 'default requires exact benchmark/harness');
      assert(['fraction', 'percent'].includes(policy.unit), 'default requires supported capability units');
      const source = sources.get(policy.sourceId);
      assert(source?.httpStatus === 200 && source.sha256 === policy.originalSourceSha256, 'default benchmark primary proof missing');
      const maintenance = evidence.benchmarkMaintenance.find(f => f.sourceId === policy.sourceId && f.versionId === policy.versionId);
      assert(maintenance && maintenance.harnessVersion === policy.harnessVersion && maintenance.maintainedAt === policy.maintainedAt, 'default maintenance/configuration does not join to captured primary facts');
      assert(age(policy.maintainedAt, now) >= 0 && (!requireFresh || age(policy.maintainedAt, now) <= registry.currentPolicy.maintenanceDays * 86400000), 'stale default benchmark');
    }
  }
  return registry;
}

export function applyCurrentPolicy(authority, registry, evidence) {
  const identities = new Map(evidence.models.map(m => [m.key, m]));
  const policies = new Map(registry.suites.map(s => [s.id, s.currentPolicy]));
  const defaultModelKeys = evidence.models.filter(m => m.selection === 'default' && m.identityVerified && m.lifecycle === 'current').map(m => m.key);
  for (const model of authority.models) {
    const fact = identities.get(model.key);
    model.currentIdentity = fact ?? { identityVerified: false, lifecycle: 'unverified', identityReason: 'No current exact primary identity capture in the curated catalogue.' };
  }
  // Include qualified requests with no result; absence is not a zero score.
  for (const fact of evidence.models) if (!authority.models.some(m => m.key === fact.key)) {
    authority.models.push({ key: fact.key, name: fact.name, labels: [fact.name], labId: fact.labId, lab: null,
      organizations: [], country: null, region: 'unknown', regionNote: 'Country attribution has not been qualified for this identity.', currentIdentity: fact });
  }
  for (const row of authority.observations) {
    const fact = identities.get(row.modelKey);
    const policy = policies.get(row.suiteId);
    // BFCL publishes the precise evaluation commit and package. Other captures
    // cannot acquire a tested harness revision merely by joining a suite name.
    const harnessVersion = row.sourceId === 'bfcl-v4' ? 'f7cf735; bfcl-eval==2025.12.17' : null;
    const eligible = Boolean(fact?.identityVerified && ['current', 'version'].includes(fact.lifecycle) && policy?.defaultEligible && !policy.saturated && harnessVersion === policy.harnessVersion
      && row.admitted && row.primary && row.configuration.conditionsKnown
      && ['benchmark-authority', 'independent-evaluator'].includes(row.provenance));
    const source = authority.sources.find(s => s.id === row.sourceId);
    const recheck = evidence.sources.find(s => s.url === source?.url && s.sha256 === source?.sha256);
    row.currentPolicy = { scoringEligible: eligible, lifecycle: policy?.lifecycle ?? 'unverified',
      reason: eligible ? 'Exact primary identity, maintained benchmark version and documented tested configuration.'
        : !fact?.identityVerified ? 'Model identity has no exact current primary confirmation.'
          : !['current', 'version'].includes(fact.lifecycle) ? 'Archived model lifecycle; preserve the historical result outside current scoring.'
          : !policy?.defaultEligible ? policy?.reason ?? 'Benchmark version has no qualified current maintenance evidence.'
            : !harnessVersion ? 'Source names the harness but does not pin its tested revision.' : 'Source tier or conditions are not comparable.',
      versionId: policy?.versionId ?? null, harnessVersion,
      originalSourceSha256: source?.sha256 ?? null, retrievedAt: source?.retrievedAt ?? null,
      verifiedAt: recheck?.verifiedAt ?? source?.retrievedAt ?? null, resultUrl: row.resultUrl,
      verificationReason: recheck ? 'Original response bytes match the fresh primary retrieval.' : 'Original capture retained; no identical later response qualified.' };
    row.currentPolicy.factualProjectionSha256 = observationFactualHash(row);
  }
  authority.currentPolicy = { version: registry.currentPolicy.version, defaultModelKeys,
    evidenceSha256: sha256(Buffer.from(JSON.stringify(evidence))),
    missingResults: defaultModelKeys.filter(key => !authority.observations.some(r => r.modelKey === key && r.currentPolicy.scoringEligible)),
    coverage: { eligibleRows: authority.observations.filter(r => r.currentPolicy.scoringEligible).length,
      eligibleDefaultRows: authority.observations.filter(r => r.currentPolicy.scoringEligible && defaultModelKeys.includes(r.modelKey)).length,
      domains: [...new Set(authority.observations.filter(r => r.currentPolicy.scoringEligible).map(r => r.domain))].sort() } };
  return authority;
}

export function currentCoverage(authority, evidence) {
  const eligible = authority.observations.filter(r => r.currentPolicy.scoringEligible);
  return { requestedModels: evidence.models.length, primaryConfirmedModels: evidence.models.filter(m => m.identityVerified).length,
    defaultModels: authority.currentPolicy.defaultModelKeys.length,
    bridgeModels: evidence.bridgeBench.records.length, bridgeAxes: evidence.bridgeBench.axes.length,
    bridgePrimaryConfirmedModels: evidence.bridgeBench.records.filter(r => r.identityVerified).length,
    currentEligibleRows: eligible.length, currentEligibleDefaultRows: authority.currentPolicy.coverage.eligibleDefaultRows,
    currentEligibleDomains: [...new Set(eligible.map(r => r.domain))].sort(),
    historicalObservations: authority.observations.length, historicalCapabilitySuites: authority.floor.suites.length,
    historicalCapabilityDomains: authority.floor.domains.length,
    currentUncoveredDomains: ['reasoning', 'coding', 'agents', 'knowledge-work', 'science', 'multimodal'] };
}
