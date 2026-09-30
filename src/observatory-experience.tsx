import { AxisBottom } from '@visx/axis';
import { useParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { AuthorityBlock } from './authority/logic';
import AuthorityRanking from './authority-ranking';
import { BenchmarkLibrary, Catalogue, Methodology } from './catalogue';
import type { CatalogueInput } from './catalogue/logic';
import HeadToHead from './head-to-head';
import OpenWeights from './open-weights';
import type { OpenWeightsBlock } from './open-weights/logic';

type Model = {
  id: string; name: string; labId: string; lab: string; catalogId: string | null; revision: string | null;
  releaseDate: string | null; releaseDateStatus: string; parameters: number | null;
  parameterEvidenceId: string | null; activatedParameters: number | null; weightsAvailability: string;
  modalities: { input?: string[]; output?: string[] } | null; originalSourceUrl: string | null;
  identitySourceId: string | null; identityBasis: string | null; identityVerified: boolean;
  identityStatus: string; sourceIds: string[];
};
type Observation = {
  id: string; modelId: string; configurationId: string; suiteId: string; familyId: string;
  taskId: string | null; split: string | null; metric: string; direction: string; value: number;
  valueText: string; unit: { status: string; label: string | null; statement: string; sourceIds: string[] } | null;
  normalization: { status: string; formula: string | null; normalizedValue: number | null; targetUnit: string | null } | null;
  version: string | null; evaluatedAt: string | null; retrievedAt: string; grader: string | null;
  framework: string | null; budget: unknown; resultUrl: string; leaderboardUrl: string | null;
  sourceClass: string; verified: boolean; verificationStatus: string;
  submission: { author: string | null; revisionRef: string | null; revisionStatus: string | null; verified: boolean } | null;
  sourceIds: string[];
};
type Suite = {
  id: string; name: string; domain: string; familyId: string; version: string | null;
  metric: { name: string; direction: string; min: number; max: number } | null;
  url: string | null; state: string; reason: string; observationCount: number;
};
type Dataset = {
  schemaVersion: string; sourceDigest: string; retrievedAt: string; models: Model[];
  configurations: Record<string, { id: string; modelId: string; revision: unknown; variant: string | null;
    baseOrInstruct: string | null; reasoningMode: unknown; providerEndpoint: unknown; quantization: string | null;
    modalities: unknown; harness: string | null; testedHarness: string | null; tools: unknown; toolSupport: unknown;
    reasoningBudgetTokens: number | null; contextWindowTokens: number | null; testCondition: unknown; sourceIds: string[] }>;
  observations: Observation[]; domains: string[]; suites: Suite[]; sourceIds: string[];
  sourceConflicts: { id: string; modelId: string; suiteId: string; observationIds: string[]; values: number[] | null;
    status: string; comparability: string | null; sourceIds: string[] }[];
  sourceLimitations: { apiPricesPublished: false; apiPriceRowsObserved: number; apiPriceExclusion: string;
    verifiedBenchmarkObservations: number; identityConfirmedModels: number };
  authority: AuthorityBlock;
  openWeights: OpenWeightsBlock;
  scoring: CatalogueInput['scoring'];
};
type Manifest = {
  schemaVersion: string; sourceDigest: string; retrievedAt: string;
  projection: { path: string; bytes: number; sha256: string };
  details: { path: string; bytes: number; sha256: string };
  counts: Record<string, number>;
};
type SourceRecord = {
  id: string; url: string; finalUrl: string | null; publisher: string; sourceClass: string; rights: string;
  permittedFields: string[] | null; snapshotSha256: string | null; retrievedAt: string | null;
  httpStatus: number | null; resolvedRevision: string | null; contentType: string | null;
};
type SourceDetails = {
  schemaVersion: string; sourceDigest: string; sources: SourceRecord[];
  conflicts: Dataset['sourceConflicts'];
};
type Props = { onDatasetStatus: (status: string) => void };
type Ranked = { observation: Observation; model: Model };

const defaultSuite = 'gpqa-diamond';
const supportedViews = ['ranking', 'table'] as const;
type View = (typeof supportedViews)[number];
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
const rawLabel = (observation: Observation) => observation.unit?.label
  ? observation.valueText + ' ' + observation.unit.label
  : observation.valueText + ' · unit ' + (observation.unit?.status ?? 'unknown');

async function verifiedJson<T>(url: string, expectedBytes: number, expectedHash: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error('The public evidence resource returned HTTP ' + response.status + '.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== expectedBytes) throw new Error('The public evidence resource length does not match its manifest.');
  const hash = hex(await crypto.subtle.digest('SHA-256', bytes));
  if (hash !== expectedHash) throw new Error('The public evidence digest does not match its manifest.');
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function SourceDetails({ ids, dataset, loadDetails }: {
  ids: string[]; dataset: Dataset; loadDetails: () => Promise<SourceDetails>;
}) {
  const [details, setDetails] = useState<SourceDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const conflicts = dataset.sourceConflicts.filter((row) => row.sourceIds.some((id) => ids.includes(id)));
  async function openDetails(event: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open || details || busy) return;
    setBusy(true);
    setProblem('');
    try {
      setDetails(await loadDetails());
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Source details could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  const sourceById = new Map((details?.sources ?? []).map((source) => [source.id, source]));
  return <details className="source-disclosure" onToggle={openDetails}>
    <summary>Source detail ({ids.length} identifiers)</summary>
    {busy && <p role="status">Loading source permissions, retrieval details and hashes…</p>}
    {problem && <p role="alert">{problem}</p>}
    {details && ids.map((id) => {
      const source = sourceById.get(id);
      return <article className="source-record" key={id}>
        <h4>{source?.publisher ?? 'Source record not captured'}</h4>
        <p><span className="mono-label">{id}</span></p>
        <p>{source?.sourceClass ?? 'Source identifier retained; detail record unavailable.'}</p>
        <p>Reuse status: {source?.rights ?? 'No source detail is available for this identifier.'}</p>
        <p>Fields: {source?.permittedFields?.join(', ') ?? 'Not enumerated'}</p>
        <p>Retrieved: {source?.retrievedAt ?? 'Unknown'} · HTTP {source?.httpStatus ?? 'unknown'}</p>
        <p>Snapshot SHA-256: {source?.snapshotSha256 ?? 'not captured'}</p>
        {source?.resolvedRevision && <p>Resolved source revision: {source.resolvedRevision}</p>}
        {source && <a href={source.finalUrl ?? source.url} target="_blank" rel="noreferrer">Open original source ↗</a>}
      </article>;
    })}
    {details && conflicts.map((conflict) => <p className="conflict-note" key={conflict.id}>
      Conflict retained: {conflict.values?.join(' / ') ?? 'source values recorded'} · {conflict.status} · {conflict.comparability ?? 'comparability not established'}.
    </p>)}
  </details>;
}

function FrontierPlot({ rows, selected, onSelect, emptyDescription }: {
  rows: Ranked[]; selected: string; onSelect: (id: string) => void; emptyDescription: string;
}) {
  const reduce = !!useReducedMotion();
  const { parentRef, width } = useParentSize({ debounceTime: 40 });
  const maxValue = Math.max(1, ...rows.map((row) => Math.abs(row.observation.value)));
  const plotWidth = Math.max(60, width);
  const scale = scaleLinear({ domain: [0, maxValue * 1.08], range: [0, Math.max(10, plotWidth - 60)], nice: true });
  const units = [...new Set(rows.map((row) => row.observation.unit?.label).filter((value): value is string => !!value))];
  const unitLabel = units.length === 1 ? units[0] : units.length > 1 ? 'source units vary' : 'unit not recorded';
  return <div className="plot-shell" data-testid="frontier-plot">
    {rows.length === 0
      ? <div className="plot-empty" role="status">
          <span className="empty-glyph" aria-hidden="true">∅</span>
          <div><strong>No plotted result is available for this filter combination.</strong>
            <p>{emptyDescription}</p>
          </div>
        </div>
      : <figure className="ranking-figure">
          <figcaption className="chart-summary" id="ranking-caption">
            <strong>Reported results on one selected suite</strong>
            <span>Raw published metric · {rows[0].observation.metric} · {unitLabel} · {rows[0].observation.direction === 'lower' ? 'lower is better' : 'higher is better'}</span>
          </figcaption>
          <div className="ranking-rows" ref={parentRef}>
              {rows.map(({ observation, model }, index) => <button
                className={'ranking-row' + (selected === observation.id ? ' selected' : '')}
                type="button" key={observation.id} aria-pressed={selected === observation.id}
                aria-label={model.name + ', ' + model.lab + ', reported ' + rawLabel(observation)
                  + ', ' + observation.sourceClass + ', ' + (observation.verified ? 'verified' : 'unverified')}
                data-model-id={model.id} data-observation-id={observation.id}
                onClick={() => onSelect(observation.id)}>
                <span className="ranking-label">
                  <strong>{model.name}</strong>
                  <small>{model.lab} <i aria-hidden="true">·</i> {observation.version ?? 'version unknown'}</small>
                </span>
                <svg width={Math.max(10, plotWidth - 60)} height="44" role="img" aria-labelledby={'bar-label-' + index}>
                  <title id={'bar-label-' + index}>{model.name}: {rawLabel(observation)}; {observation.verified ? 'source verified' : 'not source verified'}</title>
                  <line x1="0" y1="35" x2={Math.max(10, plotWidth - 60)} y2="35" className="bar-track"/>
                  <motion.rect x="0" y="12" height="13" rx="1" fill={selected === observation.id ? '#c9f36a' : '#315cde'}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: scale(Math.max(0, observation.value)) }}
                    transition={{ duration: reduce ? 0 : 0.36, ease: 'easeOut', delay: reduce ? 0 : Math.min(index * 0.025, 0.2) }}/>
                  <text x={Math.min(scale(Math.max(0, observation.value)) + 7, plotWidth - 58)} y="23" className="bar-value">{observation.valueText}</text>
                </svg>
              </button>)}
              <svg width={plotWidth} height="40" aria-hidden="true" className="axis-svg">
                <g transform="translate(0,4)">
                  <AxisBottom scale={scale} numTicks={5} stroke="#b8bcb5" tickStroke="#b8bcb5"
                    tickLabelProps={() => ({ fill: '#5c625d', fontSize: 11, textAnchor: 'middle' as const })}/>
                </g>
              </svg>
          </div>
        </figure>}
  </div>;
}

function ResultTable({ rows, watchlist, selected, onSelect, dataset, loadDetails }: {
  rows: Ranked[]; watchlist: Model[]; selected: string; onSelect: (id: string) => void;
  dataset: Dataset; loadDetails: () => Promise<SourceDetails>;
}) {
  const missing = watchlist.map((model) => ({ model, observation: null as Observation | null }));
  const resultRows = rows.map(({ observation, model }) => ({ model, observation }));
  const entries = rows.length ? resultRows : missing;
  return <div className="table-scroll" data-testid="result-table-wrap" tabIndex={0} aria-label="Scrollable exact result table">
    <table data-testid="result-table">
      <caption>{rows.length ? 'Every captured result shown in the plotted benchmark cohort' : 'Official release identity watchlist and missing benchmark result states'}</caption>
      <thead><tr><th scope="col">Model / lab</th><th scope="col">Reported value</th><th scope="col">Test context</th><th scope="col">Evaluation date</th><th scope="col">Source state</th><th scope="col">Result source</th></tr></thead>
      <tbody>{entries.length === 0
        ? <tr><td colSpan={6}><span className="missing-value">No captured result matches these filters.</span></td></tr>
        : entries.map(({ model, observation }) => <tr key={observation?.id ?? model.id} className={selected === (observation?.id ?? model.id) ? 'is-selected' : ''}>
        <th scope="row">
          <button className="table-model-select" type="button"
            aria-pressed={selected === (observation?.id ?? model.id)}
            aria-label={'Select ' + model.name}
            onClick={() => onSelect(observation?.id ?? model.id)}>{model.name}</button>
          <small>{model.lab}</small>
        </th>
        <td>{observation ? rawLabel(observation) : <span className="missing-value">No captured result</span>}</td>
        <td>{observation
          ? <>{observation.metric} · {observation.version ?? 'version unknown'} · {observation.split ?? 'split unknown'}
              <details className="context-disclosure"><summary>Test conditions</summary>
                {(() => {
                  const configuration = dataset.configurations[observation.configurationId];
                  const condition = [
                    ['Variant', configuration?.variant], ['Revision', typeof configuration?.revision === 'object' && configuration?.revision !== null
                      ? JSON.stringify(configuration.revision) : configuration?.revision],
                    ['Harness', configuration?.testedHarness ?? configuration?.harness],
                    ['Tools', configuration?.tools], ['Reasoning budget', configuration?.reasoningBudgetTokens],
                    ['Context window', configuration?.contextWindowTokens], ['Split', observation.split],
                    ['Grader', observation.grader], ['Budget', observation.budget],
                  ] as [string, unknown][];
                  return <dl>{condition.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null || value === undefined ? 'Unknown' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>;
                })()}
              </details>
            </>
          : <>{model.identityVerified ? 'Official release identity match; benchmark evidence missing' : model.identityStatus}</>}
        </td>
        <td>{observation?.evaluatedAt ?? 'Unknown'}</td>
        <td>{observation
          ? <>{observation.sourceClass}<small>{observation.verified ? 'Verified source claim' : 'Unverified claim'} · {observation.verificationStatus}</small></>
          : model.identityVerified ? 'Identity confirmed; no scored result' : 'Identity source status unknown'}
        </td>
        <td>{observation
          ? <><a href={observation.resultUrl} target="_blank" rel="noreferrer">Original result ↗</a>
              {observation.leaderboardUrl && <a className="secondary-source" href={observation.leaderboardUrl} target="_blank" rel="noreferrer">Leaderboard ↗</a>}
              <SourceDetails ids={observation.sourceIds} dataset={dataset} loadDetails={loadDetails}/>
            </>
          : model.originalSourceUrl
            ? <><a href={model.originalSourceUrl} target="_blank" rel="noreferrer">Release / model source ↗</a>
                <SourceDetails ids={model.sourceIds} dataset={dataset} loadDetails={loadDetails}/>
              </>
            : 'Source unavailable'}
        </td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function EvidenceMatrix({ models, dataset }: { models: Model[]; dataset: Dataset }) {
  const domainRows = dataset.domains.map((domain) => ({
    domain,
    suites: dataset.suites.filter((suite) => suite.domain === domain),
  }));
  return <details className="matrix-disclosure">
    <summary><span>Coverage matrix</span><small>Observed source rows by model and capability domain · counts only</small></summary>
    <p>Cells count source observations. Different tasks, versions and conditions are not merged into domain scores. Open each count for the original result links.</p>
    <div className="table-scroll matrix-scroll" tabIndex={0} aria-label="Horizontally scrollable domain coverage matrix">
      <table className="matrix-table">
        <caption>Source-row coverage for the currently filtered cohort; no cell is a score</caption>
        <thead><tr><th scope="col">Model</th>{domainRows.map((row) => <th scope="col" key={row.domain}>{row.domain}</th>)}</tr></thead>
        <tbody>{models.map((model) => <tr key={model.id}>
          <th scope="row">{model.name}<small>{model.lab}</small></th>
          {domainRows.map(({ domain }) => {
            const observations = dataset.observations.filter((row) =>
              row.modelId === model.id && dataset.suites.find((suite) => suite.id === row.suiteId)?.domain === domain);
            return <td key={domain}>{observations.length
              ? <details className="matrix-cell"><summary aria-label={observations.length + ' source observations in ' + domain + ' for ' + model.name}>{observations.length}</summary>
                  {observations.map((row) => <a key={row.id} href={row.resultUrl} target="_blank" rel="noreferrer">{row.metric} · {row.valueText} · {row.version ?? 'version unknown'} ↗</a>)}
                </details>
              : <span aria-label={'No captured source observation in ' + domain}>—</span>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </details>;
}

export default function ObservatoryExperience({ onDatasetStatus }: Props) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [failure, setFailure] = useState('');
  const [cohort, setCohort] = useState<'flagships' | 'reported'>('flagships');
  const [domain, setDomain] = useState('all');
  const [suiteId, setSuiteId] = useState(defaultSuite);
  const [labId, setLabId] = useState('all');
  const [view, setView] = useState<View>('ranking');
  const [selected, setSelected] = useState('');
  const [sourceDetailsPromise, setSourceDetailsPromise] = useState<Promise<SourceDetails> | null>(null);

  useEffect(() => {
    let active = true;
    onDatasetStatus('Loading the public evidence snapshot…');
    fetch('/data-manifest.json', { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('The public evidence manifest returned HTTP ' + response.status + '.');
        return response.json() as Promise<Manifest>;
      })
      .then(async (nextManifest) => {
        if (nextManifest.schemaVersion !== 'axionbench-data-manifest-v1') throw new Error('The public evidence manifest version is unsupported.');
        const projection = await verifiedJson<Dataset>(nextManifest.projection.path,
          nextManifest.projection.bytes, nextManifest.projection.sha256);
        if (projection.sourceDigest !== nextManifest.sourceDigest) throw new Error('The data digest does not match the exact captured ingestion file.');
        if (projection.models.length !== nextManifest.counts.models
          || projection.observations.length !== nextManifest.counts.observations
          || projection.suites.length !== nextManifest.counts.suites
          || projection.authority?.observations.length !== nextManifest.counts.authorityObservations
          || projection.authority?.models.length !== nextManifest.counts.authorityModels
          || projection.openWeights?.rows.length !== nextManifest.counts.openWeightRows) {
          throw new Error('The public evidence counts do not match their manifest.');
        }
        if (active) {
          const params = new URLSearchParams(location.search);
          const initialCohort = params.get('cohort');
          const initialDomain = params.get('domain') ?? 'all';
          const initialSuite = params.get('suite');
          const initialLab = params.get('lab') ?? 'all';
          const initialView = params.get('view');
          setDataset(projection);
          setManifest(nextManifest);
          if (initialCohort === 'flagships' || initialCohort === 'reported') setCohort(initialCohort);
          if (initialDomain === 'all' || projection.domains.includes(initialDomain)) setDomain(initialDomain);
          if (initialSuite && projection.suites.some((row) => row.id === initialSuite && row.observationCount > 0)) setSuiteId(initialSuite);
          else setSuiteId(projection.suites.some((row) => row.id === defaultSuite && row.observationCount > 0)
            ? defaultSuite : (projection.suites.find((row) => row.observationCount > 0)?.id ?? ''));
          if (initialLab === 'all' || projection.models.some((row) => row.labId === initialLab)) setLabId(initialLab);
          if (initialView && supportedViews.includes(initialView as View)) setView(initialView as View);
          onDatasetStatus(projection.models.length + ' catalogued models · ' + projection.observations.length
            + ' reported observations · snapshot ' + projection.retrievedAt.slice(0, 10));
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'The public evidence snapshot could not be validated.';
        setFailure(message);
        onDatasetStatus('The evidence snapshot could not be validated.');
      });
    return () => { active = false; };
  }, [onDatasetStatus]);

  async function loadDetails() {
    if (!manifest || !dataset) throw new Error('The evidence manifest is not ready.');
    if (!sourceDetailsPromise) {
      const next = verifiedJson<SourceDetails>(manifest.details.path, manifest.details.bytes, manifest.details.sha256)
        .then((details) => {
          if (details.sourceDigest !== dataset.sourceDigest) throw new Error('Source detail belongs to a different ingestion digest.');
          return details;
        });
      setSourceDetailsPromise(next);
      return next;
    }
    return sourceDetailsPromise;
  }

  const modelsById = useMemo(() => new Map((dataset?.models ?? []).map((model) => [model.id, model])), [dataset]);
  const watchlist = useMemo(() => (dataset?.models ?? []).filter((model) => model.identityVerified)
    .sort((a, b) => a.lab.localeCompare(b.lab) || a.name.localeCompare(b.name)), [dataset]);
  const suitesInDomain = useMemo(() => (dataset?.suites ?? []).filter((row) =>
    row.observationCount > 0 && (domain === 'all' || row.domain === domain)), [dataset, domain]);
  const availableSuite = suitesInDomain.some((row) => row.id === suiteId);
  const effectiveSuite = availableSuite ? suiteId : (suitesInDomain[0]?.id ?? '');
  const activeRows = useMemo(() => {
    if (!dataset) return [];
    return dataset.observations.filter((observation) => observation.suiteId === effectiveSuite)
      .filter((observation) => cohort === 'reported' || watchlist.some((model) => model.id === observation.modelId))
      .filter((observation) => labId === 'all' || modelsById.get(observation.modelId)?.labId === labId)
      .map((observation) => ({ observation, model: modelsById.get(observation.modelId) }))
      .filter((row): row is Ranked => !!row.model)
      .sort((a, b) => a.observation.direction === 'lower'
        ? a.observation.value - b.observation.value : b.observation.value - a.observation.value);
  }, [dataset, effectiveSuite, cohort, watchlist, labId, modelsById]);
  const selectedSuite = dataset?.suites.find((row) => row.id === effectiveSuite);
  const visibleWatchlist = watchlist.filter((model) => labId === 'all' || model.labId === labId);
  const filteredWatchlist = visibleWatchlist.filter((model) => {
    const found = dataset?.observations.some((row) => row.suiteId === effectiveSuite && row.modelId === model.id);
    return cohort === 'flagships' || !!found;
  });
  const matrixModels = cohort === 'flagships' ? visibleWatchlist
    : [...new Map(activeRows.map((row) => [row.model.id, row.model])).values()];
  const allLabs = [...new Map((dataset?.models ?? []).map((model) => [model.labId, { id: model.labId, name: model.lab }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!dataset || !effectiveSuite) return;
    const url = new URL(location.href);
    url.searchParams.set('cohort', cohort);
    url.searchParams.set('domain', domain);
    url.searchParams.set('suite', effectiveSuite);
    url.searchParams.set('lab', labId);
    url.searchParams.set('view', view);
    if (selected) url.searchParams.set('selected', selected);
    else url.searchParams.delete('selected');
    history.replaceState(null, '', url);
  }, [dataset, cohort, domain, effectiveSuite, labId, view, selected]);

  useEffect(() => {
    if (!dataset) return;
    const candidate = new URLSearchParams(location.search).get('selected');
    if (candidate && (dataset.observations.some((row) => row.id === candidate)
      || dataset.models.some((row) => row.id === candidate))) setSelected(candidate);
  }, [dataset]);

  function changeDomain(next: string) {
    setDomain(next);
    const firstSuite = dataset?.suites.find((row) => row.observationCount > 0 && (next === 'all' || row.domain === next));
    if (firstSuite) setSuiteId(firstSuite.id);
    setSelected('');
  }

  function toggleView(next: View) {
    if (supportedViews.includes(next)) setView(next);
  }

  if (!dataset) return <section className={'page-loading' + (failure ? ' failure' : '')} aria-labelledby="loading-title">
    {failure
      ? <div role="alert"><strong id="loading-title">Evidence snapshot unavailable</strong>
          <p>{failure}</p><p>The headline and animated contour field remain available. Reload after the source data has been restored.</p></div>
      : <p id="loading-title" role="status"><span className="loading-indicator" aria-hidden="true"/>Validating the public evidence digest…</p>}
  </section>;

  const sourceLimits = dataset.sourceLimitations;
  const resultBySuite = dataset.observations.filter((row) => row.suiteId === effectiveSuite);

  return <>
    <section className="frontier chapter" id="frontier" aria-labelledby="frontier-title">
      <div className="chapter-index"><span>01 / THE FRONTIER</span><span>RESULTS, WITH CONDITIONS</span></div>
      <div className="frontier-intro">
        <div className="chapter-heading">
          <p className="eyebrow">The visible edge of the evidence</p>
          <h2 id="frontier-title">A clearer view<br/><i>of what was measured.</i></h2>
          <p>Start with nine model identities matched to captured official releases. Benchmark scores appear only when this snapshot has a reported result; no result is filled in.</p>
        </div>
        <aside className="frontier-proof" aria-label="Snapshot evidence counts">
          <div><strong>{watchlist.length.toString().padStart(2, '0')}</strong><span>official release identity matches</span></div>
          <div><strong>{sourceLimits.verifiedBenchmarkObservations.toString().padStart(2, '0')}</strong><span>benchmark observations marked verified</span></div>
          <a href="#methods">How to read this capture <span aria-hidden="true">↘</span></a>
        </aside>
      </div>

      <AuthorityRanking authority={dataset.authority}/>

      <div className="frontier-stage" data-testid="frontier-stage">
        <div className="frontier-stage-head">
          <div><span className="eyebrow">One task · one metric · original units</span><h3>{selectedSuite?.name ?? 'No observed benchmark suite'}</h3>
            <p>{selectedSuite?.domain ?? 'Coverage'} <span aria-hidden="true">/</span> {selectedSuite?.version ?? 'Version not recorded'}
              <span aria-hidden="true">/</span> {selectedSuite?.metric?.name ?? 'Metric unknown'}</p></div>
          {selectedSuite?.url && <a className="benchmark-source" href={selectedSuite.url} target="_blank" rel="noreferrer">Benchmark source ↗</a>}
        </div>
        <div className="frontier-controls" aria-label="Frontier filters">
          <label>Cohort
            <select aria-label="Cohort" data-testid="cohort-filter" value={cohort} onChange={(event) => {
              setCohort(event.target.value as 'flagships' | 'reported'); setSelected('');
            }}>
              <option value="flagships">Official release matches ({watchlist.length})</option>
              <option value="reported">Captured result claims ({resultBySuite.length})</option>
            </select>
          </label>
          <label>Capability domain
            <select aria-label="Capability domain" data-testid="domain-filter" value={domain} onChange={(event) => changeDomain(event.target.value)}>
              <option value="all">All domains</option>
              {dataset.domains.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>Benchmark
            <select aria-label="Benchmark" data-testid="suite-filter" value={effectiveSuite} onChange={(event) => {
              setSuiteId(event.target.value); setSelected('');
            }}>
              {suitesInDomain.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.domain}</option>)}
            </select>
          </label>
          <label>Lab
            <select aria-label="Lab" data-testid="lab-filter" value={labId} onChange={(event) => {
              setLabId(event.target.value); setSelected('');
            }}>
              <option value="all">All labs</option>
              {allLabs.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <div className="view-switch" role="group" aria-label="Frontier view">
            <button type="button" data-testid="view-ranking" aria-pressed={view === 'ranking'} onClick={() => toggleView('ranking')}>Ranking plot</button>
            <button type="button" data-testid="view-table" aria-pressed={view === 'table'} onClick={() => toggleView('table')}>Exact rows</button>
            <button type="button" data-testid="view-cost" aria-disabled="true" disabled title="No captured rate source permits redistribution.">
              Task cost <span aria-hidden="true">·</span> unavailable
            </button>
          </div>
        </div>
        <div className="cohort-note" role="note">
          <span className="status-dot" aria-hidden="true"/>
          {cohort === 'flagships'
            ? <p><strong>Identity match is not a benchmark result.</strong> The default cohort covers {visibleWatchlist.length} source-matched entries; {dataset.observations.filter((row) => visibleWatchlist.some((model) => model.id === row.modelId)).length} captured observations reference these identities and none are verified.</p>
            : <p><strong>Captured model-card claims.</strong> Values retain their source-reported units and verification state; they are not an independently verified ranking.</p>}
        </div>
        {view === 'ranking'
          ? <FrontierPlot rows={activeRows} selected={selected} onSelect={setSelected}
              emptyDescription={cohort === 'flagships'
                ? 'The ' + visibleWatchlist.length + ' official release identity matches in this filtered cohort have no benchmark-verified result in the current snapshot.'
                : 'No captured source claim matches this selected suite, domain and lab. Change a filter to inspect another source claim.'}/>
          : <ResultTable rows={activeRows} watchlist={filteredWatchlist} selected={selected} onSelect={setSelected}
              dataset={dataset} loadDetails={loadDetails}/>}
        {view === 'ranking' && <div className="exact-table-slot">
          <details>
            <summary><span>Accessible exact values and source rows</span><small>Open the table for text values, missing states and original links</small></summary>
            <ResultTable rows={activeRows} watchlist={filteredWatchlist} selected={selected} onSelect={setSelected}
              dataset={dataset} loadDetails={loadDetails}/>
          </details>
        </div>}
        <div className="frontier-legend">
          <span><i className="legend-mark cobalt" aria-hidden="true"/>Reported metric value</span>
          <span><i className="legend-mark lime" aria-hidden="true"/>Keyboard or touch selected</span>
          <span>Units and direction are stated above each view</span>
        </div>
        <EvidenceMatrix models={matrixModels} dataset={dataset}/>
      </div>
      <section className="task-cost-note" aria-labelledby="cost-note-title">
        <div className="cost-index">COST <span>/</span> 00</div>
        <div><p className="eyebrow">Task cost and Pareto view</p><h3 id="cost-note-title">No rate is plotted without reuse permission.</h3>
          <p>The captured {sourceLimits.apiPriceRowsObserved.toLocaleString()} API price rows come from sources that explicitly exclude redistribution while terms remain unsettled. Their values and endpoint payloads are withheld, so a cost scatter and Pareto frontier are unavailable in this release.</p>
        </div>
        <span className="unavailable-tag">VIEW UNAVAILABLE</span>
      </section>
    </section>

    <section className="paired chapter dark-chapter" id="paired" aria-labelledby="paired-title">
      <div className="chapter-index"><span>02 / TWO SYSTEMS</span><span>MATCHED TESTS ONLY</span></div>
      <div className="paired-composition">
        <div className="paired-copy">
          <p className="eyebrow">US–China head-to-head</p>
          <h2 id="paired-title">Compare the same<br/><i>question, side by side.</i></h2>
          <p>Two models, one from a United States lab and one from a China lab, compared only where the same evaluator ran the same suite version, metric and test condition for both.</p>
        </div>
        <div className="paired-measure">
          <div className="paired-number">{dataset.authority.floor.domains.length.toString().padStart(2, '0')}</div>
          <div className="paired-rule"/>
          <strong>Capability domains with admitted evidence</strong>
          <p>Publisher-reported tables stay visible as facts but never enter a strict match: their evaluation conditions are not stated in a matchable form.</p>
          <a href="#methods">Read the comparison rule <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <HeadToHead authority={dataset.authority} digest={manifest?.projection.sha256 ?? dataset.sourceDigest}/>
      <div className="paired-foot"><span>Matched source / suite version / metric / test condition</span><span>REGION · DEVELOPER ORGANIZATION COUNTRY (EPOCH AI RECORD)</span></div>
    </section>

    <section className="open chapter" id="open-weights" aria-labelledby="open-title">
      <div className="chapter-index"><span>03 / OPEN WEIGHTS</span><span>TOTAL PARAMETERS DEFINE THE GROUP</span></div>
      <div className="open-composition">
        <div className="open-heading">
          <p className="eyebrow">A size ruler, not a leaderboard</p>
          <h2 id="open-title">Find the model<br/><i>at the scale you need.</i></h2>
          <p>Groups use the captured total parameter count. Activated MoE parameters are a separate, card-stated measurement and never set the group. Public weights, an open-source licence, a quantized checkpoint and a hosted price are four different facts.</p>
          <p className="open-count"><strong>{dataset.openWeights.rows.length.toLocaleString()}</strong> entries with a model repository reference in this snapshot</p>
        </div>
        <div className="ruler-stage">
          <OpenWeights block={dataset.openWeights} digest={manifest?.projection.sha256 ?? dataset.sourceDigest}/>
        </div>
      </div>
    </section>

    <section className="directory chapter" id="models" aria-labelledby="directory-title">
      <div className="chapter-index"><span>04 / THE CATALOGUE</span><span>ALL SOURCE MODELS · UNSCORED INCLUDED</span></div>
      <div className="directory-head">
        <div><p className="eyebrow">Browse the wider field</p><h2 id="directory-title">A field of models.<br/><i>Evidence attached.</i></h2></div>
        <div className="directory-tools">
          <p className="methods-lead">Search, filter and sort every permitted source model. Filters live in the address bar, and the exports match the rows you see.</p>
          <a className="export" href="/data.json" download="axionbench-public-data.json">Download complete public data ↗</a>
        </div>
      </div>
      <div className="directory-results">
        <Catalogue input={dataset as unknown as CatalogueInput} manifest={manifest}/>
      </div>
    </section>

    <section className="methods chapter" id="methods" aria-labelledby="methods-title">
      <div className="chapter-index"><span>05 / METHODS & COVERAGE</span><span>PROVENANCE BEFORE SUMMARY</span></div>
      <div className="methods-intro">
        <div><p className="eyebrow">How to read this observatory</p><h2 id="methods-title">Every number<br/><i>has a context.</i></h2></div>
        <p className="methods-lead">The current capture is broad, but it is not a verified leaderboard. It contains {dataset.models.length} model identities and {dataset.observations.length} raw source claims; {sourceLimits.verifiedBenchmarkObservations} benchmark claims are marked verified and the capture records no independent replications.</p>
      </div>
      <div className="method-rules">
        <article><span>01</span><div><h3>Identity is its own evidence</h3><p>Official release matches confirm a model name or revision only. They do not confirm a benchmark result or tested endpoint configuration.</p></div></article>
        <article><span>02</span><div><h3>Missing stays visible</h3><p>Unknown dates, parameters, units, graders, prices and test conditions remain unknown. A missing result has no plotted mark and never becomes zero.</p></div></article>
        <article><span>03</span><div><h3>Panels keep their meaning</h3><p>Results are shown only within the selected registered suite and metric. No per-model missingness renormalization, universal score or confidence interval is claimed.</p></div></article>
        <article><span>04</span><div><h3>Source rights affect the view</h3><p>The {sourceLimits.apiPriceRowsObserved.toLocaleString()} captured endpoint price rows are excluded from publication because their source terms do not permit reuse in this build.</p></div></article>
      </div>
      <BenchmarkLibrary input={dataset as unknown as CatalogueInput}/>
      <Methodology input={dataset as unknown as CatalogueInput} manifest={manifest}/>
      <div className="integrity-panel">
        <div><p className="eyebrow">Data integrity</p><h3>Bound to one captured input.</h3></div>
        <dl><div><dt>Source ingestion SHA-256</dt><dd className="mono-label">{dataset.sourceDigest}</dd></div>
          <div><dt>Projection</dt><dd>{manifest?.projection.bytes.toLocaleString() ?? 'Unknown'} bytes · verified against manifest</dd></div>
          <div><dt>Deferred source detail</dt><dd>{manifest?.details.bytes.toLocaleString() ?? 'Unknown'} bytes · loaded and checked on disclosure</dd></div>
          <div><dt>Snapshot retrieved</dt><dd>{dataset.retrievedAt}</dd></div></dl>
      </div>
      <p className="snapshot-note">This page covers the captured source-admitted snapshot, not every model or test in existence. Source detail includes the recorded reuse terms, retrieval status, identifiers and hashes when available.</p>
    </section>
    <footer><span>AXIONBENCH <i>/</i> EVIDENCE IN CONTEXT</span><a href="#top">Back to top ↑</a></footer>
  </>;
}
