import { scaleLog } from '@visx/scale';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  PARAMETER_BANDS, bandCounts, decodeFilters, encodeFilters, exportRows, filterRows, formatParameters, paginate, representatives,
  type OpenWeightRow, type OpenWeightsBlock, type OwFilters,
} from './open-weights/logic';

type Props = { block: OpenWeightsBlock; digest: string };

// One shared log axis across all panels so small multiples are directly comparable.
const axis = scaleLog({ domain: [1e8, 3e12], range: [2, 98], clamp: true });
const at = (value: number) => `${axis(value)}%`;
const TICKS = [1e9, 1e10, 1e11, 1e12];

const TOTAL_NOTE: Record<OpenWeightRow['total']['status'], string> = {
  'tensor-total': 'safetensors total',
  'quantized-tensor-count': 'quantized checkpoint: tensor count is not a parameter count',
  'not-captured': 'no tensor metadata captured',
};
const ACTIVATED_NOTE: Record<OpenWeightRow['activated']['status'], string> = {
  'card-stated': 'stated in model card',
  ambiguous: 'card states several values',
  inconsistent: 'card value is not below the total',
  'not-stated': 'not stated',
  'no-card': 'no model card captured',
};
const MOE_LABEL: Record<OpenWeightRow['moe']['status'], string> = {
  'stated-activated': 'MoE · activated count stated',
  'architecture-class': 'MoE by architecture class',
  'not-established': 'MoE not established',
};
const LICENCE_LABEL: Record<OpenWeightRow['licence']['class'], string> = {
  'osi-approved': 'OSI-approved licence',
  'named-non-osi': 'Custom or non-OSI licence',
  'not-stated': 'Licence not stated',
  'not-verified': 'Not verified',
};
const ACCESS_LABEL: Record<OpenWeightRow['access']['status'], string> = {
  public: 'Public weights', gated: 'Gated weights', 'not-verified': 'Access not verified',
};
const VARIANT_LABEL: Record<OpenWeightRow['variant']['kind'], string> = {
  base: 'Base', instruct: 'Instruct / chat', 'fine-tune': 'Fine-tune', 'not-stated': 'Base/instruct not stated',
};

function seriesLabel(row: OpenWeightRow) {
  const activated = row.activated.value === null ? 'activated count not stated'
    : `${row.activated.approximate ? 'about ' : ''}${formatParameters(row.activated.value)} activated (model card)`;
  return `${row.name}: ${formatParameters(row.total.value)} total parameters; ${activated}`;
}

function Ruler({ row, index, reduce, band }: { row: OpenWeightRow; index: number; reduce: boolean; band: (typeof PARAMETER_BANDS)[number] }) {
  const total = row.total.value!;
  const activated = row.activated.value;
  const transition = { duration: reduce ? 0 : 0.38, ease: 'easeOut' as const, delay: reduce ? 0 : Math.min(index * 0.035, 0.28) };
  const bandLow = Math.max(band.low ?? 1e8, 1e8);
  const bandHigh = Math.min(band.high ?? 3e12, 3e12);
  return <svg className="ow-ruler" width="100%" height={22} role="img" aria-label={seriesLabel(row)}
    data-total={total} data-activated={activated ?? ''}>
    <title>{seriesLabel(row)}</title>
    <rect x={at(bandLow)} y={3} width={`${axis(bandHigh) - axis(bandLow)}%`} height={16} className="ow-band-shade"/>
    {TICKS.map((tick) => <line key={tick} x1={at(tick)} x2={at(tick)} y1={4} y2={18} className="ow-tick"/>)}
    <motion.g initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={transition}>
      {activated !== null && <line x1={at(activated)} x2={at(total)} y1={11} y2={11} className="ow-link"/>}
      {activated !== null && <circle cx={at(activated)} cy={11} r={4.5} className="ow-activated" data-mark="activated"/>}
      <circle cx={at(total)} cy={11} r={5.5} className="ow-total" data-mark="total"/>
    </motion.g>
  </svg>;
}

function SourceLine({ label, source }: { label: string; source: OpenWeightRow['sources']['metadata'] }) {
  if (!source) return <div><dt>{label}</dt><dd>Not captured</dd></div>;
  return <div><dt>{label}</dt><dd>
    {source.url ? <a href={source.url} target="_blank" rel="noreferrer" data-source-link={source.id}>{source.id} ↗</a> : source.id}
    <span className="mono-label" data-sha256>SHA-256 {source.sha256}</span>
    <span>Retrieved {source.retrievedAt ?? 'unknown'}</span>
  </dd></div>;
}

function Evidence({ row, block }: { row: OpenWeightRow; block: OpenWeightsBlock }) {
  return <details className="ow-evidence" data-testid="ow-source">
    <summary>Sources</summary>
    <dl>
      <SourceLine label="Repository metadata" source={row.sources.metadata}/>
      <SourceLine label="Model card" source={row.sources.card}/>
      <div><dt>Total parameters</dt><dd>{row.total.status === 'tensor-total' ? formatParameters(row.total.value) : 'Not established'} · {TOTAL_NOTE[row.total.status]}
        {row.total.tensorCount !== null && <> · tensor count {row.total.tensorCount.toLocaleString('en-US')} ({row.total.dtypes.join(', ')})</>}</dd></div>
      <div><dt>Activated parameters</dt><dd>{ACTIVATED_NOTE[row.activated.status]}
        {row.activated.quote && <q data-testid="ow-quote">{row.activated.quote}</q>}
        {row.activated.status === 'ambiguous' && <> · values {row.activated.candidates.map((value) => formatParameters(value)).join(', ')}</>}</dd></div>
      <div><dt>Mixture of experts</dt><dd>{row.moe.basis}</dd></div>
      <div><dt>Weights access</dt><dd>{row.access.basis}</dd></div>
      <div><dt>Licence</dt><dd>{row.licence.id ?? 'not stated'}{row.licence.name && ` (${row.licence.name})`}
        {row.licence.link && <> · <a href={row.licence.link} target="_blank" rel="noreferrer">licence text ↗</a></>}</dd></div>
      <div><dt>Checkpoint</dt><dd>{row.variant.basis}{row.variant.baseModel && ` · base model ${row.variant.baseModel}`} · {row.quantized.basis}</dd></div>
      <div><dt>Hosted API price</dt><dd>{block.hostedPrice}</dd></div>
      <div><dt>Self-host cost</dt><dd>{block.selfHostCost}</dd></div>
    </dl>
  </details>;
}

export default function OpenWeights({ block, digest }: Props) {
  const reduce = !!useReducedMotion();
  const labs = useMemo(() => [...new Map(block.rows.map((row) => [row.labId, row.lab])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])), [block]);
  const [filters, setFilters] = useState<OwFilters>(() => decodeFilters(new URLSearchParams(location.search), labs.map(([id]) => id)));
  const scoped = useMemo(() => filterRows(block.rows, { ...filters, band: 'all' }), [block, filters]);
  const counts = useMemo(() => bandCounts(scoped), [scoped]);
  const filtered = useMemo(() => filterRows(block.rows, filters), [block, filters]);
  const view = paginate(filtered, filters.page);

  useEffect(() => {
    history.replaceState(null, '', encodeFilters({ ...filters, page: view.page }, new URL(location.href)));
  }, [filters, view.page]);

  const update = (next: Partial<OwFilters>) => setFilters((current) => ({ ...current, page: 0, ...next }));
  const select = (key: keyof OwFilters, label: string, options: [string, string][]) => <label>
    {label}
    <select data-testid={`ow-${key}`} value={String(filters[key])} onChange={(event) => update({ [key]: event.target.value } as Partial<OwFilters>)}>
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  </label>;

  function download() {
    const blob = new Blob([JSON.stringify(exportRows(block, filtered, filters, digest), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'axionbench-open-weights.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  return <div className="ow" data-testid="ow">
    <div className="band-tabs" role="group" aria-label="Total parameter group">
      <button type="button" aria-pressed={filters.band === 'all'} onClick={() => update({ band: 'all' })}>All sizes <small>{scoped.length}</small></button>
      {PARAMETER_BANDS.map((band) => <button type="button" key={band.id} aria-pressed={filters.band === band.id}
        data-band={band.id} onClick={() => update({ band: band.id })}>{band.label} <small>{counts[band.id]}</small></button>)}
    </div>

    <div className="ow-multiples" data-testid="ow-multiples">
      {PARAMETER_BANDS.map((band) => {
        const reps = representatives(scoped, band.id);
        return <figure key={band.id} className={'ow-panel' + (filters.band === band.id ? ' active' : '')} data-testid="ow-panel" data-band={band.id}>
          <figcaption><strong>{band.label}</strong><span>{reps.length} of {counts[band.id]} shown · one per lab</span></figcaption>
          {reps.length === 0 ? <p className="ow-empty">No entries match the current filters.</p>
            : <ul>{reps.map((row, index) => <li key={row.modelId} data-testid="ow-series" data-model-id={row.modelId}>
                <span className="ow-name"><strong>{row.name}</strong><small>{row.lab}</small></span>
                {band.id === 'undisclosed'
                  ? <span className="ow-undisclosed">{TOTAL_NOTE[row.total.status]}</span>
                  : <Ruler row={row} index={index} reduce={reduce} band={band}/>}
              </li>)}</ul>}
        </figure>;
      })}
      <p className="ow-legend"><span className="ow-key total"/>Total parameters (sets the group)
        <span className="ow-key activated"/>Activated per token (MoE, card-stated) · log scale 0.1B–3T</p>
    </div>

    <div className="ow-controls">
      <label className="search">Search open-weight models
        <input data-testid="ow-query" value={filters.query} onChange={(event) => update({ query: event.target.value })} placeholder="Model, lab or repository"/>
      </label>
      {select('moe', 'Mixture of experts', [['all', 'Any'], ['stated-activated', MOE_LABEL['stated-activated']], ['architecture-class', MOE_LABEL['architecture-class']], ['not-established', MOE_LABEL['not-established']]])}
      {select('access', 'Weights access', [['all', 'Any'], ['public', ACCESS_LABEL.public], ['gated', ACCESS_LABEL.gated], ['not-verified', ACCESS_LABEL['not-verified']]])}
      {select('licence', 'Licence', [['all', 'Any'], ['osi-approved', LICENCE_LABEL['osi-approved']], ['named-non-osi', LICENCE_LABEL['named-non-osi']], ['not-stated', LICENCE_LABEL['not-stated']], ['not-verified', LICENCE_LABEL['not-verified']]])}
      {select('variant', 'Base / instruct', [['all', 'Any'], ['base', VARIANT_LABEL.base], ['instruct', VARIANT_LABEL.instruct], ['fine-tune', VARIANT_LABEL['fine-tune']], ['not-stated', VARIANT_LABEL['not-stated']]])}
      {select('quantized', 'Quantized', [['all', 'Any'], ['yes', 'Quantized checkpoint'], ['no', 'Not quantized']])}
      {select('lab', 'Lab', [['all', 'All labs'], ...labs])}
    </div>

    <aside className="ow-cost" data-testid="ow-cost">
      <div><strong>Hosted API price</strong><p>{block.hostedPrice}</p></div>
      <div><strong>Self-host cost</strong><p>{block.selfHostCost}</p></div>
    </aside>

    <div className="ow-count" aria-live="polite"><strong data-testid="ow-total">{filtered.length}</strong>
      <span>of {block.rows.length} open-weight entries · showing {view.start}–{view.end}</span>
      <button type="button" className="export" data-testid="ow-export" onClick={download}>Export filtered rows (JSON)</button></div>
    <div className="table-scroll" tabIndex={0} aria-label="Scrollable open-weight table">
      <table data-testid="ow-table">
        <caption>Open-weight entries for the selected filters, largest established total first</caption>
        <thead><tr><th scope="col">Model</th><th scope="col">Total</th><th scope="col">Activated · MoE</th><th scope="col">Openness</th>
          <th scope="col">Checkpoint</th><th scope="col">Results</th><th scope="col">Evidence</th></tr></thead>
        <tbody>{view.rows.map((row) => <tr key={row.modelId} data-row-id={row.modelId} data-band={row.band}>
          <th scope="row">{row.name}<small>{row.lab}</small>
            {row.repositoryUrl && <a href={row.repositoryUrl} target="_blank" rel="noreferrer" className="mono-label">{row.repository} ↗</a>}</th>
          <td data-cell="total">{formatParameters(row.total.value)}<small>{TOTAL_NOTE[row.total.status]}</small></td>
          <td data-cell="activated">{row.activated.value === null ? 'Not stated' : (row.activated.approximate ? '~' : '') + formatParameters(row.activated.value)}
            <small>{MOE_LABEL[row.moe.status]}</small></td>
          <td data-cell="openness">{ACCESS_LABEL[row.access.status]}<small>{LICENCE_LABEL[row.licence.class]}{row.licence.id && ` · ${row.licence.id}`}</small></td>
          <td data-cell="checkpoint">{VARIANT_LABEL[row.variant.kind]}<small>{row.quantized.value ? 'Quantized' : 'Not quantized'}</small></td>
          <td>{row.observationCount ? row.observationCount : 'None captured'}</td>
          <td><Evidence row={row} block={block}/></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="pagination">
      <button type="button" data-testid="ow-prev" aria-label="Previous open-weight page" disabled={view.page === 0}
        onClick={() => setFilters((current) => ({ ...current, page: view.page - 1 }))}>← Previous</button>
      <span data-testid="ow-page">Page {view.page + 1} of {view.pages}</span>
      <button type="button" data-testid="ow-next" aria-label="Next open-weight page" disabled={view.page + 1 >= view.pages}
        onClick={() => setFilters((current) => ({ ...current, page: view.page + 1 }))}>Next →</button>
    </div>
  </div>;
}
