import type { AuthorityBlock } from '../authority/logic.ts';
import type { BridgeDataset, BridgeRating } from '../current/logic.ts';
import { estimateTask, type Cost, type PriceBlock, type PriceFact, type TaskScenario } from '../pricing/logic.ts';

export const taskTypes = [
  { id: 'reasoning', label: 'Reasoning', axis: 'reasoning', ratingLabel: 'Reasoning' },
  { id: 'frontend', label: 'Front-end code', axis: 'frontend', ratingLabel: 'Front End' },
  { id: 'backend', label: 'Back-end code', axis: 'backend', ratingLabel: 'Back End' },
  { id: 'oneShot', label: 'One-shot builds', axis: 'oneShot', ratingLabel: 'One Shot' },
  { id: 'security', label: 'Security', axis: 'security', ratingLabel: 'Security' },
];
export function homeTask(tokens: number): TaskScenario {
  const outputTokens = Math.round(tokens / 6);
  return { inputTokens: tokens - outputTokens, outputTokens, cachedReadTokens: 0, cachedWriteTokens: 0, reasoningTokens: 0, cacheStoredTokens: 0, cacheHours: 0 };
}
export function homeRecommendations(bridge: BridgeDataset, prices: PriceBlock, _authority: AuthorityBlock, taskType: string, tokens: number, benchmark = 'bridgebench', now = Date.now()) {
  const axis = taskTypes.find(t => t.id === taskType)?.axis;
  const valid = Number.isInteger(tokens) && tokens >= 1 && tokens <= 1e9 && axis;
  const rows = valid && benchmark === 'bridgebench' ? bridge.records.filter(r => r.identityVerified && Number.isFinite(r.ratings[axis]) && r.ratings[axis] !== null) : [];
  const candidates = rows.map(row => {
    const price = prices.records.find(p => p.modelKey === row.modelKey) ?? null;
    return { row, price, cost: estimateTask(price, homeTask(tokens), now) };
  });
  const priced = candidates.filter(c => c.cost.status === 'priced');
  const byCost = [...priced].sort((a,b) => a.cost.totalUsd! - b.cost.totalUsd! || a.row.modelKey.localeCompare(b.row.modelKey));
  const byRating = (a: typeof candidates[number], b: typeof candidates[number]) => b.row.ratings[axis!]! - a.row.ratings[axis!]! || (a.cost.totalUsd ?? Infinity) - (b.cost.totalUsd ?? Infinity) || a.row.modelKey.localeCompare(b.row.modelKey);
  const picks = [byCost[0], [...priced].sort(byRating)[0], [...candidates].sort(byRating)[0]];
  const labels = ['Economy', 'Balanced', 'Frontier'];
  const rules = ['Lowest known task cost', 'Highest rating with a known price', 'Highest published task rating'];
  return { ratedCount: rows.length, pricedCount: priced.length, tiers: ['economy', 'balanced', 'frontier'].map((id,i) => ({ id, label: labels[i], rule: rules[i], row: picks[i]?.row as BridgeRating | undefined, price: picks[i]?.price as PriceFact | null | undefined, cost: picks[i]?.cost as Cost | undefined })) };
}
