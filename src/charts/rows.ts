import type { AuthorityBlock, AuthorityObservation } from '../authority/logic.ts';
import type { BridgeDataset } from '../current/logic.ts';
import { bridgeRatingRows, currentAuthorityPanel } from '../current/logic.ts';
import { DEFAULT_WEIGHTS, type WeightSettings } from '../scoring/index.mjs';

// One factual projection for canvas, text, keyboard tooltips and downloads.
// `value` is a plot coordinate in the stated scale; `nativeValue` stays intact.
export type ViewRow = {
  id: string; modelKey: string; label: string; detail: string; value: number | null;
  nativeValue: number | null; valueLabel: string; unit: string; version: string;
  sourceClass: string; coverage: string; missingReason: string | null;
  sources: { url: string; label: string }[]; eligibility: string;
  retrievedAt?: string | null; evaluatedAt?: string | null;
  domain?: string; interval?: { low: number; high: number; method?: string } | null;
};

export function authorityViewRows(block: AuthorityBlock, observations: AuthorityObservation[]): ViewRow[] {
  return observations.map(row => ({
    id: row.id, modelKey: row.modelKey, label: block.models.find(m => m.key === row.modelKey)?.name ?? row.modelLabel,
    detail: `${row.configuration.setting ?? 'Setting unknown'} · ${row.configuration.condition ?? 'Condition unknown'}`,
    value: row.value, nativeValue: row.rawValue, valueLabel: `${row.rawText} ${row.rawUnit}`,
    unit: row.rawUnit, version: block.suites.find(s => s.id === row.suiteId)?.version ?? 'Version unknown',
    sourceClass: row.provenance, coverage: 'One listed configuration on this panel; not cross-domain coverage',
    missingReason: null, sources: [{ url: row.resultUrl, label: 'Original result' }],
    eligibility: row.currentPolicy?.scoringEligible ? 'Current scoring eligible' : `Historical panel · ${row.currentPolicy?.reason ?? 'Current eligibility not established'}`,
    interval: row.interval,
    retrievedAt: row.currentPolicy?.retrievedAt ?? block.sources.find(s => s.id === row.sourceId)?.retrievedAt ?? null,
    evaluatedAt: row.evaluatedAt,
  }));
}

export function bridgeViewRows(dataset: BridgeDataset, axis: string, cohort?: string[]): ViewRow[] {
  return bridgeRatingRows(dataset, axis, cohort).map(row => ({
    id: row.id, modelKey: row.modelKey, label: row.modelLabel, detail: row.identityVerified ? 'Primary identity confirmed' : `Unverified: ${row.identityReason}`,
    value: row.value, nativeValue: row.value, valueLabel: row.value === null ? `Unknown: ${row.missingReason}` : String(row.value),
    unit: row.unit, version: row.version, sourceClass: row.provenance,
    coverage: `${Object.values(row.ratings).filter(v => v !== null).length}/${dataset.axes.length} published rating axes · retrieved ${row.retrievedAt.slice(0, 10)}`,
    missingReason: row.missingReason ?? null, sources: [{ url: row.resultUrl, label: 'Exact model result' }],
    eligibility: row.exclusion,
    retrievedAt: row.retrievedAt, evaluatedAt: null,
  }));
}

export type CapturedResult = {
  id: string; value: number; valueText: string; unit: { label: string | null; status: string } | null;
  version: string | null; sourceClass: string; verified: boolean; resultUrl: string;
  verificationStatus: string; metric: string;
  retrievedAt?: string; evaluatedAt?: string | null;
};
type CapturedModel = { id: string; name: string; lab: string; originalSourceUrl?: string | null; identityVerified?: boolean };
export function capturedViewRows(rows: { observation: CapturedResult; model: CapturedModel }[], watchlist: CapturedModel[] = []): ViewRow[] {
  if (!rows.length) return watchlist.map(model => ({
    id: model.id, modelKey: model.id, label: model.name, detail: model.lab,
    value: null, nativeValue: null, valueLabel: 'No captured result', unit: 'Unknown', version: 'Version unknown',
    sourceClass: 'Identity only; no benchmark measurement', coverage: 'No captured result on the selected suite', missingReason: 'No captured result',
    sources: model.originalSourceUrl ? [{ url: model.originalSourceUrl, label: 'Release / model source' }] : [],
    eligibility: model.identityVerified ? 'Identity confirmed; no scored result' : 'Identity source status unknown',
  }));
  return rows.map(({ observation: r, model: m }) => ({
    id: r.id, modelKey: m.id, label: m.name, detail: `${m.lab} · ${r.metric} · ${r.verified ? 'verified' : 'unverified'}`,
    value: r.value, nativeValue: r.value,
    valueLabel: r.unit?.label ? `${r.valueText} ${r.unit.label}` : `${r.valueText} · unit ${r.unit?.status ?? 'unknown'}`,
    unit: r.unit?.label ?? `unit ${r.unit?.status ?? 'unknown'}`, version: r.version ?? 'Version unknown',
    sourceClass: r.sourceClass, coverage: 'One captured claim; comparable capability coverage not established', missingReason: null,
    sources: [{ url: r.resultUrl, label: 'Original result' }], eligibility: r.verificationStatus,
    retrievedAt: r.retrievedAt ?? null, evaluatedAt: r.evaluatedAt ?? null,
  }));
}

export function domainViewRows(block: AuthorityBlock, cohort: string[], weights: WeightSettings): ViewRow[] {
  // Compute each positively weighted domain independently through the SAME
  // strict cohort/panel/family rules. An incomplete overall score stays null.
  // Zero-weight domains are disclosed gaps, never zero-valued measurements.
  return Object.keys(DEFAULT_WEIGHTS).flatMap(domain => {
    const selected = (weights[domain] ?? 0) > 0;
    const panel = selected ? currentAuthorityPanel(block, cohort, { [domain]: 1 }) : null;
    return cohort.map(modelKey => {
      const measured = panel?.rows.filter(r => r.modelKey === modelKey) ?? [];
      const value = panel?.result.models?.[modelKey]?.domainScores[domain] ?? null;
      const missingReason = !selected ? 'Excluded by zero weight' : value === null ? 'No compatible current common panel' : null;
      return {
        id: `${modelKey}|${domain}`, modelKey, domain, label: block.models.find(m => m.key === modelKey)?.name ?? modelKey,
        detail: domain.replaceAll('-', ' '), value, nativeValue: value, valueLabel: value === null ? missingReason! : `${(value * 100).toFixed(1)}%`,
        unit: 'normalized fraction (0–1)', version: [...new Set(measured.map(r => `${r.suiteId}@${block.suites.find(s => s.id === r.suiteId)?.version ?? 'unknown'}`))].join(', ') || 'No common suite version',
        sourceClass: [...new Set(measured.map(r => r.provenance))].join(', ') || 'No eligible evidence',
        coverage: `${measured.length} common panels / ${new Set(measured.map(r => block.suites.find(s => s.id === r.suiteId)?.familyId)).size} families · weight ${weights[domain] ?? 0}`,
        missingReason, sources: [...new Map(measured.map(r => [r.resultUrl, { url: r.resultUrl, label: `${r.suiteId} · ${r.metric} · ${r.configuration.setting ?? 'Setting unknown'}` }])).values()],
        eligibility: 'Current policy; strict common conditions and settings; family means before domain means',
        retrievedAt: measured.length ? measured.map(r => r.currentPolicy?.retrievedAt ?? block.sources.find(s => s.id === r.sourceId)?.retrievedAt ?? '').sort()[0] || null : null,
        evaluatedAt: measured.length && measured.every(r => r.evaluatedAt === measured[0].evaluatedAt) ? measured[0].evaluatedAt : null,
      };
    });
  });
}
