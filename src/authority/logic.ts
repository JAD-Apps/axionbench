// Pure, framework-free logic shared by the mounted views and node regression
// scripts (erasable TypeScript only, so Node can strip types when testing).

export type Provenance = 'benchmark-authority' | 'independent-evaluator' | 'publisher-own' | 'publisher-comparison-claim';
export type Region = 'us' | 'cn' | 'global' | 'other' | 'unknown';
export type AuthorityObservation = {
  id: string; sourceId: string; provenance: Provenance; suiteId: string; domain: string; metric: string; primary: boolean;
  modelKey: string; modelLabel: string;
  configuration: { id: string; harness: string | null; setting: string | null; condition: string | null; conditionsKnown: boolean };
  value: number; rawValue: number; rawText: string; rawUnit: 'fraction' | 'percent'; unitEvidence: string;
  interval: { low: number; high: number; method: string } | null; stderr: number | null;
  counts: Record<string, number> | null; evaluatedAt: string | null; evaluatedAtBasis: string; resultUrl: string;
  tableCell?: { table: number; row: number; column: number };
  admitted: boolean; exclusion: string | null; matchable: boolean;
};
export type AuthoritySuite = { id: string; name: string; version: string; domain: string; familyId: string; benchmarkUrl: string | null };
export type AuthoritySource = { id: string; name: string; publisher: string; provenance: string; url: string; resultUrl: string;
  sha256: string; retrievedAt: string; generatedAt: string | null; licence: string; rows: number; note: string };
export type AuthorityModel = { key: string; name: string; labels: string[]; labId: string | null; lab: string | null;
  organizations: string[]; country: string | null; region: Region; regionNote: string };
export type AuthorityBlock = {
  schemaVersion: string; regionDefinition: string; inputDigests: Record<string, { path: string; sha256: string }>;
  frontierDefault: { suiteId: string; sourceId: string; metric: string; representatives: number };
  sources: AuthoritySource[]; suites: AuthoritySuite[]; models: AuthorityModel[]; observations: AuthorityObservation[];
  exclusions: { sourceId: string; label: string; reason: string }[];
  floor: { requiredSuites: number; requiredDomains: number; suites: string[]; domains: string[]; separatePanelSuites: string[]; met: boolean };
};

export const H2H_METHOD = 'matched-intersection-v1';
const NAMED_SETTINGS = ['max', 'promax', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none'];
export const TIE_EPSILON = 1e-9;

// Value-independent preference used to pick one configuration per model: named
// effort levels high→low, then explicit token budgets large→small, then unstated.
export function settingRank(setting: string | null): number {
  if (setting === null) return 1000;
  const named = NAMED_SETTINGS.indexOf(setting);
  if (named >= 0) return named;
  const budget = /^(\d+)K$/.exec(setting);
  return budget ? 100 - Math.min(99, Number(budget[1]) / 10) : 900;
}

export const panelId = (row: AuthorityObservation) => `${row.sourceId}|${row.suiteId}|${row.metric}`;
export const pct = (value: number, digits = 1) => (value * 100).toFixed(digits) + '%';
export const points = (delta: number, digits = 1) => (delta > 0 ? '+' : delta < 0 ? '−' : '±') + Math.abs(delta).toFixed(digits) + ' pp';

export type RankingPanel = { id: string; sourceId: string; suiteId: string; metric: string; rows: number; models: number };
export function rankingPanels(block: AuthorityBlock): RankingPanel[] {
  const panels = new Map<string, AuthorityObservation[]>();
  for (const row of block.observations) {
    if (!row.admitted || !['benchmark-authority', 'independent-evaluator'].includes(row.provenance)) continue;
    const id = panelId(row);
    panels.set(id, [...(panels.get(id) ?? []), row]);
  }
  return [...panels].map(([id, rows]) => ({ id, sourceId: rows[0].sourceId, suiteId: rows[0].suiteId, metric: rows[0].metric,
    rows: rows.length, models: new Set(rows.map((row) => row.modelKey)).size }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export type Cohort = 'representatives' | 'all';
// Representatives: the N distinct models with the highest listed configuration,
// each shown once at that configuration (label states the rule).
export function rankingRows(block: AuthorityBlock, panel: string, cohort: Cohort, limit: number) {
  const rows = block.observations.filter((row) => row.admitted && panelId(row) === panel)
    .sort((a, b) => b.value - a.value || a.modelKey.localeCompare(b.modelKey) || a.configuration.id.localeCompare(b.configuration.id));
  if (cohort === 'all') return rows;
  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(row.modelKey) && seen.add(row.modelKey)).slice(0, limit);
}

export function regionalModels(block: AuthorityBlock) {
  const matchable = new Set(block.observations.filter((row) => row.matchable).map((row) => row.modelKey));
  const byName = (a: AuthorityModel, b: AuthorityModel) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  const models = block.models.filter((model) => matchable.has(model.key)).sort(byName);
  return {
    us: models.filter((model) => model.region === 'us'),
    cn: models.filter((model) => model.region === 'cn'),
    outside: block.models.filter((model) => model.region !== 'us' && model.region !== 'cn').sort(byName),
  };
}

export type H2HFilters = { domain: string; sameSetting: boolean; sourceId: string };
export const DEFAULT_FILTERS: H2HFilters = { domain: 'all', sameSetting: false, sourceId: 'any' };
export type MatchedRow = {
  id: string; suiteId: string; sourceId: string; metric: string; domain: string; familyId: string; condition: string;
  a: AuthorityObservation; b: AuthorityObservation; deltaPoints: number; leader: 'a' | 'b' | 'tie';
};
export type Excluded = { observation: AuthorityObservation; side: 'a' | 'b'; reason: string };
export type DomainSummary = { domain: string; suites: number; families: number; a: number; b: number; deltaPoints: number; leader: 'a' | 'b' | 'tie' };
export type H2HResult = {
  method: string; a: string; b: string; filters: H2HFilters; matched: MatchedRow[]; domains: DomainSummary[];
  onlyA: AuthorityObservation[]; onlyB: AuthorityObservation[]; excluded: Excluded[];
  counts: { matched: number; aHigher: number; bHigher: number; ties: number; onlyA: number; onlyB: number; excluded: number };
};

const leaderOf = (a: number, b: number): 'a' | 'b' | 'tie' => Math.abs(a - b) <= TIE_EPSILON ? 'tie' : a > b ? 'a' : 'b';
const highest = (rows: AuthorityObservation[]) => {
  const best = Math.min(...rows.map((row) => settingRank(row.configuration.setting)));
  return rows.filter((row) => settingRank(row.configuration.setting) === best);
};

export function headToHead(block: AuthorityBlock, a: string, b: string, filters: H2HFilters = DEFAULT_FILTERS): H2HResult {
  const suites = new Map(block.suites.map((suite) => [suite.id, suite]));
  const matched: MatchedRow[] = [];
  const excluded: Excluded[] = [];
  const onlyA: AuthorityObservation[] = [];
  const onlyB: AuthorityObservation[] = [];
  const relevant = block.observations.filter((row) => row.primary && (row.modelKey === a || row.modelKey === b)
    && (filters.domain === 'all' || row.domain === filters.domain)
    && (filters.sourceId === 'any' || row.sourceId === filters.sourceId));
  const panels = new Map<string, AuthorityObservation[]>();
  for (const row of relevant) {
    const side = row.modelKey === a ? 'a' : 'b';
    if (!row.admitted) { excluded.push({ observation: row, side, reason: row.exclusion ?? 'not admitted' }); continue; }
    if (!row.configuration.conditionsKnown) { excluded.push({ observation: row, side, reason: 'evaluation conditions are not stated by the source, so no strict match is possible' }); continue; }
    panels.set(panelId(row), [...(panels.get(panelId(row)) ?? []), row]);
  }
  for (const [id, rows] of [...panels].sort(([x], [y]) => x.localeCompare(y))) {
    const rowsA = rows.filter((row) => row.modelKey === a);
    const rowsB = rows.filter((row) => row.modelKey === b);
    if (!rowsB.length) { onlyA.push(...rowsA); continue; }
    if (!rowsA.length) { onlyB.push(...rowsB); continue; }
    const conditionsA = new Set(rowsA.map((row) => row.configuration.condition));
    const common = [...new Set(rowsB.map((row) => row.configuration.condition))].filter((condition) => conditionsA.has(condition)).sort();
    if (!common.length) {
      const reason = `incompatible test conditions: ${[...conditionsA].join(', ')} versus ${[...new Set(rowsB.map((row) => row.configuration.condition))].join(', ')}`;
      for (const row of rows) excluded.push({ observation: row, side: row.modelKey === a ? 'a' : 'b', reason });
      continue;
    }
    for (const row of rows) if (!common.includes(row.configuration.condition)) {
      excluded.push({ observation: row, side: row.modelKey === a ? 'a' : 'b', reason: 'test condition has no counterpart for the other model' });
    }
    for (const condition of common) {
      let candidatesA = rowsA.filter((row) => row.configuration.condition === condition);
      let candidatesB = rowsB.filter((row) => row.configuration.condition === condition);
      if (filters.sameSetting) {
        const settingsB = new Set(candidatesB.map((row) => row.configuration.setting));
        const shared = [...new Set(candidatesA.map((row) => row.configuration.setting))].filter((setting) => settingsB.has(setting))
          .sort((x, y) => settingRank(x) - settingRank(y));
        if (!shared.length) {
          for (const row of [...candidatesA, ...candidatesB]) excluded.push({ observation: row, side: row.modelKey === a ? 'a' : 'b', reason: 'no identical reasoning setting for both models' });
          continue;
        }
        candidatesA = candidatesA.filter((row) => row.configuration.setting === shared[0]);
        candidatesB = candidatesB.filter((row) => row.configuration.setting === shared[0]);
      } else {
        candidatesA = highest(candidatesA);
        candidatesB = highest(candidatesB);
      }
      const chosen = new Set([...candidatesA, ...candidatesB].map((row) => row.id));
      for (const row of rows.filter((row) => row.configuration.condition === condition && !chosen.has(row.id))) {
        excluded.push({ observation: row, side: row.modelKey === a ? 'a' : 'b', reason: 'another configuration of this model was selected by the declared setting rule' });
      }
      if (candidatesA.length !== 1 || candidatesB.length !== 1) {
        for (const row of [...candidatesA, ...candidatesB]) excluded.push({ observation: row, side: row.modelKey === a ? 'a' : 'b', reason: 'duplicate observations for one model at the same condition and setting; not silently selected' });
        continue;
      }
      const [rowA, rowB] = [candidatesA[0], candidatesB[0]];
      const suite = suites.get(rowA.suiteId);
      matched.push({ id: `${id}|${condition}`, suiteId: rowA.suiteId, sourceId: rowA.sourceId, metric: rowA.metric,
        domain: rowA.domain, familyId: suite?.familyId ?? rowA.suiteId, condition: condition ?? 'unstated',
        a: rowA, b: rowB, deltaPoints: (rowB.value - rowA.value) * 100, leader: leaderOf(rowA.value, rowB.value) });
    }
  }
  return { method: H2H_METHOD, a, b, filters, matched, domains: domainSummaries(matched), onlyA, onlyB, excluded,
    counts: { matched: matched.length, aHigher: matched.filter((row) => row.leader === 'a').length,
      bHigher: matched.filter((row) => row.leader === 'b').length, ties: matched.filter((row) => row.leader === 'tie').length,
      onlyA: onlyA.length, onlyB: onlyB.length, excluded: excluded.length } };
}

// Domain means over matched rows only: average within a benchmark family first
// (family cap), then equally across families. Both models share every row.
export function domainSummaries(rows: MatchedRow[]): DomainSummary[] {
  const byDomain = new Map<string, MatchedRow[]>();
  for (const row of rows) byDomain.set(row.domain, [...(byDomain.get(row.domain) ?? []), row]);
  return [...byDomain].map(([domain, list]) => {
    const families = new Map<string, MatchedRow[]>();
    for (const row of list) families.set(row.familyId, [...(families.get(row.familyId) ?? []), row]);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const a = mean([...families.values()].map((group) => mean(group.map((row) => row.a.value))));
    const b = mean([...families.values()].map((group) => mean(group.map((row) => row.b.value))));
    return { domain, suites: list.length, families: families.size, a, b, deltaPoints: (b - a) * 100, leader: leaderOf(a, b) };
  }).sort((x, y) => x.domain.localeCompare(y.domain));
}

// Default pair: US × China models with the most matched tests (value-independent),
// preferring pairs whose older member has the most recent evaluation.
export function defaultPair(block: AuthorityBlock) {
  const { us, cn } = regionalModels(block);
  const latest = new Map<string, string>();
  const keys = new Map<string, Set<string>>();
  for (const row of block.observations) {
    if (!row.matchable) continue;
    const id = `${panelId(row)}|${row.configuration.condition}`;
    keys.set(row.modelKey, (keys.get(row.modelKey) ?? new Set()).add(id));
    if (row.evaluatedAt && (latest.get(row.modelKey) ?? '') < row.evaluatedAt) latest.set(row.modelKey, row.evaluatedAt);
  }
  let best: { a: string; b: string; count: number; recency: string } | null = null;
  const candidates: { a: string; b: string; count: number; recency: string }[] = [];
  for (const x of us) for (const y of cn) {
    const setA = keys.get(x.key) ?? new Set<string>();
    let count = 0;
    for (const id of keys.get(y.key) ?? []) if (setA.has(id)) count += 1;
    if (!count) continue;
    const recency = [latest.get(x.key) ?? '', latest.get(y.key) ?? ''].sort()[0];
    candidates.push({ a: x.key, b: y.key, count, recency });
  }
  const most = Math.max(0, ...candidates.map((c) => c.count));
  for (const candidate of candidates.filter((c) => c.count >= Math.min(4, most))) {
    if (!best || candidate.recency > best.recency || (candidate.recency === best.recency && (candidate.count > best.count
      || (candidate.count === best.count && `${candidate.a}|${candidate.b}` < `${best.a}|${best.b}`)))) best = candidate;
  }
  return best ? { a: best.a, b: best.b } : null;
}

export type H2HState = { a: string; b: string; filters: H2HFilters };
export function encodeH2H(state: H2HState, params: URLSearchParams) {
  params.set('us', state.a); params.set('cn', state.b);
  params.set('h2hDomain', state.filters.domain);
  params.set('h2hSetting', state.filters.sameSetting ? 'same' : 'highest');
  params.set('h2hSource', state.filters.sourceId);
  params.set('h2hMethod', H2H_METHOD);
  return params;
}
export function decodeH2H(block: AuthorityBlock, params: URLSearchParams): H2HState | null {
  const { us, cn } = regionalModels(block);
  const fallback = defaultPair(block);
  const a = us.some((model) => model.key === params.get('us')) ? params.get('us')! : fallback?.a;
  const b = cn.some((model) => model.key === params.get('cn')) ? params.get('cn')! : fallback?.b;
  if (!a || !b) return null;
  const domain = params.get('h2hDomain');
  const source = params.get('h2hSource');
  return { a, b, filters: {
    domain: domain && (domain === 'all' || block.suites.some((suite) => suite.domain === domain)) ? domain : 'all',
    sameSetting: params.get('h2hSetting') === 'same',
    sourceId: source && (source === 'any' || block.sources.some((row) => row.id === source)) ? source : 'any',
  } };
}

export function comparisonExport(block: AuthorityBlock, result: H2HResult, digest: string) {
  const model = (key: string) => block.models.find((row) => row.key === key);
  const obs = (row: AuthorityObservation) => ({ id: row.id, sourceId: row.sourceId, provenance: row.provenance, suiteId: row.suiteId,
    metric: row.metric, configuration: row.configuration, value: row.value, rawText: row.rawText, rawUnit: row.rawUnit,
    interval: row.interval, stderr: row.stderr, evaluatedAt: row.evaluatedAt, resultUrl: row.resultUrl });
  return {
    schemaVersion: 'axionbench-head-to-head-v1', method: result.method, dataDigest: digest,
    regionDefinition: block.regionDefinition,
    selection: { us: model(result.a), cn: model(result.b) }, filters: result.filters,
    panel: 'Matched intersection: same source, suite, version, metric and test condition; one configuration per model by the declared setting rule; no overall winner.',
    counts: result.counts,
    domains: result.domains,
    matched: result.matched.map((row) => ({ id: row.id, suiteId: row.suiteId, sourceId: row.sourceId, metric: row.metric, domain: row.domain,
      condition: row.condition, deltaPoints: row.deltaPoints, leader: row.leader, us: obs(row.a), cn: obs(row.b) })),
    onlyUs: result.onlyA.map(obs), onlyCn: result.onlyB.map(obs),
    excluded: result.excluded.map((row) => ({ side: row.side === 'a' ? 'us' : 'cn', reason: row.reason, observation: obs(row.observation) })),
  };
}
