import { useEffect, useMemo, useState } from 'react';
import { rankingPanels, rankingRows, type AuthorityBlock, type Cohort } from './authority/logic';
import CoreChart from './charts/core-chart';
import { downloadRows, RowControls, ViewControls, ViewTable } from './charts/controls';
import { authorityViewRows } from './charts/rows';
import { saveQuery, useViewState } from './charts/state';

const views = ['bars', 'dots', 'table'] as const;
export default function AuthorityRanking({ authority }: { authority: AuthorityBlock }) {
  const params = new URLSearchParams(location.search);
  const [policy, setPolicy] = useState(params.get('authorityPolicy') === 'historical' ? 'historical' : 'current');
  const qualified = useMemo(() => policy === 'current' ? { ...authority, observations: authority.observations.filter(r => r.currentPolicy?.scoringEligible === true) } : authority, [authority, policy]);
  const panels = useMemo(() => rankingPanels(qualified), [qualified]);
  const historicalDefault = `${authority.frontierDefault.sourceId}|${authority.frontierDefault.suiteId}|${authority.frontierDefault.metric}`;
  const fallback = panels.some(p => p.id === historicalDefault) ? historicalDefault : panels[0]?.id ?? '';
  const [requestedPanel, setPanel] = useState(params.get('authority') ?? fallback);
  const panel = panels.some(p => p.id === requestedPanel) ? requestedPanel : fallback;
  const [cohort, setCohort] = useState<Cohort>(params.get('authorityCohort') === 'all' ? 'all' : 'representatives');
  const [config, setConfig] = useState(params.get('authorityConfig') ?? '');
  const [view, setView] = useViewState('rankingView', views, 'bars');
  const all = useMemo(() => rankingRows(qualified, panel, 'all', 0), [qualified, panel]);
  const ranked = useMemo(() => rankingRows(qualified, panel, cohort, authority.frontierDefault.representatives), [qualified, panel, cohort, authority]);
  const selected = all.find(r => r.configuration.id === config);
  const displayed = selected && !ranked.some(r => r.id === selected.id) ? [...ranked, selected] : ranked;
  const rows = useMemo(() => authorityViewRows(authority, displayed), [authority, displayed]);
  const active = panels.find(p => p.id === panel);
  const suite = authority.suites.find(s => s.id === active?.suiteId);
  const source = authority.sources.find(s => s.id === active?.sourceId);
  useEffect(() => { saveQuery({ authority: panel, authorityCohort: cohort, authorityPolicy: policy, authorityConfig: selected ? config : null, authorityVersion: suite?.version ?? null }, true); }, [panel, cohort, policy, config, selected, suite]);
  const selectRow = (id: string) => { const next = all.find(r => r.id === id)?.configuration.id ?? ''; saveQuery({ authorityConfig: next }); setConfig(next); };
  const label = (id: string) => { const p = panels.find(p => p.id === id); if (!p) return 'No eligible current panel'; const s = authority.suites.find(s => s.id === p.suiteId); return `${s?.name ?? p.suiteId} ${s?.version ?? ''} · ${p.metric} · ${p.models} models`; };
  return <section className="authority-ranking" data-testid="authority-ranking" aria-labelledby="authority-title">
    <div className="authority-head"><div><p className="eyebrow">{policy === 'current' ? 'Current qualified measurements' : 'Historical qualified measurements'}</p>
      <h3 id="authority-title">{suite?.name ?? 'No eligible panel'} <span>{suite?.version}</span></h3>
      <p>{active?.metric} · {source?.name} · {source?.provenance} · snapshot {source?.generatedAt?.slice(0, 10) ?? 'undated'} · higher is better</p></div>
      <div className="authority-floor" data-testid="authority-floor"><strong>{authority.floor.suites.length}</strong><span>historically admitted capability suites</span><strong>{authority.floor.domains.length}</strong><span>historically covered domains</span></div>
    </div>
    <div className="frontier-controls authority-controls">
      <label>Scoring policy<select aria-label="Ranking scoring policy" value={policy} onChange={e => { saveQuery({ authorityPolicy: e.target.value, authority: null, authorityConfig: null }); setPolicy(e.target.value); setPanel(''); setConfig(''); }}><option value="current">Current exact versions</option><option value="historical">Historical qualified panels</option></select></label>
      <label>Benchmark panel<select data-testid="authority-panel" value={panel} onChange={e => { saveQuery({ authority: e.target.value, authorityConfig: null }); setPanel(e.target.value); setConfig(''); }}>{panels.map(p => <option key={p.id} value={p.id}>{label(p.id)}</option>)}</select></label>
      <label>Cohort<select data-testid="authority-cohort" value={cohort} onChange={e => { saveQuery({ authorityCohort: e.target.value }); setCohort(e.target.value as Cohort); }}><option value="representatives">Up to {authority.frontierDefault.representatives} distinct models (best listed configuration each)</option><option value="all">All {all.length} listed configurations</option></select></label>
      <label>Configuration<select data-testid="authority-config" value={selected ? config : ''} onChange={e => { saveQuery({ authorityConfig: e.target.value }); setConfig(e.target.value); }}><option value="">Highlight a configuration…</option>{all.map(r => <option key={r.id} value={r.configuration.id}>{r.modelLabel} · {r.configuration.setting ?? 'Setting unknown'} · {r.rawText} {r.rawUnit}</option>)}</select></label>
    </div>
    <p className="authority-rule">{cohort === 'representatives' ? 'Each model appears once at its highest listed configuration on this source. Other configurations remain selectable.' : 'Every listed configuration is shown; models can appear more than once.'} {policy === 'current' && 'Only primary-confirmed model identities and maintained exact benchmark/harness versions qualify. Limited coverage is not filled with historical results.'}</p>
    <ViewControls name="Ranking views" views={views} value={view} onChange={setView} prefix="ranking-view"/>
    <div className="feature-actions"><button onClick={() => downloadRows('rankings', rows, { panel, policy, cohort, view, sourceDigest: authority.inputDigests, route: location.pathname + location.search })}>Export ranking rows</button></div>
    {view !== 'table' && <><CoreChart rows={rows} view={view} name="rankings" selected={selected?.id} onSelect={selectRow} normalized/><RowControls rows={rows} selected={selected?.id ?? ''} onSelect={selectRow} testId="authority-rows"/></>}
    <p className="authority-note">{source?.note} Plot coordinates are documented normalized fractions on a fixed 0–100% scale. Text and downloads retain native values and units. Whiskers appear only where the source publishes intervals. {suite?.benchmarkUrl && <a href={suite.benchmarkUrl} target="_blank" rel="noreferrer">Benchmark definition ↗</a>}</p>
    {view === 'table' ? <ViewTable rows={rows} caption={label(panel)} testId="authority-table"/> : <details className="exact-table-slot"><summary>Accessible ranking values and sources</summary><ViewTable rows={rows} caption={label(panel)} testId="authority-table"/></details>}
  </section>;
}
