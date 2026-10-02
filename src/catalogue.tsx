import { useEffect, useMemo, useState } from 'react';
import { PARAMETER_BANDS, formatParameters } from './open-weights/logic';
import {
  CAT_DEFAULTS, MODALITIES, OPENNESS, REGIONS, SORT_KEYS, applyFilters, buildCatalogue, decodeCatFilters, encodeCatFilters, exportCsv, exportJson,
  modelEvidence, paginateRows, snapshotHistory,
  type Benchmark, type CatFilters, type CatalogueInput, type CatalogueRow, type SortKey,
} from './catalogue/logic';

type Manifest = { projection: { bytes: number; sha256: string }; details: { bytes: number } };
type Props = { input: CatalogueInput; manifest: Manifest | null };

const OPENNESS_LABEL: Record<string, string> = {
  'public-weights': 'Public weights repository', gated: 'Gated weights repository', 'repository-unchecked': 'Repository referenced, access unchecked', unknown: 'Unknown',
};
const REGION_LABEL: Record<string, string> = { us: 'United States', cn: 'China', global: 'Global / multinational', other: 'Other country', unknown: 'Unknown' };
const SORT_LABEL: Record<SortKey, string> = { name: 'Name', lab: 'Lab', release: 'Release date', parameters: 'Total parameters', evidence: 'Results captured',
  domains: 'Capability domains covered', freshness: 'Evidence freshness' };

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

export function Catalogue({ input, manifest }: Props) {
  const catalogue = useMemo(() => buildCatalogue(input), [input]);
  const labs = useMemo(() => [...new Map(catalogue.rows.map((row) => [row.labId, row.lab])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [catalogue]);
  const [filters, setFilters] = useState<CatFilters>(() => decodeCatFilters(new URLSearchParams(location.search), catalogue.rows));
  const filtered = useMemo(() => applyFilters(catalogue.rows, filters), [catalogue, filters]);
  const view = paginateRows(filtered, filters.page);
  const selected = catalogue.rows.find((row) => row.id === filters.model) ?? null;
  const update = (patch: Partial<CatFilters>) => setFilters((current) => ({ ...current, page: 0, ...patch }));

  useEffect(() => {
    const next = encodeCatFilters({ ...filters, page: view.page }, new URL(location.href));
    if (next.href !== location.href) history.replaceState(null, '', next);
  }, [filters, view.page]);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('catModel')) document.getElementById('model-detail')?.scrollIntoView();
  }, []);

  const select = (key: keyof CatFilters, label: string, options: [string, string][]) =>
    <label>{label}
      <select data-testid={'cat-' + key} value={String(filters[key])} onChange={(event) => update({ [key]: event.target.value } as Partial<CatFilters>)}>
        <option value="all">All</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select></label>;
  const digest = manifest?.projection.sha256 ?? input.sourceDigest;
  const stamp = digest.slice(0, 12);

  return <div className="cat" data-testid="catalogue">
    <div className="cat-controls">
      <label className="search">Search models, labs or source ID
        <input data-testid="cat-query" aria-label="Search models, labs or source ID" value={filters.query} placeholder="Try a model or lab name"
          onChange={(event) => update({ query: event.target.value })}/>
      </label>
      {select('lab', 'Lab', labs)}
      {select('openness', 'Openness', OPENNESS.map((value) => [value, OPENNESS_LABEL[value]]))}
      {select('region', 'Region', REGIONS.map((value) => [value, REGION_LABEL[value]]))}
      {select('band', 'Total parameters', PARAMETER_BANDS.map((band) => [band.id, band.label]))}
      {select('modality', 'Input modality', MODALITIES.map((value) => [value, value]))}
      {select('origin', 'Source family', [['catalogue', 'Provider catalogue and model cards'], ['authority', 'Original benchmark sources']])}
      {select('evidence', 'Evidence', [['admitted', 'Has admitted results'], ['none', 'Unscored, no admitted result']])}
      <label>Sort by
        <select data-testid="cat-sort" value={filters.sort} onChange={(event) => update({ sort: event.target.value as SortKey })}>
          {SORT_KEYS.map((key) => <option key={key} value={key}>{SORT_LABEL[key]}</option>)}</select></label>
      <label>Direction
        <select data-testid="cat-dir" value={filters.dir} onChange={(event) => update({ dir: event.target.value as 'asc' | 'desc' })}>
          <option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
      <div className="cat-actions">
        <button type="button" data-testid="cat-reset" onClick={() => setFilters({ ...CAT_DEFAULTS })}>Reset filters</button>
        <button type="button" data-testid="cat-export-csv" onClick={() => download('axionbench-catalogue-' + stamp + '.csv', 'text/csv', exportCsv(filtered))}>Export CSV</button>
        <button type="button" data-testid="cat-export-json" onClick={() => download('axionbench-catalogue-' + stamp + '.json', 'application/json', exportJson(input, filtered, filters))}>Export JSON</button>
      </div>
    </div>
    <div className="directory-count" aria-live="polite"><strong data-testid="cat-total">{filtered.length.toLocaleString()}</strong>
      <span>of {catalogue.rows.length.toLocaleString()} catalogued entries · exports contain every matching row, not only this page</span>
      <span>{catalogue.rows.filter((row) => row.admitted === 0).length.toLocaleString()} have no admitted result and stay listed as unscored</span></div>
    <div className="table-scroll directory-table" tabIndex={0} aria-label="Scrollable model catalogue">
      <table data-testid="cat-table">
        <caption>Model catalogue for the selected filters. Unknown values are shown as unknown, never as zero.</caption>
        <thead><tr><th scope="col">Model</th><th scope="col">Lab · region</th><th scope="col">Openness</th><th scope="col">Total parameters</th>
          <th scope="col">Evidence</th><th scope="col">Score</th><th scope="col">Freshness</th></tr></thead>
        <tbody>{view.rows.map((row) => <tr key={row.id} data-testid="cat-row" data-id={row.id}>
          <th scope="row"><button type="button" className="cat-open" onClick={() => { update({ model: row.id, page: view.page }); setTimeout(() => document.getElementById('model-detail')?.scrollIntoView(), 0); }}>{row.name}</button>
            <small className="mono-label">{row.id}</small></th>
          <td>{row.lab}<small>{REGION_LABEL[row.region]}</small></td>
          <td>{OPENNESS_LABEL[row.openness]}</td>
          <td>{formatParameters(row.parameters)}<small>{row.parameters === null ? 'Undisclosed in captured sources' : row.parameterBand}</small></td>
          <td>{row.admitted} admitted{row.reported > 0 && <small>{row.reported} reported, not admitted</small>}{row.excluded > 0 && <small>{row.excluded} excluded</small>}
            <small>{row.suites} suites · {row.domains} capability domains</small></td>
          <td>Unscored</td>
          <td>{row.freshness ? row.freshness.slice(0, 10) : 'No result captured'}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {filtered.length === 0 && <p className="cat-empty" role="status">No entry matches these filters. Reset them to see the full catalogue.</p>}
    <div className="pagination">
      <button type="button" data-testid="cat-prev" disabled={view.page === 0} onClick={() => setFilters((c) => ({ ...c, page: view.page - 1 }))}>← Previous</button>
      <span data-testid="cat-page">Page {view.page + 1} of {view.pages} · rows {view.start}–{view.end}</span>
      <button type="button" data-testid="cat-next" disabled={view.page + 1 >= view.pages} onClick={() => setFilters((c) => ({ ...c, page: view.page + 1 }))}>Next →</button>
    </div>
    <ModelDetail input={input} row={selected} benchmarks={catalogue.benchmarks} onClose={() => update({ model: '', page: view.page })}/>
  </div>;
}

function ModelDetail({ input, row, benchmarks, onClose }: { input: CatalogueInput; row: CatalogueRow | null; benchmarks: Benchmark[]; onClose: () => void }) {
  if (!row) return <div id="model-detail" className="model-detail empty"><p>Select a model name for its coverage, sources and every result with its original link.</p></div>;
  const evidence = modelEvidence(input, row, benchmarks);
  return <article id="model-detail" className="model-detail" data-testid="model-detail" data-id={row.id} aria-labelledby="model-detail-title">
    <header><div><p className="eyebrow">Model detail</p><h3 id="model-detail-title">{row.name}</h3><span className="mono-label">{row.id}</span></div>
      <button type="button" data-testid="model-close" onClick={onClose}>Close detail</button></header>
    <dl className="detail-facts">
      <div><dt>Lab</dt><dd>{row.lab}</dd></div>
      <div><dt>Region</dt><dd>{REGION_LABEL[row.region]}<small>{row.regionBasis}</small></dd></div>
      <div><dt>Openness</dt><dd>{OPENNESS_LABEL[row.openness]}</dd></div>
      <div><dt>Total parameters</dt><dd>{formatParameters(row.parameters)}<small>{row.parameters === null ? 'Undisclosed in captured sources' : 'Group ' + row.parameterBand}</small></dd></div>
      <div><dt>Activated parameters</dt><dd>{formatParameters(row.activatedParameters)}</dd></div>
      <div><dt>Release date</dt><dd>{row.releaseDate ?? 'Unknown'}</dd></div>
      <div><dt>Input modalities</dt><dd>{row.inputModalities.length ? row.inputModalities.join(', ') : 'Unknown'}</dd></div>
      <div><dt>Score</dt><dd>Unscored<small>{row.scoreReason}</small></dd></div>
      <div><dt>Freshness</dt><dd>{row.freshness ?? 'No result captured'}</dd></div>
      <div><dt>Identity source</dt><dd>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">Original source ↗</a> : 'No original source link'}<small>{row.sourceId ?? 'No source ID'}</small></dd></div>
    </dl>
    {evidence.length === 0 ? <p className="cat-empty">No result is captured for this model. It stays in the catalogue as unscored.</p>
      : <div className="table-scroll" tabIndex={0} aria-label="Scrollable model results"><table data-testid="model-results">
        <caption>Every captured result for this model</caption>
        <thead><tr><th scope="col">Benchmark</th><th scope="col">Metric</th><th scope="col">Result</th><th scope="col">Status</th><th scope="col">Source</th></tr></thead>
        <tbody>{evidence.map((item) => <tr key={item.id} data-status={item.status}>
          <th scope="row"><a className="benchmark-mention" data-suite={item.suiteId} href={item.resultUrl} target="_blank" rel="noreferrer">{item.suiteName} ↗</a>
            <small><a href={'#benchmark-' + item.suiteId}>Benchmark entry</a> · {item.domain}</small></th>
          <td>{item.metric}</td><td>{item.display}{item.configuration && <small>{item.configuration}</small>}</td>
          <td>{item.status === 'admitted' ? 'Admitted' : item.status === 'excluded' ? 'Excluded' : 'Reported, not admitted'}{item.reason && <small>{item.reason}</small>}</td>
          <td>{item.sourceName}<small>{item.retrievedAt.slice(0, 10)}</small></td>
        </tr>)}</tbody></table></div>}
  </article>;
}

export function BenchmarkLibrary({ input }: { input: CatalogueInput }) {
  const { benchmarks } = useMemo(() => buildCatalogue(input), [input]);
  const [domain, setDomain] = useState(() => new URLSearchParams(location.search).get('benDomain') ?? 'all');
  const domains = [...new Set(benchmarks.map((b) => b.domain))];
  const active = domains.includes(domain) ? domain : 'all';
  const shown = benchmarks.filter((b) => active === 'all' || b.domain === active);
  useEffect(() => {
    const url = new URL(location.href);
    if (active === 'all') url.searchParams.delete('benDomain'); else url.searchParams.set('benDomain', active);
    if (url.href !== location.href) history.replaceState(null, '', url);
  }, [active]);
  useEffect(() => {
    if (location.hash.startsWith('#benchmark-')) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, []);
  return <section className="library" aria-labelledby="library-title" data-testid="benchmark-library">
    <div className="coverage-head"><div><p className="eyebrow">Benchmark library</p><h3 id="library-title">{benchmarks.length} registered benchmarks</h3></div>
      <label className="library-filter">Capability domain
        <select data-testid="library-domain" value={active} onChange={(event) => setDomain(event.target.value)}>
          <option value="all">All domains</option>{domains.map((d) => <option key={d} value={d}>{d}</option>)}</select></label></div>
    <ul className="library-list">{shown.map((b) => {
      const link = b.results[0]?.url ?? b.url;
      return <li key={b.id} id={'benchmark-' + b.id} data-testid="benchmark-entry" data-state={b.state}>
        <div>{link ? <a className="benchmark-mention" href={link} target="_blank" rel="noreferrer">{b.name} ↗</a> : <strong>{b.name}</strong>}
          <small>{b.domain} · {b.version ?? 'version unknown'}</small></div>
        <p>{b.admitted} admitted · {b.reported} reported, not admitted · {b.models} models{b.admitted + b.reported === 0 && ' · no captured model result; the link is the benchmark\'s own page'}</p>
        {b.note && <p>{b.note}</p>}
        {b.results.length > 0 && <details><summary>Result sources ({b.results.length})</summary>
          <ul>{b.results.map((r) => <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer">{r.label} ↗</a></li>)}</ul></details>}
        {b.url && <a className="library-page" href={b.url} target="_blank" rel="noreferrer">Benchmark page ↗</a>}
      </li>;
    })}</ul>
  </section>;
}

export function Methodology({ input, manifest }: Props) {
  const scoring = input.scoring;
  const history = snapshotHistory(input);
  const weights = Object.entries(scoring.defaultWeights);
  return <section className="method-detail" aria-labelledby="scoring-title" data-testid="methodology">
    <div className="coverage-head"><div><p className="eyebrow">Scoring, confidence and exclusions</p><h3 id="scoring-title">Method {scoring.methodVersion}</h3></div>
      <span>EXECUTABLE RULES: src/scoring/index.mjs · DEFINITION: data/scoring.json</span></div>
    <div className="method-columns">
      <div><h4>Fixed default weights</h4>
        <ul className="weights" data-testid="method-weights">{weights.map(([domain, weight]) => <li key={domain}><span>{domain}</span><strong>{weight}</strong></li>)}</ul>
        <p>{scoring.familyCap}</p><p>{scoring.normalization}</p></div>
      <div><h4>Who may be scored</h4><p>{scoring.cohortRule}</p>
        <ul>{scoring.eligibility.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        <p>Measured separately, never folded in: {scoring.separatePanels.join(', ')}.</p></div>
      <div><h4>Confidence handling</h4>
        <p>No confidence interval is computed for any score. Interval-like ranges shown on a result are the source's own run-to-run figures, labelled as such. User weights and ranks never produce an interval.</p>
        <p>The catalogue shows no score. Scores exist only for a cohort with a compatible common panel, so every catalogue entry reads <em>unscored</em>.</p></div>
      <div><h4>Source exclusions</h4>
        <details><summary>{input.authority.exclusions.length} source rows excluded from every panel</summary>
        <ul data-testid="method-exclusions">{input.authority.exclusions.map((row) => <li key={row.sourceId + row.label}><strong>{row.label}</strong> ({row.sourceId}): {row.reason}</li>)}</ul></details>
        <p>{scoring.priceScenario}</p><p>Hugging Face–captured results: {scoring.currentCaptureAudit.observations} observed, {scoring.currentCaptureAudit.defaultAdmittedObservations} admitted. {scoring.currentCaptureAudit.reason}</p></div>
    </div>
    <div className="method-columns">
      <div><h4>Freshness and licences</h4>
        <div className="table-scroll" tabIndex={0} aria-label="Scrollable source freshness table"><table data-testid="method-sources">
          <thead><tr><th scope="col">Source</th><th scope="col">Retrieved</th><th scope="col">Licence</th></tr></thead>
          <tbody>{input.authority.sources.map((source) => <tr key={source.id}>
            <th scope="row"><a href={source.resultUrl} target="_blank" rel="noreferrer">{source.name} ↗</a><small>{source.publisher}</small></th>
            <td>{source.retrievedAt.slice(0, 10)}</td><td>{source.licence}</td></tr>)}</tbody></table></div></div>
      <div><h4>Snapshots and exports</h4>
        <p data-testid="method-history">{history.chartable ? 'Archived captures exist for ' + history.captures.join(', ') + '.'
          : 'One capture (' + history.captures.join(', ') + ') is archived, so no historical chart is drawn. A chart appears only when the same sources were archived on at least two dates.'}</p>
        <p>The catalogue's CSV and JSON exports are reusable snapshots: stable IDs, the active filters, the data digest <span className="mono-label">{input.sourceDigest.slice(0, 16)}…</span> and a licence notice. Identity fields come from provider catalogues whose redistribution terms are not established, so prices and endpoint payloads are never exported.</p>
        <p>Catalogue entries from the provider catalogue and from the original benchmark sources are listed separately; no identity is merged across them.</p>
        <p>{manifest ? manifest.projection.bytes.toLocaleString() + ' projection bytes verified against the manifest.' : ''}</p></div>
    </div>
  </section>;
}
