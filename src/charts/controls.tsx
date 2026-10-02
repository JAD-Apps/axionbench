import { motion } from 'motion/react';
import { useChartReducedMotion } from './reduced-motion';
import type { ViewRow } from './rows';

export function ViewControls<T extends string>({ name, views, value, onChange, prefix }: {
  name: string; views: readonly T[]; value: T; onChange: (next: T) => void; prefix: string;
}) {
  return <div className="core-view-controls" role="group" aria-label={name}>{views.map(view =>
    <button key={view} type="button" data-testid={`${prefix}-${view}`} aria-pressed={view === value} onClick={() => onChange(view)}>{view[0].toUpperCase() + view.slice(1)}</button>
  )}</div>;
}

export function RowDetail({ row }: { row: ViewRow }) {
  return <><strong>{row.label} · {row.detail}</strong><span data-tooltip-value>{row.valueLabel} · {row.unit}</span>
    <span>{row.version} · {row.sourceClass}</span><span>{row.coverage}</span><span>{row.eligibility}</span>
    <span>Retrieved {row.retrievedAt?.slice(0, 10) ?? 'unknown'} · evaluated {row.evaluatedAt?.slice(0, 10) ?? 'unknown'}</span>
    {row.interval && <span>Source interval {(row.interval.low * 100).toFixed(1)}%–{(row.interval.high * 100).toFixed(1)}% · {row.interval.method ?? 'Method unknown'}</span>}
    {row.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</>;
}

export function RowControls({ rows, selected, onSelect, className = '', testId }: {
  rows: ViewRow[]; selected: string; onSelect: (id: string) => void; className?: string; testId?: string;
}) {
  const reduce = useChartReducedMotion();
  return <ol className="core-row-list" data-testid={testId} aria-label="Inspect chart values">{rows.map(row =>
    <motion.li layout={reduce ? false : 'position'} initial={false} key={row.id} data-model-key={row.modelKey} data-value={row.value ?? ''} transition={{ duration: reduce ? 0 : .3 }}>
      <button className={'core-row-control ' + className} type="button" data-row-id={row.id} data-model-id={row.modelKey} data-observation-id={row.id}
        aria-pressed={selected === row.id} aria-label={`${row.label}, ${row.detail}, reported ${row.valueLabel}, ${row.sourceClass}, ${row.detail.endsWith('unverified') ? 'unverified' : row.eligibility}`}
        onFocus={() => onSelect(row.id)} onClick={() => onSelect(row.id)}>
        <span>{row.label}<small>{row.detail}</small></span><strong>{row.valueLabel}</strong>
      </button><span className="core-row-source">{row.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" aria-label={`${s.label} for ${row.label}`}>Result ↗</a>)}</span>
    </motion.li>)}</ol>;
}

export function ViewTable({ rows, caption, testId }: { rows: ViewRow[]; caption: string; testId: string }) {
  return <div className="table-scroll" tabIndex={0} aria-label={`Scrollable ${caption}`}><table data-testid={testId}><caption>{caption}</caption>
    <thead><tr><th scope="col">Model / context</th><th scope="col">Value / native unit</th><th scope="col">Version / source class</th><th scope="col">Coverage / eligibility</th><th scope="col">Exact sources</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id} data-row-id={row.id}><th scope="row">{row.label}<small>{row.detail}</small></th>
      <td data-cell="value">{row.valueLabel}<small>{row.unit}</small></td><td>{row.version}<small>{row.sourceClass}</small><small>Retrieved {row.retrievedAt?.slice(0, 10) ?? 'unknown'} · evaluated {row.evaluatedAt?.slice(0, 10) ?? 'unknown'}</small></td>
      <td>{row.coverage}<small>{row.eligibility}</small></td><td>{row.sources.length ? row.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a>) : row.missingReason}</td></tr>)}</tbody>
  </table></div>;
}

export function downloadRows(name: string, rows: ViewRow[], context: Record<string, unknown>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 'axionbench-view-v1', ...context, rows }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `axionbench-${name}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
