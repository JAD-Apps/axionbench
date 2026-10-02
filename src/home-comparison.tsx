import { useEffect, useState } from 'react';
import type { Dataset } from './observatory-experience';
import { homeRecommendations, homeTask, taskTypes } from './home/logic';

export default function HomeComparison({ dataset }: { dataset: Dataset }) {
  const params = new URLSearchParams(location.search);
  const [taskType, setTaskType] = useState(() => taskTypes.some(t => t.id === params.get('taskType')) ? params.get('taskType')! : 'reasoning');
  const [tokens, setTokens] = useState(() => {
    const n = Number(params.get('tokens') ?? 12000);
    return Number.isInteger(n) && n >= 1 && n <= 1e9 ? n : 12000;
  });
  const [benchmark, setBenchmark] = useState(() => params.get('benchmark') === 'current' ? 'current' : 'bridgebench');
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('taskType', taskType); url.searchParams.set('tokens', String(tokens)); url.searchParams.set('benchmark', benchmark);
    history.replaceState(null, '', url);
  }, [taskType, tokens, benchmark]);
  const result = homeRecommendations(dataset.bridgeBench, dataset.pricing, dataset.authority, taskType, tokens, benchmark);
  const axis = taskTypes.find(t => t.id === taskType)!;
  return <section className="home-comparison chapter" id="task-comparison" aria-labelledby="comparison-title" data-testid="home-comparison">
    <div className="comparison-heading"><div><p className="eyebrow">02 / FROM COMPARISON TO CHOICE</p>
      <h2 id="comparison-title">Pick for the task.<br/><span>Price for the work.</span></h2></div>
      <p>Three ways to choose, with real results,<br/>known costs and visible gaps.</p></div>
    <div className="comparison-controls">
      <label>Task type<select aria-label="Task type" value={taskType} onChange={e => setTaskType(e.target.value)}>{taskTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <label>Total task tokens<input aria-label="Total task tokens" type="number" min="1" max="1000000000" step="1" value={tokens} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 1e9) setTokens(n); }}/></label>
      <div className="budget-presets" role="group" aria-label="Token budget presets">{[12000, 100000, 1000000].map(n => <button key={n} aria-pressed={tokens === n} onClick={() => setTokens(n)}>{n === 12000 ? '12k' : n === 100000 ? '100k' : '1M'}</button>)}</div>
      <label>Benchmark<select aria-label="Homepage benchmark" value={benchmark} onChange={e => setBenchmark(e.target.value)}><option value="bridgebench">BridgeBench publisher ratings</option><option value="current">Current independent capability</option></select></label>
    </div>
    <div className="recommendation-grid">{result.tiers.map(tier => <article key={tier.id} className={'recommendation ' + tier.id} data-testid={'recommendation-' + tier.id} data-model-key={tier.row?.modelKey ?? ''}>
      <div className="recommendation-label"><span>{tier.label}</span><span aria-hidden="true">{tier.id === 'economy' ? '↘' : tier.id === 'balanced' ? '◎' : '✳'}</span></div>
      <p className="tier-rule">{tier.rule}</p>
      <h3>{tier.row ? <a href={tier.row.resultUrl}>{tier.row.modelLabel} ↗</a> : 'No eligible recommendation'}</h3>
      <p className="model-lab">{tier.row?.modelLab ?? 'More comparable evidence needed'}</p>
      <div className="recommendation-values"><div><strong data-testid="recommendation-rating">{tier.row?.ratings[axis.axis] ?? '—'}</strong><span>{benchmark === 'bridgebench' ? axis.ratingLabel + ' · native rating' : 'Current capability unavailable'}</span></div>
        <div><strong data-testid="recommendation-cost">{tier.cost?.totalUsd === null || !tier.cost ? 'Unknown' : '$' + tier.cost.totalUsd.toFixed(4)}</strong><span>estimated USD / task</span></div></div>
      <p className="coverage-note">{tier.row ? '1 / 1 selected publisher axis observed · ' + dataset.authority.observations.filter(o => o.currentPolicy?.scoringEligible && o.modelKey === tier.row!.modelKey).length + ' current independent results' : 'No common current capability panel for this task and priced cohort.'}</p>
      {tier.row && <p className="source-date">Source retrieved {tier.row.retrievedAt.slice(0, 10)} · primary identity confirmed</p>}
      {tier.cost?.reason && <p className="missing-reason">{tier.cost.reason}</p>}
      <div className="recommendation-links"><a href={'/benchmarks?bridgeAxis=' + axis.axis}>Compare results ↗</a>{tier.price && <a href={tier.price.sourceUrl}>Tariff ↗</a>}</div>
    </article>)}</div>
    <p className="comparison-note">{result.pricedCount} of {result.ratedCount} identity-confirmed rated models have a usable licensed tariff for this task. A model can appear in two tiers when coverage is limited.</p>
    <details className="home-assumptions" id="home-assumptions"><summary>Sources and task assumptions</summary>
      <p>Token budget: {homeTask(tokens).inputTokens.toLocaleString()} uncached input and {homeTask(tokens).outputTokens.toLocaleString()} output tokens. The split is 5:1, rounded to whole tokens. No cache, separately counted thinking, tools, retries or taxes. Long-prompt tiers and tariff expiry are checked by the task calculator.</p>
      <p>Economy chooses the cheapest priced model with an observed rating for this axis. Balanced chooses the highest rating among those priced models; lower cost breaks ties. Frontier chooses the highest published rating among confirmed identities, even if its price is unknown. These are limited comparisons within this snapshot.</p>
      <p><a href={dataset.bridgeBench.guideUrl}>BridgeBench’s publisher guide ↗</a>: its protocol is unpublished. Native ratings are comparative publisher judgments, not accuracy percentages or our capability index. Overall includes cost and speed, so this task selector uses individual task axes. No cost/speed rating is counted as independent capability evidence.</p>
      <p><a href="/methods">Coverage and scoring rules ↗</a> · <a href="/task-pricing">Full token and cache calculator ↗</a> · <a href="/domains">Custom domain weights ↗</a></p>
    </details>
  </section>;
}
