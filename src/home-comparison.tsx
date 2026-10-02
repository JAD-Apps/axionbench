import { useEffect, useState } from 'react';
import type { Dataset } from './observatory-experience';
import { homeRecommendations, homeTask, taskTypes } from './home/logic';
import CoreChart from './charts/core-chart';
import { downloadRows, ViewControls, ViewTable } from './charts/controls';
import { saveQuery, useViewState, useRouteQuery } from './charts/state';
import { DEFAULT_WEIGHTS, decodeWeightSettings, encodeWeightSettings, validateWeights } from './scoring/index.mjs';
const views = ['bars', 'dots', 'table'] as const;

export default function HomeComparison({ dataset, digest }: { dataset: Dataset; digest: string }) {
  useRouteQuery(['taskType','tokens','benchmark','homeView','homeWeights','w']);
  const params = new URLSearchParams(location.search);
  const [taskType, setTaskType] = useState(() => taskTypes.some(t => t.id === params.get('taskType')) ? params.get('taskType')! : 'reasoning');
  const [tokens, setTokens] = useState(() => {
    const n = Number(params.get('tokens') ?? 12000);
    return Number.isInteger(n) && n >= 1 && n <= 1e9 ? n : 12000;
  });
  const [benchmark, setBenchmark] = useState(() => params.get('benchmark') === 'current' ? 'current' : 'bridgebench');
  const [custom, setCustom] = useState(params.get('homeWeights') === 'custom');
  const [weights, setWeights] = useState(() => decodeWeightSettings(location.search).weights);
  const [weightNotice, setWeightNotice] = useState('');
  const [view, setView] = useViewState('homeView', views, 'table');
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('homeWeights', custom ? 'custom' : 'task');
    if (custom) url.searchParams.set('w', new URLSearchParams(encodeWeightSettings(weights)).get('w')!); else url.searchParams.delete('w');
    url.searchParams.set('taskType', taskType); url.searchParams.set('tokens', String(tokens)); url.searchParams.set('benchmark', benchmark);
    history.replaceState(null, '', url);
  }, [taskType, tokens, benchmark, custom, weights]);
  const result = homeRecommendations(dataset.bridgeBench, dataset.pricing, dataset.authority, taskType, tokens, benchmark, Date.now(), custom ? weights : undefined, dataset.currentModels);
  const rows = result.candidates.map(c => ({ ...c.capability, scenarioUsd: c.cost.totalUsd, costStatus: c.cost.status, costReason: c.cost.reason,
    detail: c.capability.detail + ' · scenario task cost ' + (c.cost.totalUsd === null ? 'unavailable: ' + c.cost.reason : '$' + c.cost.totalUsd.toFixed(6)),
    sources: [...c.capability.sources, ...(c.price ? [{ url: c.price.sourceUrl, label: 'Exact tariff' }] : [])] }));
  const taskQuery = new URLSearchParams({ task: JSON.stringify(homeTask(tokens)), costView: 'scatter' });
  function updateWeight(domain: string, value: number) {
    const next = { ...weights, [domain]: value }; try { validateWeights(next); setWeights(next); setWeightNotice(''); saveQuery({ w: new URLSearchParams(encodeWeightSettings(next)).get('w') }); }
    catch { setWeightNotice('Use nonnegative weights with at least one positive domain.'); }
  }
  const axis = taskTypes.find(t => t.id === taskType)!;
  const domainQuery = custom || Object.hasOwn(DEFAULT_WEIGHTS, axis.domain) ? '?' + encodeWeightSettings(custom ? weights : { [axis.domain]: 1 }) : '';
  return <section className="home-comparison chapter" id="task-comparison" aria-labelledby="comparison-title" data-testid="home-comparison">
    <div className="comparison-heading"><div><p className="eyebrow">02 / FROM COMPARISON TO CHOICE</p>
      <h2 id="comparison-title">Pick for the task.<br/><span>Price for the work.</span></h2></div>
      <p>Three ways to choose, with real results,<br/>known costs and visible gaps.</p></div>
    <div className="comparison-controls">
      <label>Task type<select aria-label="Task type" value={taskType} onChange={e => { saveQuery({ taskType: e.target.value }); setTaskType(e.target.value); }}>{taskTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <label>Total task tokens<input aria-label="Total task tokens" type="number" min="1" max="1000000000" step="1" value={tokens} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 1e9) { saveQuery({ tokens: String(n) }); setTokens(n); } }}/></label>
      <div className="budget-presets" role="group" aria-label="Token budget presets">{[12000, 100000, 1000000].map(n => <button key={n} aria-pressed={tokens === n} onClick={() => { saveQuery({ tokens: String(n) }); setTokens(n); }}>{n === 12000 ? '12k' : n === 100000 ? '100k' : '1M'}</button>)}</div>
      <label>Benchmark<select aria-label="Homepage benchmark" value={benchmark} onChange={e => { saveQuery({ benchmark: e.target.value }); setBenchmark(e.target.value); }}><option value="bridgebench">BridgeBench publisher ratings</option><option value="current">Current independent capability</option></select></label>
    </div>
    {benchmark === 'current' && <details className="home-weights"><summary>Customize capability weights</summary>
      <label><input type="checkbox" aria-label="Use custom homepage weights" checked={custom} onChange={e => { saveQuery({ homeWeights: e.target.checked ? 'custom' : 'task' }); setCustom(e.target.checked); }}/>Use custom domain weights</label>
      <p>Task mode uses only its matching domain. Custom weights use the same common-panel and family rules as the domain page. Missing required domains make all recommendations unavailable.</p>
      {custom && <div className="token-controls">{Object.keys(DEFAULT_WEIGHTS).map(domain => <label key={domain}>{domain.replaceAll('-', ' ')}<input type="number" min="0" max="1000000" step="0.1" aria-label={'Homepage ' + domain + ' weight'} value={weights[domain] ?? 0} onChange={e => updateWeight(domain, Number(e.target.value))}/></label>)}</div>}
      <button onClick={() => { const next = { 'tool-use': 1 }; saveQuery({ homeWeights: 'custom', w: new URLSearchParams(encodeWeightSettings(next)).get('w') }); setCustom(true); setWeights(next); }}>Use covered tool-use domain</button>
      <button onClick={() => { saveQuery({ homeWeights: 'task', w: null }); setCustom(false); setWeights({ ...DEFAULT_WEIGHTS }); }}>Reset homepage weights</button>
      {weightNotice && <p role="status">{weightNotice}</p>}
    </details>}
    <div className="recommendation-grid">{result.tiers.map(tier => <article key={tier.id} className={'recommendation ' + tier.id} data-testid={'recommendation-' + tier.id} data-model-key={tier.row?.modelKey ?? ''}>
      <div className="recommendation-label"><span>{tier.label}</span><span aria-hidden="true">{tier.id === 'economy' ? '↘' : tier.id === 'balanced' ? '◎' : '✳'}</span></div>
      <p className="tier-rule">{tier.rule}</p>
      <h3>{tier.row ? <a href={tier.row.resultUrl}>{tier.row.modelLabel} ↗</a> : 'No eligible recommendation'}</h3>
      <p className="model-lab">{tier.row?.modelLab ?? 'More comparable evidence needed'}</p>
      <div className="recommendation-values"><div><strong data-testid="recommendation-rating">{tier.capability?.valueLabel ?? '—'}</strong><span>{benchmark === 'bridgebench' ? axis.ratingLabel + ' · native rating' : 'Current common capability · normalized %'}</span></div>
        <div><strong data-testid="recommendation-cost">{tier.cost?.totalUsd === null || !tier.cost ? 'Unknown' : '$' + tier.cost.totalUsd.toFixed(4)}</strong><span>estimated USD / task</span></div></div>
      <p className="coverage-note">{tier.capability?.coverage ?? tier.missingReason}</p>
      {tier.row && <p className="source-date">Source retrieved {tier.row.retrievedAt.slice(0, 10)} · primary identity confirmed</p>}
      {tier.cost?.reason && <p className="missing-reason">{tier.cost.reason}</p>}
      <div className="recommendation-links"><a href={benchmark === 'bridgebench' ? '/benchmarks?bridgeAxis=' + axis.axis + '&bridgeCohort=confirmed' : '/domains' + domainQuery}>Compare results ↗</a>{tier.price && <a href={tier.price.sourceUrl}>Tariff ↗</a>}
        <a href={'/task-pricing?' + taskQuery.toString() + (tier.row ? '&costModel=' + encodeURIComponent(tier.row.modelKey) : '')}>Price this task ↗</a>
        {tier.row && <a href={'/versions?version0=' + encodeURIComponent(tier.row.modelKey)}>Exact versions ↗</a>}
      </div>
    </article>)}</div>
    <p className="comparison-note">{result.pricedCount} of {result.ratedCount} identity-confirmed rated models have a usable licensed tariff for this task. A model can appear in two tiers when coverage is limited.</p>
    <details className="home-data"><summary>Compare and export the recommendation data</summary>
      <ViewControls name="Homepage comparison view" views={views} value={view} onChange={setView} prefix="home-view"/>
      {view !== 'table' && <CoreChart rows={rows} view={view} name="home-comparison" normalized={benchmark === 'current'}/>}
      <ViewTable rows={rows} caption="Recommendation candidates and scenario costs" testId="home-table"/>
      <button onClick={() => downloadRows('home-comparison', rows, { taskType, task: homeTask(tokens), benchmark, view, weights: custom ? weights : null, tiers: result.tiers, productDataDigest: digest })}>Export recommendation values</button>
    </details>
    <details className="home-assumptions" id="home-assumptions"><summary>Sources and task assumptions</summary>
      <p>Token budget: {homeTask(tokens).inputTokens.toLocaleString()} uncached input and {homeTask(tokens).outputTokens.toLocaleString()} output tokens. The split is 5:1, rounded to whole tokens. No cache, separately counted thinking, tools, retries or taxes. Long-prompt tiers and tariff expiry are checked by the task calculator.</p>
      <p>Economy chooses the cheapest priced model with an observed rating for this axis. Balanced chooses the highest selected capability value among those priced models; lower cost breaks ties. Frontier chooses the highest selected capability value among confirmed identities, even if its price is unknown. These are limited comparisons within this snapshot.</p>
      <p><a href={dataset.bridgeBench.guideUrl}>BridgeBench’s publisher guide ↗</a>: its protocol is unpublished. Native ratings are comparative publisher judgments, not accuracy percentages or our capability index. Overall includes cost and speed, so this task selector uses individual task axes. No cost/speed rating is counted as independent capability evidence.</p>
      <p><a href="/methods">Coverage and scoring rules ↗</a> · <a href={'/task-pricing?' + taskQuery.toString()}>Full token and cache calculator ↗</a> · <a href="/domains">Custom domain weights ↗</a></p>
    </details>
  </section>;
}
