import { panelId, settingRank, type AuthorityBlock, type AuthorityObservation } from '../authority/logic.ts';

export type PriceFact = {
  id: string; provider: string; endpointModelId: string; modelKey: string;
  currency: 'USD'; unit: 'USD/token'; serviceTier: string;
  input: number; cachedInputRead: number; cachedInputWrite: number | null; output: number;
  reasoning: number; reasoningBilling: 'included-in-output'; cacheStoragePerMillionTokenHour: number | null;
  tiers: { minPromptTokens: number; input: number; output: number; cachedInputRead: number }[];
  expiresAt: string | null; effectiveAt: string | null; retrievedAt: string; sourceUrl: string;
  evidence: { tableSection: string; row: number; column: number; field: string; paidCell: string }[];
  limitations: string[];
};
export type PriceBlock = {
  schemaVersion: string; source: { id: string; publisher: string; url: string; sha256: string; bytes: number;
    retrievedAt: string; licence: string; licenceUrl: string; attribution: string; permissionBasis: string };
  coverage: string; records: PriceFact[];
};
export type TaskScenario = {
  inputTokens: number; cachedReadTokens: number; cachedWriteTokens: number; outputTokens: number;
  reasoningTokens: number; cacheStoredTokens: number; cacheHours: number;
};
export const DEFAULT_TASK: TaskScenario = { inputTokens: 10000, cachedReadTokens: 0, cachedWriteTokens: 0,
  outputTokens: 2000, reasoningTokens: 0, cacheStoredTokens: 0, cacheHours: 0 };
export type Cost = { status: 'priced' | 'invalid' | 'unsupported'; totalUsd: number | null;
  tokenUsd: number | null; storageUsd: number | null; tier: number | null; reason: string | null };

export function validatePriceFacts(block: PriceBlock) {
  const fail = (message: string): never => { throw new Error('Price facts: ' + message); };
  if (block.schemaVersion !== 'axionbench-price-facts-v1' || !Array.isArray(block.records) || !block.records.length) fail('schema or records missing');
  if (block.source.url !== 'https://ai.google.dev/gemini-api/docs/pricing'
    || block.source.licence !== 'CC BY 4.0' || block.source.licenceUrl !== 'https://creativecommons.org/licenses/by/4.0/'
    || !/^[a-f0-9]{64}$/.test(block.source.sha256) || !block.source.permissionBasis || !block.source.attribution) fail('source permission or hash missing');
  if (!Number.isFinite(Date.parse(block.source.retrievedAt)) || !Number.isInteger(block.source.bytes) || block.source.bytes <= 0) fail('source retrieval date or byte count invalid');
  const models = new Set<string>();
  for (const price of block.records) {
    if (models.has(price.modelKey)) fail('duplicate exact model price');
    models.add(price.modelKey);
    if (price.id !== 'google-standard-text:' + price.endpointModelId || price.provider !== 'Google Gemini Developer API'
      || price.retrievedAt !== block.source.retrievedAt || price.effectiveAt !== null) fail('source identity or dates changed');
    if (price.modelKey !== price.endpointModelId.replace(/[^a-z0-9]+/g, '-')
      || price.sourceUrl !== block.source.url + '#' + price.endpointModelId) fail('endpoint identity mismatch');
    if (price.unit !== 'USD/token' || price.currency !== 'USD' || price.serviceTier !== 'Standard paid') fail('units or tier changed');
    if (price.reasoningBilling !== 'included-in-output' || price.reasoning !== price.output || price.cachedInputWrite !== null) fail('billing semantics changed');
    for (const field of ['input', 'output', 'cachedInputRead'] as const) {
      const fact = price.evidence.filter((row) => row.field === field);
      if (fact.length !== 1 || fact[0].tableSection !== 'Standard' || fact[0].column !== 2) fail('ambiguous source cell');
      const values = [...fact[0].paidCell.matchAll(/\$([\d.]+)/g)].map((match) => Number(match[1]));
      if (!Number.isFinite(price[field]) || price[field] < 0 || price[field] !== values[0] / 1e6) fail('source cell/rate mismatch');
      if (price.tiers.length) {
        if (price.tiers.length !== 1 || price.tiers[0].minPromptTokens !== 200001
          || !fact[0].paidCell.includes('prompts > 200k') || price.tiers[0][field] !== values[1] / 1e6) fail('long context source tier mismatch');
      } else if (fact[0].paidCell.includes('prompts >')) fail('source tier dropped');
      if (fact[0].paidCell.includes('through December 31, 2026.') !== (price.expiresAt === '2027-01-01T00:00:00Z')) fail('promotion expiry lost');
    }
    const storageCell = price.evidence.find((row) => row.field === 'cachedInputRead')!.paidCell;
    const storage = /\$([\d.]+) \/ 1,000,000 tokens per hour/.exec(storageCell);
    if (price.cacheStoragePerMillionTokenHour !== (storage ? Number(storage[1]) : null)) fail('cache storage rate mismatch');
  }
  return block;
}

export function estimateTask(price: PriceFact | null, task: TaskScenario, now = Date.now()): Cost {
  const absent = (status: Cost['status'], reason: string): Cost => ({ status, reason, totalUsd: null, tokenUsd: null, storageUsd: null, tier: null });
  if (!task || Object.keys(DEFAULT_TASK).some((key) => {
    const count = task[key as keyof TaskScenario];
    return !Number.isFinite(count) || count < 0 || count > 1e9 || (key !== 'cacheHours' && !Number.isInteger(count));
  })) return absent('invalid', 'Use nonnegative whole token counts and nonnegative cache hours.');
  if (!price) return absent('unsupported', 'No licensed current public tariff matches this exact model endpoint.');
  if (!Number.isFinite(Date.parse(price.retrievedAt)) || now - Date.parse(price.retrievedAt) > 7 * 86400000 || Date.parse(price.retrievedAt) > now + 300000) return absent('unsupported', 'The tariff capture needs refresh; it is outside its seven-day freshness window.');
  if (price.expiresAt && now >= Date.parse(price.expiresAt)) return absent('unsupported', 'The captured introductory tariff has expired; refresh before quoting this endpoint.');
  if (task.cachedReadTokens > 0 && (task.cacheStoredTokens < task.cachedReadTokens || task.cacheHours <= 0)) return absent('unsupported', 'For explicit cache reads, enter the stored context size and its billable lifetime.');
  const prompt = task.inputTokens + task.cachedReadTokens + task.cachedWriteTokens;
  const tier = [...price.tiers].filter((row) => prompt >= row.minPromptTokens).sort((a, b) => b.minPromptTokens - a.minPromptTokens)[0];
  const rates = { ...price, ...tier };
  // Output here excludes thinking; source bills both once at the output tariff.
  const amounts: [number, number | null][] = [[task.inputTokens, rates.input], [task.cachedReadTokens, rates.cachedInputRead],
    [task.cachedWriteTokens, price.cachedInputWrite], [task.outputTokens + task.reasoningTokens, rates.output]];
  if (amounts.some(([count, rate]) => count > 0 && (rate === null || !Number.isFinite(rate) || rate < 0))) return absent('unsupported', 'A used token class has no documented tariff (cache-write pricing is unknown).');
  if (task.cacheStoredTokens > 0 && task.cacheHours > 0 && price.cacheStoragePerMillionTokenHour === null) return absent('unsupported', 'Cache storage tariff is unknown.');
  const tokenUsd = amounts.reduce((sum, [count, rate]) => sum + count * (rate ?? 0), 0);
  const storageUsd = task.cacheStoredTokens * task.cacheHours * (price.cacheStoragePerMillionTokenHour ?? 0) / 1e6;
  return { status: 'priced', totalUsd: tokenUsd + storageUsd, tokenUsd, storageUsd, tier: tier?.minPromptTokens ?? null, reason: null };
}

export const costPanelId = (row: AuthorityObservation) => panelId(row) + '|' + row.configuration.condition;
export function costPanels(block: AuthorityBlock, prices: PriceBlock) {
  const priced = new Set(prices.records.map((row) => row.modelKey));
  const groups = new Map<string, Set<string>>();
  for (const row of block.observations) {
    if (!row.admitted || !row.primary || !row.configuration.conditionsKnown
      || !['benchmark-authority', 'independent-evaluator'].includes(row.provenance)) continue;
    const id = costPanelId(row);
    const group = groups.get(id) ?? new Set<string>();
    if (priced.has(row.modelKey)) group.add(row.modelKey);
    groups.set(id, group);
  }
  return [...groups].filter(([, models]) => models.size >= 2).map(([id, models]) => ({ id, models: models.size })).sort((a, b) => b.models - a.models || a.id.localeCompare(b.id));
}
export type CostRow = { observation: AuthorityObservation; price: PriceFact | null; cost: Cost; frontier: boolean };
export function costRows(block: AuthorityBlock, prices: PriceBlock, panel: string, task: TaskScenario, now = Date.now()): CostRow[] {
  const byModel = new Map<string, AuthorityObservation[]>();
  for (const row of block.observations.filter((row) => row.admitted && row.primary && row.configuration.conditionsKnown
    && ['benchmark-authority', 'independent-evaluator'].includes(row.provenance) && costPanelId(row) === panel)) {
    byModel.set(row.modelKey, [...(byModel.get(row.modelKey) ?? []), row]);
  }
  const rows: CostRow[] = [];
  for (const list of byModel.values()) {
    // Value-independent representative. Duplicate same-setting claims are excluded.
    const best = Math.min(...list.map((row) => settingRank(row.configuration.setting)));
    const chosen = list.filter((row) => settingRank(row.configuration.setting) === best);
    if (chosen.length !== 1) continue;
    const observation = chosen[0];
    const price = prices.records.find((row) => row.modelKey === observation.modelKey) ?? null;
    rows.push({ observation, price, cost: estimateTask(price, task, now), frontier: false });
  }
  for (const row of rows) {
    if (row.cost.totalUsd === null) continue;
    row.frontier = !rows.some((other) => other.cost.totalUsd !== null && other.cost.totalUsd <= row.cost.totalUsd!
      && other.observation.value >= row.observation.value
      && (other.cost.totalUsd < row.cost.totalUsd! || other.observation.value > row.observation.value));
  }
  return rows.sort((a, b) => (a.cost.totalUsd ?? Infinity) - (b.cost.totalUsd ?? Infinity) || a.observation.modelKey.localeCompare(b.observation.modelKey));
}
export function encodeTask(task: TaskScenario, params: URLSearchParams) { params.set('task', JSON.stringify(task)); }
export function decodeTask(params: URLSearchParams): TaskScenario {
  try {
    const raw = JSON.parse(params.get('task') ?? 'null');
    if (!raw || Object.keys(raw).some((key) => !Object.hasOwn(DEFAULT_TASK, key))) return { ...DEFAULT_TASK };
    const next = { ...DEFAULT_TASK, ...raw };
    return estimateTask(null, next).status === 'invalid' ? { ...DEFAULT_TASK } : next;
  } catch { return { ...DEFAULT_TASK }; }
}
