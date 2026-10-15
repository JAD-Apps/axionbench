import { useParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { pct, rankingPanels, rankingRows, type AuthorityBlock, type Cohort } from './authority/logic';

const PANEL_PARAM = 'authority';
const COHORT_PARAM = 'authorityCohort';
const CONFIG_PARAM = 'authorityConfig';

function RankBar({ value, interval, selected, label, index, reduce }: {
  value: number; interval: { low: number; high: number } | null; selected: boolean; label: string; index: number; reduce: boolean;
}) {
  const { parentRef, width } = useParentSize({ debounceTime: 40 });
  const plot = Math.max(80, width);
  const x = scaleLinear({ domain: [0, 1], range: [0, plot - 56] });
  // The bar length is a plain attribute so a late container resize can never
  // leave a stale animated width; Motion only animates the entry transform.
  const labelX = Math.min(Math.max(x(value), interval ? x(interval.high) : 0) + 8, plot - 50);
  return <div className="authority-bar" ref={parentRef}>
    <svg width={plot} height="30" role="img" aria-label={label} data-value={value}>
      <title>{label}</title>
      <line x1="0" x2={plot - 56} y1="23" y2="23" className="bar-track"/>
      <motion.g style={{ transformBox: 'fill-box', originX: 0, originY: 0.5 }}
        initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }}
        transition={{ duration: reduce ? 0 : 0.36, ease: 'easeOut', delay: reduce ? 0 : Math.min(index * 0.02, 0.2) }}>
        <rect x="0" y="9" height="11" rx="1" width={x(value)} fill={selected ? '#c9f36a' : '#315cde'} data-mark="value"/>
      </motion.g>
      {interval && <line className="interval-whisker" x1={x(interval.low)} x2={x(interval.high)} y1="14.5" y2="14.5"/>}
      <text x={labelX} y="19" className="bar-value">{pct(value)}</text>
    </svg>
  </div>;
}

export default function AuthorityRanking({ authority }: { authority: AuthorityBlock }) {
  const reduce = !!useReducedMotion();
  const panels = useMemo(() => rankingPanels(authority), [authority]);
  const suites = useMemo(() => new Map(authority.suites.map((suite) => [suite.id, suite])), [authority]);
  const models = useMemo(() => new Map(authority.models.map((model) => [model.key, model])), [authority]);
  const fallback = `${authority.frontierDefault.sourceId}|${authority.frontierDefault.suiteId}|${authority.frontierDefault.metric}`;
  const params = new URLSearchParams(location.search);
  const [panel, setPanel] = useState(() => panels.some((row) => row.id === params.get(PANEL_PARAM)) ? params.get(PANEL_PARAM)! : fallback);
  const [cohort, setCohort] = useState<Cohort>(() => params.get(COHORT_PARAM) === 'all' ? 'all' : 'representatives');
  const [config, setConfig] = useState(() => params.get(CONFIG_PARAM) ?? '');
  const rows = useMemo(() => rankingRows(authority, panel, cohort, authority.frontierDefault.representatives), [authority, panel, cohort]);
  const allConfigurations = useMemo(() => rankingRows(authority, panel, 'all', 0), [authority, panel]);
  const active = panels.find((row) => row.id === panel);
  const suite = active ? suites.get(active.suiteId) : undefined;
  const source = authority.sources.find((row) => row.id === active?.sourceId);
  const selectedRow = allConfigurations.find((row) => row.configuration.id === config);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set(PANEL_PARAM, panel);
    url.searchParams.set(COHORT_PARAM, cohort);
    if (selectedRow) url.searchParams.set(CONFIG_PARAM, config); else url.searchParams.delete(CONFIG_PARAM);
    history.replaceState(null, '', url);
  }, [panel, cohort, config, selectedRow]);

  const panelLabel = (id: string) => {
    const row = panels.find((item) => item.id === id)!;
    const item = suites.get(row.suiteId);
    const from = authority.sources.find((s) => s.id === row.sourceId);
    return `${item?.name ?? row.suiteId} ${item?.version ?? ''} · ${row.metric} · ${from?.publisher ?? row.sourceId} (${row.models} models)`;
  };
  const displayed = selectedRow && !rows.some((row) => row.id === selectedRow.id) ? [...rows, selectedRow] : rows;

  return <section className="authority-ranking" data-testid="authority-ranking" aria-labelledby="authority-title">
    <div className="authority-head">
      <div><p className="eyebrow">Benchmark-authority and independent measurements</p>
        <h3 id="authority-title">{suite?.name ?? 'Authority ranking'} <span>{suite?.version}</span></h3>
        <p>{active?.metric} · {source?.name} · {source?.provenance === 'independent-evaluator' ? 'independent evaluator runs' : 'original benchmark authority'} ·
          snapshot {source?.generatedAt?.slice(0, 10) ?? 'undated'} · higher is better</p></div>
      <div className="authority-floor" data-testid="authority-floor">
        <strong>{authority.floor.suites.length}</strong><span>admitted capability suites</span>
        <strong>{authority.floor.domains.length}</strong><span>capability domains</span>
      </div>
    </div>
    <div className="frontier-controls authority-controls">
      <label>Benchmark panel
        <select data-testid="authority-panel" value={panel} onChange={(event) => { setPanel(event.target.value); setConfig(''); }}>
          {panels.map((row) => <option key={row.id} value={row.id}>{panelLabel(row.id)}</option>)}
        </select>
      </label>
      <label>Cohort
        <select data-testid="authority-cohort" value={cohort} onChange={(event) => setCohort(event.target.value as Cohort)}>
          <option value="representatives">Top {authority.frontierDefault.representatives} distinct models (best listed configuration each)</option>
          <option value="all">All {allConfigurations.length} listed configurations</option>
        </select>
      </label>
      <label>Configuration
        <select data-testid="authority-config" value={selectedRow ? config : ''} onChange={(event) => setConfig(event.target.value)}>
          <option value="">Highlight a configuration…</option>
          {allConfigurations.map((row) => <option key={row.id} value={row.configuration.id}>
            {models.get(row.modelKey)?.name ?? row.modelKey} · {row.configuration.setting ?? 'setting not stated'} · {row.configuration.condition ?? ''} · {pct(row.value)}
          </option>)}
        </select>
      </label>
    </div>
    <p className="authority-rule">{cohort === 'representatives'
      ? `Each model appears once at its highest-scoring listed configuration on this source; ${allConfigurations.length} configurations remain available.`
      : 'Every listed configuration is shown; one model can appear several times at different settings.'}</p>
    <ol className="authority-rows" data-testid="authority-rows">
      {displayed.map((row, index) => {
        const model = models.get(row.modelKey);
        const selected = row.configuration.id === config;
        const label = `${model?.name ?? row.modelKey}, ${model?.lab ?? 'lab not attributed'}, ${pct(row.value)}${row.interval ? `, source interval ${pct(row.interval.low)} to ${pct(row.interval.high)}` : ''}, setting ${row.configuration.setting ?? 'not stated'}`;
        return <li key={row.id} className={'authority-row' + (selected ? ' selected' : '')} data-model-key={row.modelKey} data-value={row.value}>
          <div className="authority-label"><strong>{model?.name ?? row.modelKey}</strong>
            <small>{model?.lab ?? 'lab not attributed'} · {row.configuration.setting ?? 'setting not stated'} · {row.configuration.condition}</small></div>
          <RankBar value={row.value} interval={row.interval} selected={selected} label={label} index={index} reduce={reduce}/>
          <a href={row.resultUrl} target="_blank" rel="noreferrer" aria-label={`Original result for ${model?.name ?? row.modelKey}`}>Result ↗</a>
        </li>;
      })}
    </ol>
    <p className="authority-note">{source?.note} Values use the source's documented unit ({rows[0]?.rawUnit ?? 'fraction'}), shown as percentages. Intervals appear only where the source publishes them.
      {suite?.benchmarkUrl && <> <a href={suite.benchmarkUrl} target="_blank" rel="noreferrer">Benchmark definition ↗</a></>}</p>
    <details className="exact-table-slot"><summary><span>Accessible ranking values</span><small>Model, lab, configuration, value and original result link</small></summary>
      <div className="table-scroll" tabIndex={0} aria-label="Scrollable authority ranking rows">
        <table data-testid="authority-table"><caption>{panelLabel(panel)}</caption>
          <thead><tr><th scope="col">Model</th><th scope="col">Configuration</th><th scope="col">Value</th><th scope="col">Source</th></tr></thead>
          <tbody>{displayed.map((row) => <tr key={row.id}><th scope="row">{models.get(row.modelKey)?.name ?? row.modelKey}<small>{models.get(row.modelKey)?.lab ?? 'lab not attributed'}</small></th>
            <td>{row.configuration.id}<small>{row.configuration.setting ?? 'setting not stated'}</small></td><td data-cell="value">{pct(row.value)}</td>
            <td><a href={row.resultUrl} target="_blank" rel="noreferrer">Original result ↗</a></td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}

