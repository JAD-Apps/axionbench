import { formatParameters, type OpenWeightRow } from '../open-weights/logic';
import { pct, type AuthorityBlock, type H2HResult } from '../authority/logic';
import type { ViewRow } from './rows';

// All cohort views use these factual rows. Nulls stay null in canvas, text and exports.
export function parameterRows(rows: OpenWeightRow[]): ViewRow[] {
  return rows.flatMap(row => ['Total', 'Activated'].map(kind => {
    const value = kind === 'Total' ? row.total.value : row.activated.value;
    const source = kind === 'Total' ? row.sources.metadata : row.sources.card;
    return { id: `${row.modelId}|${kind}`, modelKey: row.modelId, label: row.name, domain: kind,
      detail: `${kind} parameters · ${row.lab}`, value, nativeValue: value, valueLabel: (kind === 'Activated' && value !== null && row.activated.approximate ? '~' : '') + formatParameters(value),
      unit: kind === 'Total' ? 'total parameters' : 'activated parameters per token', version: row.repository ?? 'Repository unknown',
      sourceClass: kind === 'Total' ? row.total.status : row.activated.status, coverage: `${row.observationCount} captured results; size is not capability`,
      missingReason: value === null ? (kind === 'Total' ? row.total.status : row.activated.status) : null,
      sources: source?.url ? [{ url: source.url, label: kind === 'Total' ? 'Repository metadata' : 'Model card' }] : [],
      eligibility: `Weights ${row.access.status}; licence ${row.licence.class}. Weight availability does not establish an open-source model.`,
      retrievedAt: source?.retrievedAt ?? null, evaluatedAt: null };
  }));
}

export function matchedRows(block: AuthorityBlock, result: H2HResult, domains = false): ViewRow[] {
  const rows = domains ? result.domains : result.matched;
  return rows.flatMap(row => ['US', 'China'].map(side => {
    const isUS = side === 'US';
    const panel = 'id' in row ? row.id : row.domain;
    const observations = 'id' in row ? [isUS ? row.a : row.b] : result.matched.filter(r => r.domain === row.domain).map(r => isUS ? r.a : r.b);
    const value = 'id' in row ? (isUS ? row.a.value : row.b.value) : (isUS ? row.a : row.b);
    const suite = 'suiteId' in row ? block.suites.find(s => s.id === row.suiteId) : null;
    return { id: `${panel}|${side}`, modelKey: panel, label: suite ? `${suite.name} ${suite.version} · ${'metric' in row ? row.metric : ''} · ${'condition' in row ? row.condition : ''}` : row.domain,
      domain: side, detail: `${side} · ${block.models.find(m => m.key === (isUS ? result.a : result.b))?.name ?? side}${'id' in row ? ` · reported ${observations[0].rawText} ${observations[0].rawUnit}` : ''}`,
      value, nativeValue: 'id' in row ? observations[0].rawValue : value, valueLabel: pct(value),
      unit: 'normalized source fraction (0–1)', version: suite?.version ?? 'Family-capped matched domain mean',
      sourceClass: [...new Set(observations.map(o => o.provenance))].join(', '),
      coverage: `${observations.length} observed compatible result${observations.length === 1 ? '' : 's'} on the shared panel`, missingReason: null,
      sources: [...new Set(observations.map(o => o.resultUrl))].map(url => ({ url, label: `Original ${side} result` })),
      eligibility: `${result.method}; not an overall or country ranking`,
      retrievedAt: observations.map(o => block.sources.find(s => s.id === o.sourceId)?.retrievedAt ?? '').sort()[0] || null,
      evaluatedAt: observations.every(o => o.evaluatedAt === observations[0].evaluatedAt) ? observations[0].evaluatedAt : null };
  }));
}

export function coverageRows(block: AuthorityBlock, result: H2HResult): ViewRow[] {
  return [result.a, result.b].flatMap((key, index) => {
    const side = index === 0 ? 'US' : 'China';
    return ['Shared', 'Unmatched'].map(kind => {
      const observations = kind === 'Shared' ? result.matched.map(r => index === 0 ? r.a : r.b) : index === 0 ? result.onlyA : result.onlyB;
      return { id: `${key}|${kind}`, modelKey: key, label: `${side} · ${block.models.find(m => m.key === key)?.name ?? key}`,
        domain: kind, detail: kind === 'Shared' ? 'Observed on the shared compatible panel' : 'Observed for this model only under active filters',
        value: observations.length, nativeValue: observations.length, valueLabel: String(observations.length), unit: 'observed compatible results',
        version: result.method, sourceClass: [...new Set(observations.map(o => o.provenance))].join(', ') || 'No observed compatible results',
        coverage: 'Selected pair and filters; excludes incompatible/duplicate/non-admitted observations and pending identities', missingReason: null,
        sources: [...new Set(observations.map(o => o.resultUrl))].map(url => ({ url, label: `${kind} result` })),
        eligibility: 'A result count, not a capability score or catalogue count' };
    });
  });
}
