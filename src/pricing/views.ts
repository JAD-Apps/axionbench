import type { AuthorityBlock } from '../authority/logic.ts';
import { authorityViewRows, type ViewRow } from '../charts/rows.ts';
import { costRows, type CostRow, type PriceBlock, type TaskScenario } from './logic.ts';

export const usd = (value: number) => '$' + value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
export type CostViewRow = ViewRow & { scenarioUsd: number | null; benchmarkValue: number; benchmarkUnit: string; costRow: CostRow };
export function taskCostViewRows(authority: AuthorityBlock, prices: PriceBlock, panel: string, task: TaskScenario, now = Date.now()): CostViewRow[] {
  return costRows(authority, prices, panel, task, now).map(costRow => {
    const row = authorityViewRows(authority, [costRow.observation])[0];
    return { ...row, value: costRow.cost.totalUsd, nativeValue: costRow.cost.totalUsd,
      valueLabel: costRow.cost.totalUsd === null ? 'Unavailable: ' + costRow.cost.reason : usd(costRow.cost.totalUsd), unit: 'USD / scenario task',
      detail: `${costRow.price?.endpointModelId ?? row.modelKey} · ${row.valueLabel} · ${costRow.observation.configuration.setting ?? 'Reasoning setting unreported'}`,
      missingReason: costRow.cost.reason, scenarioUsd: costRow.cost.totalUsd,
      benchmarkValue: costRow.observation.rawValue, benchmarkUnit: costRow.observation.rawUnit, costRow,
      coverage: `${costRow.price ? 'Exact endpoint tariff' : 'No permitted exact tariff'} · ${row.coverage}`,
      sources: [...row.sources, ...(costRow.price ? [{ url: costRow.price.sourceUrl, label: 'Exact tariff' }] : [])] };
  });
}
