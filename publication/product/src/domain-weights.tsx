import { useEffect, useMemo, useState } from 'react';
import type { AuthorityBlock } from './authority/logic';
import { pct } from './authority/logic';
import { authorityPanel, rankResult, weightSensitivity } from './scoring/authority';
import { DEFAULT_WEIGHTS, decodeWeightSettings, encodeWeightSettings, validateWeights, type PanelResult, type WeightSettings } from './scoring/index.mjs';

const rankLabel = (result: PanelResult) => {
  const ranked = rankResult(result);
  if (!ranked.length) return 'Insufficient common coverage';
  const tied = ranked.length > 1 && Math.abs(ranked[0][1].score - ranked[1][1].score) < 1e-9;
  return tied ? 'Tie' : ranked.map(([, model], index) => `${index + 1}. ${model.model} (${pct(model.score)})`).join(' / ');
};

export default function DomainWeights({ authority, digest }: { authority: AuthorityBlock; digest: string }) {
  const candidates = useMemo(() => {
    const measured = new Set(authority.observations.filter((row) => row.admitted && row.primary && row.configuration.conditionsKnown).map((row) => row.modelKey));
    return authority.models.filter((model) => measured.has(model.key)).sort((a, b) => a.name.localeCompare(b.name));
  }, [authority]);
  const defaults = ['gpt-6-astra', 'gemini-3-8-flash'].filter((key) => candidates.some((model) => model.key === key));
  const [cohort, setCohort] = useState(() => {
    const requested = new URLSearchParams(location.search).get('weight-models')?.split(',');
    return requested?.length === 2 && requested[0] !== requested[1] && requested.every((key) => candidates.some((model) => model.key === key))
      ? requested : defaults.length === 2 ? defaults : candidates.slice(0, 2).map((model) => model.key);
  });
  const decoded = decodeWeightSettings(location.search);
  const [weights, setWeights] = useState<WeightSettings>(() => ({ ...Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((key) => [key, 0])), ...decoded.weights }));
  const [notice, setNotice] = useState(decoded.valid ? '' : 'Invalid saved weights were reset to the equal default.');
  const sensitivity = useMemo(() => weightSensitivity(authority, cohort, weights), [authority, cohort, weights]);
  const { result, rows } = sensitivity.base;
  const available = useMemo(() => authorityPanel(authority, cohort, { ...DEFAULT_WEIGHTS }).coveredDomains, [authority, cohort]);
  const selected = Object.keys(weights).filter((key) => weights[key] > 0);
  const missing = selected.filter((domain) => !available.includes(domain));
  const isDefault = Object.keys(DEFAULT_WEIGHTS).every((key) => weights[key] === DEFAULT_WEIGHTS[key]);
  const scores = rankResult(result);
  const suiteNames = new Map(authority.suites.map((suite) => [suite.id, suite.name]));
  const rowsByPanel = [...new Map(rows.map((row) => [[row.sourceId, row.suiteId, row.metric, row.configuration.condition, row.configuration.setting].join('|'), row])).values()];
  const validRuns = [...sensitivity.weightRuns.map((run) => run.result), ...sensitivity.omissions.map((run) => run.result)]
    .map(rankResult).filter((ranked) => ranked.length > 0);
  const leaders = new Set(validRuns.map((ranked) => ranked.length > 1 && Math.abs(ranked[0][1].score - ranked[1][1].score) < 1e-9 ? 'tie' : ranked[0][0]));
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('w', new URLSearchParams(encodeWeightSettings(weights)).get('w')!);
    url.searchParams.set('weight-models', cohort.join(','));
    history.replaceState(null, '', url);
  }, [weights, cohort]);
  function update(domain: string, value: number) {
    const next = { ...weights, [domain]: value };
    try { validateWeights(next); setWeights(next); setNotice(''); }
    catch { setNotice('At least one capability domain must have a positive weight.'); }
  }
  async function share() {
    try { await navigator.clipboard.writeText(location.href); setNotice('Comparison and weight link copied.'); }
    catch { setNotice('The address bar contains these models and domain weights.'); }
  }
  function download() {
    const payload = { schemaVersion: 'axionbench-weight-sensitivity-v1', productDataDigest: digest, cohort,
      weights, defaultWeights: DEFAULT_WEIGHTS, custom: !isDefault, commonPanel: rows,
      result, sensitivity: { weightRuns: sensitivity.weightRuns, leaveOneSuiteOut: sensitivity.omissions, independentOnly: sensitivity.independent },
      caveat: 'Fixed cohort/common panel, source family caps, no missing-value imputation. Weight and omission scenarios are not statistical confidence intervals.' };
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = href; link.download = 'axionbench-domain-weights.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return <section className="weight-experience" id="domain-weights" aria-labelledby="weight-title" data-testid="domain-weights">
    <div className="coverage-head"><div><p className="eyebrow">A declared point of view</p><h3 id="weight-title">Choose what matters. Keep the panel fixed.</h3></div><span>{isDefault ? 'DEFAULT / EQUAL DOMAINS' : 'CUSTOM / USER WEIGHTS'}</span></div>
    <p className="cost-lead">The same source, suite version, metric, test condition and reasoning setting must be present for both models. Families are capped before domains are weighted. An incomplete positively weighted domain makes the comparison unavailable.</p>
    <div className="weight-models">{cohort.map((key, index) => <label key={index}>Model {index + 1}<select aria-label={'Weight model ' + (index + 1)} data-testid={'weight-model-' + index} value={key}
      onChange={(event) => { const next = [...cohort]; next[index] = event.target.value; setCohort(next); }}>
      {candidates.map((model) => <option key={model.key} value={model.key} disabled={cohort[1 - index] === model.key}>{model.name} · {model.lab ?? 'Lab unknown'}</option>)}</select></label>)}</div>
    <div className="weight-layout"><div className="weight-controls" aria-label="Capability domain weights">
      {Object.keys(DEFAULT_WEIGHTS).map((domain) => <label key={domain}><span>{domain.replaceAll('-', ' ')}<small>{available.includes(domain) ? 'Common panel available' : 'No compatible common panel'}</small></span>
        <input type="number" min="0" max="10" step="0.25" aria-label={domain + ' weight'} data-testid={'weight-' + domain} value={weights[domain] ?? 0}
          onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value <= 10) update(domain, value); }}/></label>)}
      <div className="feature-actions"><button data-testid="weight-reset" onClick={() => { setWeights({ ...DEFAULT_WEIGHTS }); setNotice('Equal default weights restored.'); }}>Reset equal weights</button>
        <button data-testid="weight-covered" disabled={!available.length} onClick={() => { setWeights(Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((key) => [key, available.includes(key) ? 1 : 0]))); setNotice('Custom subset uses only this pair’s common domains.'); }}>Use covered domains</button>
        <button data-testid="weight-share" onClick={share}>Share weights</button><button data-testid="weight-export" onClick={download}>Export sensitivity ↗</button></div>
    </div><div className="weight-results">
      <p className="eyebrow">{isDefault ? 'Equal default index / 11 domains' : 'Custom common-panel index / ' + selected.length + ' domains'}</p>
      <div className="weight-score" data-testid="weight-score">{scores.length ? scores.map(([key, model]) => <div key={key}><strong>{pct(model.score)}</strong><span>{model.model}</span></div>) : <p>Insufficient common coverage</p>}</div>
      <p data-testid="weight-coverage">{result.panelSize} compatible common panels · {available.length} available capability domains · {selected.length} positively weighted domains.</p>
      {missing.length > 0 && <p className="weight-missing">Missing selected domains: {missing.join(', ')}. No weight is redistributed to replace them.</p>}
      <p>Zero-weight domains are explicitly excluded from the selected index. A custom subset is labelled separately from the default and applies to this pair only.</p>
      <details><summary>Inspect the exact common panel ({rowsByPanel.length})</summary><ul>{rowsByPanel.map((row) => <li key={row.id}><a href={row.resultUrl} target="_blank" rel="noreferrer">{suiteNames.get(row.suiteId) ?? row.suiteId} ↗</a> · {row.sourceId} / {row.metric} / {row.configuration.condition} / {row.configuration.setting ?? 'Unreported setting'}</li>)}</ul></details>
    </div></div>
    <div className="weight-sensitivity" data-testid="weight-sensitivity"><div><h4>How sensitive is the order?</h4><p>Each selected domain is changed by ±20%, one at a time. Every run recomputes the same cohort and admission rules. {validRuns.length ? (leaders.size > 1 ? 'The leading model changes or ties across supported scenarios.' : 'The leading model is stable across the supported weight and omission scenarios.') : 'No selected scenario has complete common coverage.'} These scenarios are not confidence intervals.</p></div>
      <div className="table-scroll" tabIndex={0} aria-label="Scrollable weight sensitivity table"><table data-testid="weight-sensitivity-table"><thead><tr><th scope="col">Weight scenario</th><th scope="col">Order / result</th></tr></thead><tbody>{sensitivity.weightRuns.map((run) => <tr key={run.label}><th scope="row">{run.label}</th><td>{rankLabel(run.result)}</td></tr>)}</tbody></table></div>
      <details><summary>Leave one suite out ({sensitivity.omissions.length} real suites)</summary><ul data-testid="weight-omissions">{sensitivity.omissions.map((run) => <li key={run.suiteId}>
        <a href={rows.find((row) => row.suiteId === run.suiteId)!.resultUrl} target="_blank" rel="noreferrer">Without {suiteNames.get(run.suiteId) ?? run.suiteId} ↗</a>: {rankLabel(run.result)}</li>)}</ul></details>
      <p data-testid="weight-independent"><strong>Independent-evaluator sources only:</strong> {rankLabel(sensitivity.independent)}. Benchmark-authority and publisher claims are excluded from this check; source independence does not mean an item-level replication.</p>
    </div>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
