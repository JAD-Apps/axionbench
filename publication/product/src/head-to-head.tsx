import { scaleLinear } from '@visx/scale';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  comparisonExport, decodeH2H, encodeH2H, headToHead, pct, points, regionalModels,
  type AuthorityBlock, type AuthorityObservation, type H2HState, type MatchedRow,
} from './authority/logic';

type Props = { authority: AuthorityBlock; digest: string };
const US = '#7f9dff';
const CN = '#c9f36a';

function Dumbbell({ a, b, label, strong, index, reduce }: {
  a: number; b: number; label: string; strong: boolean; index: number; reduce: boolean;
}) {
  // Percentage coordinates keep the plot exact at any container width without
  // re-measurement; visx supplies the linear mapping, Motion the entrance.
  const x = scaleLinear({ domain: [0, 1], range: [2, 98] });
  const at = (value: number) => `${x(value)}%`;
  const transition = { duration: reduce ? 0 : 0.42, ease: 'easeOut' as const, delay: reduce ? 0 : Math.min(index * 0.03, 0.24) };
  const height = strong ? 34 : 26;
  const y = height / 2;
  const half = strong ? 6.5 : 4.5;
  return <div className="dumbbell-plot">
    <svg width="100%" height={height} role="img" aria-label={label} data-a-value={a} data-b-value={b}>
      <title>{label}</title>
      {[0.25, 0.5, 0.75].map((tick) => <line key={tick} x1={at(tick)} x2={at(tick)} y1={2} y2={height - 2} className="dumbbell-grid"/>)}
      <line x1={at(0)} x2={at(1)} y1={y} y2={y} className="dumbbell-track"/>
      <motion.g initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={transition}>
        <line x1={at(Math.min(a, b))} x2={at(Math.max(a, b))} y1={y} y2={y} className={strong ? 'dumbbell-link strong' : 'dumbbell-link'}/>
        <circle cx={at(a)} cy={y} r={strong ? 7 : 5} fill={US} data-mark="us"/>
        <svg x={at(b)} y={0} overflow="visible"><rect x={-half} y={y - half} width={half * 2} height={half * 2} fill={CN} data-mark="cn"/></svg>
      </motion.g>
    </svg>
  </div>;
}

function Evidence({ row, authority, side }: { row: AuthorityObservation; authority: AuthorityBlock; side: string }) {
  const source = authority.sources.find((item) => item.id === row.sourceId);
  return <div className="h2h-evidence">
    <strong>{side} · {source?.name ?? row.sourceId}</strong>
    <dl>
      <div><dt>Provenance</dt><dd>{row.provenance}</dd></div>
      <div><dt>Reported</dt><dd>{row.rawText} ({row.rawUnit}; {row.unitEvidence})</dd></div>
      <div><dt>Configuration</dt><dd>{row.configuration.harness ?? 'harness not stated'} · setting {row.configuration.setting ?? 'not stated'} · {row.configuration.id}</dd></div>
      <div><dt>Uncertainty</dt><dd>{row.interval ? `${pct(row.interval.low)}–${pct(row.interval.high)} · ${row.interval.method}`
        : row.stderr !== null ? `standard error ${pct(row.stderr, 2)} (source-reported)` : 'none reported by source'}</dd></div>
      <div><dt>Evaluated</dt><dd>{row.evaluatedAt ?? 'unknown'} · {row.evaluatedAtBasis}</dd></div>
      <div><dt>Source SHA-256</dt><dd className="mono-label">{source?.sha256 ?? 'unknown'}</dd></div>
      <div><dt>Retrieved</dt><dd>{source?.retrievedAt ?? 'unknown'}</dd></div>
    </dl>
    <a href={row.resultUrl} target="_blank" rel="noreferrer" data-result-side={side}>Original {side} result ↗</a>
  </div>;
}

export default function HeadToHead({ authority, digest }: Props) {
  const reduce = !!useReducedMotion();
  const regional = useMemo(() => regionalModels(authority), [authority]);
  const [state, setState] = useState<H2HState | null>(() => decodeH2H(authority, new URLSearchParams(location.search)));
  const result = useMemo(() => state ? headToHead(authority, state.a, state.b, state.filters) : null, [authority, state]);
  const suites = useMemo(() => new Map(authority.suites.map((suite) => [suite.id, suite])), [authority]);
  const models = useMemo(() => new Map(authority.models.map((model) => [model.key, model])), [authority]);
  const domains = useMemo(() => [...new Set(authority.observations.filter((row) => row.matchable).map((row) => row.domain))].sort(), [authority]);
  const sources = authority.sources.filter((source) => authority.observations.some((row) => row.sourceId === source.id && row.matchable));

  useEffect(() => {
    if (!state) return;
    const url = new URL(location.href);
    encodeH2H(state, url.searchParams);
    history.replaceState(null, '', url);
  }, [state]);

  if (!state || !result) return <div className="h2h-empty" role="status">
    <strong>No United States and China models share a matchable observation in this snapshot.</strong>
  </div>;

  const a = models.get(state.a)!;
  const b = models.get(state.b)!;
  const update = (next: { a?: string; b?: string; filters?: Partial<H2HState['filters']> }) =>
    setState({ a: next.a ?? state.a, b: next.b ?? state.b, filters: { ...state.filters, ...next.filters } });
  const suiteLabel = (row: MatchedRow) => {
    const suite = suites.get(row.suiteId);
    return `${suite?.name ?? row.suiteId} ${suite?.version ?? ''}`.trim();
  };
  const describe = (row: { a: number; b: number }, name: string) =>
    `${name}: ${a.name} ${pct(row.a)}, ${b.name} ${pct(row.b)}, difference ${points((row.b - row.a) * 100)} for ${b.name}`;
  function download() {
    const payload = comparisonExport(authority, result!, digest);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `axionbench-us-china-${state!.a}-vs-${state!.b}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  const outsideCounts = regional.outside.reduce<Record<string, number>>((counts, model) => ({ ...counts, [model.region]: (counts[model.region] ?? 0) + 1 }), {});

  return <div className="h2h" data-testid="h2h">
    <div className="h2h-controls" aria-label="Head-to-head selections">
      <label><span><i className="h2h-key us" aria-hidden="true"/>United States lab model</span>
        <select data-testid="h2h-us" value={state.a} onChange={(event) => update({ a: event.target.value })}>
          {regional.us.map((model) => <option key={model.key} value={model.key}>{model.name} · {model.lab}</option>)}
        </select>
      </label>
      <label><span><i className="h2h-key cn" aria-hidden="true"/>China lab model</span>
        <select data-testid="h2h-cn" value={state.b} onChange={(event) => update({ b: event.target.value })}>
          {regional.cn.map((model) => <option key={model.key} value={model.key}>{model.name} · {model.lab}</option>)}
        </select>
      </label>
      <label><span>Domain panel</span>
        <select data-testid="h2h-domain" value={state.filters.domain} onChange={(event) => update({ filters: { domain: event.target.value } })}>
          <option value="all">All matched domains</option>
          {domains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
        </select>
      </label>
      <label><span>Evaluator</span>
        <select data-testid="h2h-source" value={state.filters.sourceId} onChange={(event) => update({ filters: { sourceId: event.target.value } })}>
          <option value="any">Any admitted evaluator</option>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
      </label>
      <label className="h2h-check"><input type="checkbox" data-testid="h2h-same-setting" checked={state.filters.sameSetting}
        onChange={(event) => update({ filters: { sameSetting: event.target.checked } })}/>
        <span>Require the identical reasoning setting</span></label>
    </div>

    <p className="h2h-definition" data-testid="h2h-region-definition"><strong>Region definition.</strong> {authority.regionDefinition}</p>

    <div className="h2h-summary" data-testid="h2h-summary" aria-live="polite">
      <div><strong data-testid="h2h-matched-count">{result.counts.matched}</strong><span>matched tests</span></div>
      <div><strong>{result.counts.aHigher}</strong><span>{a.name} higher</span></div>
      <div><strong>{result.counts.bHigher}</strong><span>{b.name} higher</span></div>
      <div><strong>{result.counts.ties}</strong><span>ties</span></div>
      <div><strong>{result.counts.onlyA + result.counts.onlyB}</strong><span>unmatched coverage</span></div>
      <div><strong>{result.counts.excluded}</strong><span>excluded observations</span></div>
    </div>
    <p className="h2h-rule" data-testid="h2h-no-winner">No overall or country winner is declared. Each row compares the same source, suite version, metric and test condition; one configuration per model is chosen by the declared setting rule ({state.filters.sameSetting ? 'identical setting required' : 'each model’s highest listed setting'}), never by score.</p>

    {result.matched.length === 0
      ? <div className="h2h-empty" role="status" data-testid="h2h-empty">
          <span aria-hidden="true">∅</span>
          <div><strong>No matched tests for this pair and filter.</strong>
            <p>No mark is drawn and no difference is computed. Unmatched coverage and exclusions remain listed below.</p></div>
        </div>
      : <figure className="h2h-figure">
          <figcaption><strong>Aligned domain dumbbells</strong><span>Domain rows average matched suites (within a benchmark family first); raw benchmark rows follow. Scale 0–100% of each source’s own metric.</span></figcaption>
          <div className="h2h-legend"><span><i className="h2h-key us" aria-hidden="true"/>{a.name} (circle)</span><span><i className="h2h-key cn" aria-hidden="true"/>{b.name} (square)</span></div>
          <ol className="dumbbell-list" data-testid="h2h-dumbbells">
            {result.domains.map((domain, domainIndex) => <li key={domain.domain} className="dumbbell-domain">
              <div className="dumbbell-row strong" data-testid="h2h-domain-row" data-domain={domain.domain}>
                <div className="dumbbell-label"><strong>{domain.domain}</strong>
                  <small>{domain.suites} matched suite{domain.suites === 1 ? '' : 's'} · {domain.families} famil{domain.families === 1 ? 'y' : 'ies'}</small></div>
                <Dumbbell a={domain.a} b={domain.b} strong index={domainIndex} reduce={reduce}
                  label={describe(domain, `${domain.domain} domain mean`)}/>
                <div className="dumbbell-values"><span className="us">{pct(domain.a)}</span><span className="cn">{pct(domain.b)}</span>
                  <em>{domain.leader === 'tie' ? 'tie' : points(domain.deltaPoints)}</em></div>
              </div>
              <ol>{result.matched.filter((row) => row.domain === domain.domain).map((row, index) => <li key={row.id}
                className="dumbbell-row" data-testid="h2h-suite-row" data-row-id={row.id}>
                <div className="dumbbell-label"><span>{suiteLabel(row)}</span><small>{row.condition} · {row.metric}</small></div>
                <Dumbbell a={row.a.value} b={row.b.value} strong={false} index={domainIndex + index} reduce={reduce}
                  label={describe({ a: row.a.value, b: row.b.value }, suiteLabel(row))}/>
                <div className="dumbbell-values"><span className="us">{pct(row.a.value)}</span><span className="cn">{pct(row.b.value)}</span>
                  <em>{row.leader === 'tie' ? 'tie' : points(row.deltaPoints)}</em></div>
              </li>)}</ol>
            </li>)}
          </ol>
        </figure>}

    <div className="h2h-actions">
      <button type="button" data-testid="h2h-export" onClick={download} disabled={!state}>Export this comparison (JSON) ↓</button>
      <span>Export and share link keep both models, filters and the {result.method} panel definition.</span>
    </div>

    <details className="h2h-table-wrap" open>
      <summary>Exact matched rows, differences and source drilldown</summary>
      <div className="table-scroll" tabIndex={0} aria-label="Scrollable matched benchmark rows">
        <table data-testid="h2h-table">
          <caption>Matched benchmark rows for {a.name} and {b.name}; difference is {b.name} minus {a.name} in percentage points</caption>
          <thead><tr><th scope="col">Benchmark / condition</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th><th scope="col">Difference</th><th scope="col">Evidence</th></tr></thead>
          <tbody>{result.matched.length === 0
            ? <tr><td colSpan={5}><span className="missing-value">No matched rows.</span></td></tr>
            : result.matched.map((row) => <tr key={row.id} data-row-id={row.id}>
              <th scope="row">{suiteLabel(row)}<small>{row.domain} · {row.condition} · {row.metric}</small></th>
              <td data-cell="us">{pct(row.a.value)}<small>setting {row.a.configuration.setting ?? 'not stated'}</small></td>
              <td data-cell="cn">{pct(row.b.value)}<small>setting {row.b.configuration.setting ?? 'not stated'}</small></td>
              <td data-cell="delta">{row.leader === 'tie' ? 'tie (±0.0 pp)' : points(row.deltaPoints)}</td>
              <td><details className="h2h-sources"><summary>Sources</summary>
                <Evidence row={row.a} authority={authority} side="US"/><Evidence row={row.b} authority={authority} side="China"/>
              </details></td>
            </tr>)}</tbody>
        </table>
      </div>
    </details>

    <div className="h2h-lists">
      <details data-testid="h2h-unmatched"><summary>Unequal coverage ({result.onlyA.length + result.onlyB.length})</summary>
        <p>Observed for only one model under the active filters, so no comparison is made.</p>
        <ul>{[...result.onlyA.map((row) => ['US', row] as const), ...result.onlyB.map((row) => ['China', row] as const)].map(([side, row]) =>
          <li key={row.id}><span>{side} only</span> {suites.get(row.suiteId)?.name ?? row.suiteId} · {row.configuration.condition ?? 'condition not stated'} · {row.rawText}
            <a href={row.resultUrl} target="_blank" rel="noreferrer">result ↗</a></li>)}</ul>
      </details>
      <details data-testid="h2h-excluded"><summary>Excluded observations ({result.excluded.length})</summary>
        <ul>{result.excluded.map((item) => <li key={item.observation.id + item.reason} data-reason={item.reason}>
          <span>{item.side === 'a' ? 'US' : 'China'}</span> {suites.get(item.observation.suiteId)?.name ?? item.observation.suiteId} · {item.observation.rawText} · {item.reason}
          <a href={item.observation.resultUrl} target="_blank" rel="noreferrer">result ↗</a></li>)}</ul>
      </details>
      <details data-testid="h2h-outside"><summary>Outside the regional selectors ({regional.outside.length} models)</summary>
        <p>Global/multinational {outsideCounts.global ?? 0} · other countries {outsideCounts.other ?? 0} · unknown {outsideCounts.unknown ?? 0}. They remain in the catalogue and rankings.</p>
        <ul>{regional.outside.map((model) => <li key={model.key}><span>{model.region}</span> {model.name} · {model.lab ?? 'lab not attributed'} · {model.regionNote}</li>)}</ul>
      </details>
    </div>
  </div>;
}
