import { useEffect, useMemo, useState } from 'react';
import { type AuthorityBlock } from './authority/logic';
import { costPanels, decodeTask, DEFAULT_TASK, encodeTask, type PriceBlock, type TaskScenario } from './pricing/logic';

import { taskCostViewRows, usd } from './pricing/views';
import CoreChart from './charts/core-chart';
import ComparisonChart from './charts/comparison-chart';
import { RowControls, ViewControls } from './charts/controls';
import { saveQuery, useViewState, useRouteQuery } from './charts/state';
const views = ['scatter', 'costbars', 'table'] as const;
const rate = (value: number | null) => value === null ? 'Unknown' : '$' + (value * 1e6).toLocaleString('en-US', { maximumFractionDigits: 4 });
const fields: [keyof TaskScenario, string][] = [['inputTokens', 'Uncached input'], ['cachedReadTokens', 'Cached input read'],
  ['cachedWriteTokens', 'Cache-write tokens'], ['outputTokens', 'Output (excluding thinking)'], ['reasoningTokens', 'Thinking tokens'],
  ['cacheStoredTokens', 'Stored cache tokens'], ['cacheHours', 'Cache storage hours']];

export default function TaskCost({ authority, pricing, digest }: { authority: AuthorityBlock; pricing: PriceBlock; digest: string }) {
  useRouteQuery(['task','cost-panel','costView','costModel','costVersion']);
  const panels = useMemo(() => costPanels(authority, pricing), [authority, pricing]);
  const [task, setTask] = useState(() => decodeTask(new URLSearchParams(location.search)));
  const [panel, setPanel] = useState(() => {
    const saved = new URLSearchParams(location.search).get('cost-panel');
    return panels.some((row) => row.id === saved) ? saved! : panels.find((row) => row.id.startsWith('epoch-hub|gpqa-diamond|'))?.id ?? panels[0]?.id ?? '';
  });
  const [selected, setSelected] = useState(new URLSearchParams(location.search).get('costModel') ?? '');
  const select = (id: string) => { setSelected(id); saveQuery({ costModel: id }); };
  const [view, setView] = useViewState('costView', views, 'scatter');
  const [notice, setNotice] = useState('');
  const viewRows = useMemo(() => taskCostViewRows(authority, pricing, panel, task), [authority, pricing, panel, task]);
  const rows = viewRows.map(r => r.costRow);
  const quoted = rows.filter((row) => row.price);
  const supported = quoted.filter((row) => row.cost.totalUsd !== null);
  const selectedId = viewRows.find(r => r.id === selected || r.modelKey === selected)?.id ?? selected;
  const chosen = selected ? rows.find(row => row.observation.id === selectedId) : quoted[0];
  const modelNames = new Map(authority.models.map((model) => [model.key, model.name]));
  const suiteNames = new Map(authority.suites.map((suite) => [suite.id, suite.name]));
  const first = rows[0]?.observation;
  useEffect(() => {
    const url = new URL(location.href);
    encodeTask(task, url.searchParams);
    url.searchParams.set('cost-panel', panel);
    url.searchParams.set('costVersion', authority.suites.find(s => s.id === panel.split('|')[1])?.version ?? 'unknown');
    history.replaceState(null, '', url);
  }, [task, panel, authority]);
  function download() {
    const payload = { schemaVersion: 'axionbench-task-cost-export-v1', productDataDigest: digest, task, panel,
      view, selected, viewRows,
      note: 'Scenario text API task cost and one matched benchmark panel; task tokens do not reproduce evaluation budgets. Pareto applies only to the priced set.',
      pricingSource: pricing.source, rows };
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = href; link.download = 'axionbench-task-cost.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  async function share() {
    try { await navigator.clipboard.writeText(location.href); setNotice('Scenario link copied.'); }
    catch { setNotice('The address bar contains this scenario and benchmark selection.'); }
  }
  return <section className="cost-experience" id="task-cost" aria-labelledby="task-cost-title" data-testid="task-cost">
    <div className="coverage-head"><div><p className="eyebrow">Task cost / capability</p><h3 id="task-cost-title">Set the task. Inspect the tradeoff.</h3></div><span>PUBLIC API TARIFFS · TEXT TOKENS · USD</span></div>
    <p className="cost-lead">A token scenario priced at the quoted standard endpoint. Benchmark results retain their measured configuration; this estimate does not reproduce the evaluation's token use or imply cost per successful task. Measured benchmark expenditure is unavailable in this view.</p>
    <div className="cost-controls">
      <label className="cost-panel-control">Matched benchmark panel<select aria-label="Cost benchmark panel" data-testid="cost-panel" value={panel} onChange={(event) => { setPanel(event.target.value); setSelected(''); saveQuery({ 'cost-panel': event.target.value, costModel: null }); }}>
        {panels.map((row) => <option key={row.id} value={row.id}>{suiteNames.get(row.id.split('|')[1]) ?? row.id.split('|')[1]} · {row.id.split('|')[0]} · {row.models} quoted identities</option>)}
      </select></label>
      <div className="token-controls">{fields.map(([field, label]) => <label key={field}>{label}<input type="number" min="0" max="1000000000" step={field === 'cacheHours' ? '0.1' : '1'} aria-label={label} data-testid={'cost-' + field} value={task[field]}
        onChange={(event) => { const next = { ...task, [field]: event.target.value === '' ? 0 : Number(event.target.value) }; saveQuery({ task: JSON.stringify(next) }); setTask(next); }}/></label>)}</div>
      <div className="feature-actions"><button onClick={() => { saveQuery({ task: JSON.stringify(DEFAULT_TASK) }); setTask({ ...DEFAULT_TASK }); setNotice('Task reset to 10,000 input and 2,000 output tokens.'); }} data-testid="cost-reset">Reset task</button><button onClick={share} data-testid="cost-share">Share scenario</button><button onClick={download} data-testid="cost-export">Export exact values ↗</button></div>
    </div>
    <p className="cost-conditions">Input, cache reads and cache writes are disjoint. Output excludes thinking, which is billed once at the output rate. Explicit cache reads require stored context size and billable hours; storage is included in the estimate. Unsupported used classes stay unknown.</p>
    <div className="cost-stage-head"><strong>{supported.length} priced identities / {rows.length} measured</strong>
      {first && <a href={first.resultUrl} target="_blank" rel="noreferrer">{suiteNames.get(first.suiteId) ?? first.suiteId} original results ↗</a>}</div>
    <ViewControls name="Task pricing view" views={views} value={view} onChange={setView} prefix="cost-view"/>
    {view !== 'table' && <div data-testid="cost-plot">{view === 'scatter'
      ? <ComparisonChart rows={viewRows} view="scatter" name="task-cost" selected={selectedId} onSelect={select}/>
      : <CoreChart minimumRange={.000001} rows={viewRows} view="bars" name="task-cost" selected={selectedId} onSelect={select}/>}
      <RowControls rows={viewRows.filter(r => r.scenarioUsd !== null)} selected={selectedId} onSelect={select} testId="cost-points"/>
    </div>}
    <p className="core-scale-note">Scatter uses the published native result unit; cost bars show USD for this scenario. Unknown costs have no mark. All measured identities remain in the table and export.</p>
    <p className="cost-pareto-note">Open ring = nondominated within this priced set: no other priced point is both cheaper and higher-scoring, with at least one strict improvement. Source / suite / metric / test conditions are fixed. Tested harness revisions may be unreported. Representatives use the highest source-listed effort per model; effort budgets can differ. No success-rate or speed claim is made.</p>
    <div className="table-scroll" tabIndex={0} aria-label="Scrollable exact task cost table"><table data-testid="cost-table">
      <thead><tr><th scope="col">Point / exact endpoint</th><th scope="col">Result / setting</th><th scope="col">Task estimate</th><th scope="col">Within priced set</th><th scope="col">Sources</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.observation.id} data-row-id={row.observation.id} className={selectedId === row.observation.id ? 'selected' : ''}>
        <th scope="row"><button onClick={() => select(row.observation.id)}>{index + 1} / {modelNames.get(row.observation.modelKey) ?? row.observation.modelKey}</button><small>{row.price?.endpointModelId ?? "No permitted endpoint quote"}</small></th>
        <td>{row.observation.rawText} {row.observation.rawUnit}<small>{row.observation.configuration.setting ?? 'Setting unreported'}</small><small>{row.observation.provenance} · {viewRows[index].eligibility}</small></td>
        <td>{row.cost.totalUsd === null ? <span>Unsupported<small>{row.cost.reason}</small></span> : <span>{usd(row.cost.totalUsd)}<small>{usd(row.cost.tokenUsd!)} tokens + {usd(row.cost.storageUsd!)} storage{row.cost.tier ? ' · >200k prompt tier' : ''}</small></span>}</td>
        <td>{row.cost.totalUsd === null ? 'Unavailable' : row.frontier ? 'Nondominated' : 'Dominated'}</td>
        <td><a href={row.observation.resultUrl} target="_blank" rel="noreferrer">Result ↗</a>{row.price && <><br/><a href={row.price.sourceUrl} target="_blank" rel="noreferrer">Tariff ↗</a></>}</td>
      </tr>)}</tbody></table></div>
    {chosen?.price && <div className="rate-detail" data-testid="cost-rate-detail"><h4>{chosen.price.endpointModelId} / base tariff per million tokens</h4>
      <dl>{[['Input', chosen.price.input], ['Cached input read', chosen.price.cachedInputRead], ['Cache write', chosen.price.cachedInputWrite], ['Output including thinking', chosen.price.output]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{rate(value as number | null)}</dd></div>)}</dl>
      <p>Explicit cache storage: {chosen.price.cacheStoragePerMillionTokenHour === null ? 'unknown' : '$' + chosen.price.cacheStoragePerMillionTokenHour + ' per million stored tokens per hour'}. {chosen.price.expiresAt ? 'Promotion expires ' + chosen.price.expiresAt + '; no rate is quoted at or after that time.' : ''} Effective {chosen.price.effectiveAt ?? 'date unreported'}; retrieved {chosen.price.retrievedAt.slice(0, 10)}. Long-prompt tiers apply to uncached input + cache reads + cache writes together. {chosen.price.tiers.length ? chosen.price.tiers.map(t => `At ${t.minPromptTokens.toLocaleString()} prompt tokens: input ${rate(t.input)}, cached read ${rate(t.cachedInputRead)}, output including thinking ${rate(t.output)} per million tokens.`).join(' ') : 'No long-prompt tier is documented for this quote.'}</p></div>}
    {selected && !chosen?.price && <p data-testid="cost-rate-unavailable">{chosen?.observation.modelLabel ?? selected}: no permitted exact endpoint quote on this panel. No tariff is transferred from another model.</p>}
    <details className="cost-missing"><summary>{rows.filter((row) => !row.price).length} measured identities have no permitted endpoint quote</summary>
      <p>No price is transferred from a related model, routed endpoint or self-hosted checkpoint.</p><ul>{rows.filter((row) => !row.price).map((row) => <li key={row.observation.id}>{modelNames.get(row.observation.modelKey) ?? row.observation.modelKey}: unknown current permitted tariff · <a href={row.observation.resultUrl} target="_blank" rel="noreferrer">Original result ↗</a></li>)}</ul></details>
    <p className="price-attribution">{pricing.source.attribution} <a href={pricing.source.url} target="_blank" rel="noreferrer">Original pricing ↗</a> · <a href={pricing.source.licenceUrl} target="_blank" rel="noreferrer">{pricing.source.licence}</a>. {pricing.coverage} Source SHA-256 <span className="mono-label">{pricing.source.sha256}</span>.</p>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
