import type { AuthorityBlock } from '../authority/logic.ts';
import { authorityViewRows, type ViewRow } from '../charts/rows.ts';
import { currentAuthorityPanel, type BridgeDataset, type BridgeRating } from '../current/logic.ts';
import { estimateTask, type Cost, type PriceBlock, type PriceFact, type TaskScenario } from '../pricing/logic.ts';
import type { VersionIdentity } from '../versions/logic.ts';
import type { WeightSettings } from '../scoring/index.mjs';

export const taskTypes = [
  { id: 'reasoning', label: 'Reasoning', axis: 'reasoning', ratingLabel: 'Reasoning', domain: 'reasoning' },
  { id: 'frontend', label: 'Front-end code', axis: 'frontend', ratingLabel: 'Front End', domain: 'coding' },
  { id: 'backend', label: 'Back-end code', axis: 'backend', ratingLabel: 'Back End', domain: 'coding' },
  { id: 'oneShot', label: 'One-shot builds', axis: 'oneShot', ratingLabel: 'One Shot', domain: 'agents' },
  { id: 'security', label: 'Security', axis: 'security', ratingLabel: 'Security', domain: 'security' },
];
export function homeTask(tokens: number): TaskScenario {
  const outputTokens = Math.round(tokens / 6);
  return { inputTokens: tokens - outputTokens, outputTokens, cachedReadTokens: 0, cachedWriteTokens: 0, reasoningTokens: 0, cacheStoredTokens: 0, cacheHours: 0 };
}
type CurrentRow = { modelKey: string; modelLabel: string; modelLab: string; resultUrl: string; retrievedAt: string; ratings: Record<string, number | null> };
export type HomeCandidate = { row: BridgeRating | CurrentRow; price: PriceFact | null; cost: Cost; capability: ViewRow };
export function homeRecommendations(bridge: BridgeDataset, prices: PriceBlock, authority: AuthorityBlock, taskType: string, tokens: number,
  benchmark = 'bridgebench', now = Date.now(), weights?: WeightSettings, identities?: VersionIdentity[]) {
  const task = taskTypes.find(t => t.id === taskType);
  const valid = Number.isInteger(tokens) && tokens >= 1 && tokens <= 1e9 && task;
  let candidates: HomeCandidate[] = [];
  let missingReason = 'No eligible recommendation for these inputs.';
  if (valid && benchmark === 'bridgebench') {
    candidates = bridge.records.filter(r => r.identityVerified && Number.isFinite(r.ratings[task.axis]) && r.ratings[task.axis] !== null).map(row => {
      const price = prices.records.find(p => p.modelKey === row.modelKey) ?? null;
      const value = row.ratings[task.axis]!;
      const capability: ViewRow = { id: row.modelKey, modelKey: row.modelKey, label: row.modelLabel, detail: task.ratingLabel,
        value, nativeValue: value, valueLabel: String(value), unit: row.unit, version: row.version, sourceClass: row.provenance,
        coverage: '1 / 1 selected publisher axis observed; independent capability coverage is separate', missingReason: null,
        sources: [{ url: row.resultUrl, label: 'Exact model rating' }], eligibility: row.exclusion, retrievedAt: row.retrievedAt, evaluatedAt: null };
      return { row, price, cost: estimateTask(price, homeTask(tokens), now), capability };
    });
    missingReason = 'No identity-confirmed publisher rating for this task.';
  } else if (valid && benchmark === 'current') {
    const confirmed = new Set(identities ? identities.filter(m => m.identityVerified).map(m => m.key) : bridge.records.filter(r => r.identityVerified).map(r => r.modelKey));
    const cohort = authority.models.filter(m => confirmed.has(m.key) && authority.observations.some(r => r.modelKey === m.key && r.currentPolicy?.scoringEligible)).map(m => m.key);
    if (cohort.length >= 2 && (task.domain !== 'security' || weights)) {
      const panel = currentAuthorityPanel(authority, cohort, weights ?? { [task.domain]: 1 });
      missingReason = panel.result.reason ?? 'No common current capability panel for the selected task or weights.';
      if (panel.result.eligible) candidates = cohort.flatMap(modelKey => {
        const score = panel.result.models?.[modelKey]?.score;
        if (score === null || score === undefined) return [];
        const model = authority.models.find(m => m.key === modelKey)!;
        const measured = panel.rows.filter(r => r.modelKey === modelKey);
        const projected = authorityViewRows(authority, measured);
        const sources = [...new Map(projected.flatMap(r => r.sources).map(s => [s.url,s])).values()];
        const capability: ViewRow = { id: modelKey, modelKey, label: model.name, detail: 'Current common capability · custom domain weights', value: score,
          nativeValue: score, valueLabel: (score * 100).toFixed(1) + '%', unit: 'normalized fraction (0–1)',
          version: [...new Set(projected.map(r => r.version))].join(', '), sourceClass: [...new Set(projected.map(r => r.sourceClass))].join(', '),
          coverage: `${measured.length} common panels / ${new Set(measured.map(r => r.suiteId)).size} suites; all positively weighted domains observed`,
          missingReason: null, sources, eligibility: 'Current scoring eligible; family means precede domain means',
          retrievedAt: projected.map(r => r.retrievedAt ?? '').sort()[0] || null, evaluatedAt: null };
        const price = prices.records.find(p => p.modelKey === modelKey) ?? null;
        return [{ row: { modelKey, modelLabel: model.name, modelLab: model.lab ?? 'Unknown developer', resultUrl: sources[0]?.url ?? '',
          retrievedAt: capability.retrievedAt ?? '', ratings: { [task.axis]: score } }, capability, price, cost: estimateTask(price, homeTask(tokens), now) }];
      });
    } else missingReason = 'No common current capability panel for this task and confirmed cohort.';
  }
  const priced = candidates.filter(c => c.cost.status === 'priced');
  const byCost = [...priced].sort((a,b) => a.cost.totalUsd! - b.cost.totalUsd! || a.row.modelKey.localeCompare(b.row.modelKey));
  const byCapability = (a: HomeCandidate, b: HomeCandidate) => b.capability.value! - a.capability.value!
    || (a.cost.totalUsd ?? Infinity) - (b.cost.totalUsd ?? Infinity) || a.row.modelKey.localeCompare(b.row.modelKey);
  const picks = [byCost[0], [...priced].sort(byCapability)[0], [...candidates].sort(byCapability)[0]];
  const labels = ['Economy', 'Balanced', 'Frontier'];
  const noun = benchmark === 'bridgebench' ? 'task rating' : 'current capability';
  const rules = ['Lowest known task cost', `Highest ${noun} with a known price`, `Highest ${noun}`];
  return { ratedCount: candidates.length, pricedCount: priced.length, candidates, missingReason,
    tiers: ['economy', 'balanced', 'frontier'].map((id,i) => ({ id, label: labels[i], rule: rules[i],
      row: picks[i]?.row, price: picks[i]?.price, cost: picks[i]?.cost, capability: picks[i]?.capability,
      missingReason: picks[i] ? null : candidates.length ? 'No usable licensed tariff for this scenario among the measured models.' : missingReason })) };
}
