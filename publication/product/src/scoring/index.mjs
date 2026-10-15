export const METHOD_VERSION = 'axion-domain-v1';
export const DEFAULT_WEIGHTS = Object.freeze({ coding: 1, reasoning: 1, mathematics: 1, knowledge: 1, 'instruction-following': 1, 'long-context': 1, 'tool-use': 1, agents: 1, 'vision-documents': 1, factuality: 1, multilingual: 1 });
const SEPARATE = new Set(['safety', 'preference', 'professional', 'audio-video', 'latency', 'cost']);

export function normalize(value, metric) {
  if (!Number.isFinite(value) || !metric || !Number.isFinite(metric.min) || !Number.isFinite(metric.max) || metric.max <= metric.min || !['higher', 'lower'].includes(metric.direction)) return null;
  // Values outside the declared bounds are invalid, never silently clamped.
  if (value < metric.min || value > metric.max) return null;
  const scaled = (value - metric.min) / (metric.max - metric.min);
  return metric.direction === 'higher' ? scaled : 1 - scaled;
}

export function admission(observation, configuration) {
  if (observation.unit?.status !== 'documented' || observation.normalization?.status !== 'normalized') return { eligible: false, reason: 'unit is inferred or unknown' };
  if (configuration?.revision?.ref?.startsWith('refs/pr/')) return { eligible: false, reason: 'unmerged model-repository pull request' };
  if (observation.leaderboardVerified === false && !observation.sourceVerification?.independentReplication && !observation.publisherConfirmed) return { eligible: false, reason: 'unverified community submission without publisher/authority confirmation' };
  if (!observation.sourceVerification?.independentReplication && !observation.publisherConfirmed && !observation.sourceVerification?.huggingFaceVerified) return { eligible: false, reason: 'no authoritative or independent measurement confirmation' };
  return { eligible: true, reason: null };
}

// Raw percentage observations are normalized exactly once, by their documented
// normalization, before fraction-bounded registry scoring.
export function comparableValue(observation, metric) {
  if (metric && metric.max <= 1 && observation.normalization?.status === 'normalized' && observation.normalization.targetUnit === 'fraction') return observation.normalization.normalizedValue;
  return observation.rawValue;
}
export function validateWeights(weights) {
  const unknown = Object.keys(weights ?? {}).filter((k) => !Object.hasOwn(DEFAULT_WEIGHTS, k));
  if (unknown.length) throw new Error('weights outside the declared capability domains: ' + unknown.join(', '));
  if (Object.values(weights).some((v) => !Number.isFinite(v) || v < 0) || !Object.values(weights).some((v) => v > 0)) throw new Error('weights must be nonnegative with at least one positive value');
  return weights;
}
const knownConfiguration = (o, c) => !!o.configurationSignature || (!!c && [c.testedHarness ?? c.harness, c.testCondition].some((v) => v !== null && v !== undefined));
const configSignature = (c) => c ? JSON.stringify({variant:c.variant ?? null, baseOrInstruct:c.baseOrInstruct ?? null, reasoningMode:c.reasoningMode ?? null, quantization:c.quantization ?? null, harness:c.testedHarness ?? c.harness ?? null, tools:c.tools ?? null, reasoningBudgetTokens:c.reasoningBudgetTokens ?? null, testCondition:c.testCondition ?? null}) : 'configuration-unknown';
const panelKey = (o, c) => [o.suiteId, o.benchmarkVersion, o.taskId, o.split ?? 'unknown', o.metric, o.metricDirection, o.configurationSignature ?? configSignature(c)].join('|');
export function comparePanel(rows, { models, suites, configurations, weights = DEFAULT_WEIGHTS, independentOnly = false, cohort, conflictedObservationIds = new Set(), sourceConflicts = [] } = {}) {
  validateWeights(weights);
  const modelIds = cohort ? [...new Set(cohort)] : [...new Set(rows.map(x => x.modelId))];
  const excludedReasons = [];
  const conflicts = new Set([...conflictedObservationIds, ...sourceConflicts.flatMap(x => x.observationIds ?? [])]);
  const grouped = new Map();
  for (const row of rows) {
    if (conflicts.has(row.id) || row.sourceConflicted) continue;
    const config = configurations?.get(row.configurationId);
    const allowed = admission(row, config);
    if (!allowed.eligible || (independentOnly && !row.sourceVerification?.independentReplication)) continue;
    const suite = suites?.get(row.suiteId);
    if (!suite || SEPARATE.has(suite.domain)) continue;
    // Selection depends only on the selected (positive-weight) domains.
    if (!(weights[suite.domain] > 0)) continue;
    // Unknown conditions are not proof of a match.
    if (!knownConfiguration(row, config)) { excludedReasons.push({ id: row.id, reason: 'unknown test conditions' }); continue; }
    const score = normalize(comparableValue(row, suite.metric), suite.metric);
    if (score === null) { excludedReasons.push({ id: row.id, reason: 'value outside the declared metric bounds' }); continue; }
    const key = panelKey(row, config);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ row, suite, score });
  }
  // Duplicate rows for one model in one panel are ambiguous; the panel is dropped
  // rather than choosing by array order.
  for (const [key, entries] of [...grouped]) {
    const counts = new Map();
    for (const e of entries) counts.set(e.row.modelId, (counts.get(e.row.modelId) ?? 0) + 1);
    if ([...counts.values()].some((n) => n > 1)) { grouped.delete(key); excludedReasons.push({ id: key, reason: 'duplicate observations for one model in one panel' }); }
  }
  // A cohort uses only exact panels represented once for every model. Repeated family variants are
  // capped by averaging within family/domain before domain weighting.
  const common = [...grouped].filter(([, entries]) => modelIds.every(id => entries.some(x => x.row.modelId === id)));
  if (!common.length) return { version: METHOD_VERSION, eligible: false, score: null, reason: 'no eligible compatible common panel', panelSize: 0, exclusions: rows.length, excludedReasons };
  const perModel = new Map();
  for (const id of modelIds) {
    const familyValues = new Map();
    for (const [, entries] of common) {
      const entry = entries.find(x => x.row.modelId === id);
      if (!entry || entry.score === null) continue;
      const k = `${entry.suite.domain}|${entry.suite.benchmarkFamilyId}`;
      if (!familyValues.has(k)) familyValues.set(k, []);
      familyValues.get(k).push({ domain: entry.suite.domain, score: entry.score });
    }
    const familyAverages = [...familyValues.values()].map(v => ({ domain: v[0].domain, score: v.reduce((s,x)=>s+x.score,0)/v.length }));
    const byDomain = new Map();
    for (const v of familyAverages) { if (!byDomain.has(v.domain)) byDomain.set(v.domain, []); byDomain.get(v.domain).push(v.score); }
    const domainScores = Object.fromEntries([...byDomain].map(([d,vs])=>[d,vs.reduce((s,x)=>s+x,0)/vs.length]));
    const selected = Object.keys(weights).filter(d => weights[d] > 0);
    const total = selected.reduce((sum,d)=>sum+weights[d],0);
    // Every selected domain must be present; missing domains never cause model-specific renormalization.
    const score = selected.every(d => Number.isFinite(domainScores[d])) && total > 0
      ? selected.reduce((sum,d)=>sum+domainScores[d]*weights[d],0)/total : null;
    perModel.set(id, { model: models?.get(id)?.name ?? id, score, domainScores, eligible: score !== null });
  }
  return { version: METHOD_VERSION, eligible: true, panelSize: common.length, panel: common.map(([key])=>key), exclusions: rows.length - common.reduce((n,[,e])=>n+e.length,0), excludedReasons, models: Object.fromEntries(perModel), weights: { ...weights }, score: null };
}

export function rankSensitivity(result, variants) {
  return variants.map(weights => {
    const scores = Object.entries(result.models ?? {}).map(([id,m]) => ({id, score: m.score === null ? null : weighted(m.domainScores, weights)})).filter(x=>x.score !== null).sort((a,b)=>b.score-a.score);
    return { weights: { ...weights }, ranking: scores.map(x=>x.id), ties: scores.filter((x,i)=>i>0 && x.score===scores[i-1].score).map(x=>x.id) };
  });
}
export function encodeWeightSettings(weights = DEFAULT_WEIGHTS) {
  if (!weights || Object.keys(weights).some(k=>SEPARATE.has(k))) throw new Error('weights must be nonnegative capability-domain weights with at least one positive value');
  validateWeights(weights);
  return `w=${encodeURIComponent(JSON.stringify(weights))}`;
}
export function decodeWeightSettings(search, fallback = DEFAULT_WEIGHTS) {
  try { const raw = new URLSearchParams(search).get('w'); if (!raw) return {weights:{...fallback},valid:true}; const w=JSON.parse(raw); encodeWeightSettings(w); return {weights:w,valid:true}; }
  catch { return {weights:{...fallback},valid:false}; }
}
function weighted(domains, weights) { const keys=Object.keys(weights).filter(k=>weights[k]>0); if(keys.some(k=>!Number.isFinite(domains[k]))) return null; const total=keys.reduce((s,k)=>s+weights[k],0); return total ? keys.reduce((s,k)=>s+domains[k]*weights[k],0)/total : null; }
export function leaveOneSuiteOut(rows, options) { const ids=[...new Set(rows.map(x=>x.suiteId))]; return ids.map(id=>({omittedSuite:id, result:comparePanel(rows.filter(x=>x.suiteId!==id),options)})); }

export function taskCost(price, task) {
  const amounts = ['inputTokens','cachedReadTokens','cachedWriteTokens','outputTokens','reasoningTokens'];
  if (!price || !task || amounts.some(k => task[k] === undefined || !Number.isFinite(task[k]) || task[k] < 0)) return { status:'invalid', totalUsd:null, reason:'token counts must be present, finite and nonnegative' };
  const promptTokens = task.inputTokens + task.cachedReadTokens + task.cachedWriteTokens;
  const threshold = (price.tiers ?? []).filter(t=>Number.isFinite(Number(t.min_prompt_tokens)) && promptTokens >= Number(t.min_prompt_tokens)).sort((a,b)=>Number(b.min_prompt_tokens)-Number(a.min_prompt_tokens))[0];
  const rate = (key, tierKey) => threshold?.[tierKey] !== undefined ? Number(threshold[tierKey]) : price[key];
  const fields = [ ['input',task.inputTokens,'prompt'], ['cachedInputRead',task.cachedReadTokens,'input_cache_read'], ['cachedInputWrite',task.cachedWriteTokens,'input_cache_write'], ['output',task.outputTokens,'completion'], ['reasoning',task.reasoningTokens,'internal_reasoning'] ];
  let total=0;
  for (const [key,count,tierKey] of fields) { if (!count) continue; const r=rate(key,tierKey); if (r===null || r===undefined || !Number.isFinite(Number(r)) || Number(r)<0) return {status:'unsupported',totalUsd:null,reason:`${key} rate is unknown for this task`}; total += count*Number(r); }
  return {status:'priced',totalUsd:total, tierMinPromptTokens:threshold ? Number(threshold.min_prompt_tokens):null, currency:price.currency};
}

export function resolveModelIdentity(modelRows) { const map=new Map(); for (const m of modelRows) { const key=m.canonicalSlug ?? m.canonical_slug ?? m.catalogId ?? m.id; if (!map.has(key)) map.set(key,[]); map.get(key).push(m); } return map; }
