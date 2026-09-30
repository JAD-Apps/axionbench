import { useEffect, useMemo, useRef, useState } from 'react';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { ParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';
import { animate } from 'motion';
import { data, rankingRows, scatterRows } from './chart-data';
import type { Model } from './chart-data';

const fmt = (n: number) => (n * 100).toFixed(1);
const money = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 3)}`;

function useReducedMotionPreference() {
  const [reduce, setReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduce(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduce;
}

function AnimatedBar({ target, reduced, fill }: { target: number; reduced: boolean; fill: string }) {
  const ref = useRef<SVGRectElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (reduced) { ref.current.setAttribute('width', String(target)); return; }
    const control = animate(ref.current, { width: [0, target] }, { duration: 0.35, ease: 'easeOut' });
    return () => control.stop();
  }, [target, reduced]);
  return <rect ref={ref} width={reduced ? target : 0} y={3} height={17} rx={2} fill={fill} />;
}

function AnimatedPoint({ cx, cy, radius, fill, label, selected, onSelect, onKey }: {
  cx: number; cy: number; radius: number; fill: string; label: string; selected: boolean;
  onSelect: () => void; onKey: (event: React.KeyboardEvent<SVGGElement>) => void;
}) {
  const ref = useRef<SVGCircleElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ref.current.setAttribute('cx', String(cx)); ref.current.setAttribute('cy', String(cy)); return;
    }
    const control = animate(ref.current, { cx, cy }, { duration: 0.35, ease: 'easeOut' });
    return () => control.stop();
  }, [cx, cy]);
  return <g tabIndex={0} role="button" aria-label={label} aria-pressed={selected} onClick={onSelect} onKeyDown={onKey}>
    <circle ref={ref} cx={cx} cy={cy} r={radius} fill={fill} stroke="#171918" strokeWidth={2} />
  </g>;
}

function Chart({ kind, capability, models, selected, onSelect }: {
  kind: 'ranking' | 'scatter'; capability: string; models: Model[]; selected: string; onSelect: (id: string) => void;
}) {
  const reduce = useReducedMotionPreference();
  const ranked = rankingRows(models, capability);
  const points = scatterRows(models, capability);
  return <ParentSize>{({ width, height }) => {
    const margin = kind === 'ranking' ? { top: 12, right: 24, bottom: 34, left: 152 } : { top: 18, right: 28, bottom: 48, left: 58 };
    const w = Math.max(300, width) - margin.left - margin.right;
    const h = Math.max(300, height) - margin.top - margin.bottom;
    const x = scaleLinear({ domain: kind === 'ranking' ? [0, Math.max(1, ...ranked.map(d => d.value.score))] : [0, Math.max(1, ...points.map(d => d.value.score))], range: [0, w], nice: true });
    const y = scaleLinear({ domain: kind === 'ranking' ? [0, Math.max(1, ranked.length)] : [0, Math.max(0.001, ...points.map(d => d.price))], range: [h, 0], nice: true });
    const onKey = (event: React.KeyboardEvent<SVGGElement>, id: string) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(id); }
    };
    return <svg width={width} height={height} role="img" aria-labelledby="chart-title chart-summary" data-chart-kind={kind}>
      <title id="chart-title">{kind === 'ranking' ? 'Capability ranking' : 'Capability and public API price'}</title>
      <desc id="chart-summary">{kind === 'ranking' ? `Historical snapshot values for ${ranked.length} models. Select a bar for details.` : `Historical snapshot values for ${points.length} models with known API prices. Price is USD per million blended tokens; select a point for details.`}</desc>
      <g transform={`translate(${margin.left},${margin.top})`}>
        {kind === 'ranking' ? ranked.map(({ model, value }, i) => <g key={model.model} transform={`translate(0,${i * Math.min(30, h / Math.max(ranked.length, 1))})`}>
          <text className="chart-label" x={-12} y={18} textAnchor="end">{model.name}</text>
          <g tabIndex={0} role="button" aria-label={`${model.name}: ${fmt(value.score)} out of 100 score, ${Math.round(value.coverage * 100)} percent source coverage`} aria-pressed={selected === model.model} onClick={() => onSelect(model.model)} onKeyDown={e => onKey(e, model.model)}>
            <AnimatedBar target={x(value.score)} reduced={reduce} fill={selected === model.model ? '#c8f66b' : '#315cde'} />
            <text x={x(value.score) + 7} y={17} className="chart-value">{fmt(value.score)}</text>
          </g>
        </g>) : <>
          {points.map(({ model, value, price }) => <g key={model.model}>
            <AnimatedPoint cx={x(value.score)} cy={y(price)} radius={selected === model.model ? 7 : 5} fill={selected === model.model ? '#c8f66b' : '#315cde'} label={`${model.name}: ${fmt(value.score)} out of 100 capability score; ${money(price)} per million blended tokens`} selected={selected === model.model} onSelect={() => onSelect(model.model)} onKey={e => onKey(e, model.model)} />
            <text x={x(value.score) + 9} y={y(price) - 8} className="chart-label">{model.name}</text>
          </g>)}
        </>}
        <AxisBottom top={h} scale={x} numTicks={5} tickFormat={value => `${Math.round(Number(value) * 100)}`} stroke="#9ba19b" tickStroke="#9ba19b" tickLabelProps={() => ({ fill: '#5f665f', fontSize: 11, textAnchor: 'middle' })} />
        {kind === 'scatter' && <AxisLeft scale={y} numTicks={5} stroke="#9ba19b" tickStroke="#9ba19b" tickLabelProps={() => ({ fill: '#5f665f', fontSize: 11, textAnchor: 'end', dx: '-0.25em', dy: '0.25em' })} />}
      </g>
      <text x={width / 2} y={height - 3} textAnchor="middle" className="axis-title">Capability score / 100 →</text>
    </svg>;
  }}</ParentSize>;
}

export function Observatory() {
  const [capability, setCapability] = useState('code');
  const [kind, setKind] = useState<'ranking' | 'scatter'>('ranking');
  const [developer, setDeveloper] = useState('all');
  const [selected, setSelected] = useState('');
  const developers = [...new Set(data.models.map(model => model.developer))];
  const models = useMemo(() => data.models.filter(model => developer === 'all' || model.developer === developer), [developer]);
  const rows = rankingRows(models, capability);
  const current = rows.find(row => row.model.model === selected) ?? rows[0];
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/assets/surface.js';
    document.body.append(script);
    return () => script.remove();
  }, []);
  return <>
    <header className="topbar"><a href="#top" className="wordmark">AXION<span>BENCH</span></a><nav aria-label="Main navigation"><a href="#frontier">Frontier</a><a href="#evidence">Evidence</a></nav><span className="edition">OBSERVATORY / 01</span></header>
    <main id="top">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><p className="kicker">A measured view of machine capability</p><h1 id="hero-title">Signal over<br /><em>spectacle.</em></h1><p>Compare systems through published results, with their coverage and source trail in view.</p><a className="hero-link" href="#frontier">Explore the snapshot <span aria-hidden="true">↘</span></a><small>Historical preview snapshot · built 30 September 2026</small></div>
        <div className="hero-art" aria-hidden="true"><div className="art-label">FIG. 01&nbsp; / &nbsp;CONTOUR FIELD</div><div className="surface-stage"><canvas id="intelligence-surface" /></div><div className="art-caption">A SIGNAL IN MOTION <span>01 — 07</span></div></div>
      </section>
      <section className="frontier" id="frontier" aria-labelledby="frontier-heading">
        <div className="section-intro"><p className="kicker">01 / Frontier comparison</p><h2 id="frontier-heading">One snapshot.<br /><span>Several ways to read it.</span></h2><p>These values come from the existing preview snapshot. They are not a current release survey or a new evaluation.</p></div>
        <div className="chart-panel">
          <div className="chart-toolbar"><div><p className="kicker">Capability · historical snapshot</p><h3>{data.capabilities[capability]?.label ?? capability}</h3></div><div className="controls"><label>Capability<select aria-label="Capability" value={capability} onChange={e => setCapability(e.target.value)}>{Object.entries(data.capabilities).map(([id, cap]) => <option key={id} value={id}>{cap.label}</option>)}</select></label><label>Lab<select aria-label="Lab" value={developer} onChange={e => setDeveloper(e.target.value)}><option value="all">All labs</option>{developers.map(lab => <option key={lab} value={lab}>{lab}</option>)}</select></label></div></div>
          <div className="view-tabs" role="group" aria-label="Chart type"><button aria-pressed={kind === 'ranking'} onClick={() => setKind('ranking')}>Ranking</button><button aria-pressed={kind === 'scatter'} onClick={() => setKind('scatter')}>Cost × capability</button></div>
          <div className="chart-stage" id="chart"><Chart kind={kind} capability={capability} models={models} selected={current?.model.model ?? selected} onSelect={setSelected} /></div>
          <div className="chart-meta"><span>{kind === 'ranking' ? `${rows.length} scored models · missing results have no mark` : `${scatterRows(models, capability).length} models with a score and known public API price`}</span><span>{kind === 'ranking' ? 'Source coverage shown in table' : 'USD / million blended tokens'}</span></div>
          <details className="data-table"><summary>Read exact values in a table</summary><div className="table-wrap"><table><caption>Historical snapshot values for {data.capabilities[capability]?.label}</caption><thead><tr><th>Model</th><th>Score / 100</th><th>Coverage</th><th>API price / MTok</th><th>Original result</th></tr></thead><tbody>{rows.map(({ model, value }) => <tr key={model.model}><th scope="row">{model.name}</th><td>{fmt(value.score)}</td><td>{Math.round(value.coverage * 100)}%</td><td>{typeof model.apiUsdPerMTok === 'number' ? money(model.apiUsdPerMTok) : 'Unknown'}</td><td>{value.sources.map(source => data.sources[source] ? <a key={source} href={data.sources[source].source} target="_blank" rel="noreferrer">{data.sources[source].label}</a> : null)}</td></tr>)}</tbody></table></div></details>
        </div>
        <aside className="selection" aria-live="polite"><span className="kicker">Selected observation</span>{current ? <><strong>{current.model.name}</strong><span>{fmt(current.value.score)} / 100 · {Math.round(current.value.coverage * 100)}% weighted source coverage</span><span>Historical value · source conditions are inherited from the saved preview and have not been revalidated here.</span></> : <span>No scored rows in this filter.</span>}</aside>
      </section>
      <footer id="evidence"><span>AXIONBENCH / METHODS BEFORE MILESTONES</span><span>Historical preview snapshot · {new Date(data.builtAt).toISOString().slice(0, 10)}</span></footer>
    </main>
  </>;
}
