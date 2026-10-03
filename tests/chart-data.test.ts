import { describe, expect, it } from 'vitest';
import { rankingRows, panelId, type AuthorityBlock } from '../src/authority/logic';
import { costRows, costPanelId, DEFAULT_TASK, type PriceBlock } from '../src/pricing/logic';
import data from '../public/data.json';

const observation = data.authority.observations.find(row => row.admitted && row.primary && row.configuration.conditionsKnown)!;
const block = { ...data.authority, observations: ['low', 'high'].map((key, index) => ({ ...observation, id: key, modelKey: key, value: index ? .8 : .2 })) } as unknown as AuthorityBlock;

describe('chart row preparation', () => {
  it('sorts only observations with a score and never promotes missing values to zero', () => {
    const rows = rankingRows(block, panelId(block.observations[0]), 'all', 10);
    expect(rows.map(row => row.modelKey)).toEqual(['high', 'low']);
    expect(rows.map(row => row.value)).toEqual([.8, .2]);
    expect(rows.some(row => row.modelKey === 'unknown')).toBe(false);
  });
  it('requires both a real score and a known positive public API price for scatter placement', () => {
    const quote = { ...data.pricing.records[0], modelKey: 'low', input: .3 / 1e6, output: .3 / 1e6, tiers: [] };
    const prices = { ...data.pricing, records: [quote, { ...quote, modelKey: 'no-score' }] } as PriceBlock;
    const now = Date.parse(quote.retrievedAt);
    const rows = costRows(block, prices, costPanelId(block.observations[0]), { ...DEFAULT_TASK, inputTokens: 1000000, outputTokens: 0 }, now);
    expect(rows.filter(row => row.cost.totalUsd !== null).map(row => row.observation.modelKey)).toEqual(['low']);
    expect(rows[0].cost.totalUsd).toBe(.3);
    expect(rows.find(row => row.observation.modelKey === 'high')!.cost.totalUsd).toBeNull();
    const invalid = costRows(block, { ...prices, records: [{ ...quote, input: -1 }] }, costPanelId(block.observations[0]), DEFAULT_TASK, now);
    expect(invalid.every(row => row.cost.totalUsd === null)).toBe(true);
  });
});
