import { AxisBottom, AxisLeft } from '@visx/axis';
import { scaleLinear } from '@visx/scale';
import { useParentSize } from '@visx/responsive';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { pct, type AuthorityBlock } from './authority/logic';
import { costPanels, costRows, decodeTask, DEFAULT_TASK, encodeTask, type CostRow, type PriceBlock, type TaskScenario } from './pricing/logic';

const usd = (value: number) => '$' + value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
const rate = (value: number | null) => value === null ? 'Unknown' : '$' + (value * 1e6).toLocaleString('en-US', { maximumFractionDigits: 4 });
const fields: [keyof TaskScenario, string][] = [['inputTokens', 'Uncached input'], ['cachedReadTokens', 'Cached input read'],
  ['cachedWriteTokens', 'Cache-write tokens'], ['outputTokens', 'Output (excluding thinking)'], ['reasoningTokens', 'Thinking tokens'],
  ['cacheStoredTokens', 'Stored cache tokens'], ['cacheHours', 'Cache storage hours']];

function CostPlot({ rows, selected, onSelect }: { rows: CostRow[]; selected: string; onSelect: (id: string) => void }) {
  const { parentRef, width } = useParentSize({ initialSize: { width: 700, height: 360 }, debounceTime: 50 });
  const reduce = useReducedMotion();
  const plotted = rows.filter((row) => row.cost.totalUsd !== null).slice(0, 12);
  const w = Math.max(260, width);
  const margin = { left: 52, right: 24, top: 24, bottom: 52 };
  const height = 350;
  const x = scaleLinear({ domain: [0, Math.max(0.001, ...plotted.map((row) => row.cost.totalUsd!)) * 1.12], range: [margin.left, w - margin.right] });
  const y = scaleLinear({ domain: [0, 1], range: [height - margin.bottom, margin.top] });
  const labels: { x: number; y: number }[] = [];
  const positions = plotted.map((row) => {
    const px = x(row.cost.totalUsd!); const py = y(row.observation.value);
    let position = { x: px + 18, y: py - 10 };
    for (const [dx, dy] of [[18, -10], [18, 14], [-18, -10], [-18, 14], [18, -34], [18, 38], [-18, -34], [-18, 38], [42, -10], [-42, 14]]) {
      const next = { x: px + dx, y: py + dy };
      if (next.x < margin.left + 9 || next.x > w - margin.right - 9 || next.y < margin.top + 9 || next.y > height - margin.bottom - 9) continue;
      if (!labels.some((label) => Math.abs(label.x - next.x) < 21 && Math.abs(label.y - next.y) < 21)) { position = next; break; }
    }
    labels.push(position); return { x: position.x - px, y: position.y - py };
  });
  return <div ref={parentRef} className="cost-plot" data-testid="cost-plot">
    {plotted.length ? <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-labelledby="cost-chart-title cost-chart-description">
      <title id="cost-chart-title">Scenario API task cost versus measured benchmark result</title>
      <desc id="cost-chart-description">{plotted.length} exact endpoint identities. Cost axis is linear in USD; result axis is 0 to 100 percent. Numbered points match the exact table. An open ring marks a nondominated point within this priced set. The task tokens are a scenario and do not reproduce the evaluation's token use.</desc>
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => <line key={tick} x1={margin.left} x2={w - margin.right} y1={y(tick)} y2={y(tick)} stroke="var(--rule)"/>) }
      <AxisBottom top={height - margin.bottom} scale={x} numTicks={w < 500 ? 3 : 5} tickFormat={(value) => '$' + Number(value).toFixed(3)}
        stroke="var(--muted)" tickStroke="var(--muted)" tickLabelProps={{ fill: 'var(--ink)', fontSize: 11, textAnchor: 'middle' }}/>
      <AxisLeft left={margin.left} scale={y} numTicks={5} tickFormat={(value) => pct(Number(value), 0)}
        stroke="var(--muted)" tickStroke="var(--muted)" tickLabelProps={{ fill: 'var(--ink)', fontSize: 11, textAnchor: 'end', dy: '0.3em' }}/>
      <text x={(w + margin.left - margin.right) / 2} y={height - 5} textAnchor="middle" className="svg-axis-label">Scenario task cost · USD</text>
      {plotted.map((row, index) => <motion.g key={row.observation.modelKey} initial={false}
        animate={{ x: x(row.cost.totalUsd!), y: y(row.observation.value) }} transition={{ duration: reduce ? 0 : 0.3 }}
        role="button" tabIndex={0} aria-pressed={selected === row.observation.modelKey}
        aria-label={`${index + 1}: ${row.observation.modelLabel}, ${usd(row.cost.totalUsd!)}, ${pct(row.observation.value)}${row.frontier ? ', nondominated within priced set' : ''}`}
        onClick={() => onSelect(row.observation.modelKey)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(row.observation.modelKey); } }}>
        <circle r="22" fill="transparent"/>
        <line x1="0" y1="0" x2={positions[index].x} y2={positions[index].y} stroke="var(--muted)"/>
        <circle r={row.frontier ? 7 : 5} fill={selected === row.observation.modelKey ? 'var(--signal)' : 'var(--paper)'} stroke={row.frontier ? 'var(--ink)' : 'var(--cobalt)'} strokeWidth={row.frontier ? 2 : 1}/>
        <rect x={positions[index].x - 9} y={positions[index].y - 9} width="18" height="18" fill="var(--paper)"/>
        <text x={positions[index].x} y={positions[index].y} textAnchor="middle" dy=".35em" fill="var(--ink)" fontSize="11">{index + 1}</text>
        <title>{row.observation.modelLabel}: {usd(row.cost.totalUsd!)}, {pct(row.observation.value)}</title>
      </motion.g>)}
    </svg> : <p role="status">No supported tariff scenario produces a plotted point. Exact missing states are listed below.</p>}
  </div>;
}

export default function TaskCost({ authority, pricing, digest }: { authority: AuthorityBlock; pricing: PriceBlock; digest: string }) {
  const panels = useMemo(() => costPanels(authority, pricing), [authority, pricing]);
  const [task, setTask] = useState(() => decodeTask(new URLSearchParams(location.search)));
  const [panel, setPanel] = useState(() => {
    const saved = new URLSearchParams(location.search).get('cost-panel');
    return panels.some((row) => row.id === saved) ? saved! : panels.find((row) => row.id.startsWith('epoch-hub|gpqa-diamond|'))?.id ?? panels[0]?.id ?? '';
  });
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const rows = useMemo(() => costRows(authority, pricing, panel, task), [authority, pricing, panel, task]);
  const quoted = rows.filter((row) => row.price);
  const supported = quoted.filter((row) => row.cost.totalUsd !== null);
  const chosen = quoted.find((row) => row.observation.modelKey === selected) ?? quoted[0];
  const modelNames = new Map(authority.models.map((model) => [model.key, model.name]));
  const suiteNames = new Map(authority.suites.map((suite) => [suite.id, suite.name]));
  const first = rows[0]?.observation;
  useEffect(() => {
    const url = new URL(location.href);
    encodeTask(task, url.searchParams);
    url.searchParams.set('cost-panel', panel);
    history.replaceState(null, '', url);
  }, [task, panel]);
  function download() {
    const payload = { schemaVersion: 'axionbench-task-cost-export-v1', productDataDigest: digest, task, panel,
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
    <p className="cost-lead">A token scenario priced at the quoted standard endpoint. Benchmark results retain their measured configuration; this estimate does not reproduce the evaluation's token use or imply cost per successful task.</p>
    <div className="cost-controls">
      <label className="cost-panel-control">Matched benchmark panel<select aria-label="Cost benchmark panel" data-testid="cost-panel" value={panel} onChange={(event) => { setPanel(event.target.value); setSelected(''); }}>
        {panels.map((row) => <option key={row.id} value={row.id}>{suiteNames.get(row.id.split('|')[1]) ?? row.id.split('|')[1]} · {row.id.split('|')[0]} · {row.models} quoted identities</option>)}
      </select></label>
      <div className="token-controls">{fields.map(([field, label]) => <label key={field}>{label}<input type="number" min="0" max="1000000000" step={field === 'cacheHours' ? '0.1' : '1'} aria-label={label} data-testid={'cost-' + field} value={task[field]}
        onChange={(event) => setTask({ ...task, [field]: event.target.value === '' ? 0 : Number(event.target.value) })}/></label>)}</div>
      <div className="feature-actions"><button onClick={() => { setTask({ ...DEFAULT_TASK }); setNotice('Task reset to 10,000 input and 2,000 output tokens.'); }} data-testid="cost-reset">Reset task</button><button onClick={share} data-testid="cost-share">Share scenario</button><button onClick={download} data-testid="cost-export">Export exact values ↗</button></div>
    </div>
    <p className="cost-conditions">Input, cache reads and cache writes are disjoint. Output excludes thinking, which is billed once at the output rate. Explicit cache reads require stored context size and billable hours; storage is included in the estimate. Unsupported used classes stay unknown.</p>
    <div className="cost-stage-head"><strong>{supported.length} priced identities / {rows.length} measured</strong>
      {first && <a href={first.resultUrl} target="_blank" rel="noreferrer">{suiteNames.get(first.suiteId) ?? first.suiteId} original results ↗</a>}</div>
    <CostPlot rows={quoted} selected={selected} onSelect={setSelected}/>
    <p className="cost-pareto-note">Open ring = nondominated within this priced set: no other priced point is both cheaper and higher-scoring, with at least one strict improvement. Source / suite / metric / harness are fixed. Representatives use the highest source-listed effort per model; effort budgets can differ. No success-rate or speed claim is made.</p>
    <div className="table-scroll" tabIndex={0} aria-label="Scrollable exact task cost table"><table data-testid="cost-table">
      <thead><tr><th scope="col">Point / exact endpoint</th><th scope="col">Result / setting</th><th scope="col">Task estimate</th><th scope="col">Within priced set</th><th scope="col">Sources</th></tr></thead>
      <tbody>{quoted.map((row, index) => <tr key={row.observation.id} className={selected === row.observation.modelKey ? 'selected' : ''}>
        <th scope="row"><button onClick={() => setSelected(row.observation.modelKey)}>{index + 1} / {modelNames.get(row.observation.modelKey) ?? row.observation.modelKey}</button><small>{row.price!.endpointModelId}</small></th>
        <td>{pct(row.observation.value)}<small>{row.observation.configuration.setting ?? 'Setting unreported'}</small></td>
        <td>{row.cost.totalUsd === null ? <span>Unsupported<small>{row.cost.reason}</small></span> : <span>{usd(row.cost.totalUsd)}<small>{usd(row.cost.tokenUsd!)} tokens + {usd(row.cost.storageUsd!)} storage{row.cost.tier ? ' · >200k prompt tier' : ''}</small></span>}</td>
        <td>{row.cost.totalUsd === null ? 'Unavailable' : row.frontier ? 'Nondominated' : 'Dominated'}</td>
        <td><a href={row.observation.resultUrl} target="_blank" rel="noreferrer">Result ↗</a><br/><a href={row.price!.sourceUrl} target="_blank" rel="noreferrer">Tariff ↗</a></td>
      </tr>)}</tbody></table></div>
    {chosen?.price && <div className="rate-detail" data-testid="cost-rate-detail"><h4>{chosen.price.endpointModelId} / base tariff per million tokens</h4>
      <dl>{[['Input', chosen.price.input], ['Cached input read', chosen.price.cachedInputRead], ['Cache write', chosen.price.cachedInputWrite], ['Output including thinking', chosen.price.output]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{rate(value as number | null)}</dd></div>)}</dl>
      <p>Explicit cache storage: {chosen.price.cacheStoragePerMillionTokenHour === null ? 'unknown' : '$' + chosen.price.cacheStoragePerMillionTokenHour + ' per million stored tokens per hour'}. {chosen.price.expiresAt ? 'Introductory token and storage rates end on 31 December 2026.' : ''} Effective date is unreported; retrieved {chosen.price.retrievedAt.slice(0, 10)}. Long-prompt tiers apply to all prompt classes together.</p></div>}
    <details className="cost-missing"><summary>{rows.filter((row) => !row.price).length} measured identities have no permitted endpoint quote</summary>
      <p>No price is transferred from a related model, routed endpoint or self-hosted checkpoint.</p><ul>{rows.filter((row) => !row.price).map((row) => <li key={row.observation.id}>{modelNames.get(row.observation.modelKey) ?? row.observation.modelKey}: unknown current permitted tariff · <a href={row.observation.resultUrl} target="_blank" rel="noreferrer">Original result ↗</a></li>)}</ul></details>
    <p className="price-attribution">{pricing.source.attribution} <a href={pricing.source.url} target="_blank" rel="noreferrer">Original pricing ↗</a> · <a href={pricing.source.licenceUrl} target="_blank" rel="noreferrer">{pricing.source.licence}</a>. {pricing.coverage} Source SHA-256 <span className="mono-label">{pricing.source.sha256}</span>.</p>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
