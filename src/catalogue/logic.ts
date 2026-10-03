// Catalogue, benchmark library and export logic. Pure functions: the page, the exports and
// test:catalogue all use this one module. Nothing here invents a value; unknown stays null.
import { bandFor, PARAMETER_BANDS, type BandId, type OpenWeightRow } from '../open-weights/logic.ts';

export const CATALOGUE_PAGE_SIZE = 25;
export const CATALOGUE_SCHEMA = 'axionbench-catalogue-export-v1';

export type Region = 'us' | 'cn' | 'global' | 'other' | 'unknown';
export type Openness = 'public-weights' | 'gated' | 'repository-unchecked' | 'unknown';
export type Origin = 'catalogue' | 'authority';

export type InputModel = {
  id: string; name: string; labId: string; lab: string; releaseDate: string | null; parameters: number | null;
  activatedParameters: number | null; weightsAvailability: string; modalities: { input?: string[] } | null;
  originalSourceUrl: string | null; identitySourceId: string | null; identityVerified: boolean; revision?: string;
};
export type InputObservation = {
  id: string; modelId: string; suiteId: string; metric: string; valueText: string; unit: { label: string | null; status: string } | null;
  retrievedAt: string; resultUrl: string; verified: boolean;
};
export type InputSuite = {
  id: string; name: string; domain: string; familyId: string; version: string | null; url: string | null; state: string; reason?: string;
  observationCount: number;
};
export type AuthorityInput = {
  regionDefinition: string;
  sources: { id: string; name: string; publisher: string; provenance: string; url: string; resultUrl: string; retrievedAt: string; licence: string }[];
  suites: { id: string; name: string; version: string; domain: string; familyId: string; benchmarkUrl: string | null }[];
  models: { key: string; name: string; labId: string | null; lab: string | null; region: Region; country: string | null; currentIdentity?: { lifecycle: string; identityVerified: boolean; originalSourceUrl?: string; apiId?: string; releaseDate?: string | null } }[];
  observations: { id: string; sourceId: string; suiteId: string; metric: string; modelKey: string; rawText: string; rawUnit: string;
    resultUrl: string; domain: string; admitted: boolean; exclusion: string | null; configuration: { id: string; conditionsKnown: boolean } | null;
    interval: { low: number; high: number; method: string } | null }[];
  exclusions: { sourceId: string; label: string; reason: string }[];
};
export type ScoringInput = {
  methodVersion: string; normalization: string; defaultWeights: Record<string, number>; familyCap: string; cohortRule: string;
  eligibility: string[]; separatePanels: string[]; priceScenario: string;
  currentCaptureAudit: { observations: number; defaultAdmittedObservations: number; reason: string };
};
export type CatalogueInput = {
  retrievedAt: string; sourceDigest: string; models: InputModel[]; observations: InputObservation[]; suites: InputSuite[];
  authority: AuthorityInput; openWeights: { rows: OpenWeightRow[] }; scoring: ScoringInput;
  bridgeBench?: { id: string; records: { modelKey: string; modelLabel: string; ratings: Record<string, number | null>; resultUrl: string }[] };
};

export type CatalogueRow = {
  id: string; name: string; lab: string; labId: string; origin: Origin;
  region: Region; regionBasis: string; openness: Openness; parameters: number | null; parameterBand: BandId;
  activatedParameters: number | null; inputModalities: string[]; releaseDate: string | null;
  admitted: number; reported: number; excluded: number; suites: number; domains: number;
  scoreState: 'unscored'; scoreReason: string; freshness: string | null;
  sourceUrl: string | null; sourceId: string | null;
  lifecycle: 'current' | 'archive' | 'unknown'; version: string | null;
};
export type EvidenceRow = {
  id: string; suiteId: string; suiteName: string; domain: string; metric: string; display: string; configuration: string | null;
  status: 'admitted' | 'excluded' | 'reported-unverified'; reason: string | null; resultUrl: string; sourceName: string; retrievedAt: string;
};
export type Benchmark = {
  id: string; name: string; domain: string; familyId: string; version: string | null; url: string | null;
  state: string; admitted: number; reported: number; models: number; results: { url: string; label: string }[]; note: string | null;
};
export type Catalogue = { rows: CatalogueRow[]; benchmarks: Benchmark[]; capabilityDomains: string[] };

const unique = <T,>(values: T[]) => [...new Set(values)];

export function opennessOf(availability: string): Openness {
  if (availability.startsWith('public repository')) return 'public-weights';
  if (availability.startsWith('gated')) return 'gated';
  if (availability.startsWith('repository referenced')) return 'repository-unchecked';
  return 'unknown';
}

/** Region is taken from a same-lab Epoch record only when every Epoch-attributed model of that lab agrees. */
export function labRegions(authority: AuthorityInput) {
  const byLab = new Map<string, Set<Region>>();
  for (const model of authority.models) {
    if (!model.labId || model.region === 'unknown') continue;
    if (!byLab.has(model.labId)) byLab.set(model.labId, new Set());
    byLab.get(model.labId)!.add(model.region);
  }
  return new Map([...byLab].filter(([, set]) => set.size === 1).map(([lab, set]) => [lab, [...set][0]]));
}

const SCORE_REASON_NONE = 'No admitted observation: nothing to score.';
const SCORE_REASON_COHORT = 'Scores exist only inside a cohort with a compatible common panel; a catalogue-wide score would need per-model renormalization, which the method forbids.';

export function buildCatalogue(input: CatalogueInput): Catalogue {
  const capabilityDomains = Object.keys(input.scoring.defaultWeights);
  const capability = new Set(capabilityDomains);
  const suiteById = new Map<string, Benchmark>();
  for (const suite of input.suites) suiteById.set(suite.id, { id: suite.id, name: suite.name, domain: suite.domain, familyId: suite.familyId,
    version: suite.version, url: suite.url, state: suite.state, admitted: 0, reported: 0, models: 0, results: [], note: suite.reason ?? null });
  for (const suite of input.authority.suites) if (!suiteById.has(suite.id)) suiteById.set(suite.id, { id: suite.id, name: suite.name, domain: suite.domain,
    familyId: suite.familyId, version: suite.version, url: suite.benchmarkUrl, state: 'available', admitted: 0, reported: 0, models: 0, results: [], note: null });
  const sourceById = new Map(input.authority.sources.map((source) => [source.id, source]));
  const regions = labRegions(input.authority);
  const ow = new Map(input.openWeights.rows.map((row) => [row.modelId, row]));
  const benchmarkModels = new Map<string, Set<string>>();
  const addResult = (benchmark: Benchmark | undefined, url: string, label: string) => {
    if (benchmark && url && !benchmark.results.some((row) => row.url === url)) benchmark.results.push({ url, label });
  };
  if (input.bridgeBench) {
    const benchmark = suiteById.get(input.bridgeBench.id);
    if (benchmark) {
      benchmark.reported = input.bridgeBench.records.reduce((sum, row) => sum + Object.values(row.ratings).filter(value => value !== null).length, 0);
      benchmark.note = 'Native BridgeBench comparative publisher ratings. Proprietary protocol; excluded from capability scoring. Overall includes cost and speed.';
      benchmarkModels.set(benchmark.id, new Set(input.bridgeBench.records.map(row => 'rating:' + row.modelKey)));
      for (const row of input.bridgeBench.records) addResult(benchmark, row.resultUrl, 'BridgeBench publisher rating · ' + row.modelLabel);
    }
  }
  const rows: CatalogueRow[] = [];

  const byModel = new Map<string, InputObservation[]>();
  for (const observation of input.observations) {
    if (!byModel.has(observation.modelId)) byModel.set(observation.modelId, []);
    byModel.get(observation.modelId)!.push(observation);
    const benchmark = suiteById.get(observation.suiteId);
    if (benchmark) { benchmark.reported += 1; addResult(benchmark, observation.resultUrl, 'Reported result source'); }
    if (!benchmarkModels.has(observation.suiteId)) benchmarkModels.set(observation.suiteId, new Set());
    benchmarkModels.get(observation.suiteId)!.add('catalogue:' + observation.modelId);
  }
  for (const model of input.models) {
    const own = byModel.get(model.id) ?? [];
    const row = ow.get(model.id);
    const parameters = model.parameters ?? (row && row.total.status === 'tensor-total' ? row.total.value : null);
    const region = model.labId !== 'other' ? regions.get(model.labId) : undefined;
    rows.push({
      id: model.id, name: model.name, lab: model.lab, labId: model.labId, origin: 'catalogue',
      region: region ?? 'unknown', regionBasis: region ? 'Every Epoch-attributed model with this lab ID has this country.' : 'No single Epoch country record for this lab.',
      openness: opennessOf(model.weightsAvailability), parameters, parameterBand: bandFor(parameters),
      activatedParameters: model.activatedParameters ?? (row?.activated.status === 'card-stated' ? row.activated.value : null),
      inputModalities: unique(model.modalities?.input ?? []).sort(), releaseDate: model.releaseDate,
      admitted: 0, reported: own.length, excluded: 0, suites: unique(own.map((o) => o.suiteId)).length,
      domains: unique(own.map((o) => suiteById.get(o.suiteId)?.domain).filter((d): d is string => !!d && capability.has(d))).length,
      scoreState: 'unscored', scoreReason: own.length ? 'Reported results are not admitted to the score: ' + input.scoring.currentCaptureAudit.reason : SCORE_REASON_NONE,
      freshness: own.map((o) => o.retrievedAt).sort().at(-1) ?? null, sourceUrl: model.originalSourceUrl, sourceId: model.identitySourceId,
      lifecycle: 'unknown', version: model.revision ?? null,
    });
  }

  const authorityByModel = new Map<string, AuthorityInput['observations']>();
  for (const observation of input.authority.observations) {
    if (!authorityByModel.has(observation.modelKey)) authorityByModel.set(observation.modelKey, []);
    authorityByModel.get(observation.modelKey)!.push(observation);
    const benchmark = suiteById.get(observation.suiteId);
    if (benchmark) {
      if (observation.admitted) benchmark.admitted += 1;
      addResult(benchmark, observation.resultUrl, sourceById.get(observation.sourceId)?.name ?? observation.sourceId);
      if (observation.admitted) {
        if (!benchmarkModels.has(observation.suiteId)) benchmarkModels.set(observation.suiteId, new Set());
        benchmarkModels.get(observation.suiteId)!.add('authority:' + observation.modelKey);
      }
    }
  }
  for (const model of input.authority.models) {
    const own = authorityByModel.get(model.key) ?? [];
    const admitted = own.filter((o) => o.admitted);
    rows.push({
      id: 'authority:' + model.key, name: model.name, lab: model.lab ?? 'Unattributed', labId: model.labId ?? 'unattributed', origin: 'authority',
      region: model.region, regionBasis: model.country ? model.country + ' — Epoch AI organization record.' : 'No Epoch organization country record.',
      openness: 'unknown', parameters: null, parameterBand: 'undisclosed', activatedParameters: null, inputModalities: [], releaseDate: null,
      admitted: admitted.length, reported: 0, excluded: own.length - admitted.length,
      suites: unique(admitted.map((o) => o.suiteId)).length,
      domains: unique(admitted.map((o) => o.domain).filter((d) => capability.has(d))).length,
      scoreState: 'unscored', scoreReason: admitted.length ? SCORE_REASON_COHORT : SCORE_REASON_NONE,
      freshness: admitted.map((o) => sourceById.get(o.sourceId)?.retrievedAt ?? '').filter(Boolean).sort().at(-1) ?? null,
      sourceUrl: model.currentIdentity?.originalSourceUrl ?? own[0]?.resultUrl ?? null, sourceId: own[0]?.sourceId ?? null,
      lifecycle: model.currentIdentity?.identityVerified ? model.currentIdentity.lifecycle === 'current' ? 'current' : ['version', 'retired'].includes(model.currentIdentity.lifecycle) ? 'archive' : 'unknown' : 'unknown',
      version: model.currentIdentity?.apiId ?? model.key,
    });
  }
  const benchmarks = [...suiteById.values()].map((b) => ({ ...b, models: benchmarkModels.get(b.id)?.size ?? 0 }))
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
  return { rows, benchmarks, capabilityDomains };
}

/** Every result a model has, with its own link; the benchmark name in the page links to `#benchmark-<suiteId>`. */
export function modelEvidence(input: CatalogueInput, row: CatalogueRow, benchmarks: Benchmark[]): EvidenceRow[] {
  const suite = new Map(benchmarks.map((b) => [b.id, b]));
  const name = (id: string) => suite.get(id)?.name ?? id;
  if (row.origin === 'catalogue') {
    return input.observations.filter((o) => o.modelId === row.id).map((o) => ({
      id: o.id, suiteId: o.suiteId, suiteName: name(o.suiteId), domain: suite.get(o.suiteId)?.domain ?? 'unknown', metric: o.metric,
      display: o.unit?.label ? o.valueText + ' ' + o.unit.label : o.valueText + ' (unit ' + (o.unit?.status ?? 'unknown') + ')', configuration: null,
      status: 'reported-unverified' as const, reason: input.scoring.currentCaptureAudit.reason, resultUrl: o.resultUrl, sourceName: 'Reported result source', retrievedAt: o.retrievedAt,
    }));
  }
  const sources = new Map(input.authority.sources.map((s) => [s.id, s]));
  return input.authority.observations.filter((o) => 'authority:' + o.modelKey === row.id).map((o) => ({
    id: o.id, suiteId: o.suiteId, suiteName: name(o.suiteId), domain: o.domain, metric: o.metric, display: o.rawText + ' (' + o.rawUnit + ')',
    configuration: o.configuration?.id ?? null, status: o.admitted ? 'admitted' as const : 'excluded' as const, reason: o.exclusion, resultUrl: o.resultUrl,
    sourceName: sources.get(o.sourceId)?.name ?? o.sourceId, retrievedAt: sources.get(o.sourceId)?.retrievedAt ?? '',
  }));
}

// ---- Filters, sorting, pagination, URL state ----
export const SORT_KEYS = ['name', 'lab', 'release', 'parameters', 'evidence', 'domains', 'freshness'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type CatFilters = {
  lab: string; openness: 'all' | Openness; region: 'all' | Region; band: 'all' | BandId; modality: string; origin: 'all' | Origin;
  evidence: 'all' | 'admitted' | 'none'; lifecycle: 'all' | 'current' | 'archive' | 'unknown'; query: string; sort: SortKey; dir: 'asc' | 'desc'; page: number; model: string;
};
export const CAT_DEFAULTS: CatFilters = { lab: 'all', openness: 'all', region: 'all', band: 'all', modality: 'all', origin: 'all', evidence: 'all',
  lifecycle: 'all', query: '', sort: 'evidence', dir: 'desc', page: 0, model: '' };
export const OPENNESS: Openness[] = ['public-weights', 'gated', 'repository-unchecked', 'unknown'];
export const REGIONS: Region[] = ['us', 'cn', 'global', 'other', 'unknown'];
export const MODALITIES = ['text', 'image', 'audio', 'video', 'file'];
const BAND_IDS = PARAMETER_BANDS.map((band) => band.id) as string[];
const KEYS = { lab: 'catLab', openness: 'catOpen', region: 'catRegion', band: 'catBand', modality: 'catMod', origin: 'catSource', evidence: 'catEvidence',
  lifecycle: 'catLifecycle', query: 'catQ', sort: 'catSort', dir: 'catDir', page: 'catPage', model: 'catModel' } as const;

export function matches(row: CatalogueRow, f: CatFilters) {
  const q = f.query.trim().toLocaleLowerCase();
  return (f.lab === 'all' || row.labId === f.lab) && (f.openness === 'all' || row.openness === f.openness)
    && (f.region === 'all' || row.region === f.region) && (f.band === 'all' || row.parameterBand === f.band)
    && (f.modality === 'all' || row.inputModalities.includes(f.modality)) && (f.origin === 'all' || row.origin === f.origin)
    && (f.lifecycle === 'all' || row.lifecycle === f.lifecycle)
    && (f.evidence === 'all' || (f.evidence === 'admitted' ? row.admitted > 0 : row.admitted === 0))
    && (!q || [row.name, row.lab, row.id, row.sourceId ?? ''].some((text) => text.toLocaleLowerCase().includes(q)));
}
const sortValue = (row: CatalogueRow, key: SortKey): string | number | null => {
  switch (key) {
    case 'name': return row.name.toLocaleLowerCase();
    case 'lab': return row.lab.toLocaleLowerCase();
    case 'release': return row.releaseDate;
    case 'parameters': return row.parameters;
    case 'evidence': return row.admitted + row.reported;
    case 'domains': return row.domains;
    case 'freshness': return row.freshness;
  }
};
/** Unknown values sort last in either direction; ties break on the stable ID. */
export function sortRows(rows: CatalogueRow[], sort: SortKey, dir: 'asc' | 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, sort); const y = sortValue(b, sort);
    if (x === null && y !== null) return 1;
    if (y === null && x !== null) return -1;
    if (x !== null && y !== null && x !== y) return (x < y ? -1 : 1) * sign;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
export const applyFilters = (rows: CatalogueRow[], f: CatFilters) => sortRows(rows.filter((row) => matches(row, f)), f.sort, f.dir);

export function paginateRows<T>(rows: T[], page: number, size = CATALOGUE_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Number.isFinite(page) ? Math.min(Math.max(0, Math.trunc(page)), pages - 1) : 0;
  return { page: safe, pages, rows: rows.slice(safe * size, (safe + 1) * size), start: rows.length ? safe * size + 1 : 0, end: Math.min(rows.length, (safe + 1) * size) };
}

export function decodeCatFilters(params: URLSearchParams, rows: CatalogueRow[]): CatFilters {
  const pick = <T extends string>(key: keyof typeof KEYS, allowed: readonly string[], fallback: T): T => {
    const value = params.get(KEYS[key]); return value !== null && allowed.includes(value) ? value as T : fallback;
  };
  const page = Number(params.get(KEYS.page));
  const model = params.get(KEYS.model) ?? '';
  return {
    lab: pick('lab', ['all', ...rows.map((row) => row.labId)], 'all'), openness: pick('openness', ['all', ...OPENNESS], 'all'),
    region: pick('region', ['all', ...REGIONS], 'all'), band: pick('band', ['all', ...BAND_IDS], 'all'),
    modality: pick('modality', ['all', ...MODALITIES], 'all'), origin: pick('origin', ['all', 'catalogue', 'authority'], 'all'),
    lifecycle: pick('lifecycle', ['all', 'current', 'archive', 'unknown'], 'all'),
    evidence: pick('evidence', ['all', 'admitted', 'none'], 'all'), query: (params.get(KEYS.query) ?? '').slice(0, 120),
    sort: pick('sort', SORT_KEYS, CAT_DEFAULTS.sort), dir: pick('dir', ['asc', 'desc'], CAT_DEFAULTS.dir),
    page: Number.isInteger(page) && page >= 1 ? page - 1 : 0, model: rows.some((row) => row.id === model) ? model : '',
  };
}
/** Non-default values only; other chapters' parameters are left untouched. The page is written 1-based. */
export function encodeCatFilters(f: CatFilters, url: URL) {
  const next = new URL(url.href);
  for (const key of Object.keys(KEYS) as (keyof typeof KEYS)[]) {
    const value = key === 'page' ? (f.page > 0 ? String(f.page + 1) : '') : String(f[key]);
    const fallback = key === 'page' ? '' : String(CAT_DEFAULTS[key]);
    if (value === fallback) next.searchParams.delete(KEYS[key]); else next.searchParams.set(KEYS[key], value);
  }
  return next;
}
export const catalogueParameterKeys = Object.values(KEYS);

// ---- Exports: the same filtered, sorted rows the table shows (every page), with stable IDs ----
export const CSV_COLUMNS = ['id', 'name', 'lab', 'source_family', 'region', 'openness', 'total_parameters', 'parameter_group', 'activated_parameters',
  'input_modalities', 'release_date', 'admitted_results', 'reported_unverified_results', 'excluded_results', 'suites', 'capability_domains',
  'score_state', 'latest_evidence_retrieval', 'source_url', 'lifecycle', 'version'] as const;
const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? '' : String(value);
  // A spreadsheet must not execute a cell a source happened to start with a formula character.
  if (/^[=+@\t\r]/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
};
export const csvRecord = (row: CatalogueRow) => [row.id, row.name, row.lab, row.origin, row.region, row.openness, row.parameters, row.parameterBand,
  row.activatedParameters, row.inputModalities.join('|'), row.releaseDate, row.admitted, row.reported, row.excluded, row.suites, row.domains,
  row.scoreState, row.freshness, row.sourceUrl, row.lifecycle, row.version];
export function exportCsv(rows: CatalogueRow[]) {
  return [CSV_COLUMNS.join(','), ...rows.map((row) => csvRecord(row).map(csvCell).join(','))].join('\r\n') + '\r\n';
}
export function exportNotice(input: CatalogueInput) {
  return {
    attribution: 'AxionBench public evidence snapshot. Results belong to their original publishers; follow each row\'s source link.',
    authoritySources: input.authority.sources.map((s) => ({ id: s.id, name: s.name, publisher: s.publisher, licence: s.licence, url: s.resultUrl })),
    providerCatalogue: 'Model identity fields come from public provider catalogues and model cards whose redistribution terms are not established. Only identifiers and facts already shown on the page are exported; no prices or endpoint payloads.',
    scoring: 'No row carries a score. Scores exist only inside a cohort with a compatible common panel (method ' + input.scoring.methodVersion + ').',
  };
}
export function exportJson(input: CatalogueInput, rows: CatalogueRow[], f: CatFilters) {
  return JSON.stringify({ schema: CATALOGUE_SCHEMA, sourceDigest: input.sourceDigest, retrievedAt: input.retrievedAt,
    filters: { ...f, page: undefined, model: undefined }, count: rows.length, notice: exportNotice(input), rows }, null, 2);
}

/** History is drawn only when the same sources were archived on at least two dates. */
export function snapshotHistory(input: CatalogueInput) {
  const dates = unique(input.authority.sources.map((s) => s.retrievedAt.slice(0, 10))).sort();
  return { captures: dates, chartable: dates.length >= 2 };
}
