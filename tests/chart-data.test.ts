import { describe, expect, it } from 'vitest';
import { rankingRows, scatterRows } from '../src/chart-data';

const model = (id: string, score: number | null, price: number | null) => ({
  model: id, name: id.toUpperCase(), developer: 'lab', apiUsdPerMTok: price,
  capabilities: { code: score === null ? null : { score, coverage: 0.5, sources: [] } },
});

describe('chart row preparation', () => {
  it('sorts only observations with a score and never promotes missing values to zero', () => {
    const rows = rankingRows([model('low', 0.2, 1), model('unknown', null, 1), model('high', 0.8, 1)], 'code');
    expect(rows.map(row => row.model.model)).toEqual(['high', 'low']);
  });
  it('requires both a real score and a known positive public API price for scatter placement', () => {
    const rows = scatterRows([model('known', 0.4, 0.3), model('no-price', 0.8, null), model('no-score', null, 0.01), model('invalid', 0.3, 0)], 'code');
    expect(rows.map(row => row.model.model)).toEqual(['known']);
    expect(rows[0].price).toBe(0.3);
  });
});
