// Policy checks are pure so private ingestion and portable public validation use
// the same rules. A historical admission is not a current-default admission.
export const DAY = 86400000;
export const POLICY_VERSION = 'current-exact-v1';
export const SOURCE_TIERS = ['benchmark-authority', 'independent-evaluator', 'publisher-own', 'publisher-comparison-claim'];
export const modelLabel = (name) => name.replace(/^[^:]+:\s*/, '').trim().toLowerCase().replace(/[._\s-]+/g, '-');
export const exactReleaseMatch = (name, claim) => modelLabel(name) === modelLabel(claim);
export const fresh = (at, now, days = 7) => typeof at === 'string' && Number.isFinite(Date.parse(at))
  && Date.parse(at) <= now + 300000 && now - Date.parse(at) <= days * DAY;

export function currentAdmission(row, suite, identity, source, now = Date.now()) {
  const refuse = (reason) => ({ eligible: false, reason });
  if (!identity?.verified || !fresh(identity.evidence?.retrievedAt, now)) return refuse('exact primary model identity is unverified or stale');
  const policy = suite?.currentPolicy;
  if (!policy || policy.status !== 'current') return refuse(policy?.reason ?? 'current benchmark version has not been established');
  if (policy.saturated !== false) return refuse('saturation is confirmed or has not been assessed');
  if (!policy.maintained || !fresh(policy.maintenanceEvidence?.retrievedAt, now)) return refuse('active maintenance lacks fresh primary evidence');
  if (!policy.exactVersion || row.benchmarkVersion !== policy.exactVersion) return refuse('benchmark version does not match the exact admitted version');
  if (!row.configuration?.harnessRevision || !row.configuration.conditionsKnown) return refuse('exact harness revision or comparable conditions are missing');
  if (!['benchmark-authority', 'independent-evaluator'].includes(row.provenance)) return refuse('publisher claims are a separate dataset');
  if (!fresh(source?.verifiedAt ?? source?.retrievedAt, now)) return refuse('result source verification is stale');
  if (!Number.isFinite(row.value) || !['fraction', 'percent'].includes(row.rawUnit) || !row.unitEvidence) return refuse('documented comparable units or score are missing');
  if (!row.primary) return refuse('secondary metrics do not add independent capability evidence');
  return { eligible: true, reason: null };
}

// No coercion: null, empty strings and absent confidence never become zeroes.
export function nullableNumber(value, reason) {
  if (value === null) {
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('missing numeric value requires a reason');
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('finite number or explicit null required');
  return value;
}

export function validateNativeRatings(dataset, identities, now = Date.now()) {
  if (dataset.status !== 'available') throw new Error(`BridgeBench snapshot unavailable: ${dataset.reason}`);
  if (!dataset.snapshotVersion || !fresh(dataset.source?.verifiedAt ?? dataset.source?.retrievedAt, now)) throw new Error('BridgeBench snapshot identity or freshness missing');
  for (const hash of [dataset.source?.sha256, dataset.source?.guideSha256, dataset.rowsSha256]) {
    if (!/^[a-f0-9]{64}$/.test(hash ?? '')) throw new Error('BridgeBench source/guide/factual hash missing');
  }
  if (!dataset.rows?.length) throw new Error('BridgeBench factual snapshot has no rows');
  const seen = new Set();
  for (const row of dataset.rows) {
    if (!row.modelLabel || !row.configurationId || seen.has(row.id)) throw new Error('BridgeBench duplicate or incomplete row identity');
    seen.add(row.id);
    const url = new URL(row.resultUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname !== 'www.bridgebench.ai' || url.pathname === '/leaderboard' || url.pathname === '/') throw new Error('BridgeBench exact per-model result URL required');
    if (row.snapshotVersion !== dataset.snapshotVersion) throw new Error('BridgeBench incompatible snapshot/configuration version');
    if (row.configurationVersion === null ? !row.configurationReason : typeof row.configurationVersion !== 'string' || !row.configurationVersion.trim()) throw new Error('BridgeBench configuration version must be explicit or null with a reason');
    if (row.provenance !== 'publisher-rating' || row.unit !== 'native rating' || row.capabilityEligible !== false) throw new Error('BridgeBench native publisher ratings cannot be accuracy, Elo or capability evidence');
    if (row.modelKey !== null && (!identities.get(row.modelKey)?.verified || !exactReleaseMatch(row.modelLabel, identities.get(row.modelKey).name))) throw new Error('BridgeBench alias/version conflation');
    if (row.modelKey === null && !row.identityReason) throw new Error('BridgeBench unverified identities must remain visible with a reason');
    nullableNumber(row.overall, row.overallReason);
    if (!row.axes || !Object.keys(row.axes).length) throw new Error('BridgeBench per-axis ratings missing');
    for (const axis of Object.values(row.axes)) nullableNumber(axis.value, axis.reason);
    nullableNumber(row.confidence, row.confidenceReason);
    if (!row.methodologyLimit || !row.costSpeedTreatment) throw new Error('BridgeBench proprietary method and cost/speed limits must be explicit');
  }
  return dataset;
}
