import { panelId, type AuthorityBlock, type AuthorityObservation } from '../authority/logic.ts';
import { authorityViewRows, type ViewRow } from '../charts/rows.ts';

export type VersionIdentity = { key: string; name: string; labId: string; apiId: string; selection: string; lifecycle: string; identityVerified: boolean; identityReason: string | null; originalSourceUrl: string; retrievedAt: string; releaseDate: string | null };
export type VersionRow = ViewRow & { releaseDate: string | null; comparisonKey: string | null; comparisonReason: string | null; observationId: string | null };
export function versionPanels(block: AuthorityBlock, models: VersionIdentity[]) {
  const ids = new Set(models.filter(m => m.identityVerified).map(m => m.key));
  return [...new Set(block.observations.filter(r => r.primary && r.admitted && ids.has(r.modelKey)).map(panelId))].sort();
}
// Unknown fields never match each other. Catalogue creation/retrieval dates are
// deliberately absent from this key and from the release-date axis.
export function comparisonIdentity(block: AuthorityBlock, r: AuthorityObservation) {
  const suite = block.suites.find(s => s.id === r.suiteId);
  if (!r.primary || !r.admitted || !r.matchable) return { key: null, reason: 'This claim is not admitted for a matched comparison.' };
  if (!r.currentPolicy?.versionId || !suite?.version || /not stated|unknown|unversioned|as published/i.test(suite.version)) return { key: null, reason: 'The suite version is not established.' };
  if (!r.currentPolicy?.harnessVersion || !r.configuration.harness) return { key: null, reason: 'The tested harness revision is not established.' };
  if (!r.configuration.conditionsKnown || !r.configuration.condition) return { key: null, reason: 'The test conditions are not established.' };
  if (r.configuration.setting === null || !r.configuration.setting.trim()) return { key: null, reason: 'The reasoning setting is unreported; two unknown settings do not establish a match.' };
  return { key: JSON.stringify([r.sourceId, r.provenance, r.suiteId, suite.version, r.currentPolicy.versionId,
    r.metric, r.rawUnit, r.configuration.harness, r.currentPolicy.harnessVersion, r.configuration.condition, r.configuration.setting]), reason: null };
}
export function versionRows(block: AuthorityBlock, models: VersionIdentity[], keys: string[], panel: string, condition: string, setting: string): VersionRow[] {
  return [...new Set(keys)].flatMap<VersionRow>(key => {
    const m = models.find(m => m.key === key); if (!m) return [];
    const candidates = m.identityVerified ? block.observations.filter(r => r.modelKey === key && r.primary && r.admitted && panelId(r) === panel
      && (condition === 'all' || r.configuration.condition === condition)
      && (setting === 'all' || (r.configuration.setting ?? 'unreported') === setting)) : [];
    const releaseDate = m.releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(m.releaseDate) && Number.isFinite(Date.parse(m.releaseDate)) && new Date(m.releaseDate).toISOString().slice(0,10) === m.releaseDate ? m.releaseDate : null;
    const r = candidates.length === 1 ? candidates[0] : null;
    if (r) {
      const row = authorityViewRows(block, [r])[0]; const comparison = comparisonIdentity(block, r);
      return [{ ...row, id: key, label: m.name, value: r.rawValue, nativeValue: r.rawValue,
        detail: `${m.apiId} · ${r.metric} · ${r.configuration.condition ?? 'Conditions unknown'} · ${r.configuration.setting ?? 'Reasoning setting unreported'}`,
        releaseDate, comparisonKey: comparison.key, comparisonReason: comparison.reason, observationId: r.id,
        coverage: 'One exact configuration; ' + (comparison.reason ?? 'Comparable only with the identical source, suite, metric, harness, conditions and reasoning setting'),
        sources: [...row.sources, { url: m.originalSourceUrl, label: 'Exact release identity' }] }];
    }
    const reason = !m.identityVerified ? m.identityReason ?? 'Identity is unconfirmed.' : candidates.length > 1
      ? 'Multiple configurations remain. Select one condition and reasoning setting.' : 'No admitted measurement for this exact identity and selected filters.';
    return [{ id: key, modelKey: key, label: m.name, detail: m.apiId, value: null, nativeValue: null, valueLabel: reason,
      unit: 'No measured unit', version: block.suites.find(s => s.id === panel.split('|')[1])?.version ?? 'Unknown', sourceClass: 'Identity only; no selected measurement',
      coverage: 'No selected comparable result', missingReason: reason, sources: [{ url: m.originalSourceUrl, label: 'Exact release identity' }],
      eligibility: 'No scored result', retrievedAt: m.retrievedAt, evaluatedAt: null, releaseDate, comparisonKey: null, comparisonReason: reason, observationId: null }];
  });
}
export function pairAvailability(rows: VersionRow[]) {
  if (rows.length !== 2 || rows[0].modelKey === rows[1].modelKey) return { available: false, reason: 'Select two different exact identities.' };
  const failed = rows.find(r => r.comparisonReason || r.value === null);
  if (failed) return { available: false, reason: `${failed.label}: ${failed.comparisonReason ?? failed.missingReason}` };
  if (!rows[0].comparisonKey || !rows[1].comparisonKey) return { available: false, reason: 'A complete comparison identity is unavailable; unknown fields cannot establish a match.' };
  if (rows[0].comparisonKey !== rows[1].comparisonKey) return { available: false, reason: 'Source, suite/harness version, metric, native unit, conditions or reasoning settings differ.' };
  return { available: true, reason: 'Both exact identities have the same source, suite/harness version, metric, native unit, conditions and reasoning setting.' };
}
export function trendSeries(rows: VersionRow[]) {
  // Each dated identity occupies a slot even if absent/incompatible. Nulls break
  // lines, including a missing middle release. Undated identities cannot place
  // a chronological point and remain visible in the table.
  const dated = rows.filter(r => r.releaseDate).sort((a,b) => a.releaseDate!.localeCompare(b.releaseDate!) || a.modelKey.localeCompare(b.modelKey));
  const groups = [...new Set(dated.filter(r => r.value !== null).map(r => r.comparisonKey ?? `isolated:${r.id}`))];
  return groups.map(key => ({ key, rows: dated, values: dated.map(r => (r.comparisonKey ?? `isolated:${r.id}`) === key ? r.value : null) }));
}
