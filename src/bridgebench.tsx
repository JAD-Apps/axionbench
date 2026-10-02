import { useMemo, useState } from 'react';
import { bridgeRatingRows, type BridgeDataset } from './current/logic';

// This standalone dataset view can be reused on the benchmark and home routes.
export default function BridgeBench({ dataset }: { dataset: BridgeDataset }) {
  const initial = new URLSearchParams(location.search).get('bridgeAxis');
  const [axis, setAxis] = useState(dataset.axes.some(a => a.id === initial) ? initial! : 'overall');
  const rows = useMemo(() => bridgeRatingRows(dataset, axis), [dataset, axis]);
  return <section className="chapter bridgebench" aria-labelledby="bridgebench-title" data-testid="bridgebench">
    <p className="eyebrow">Selectable publisher dataset</p>
    <h2 id="bridgebench-title">BridgeBench ratings</h2>
    <p>{dataset.methodology} These ratings stay separate from accuracy, Arena Elo and design-gallery qualification. They do not enter the capability index.</p>
    <label>Rating axis <select value={axis} onChange={event => {
      setAxis(event.target.value);
      const url = new URL(location.href); url.searchParams.set('bridgeAxis', event.target.value); history.replaceState(null, '', url);
    }}>{dataset.axes.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
    <p><a href={dataset.guideUrl}>Read the publisher’s rating guide</a> · {rows.length} published model ratings · native {dataset.unit} units</p>
    <div className="table-scroll" tabIndex={0} aria-label="Scrollable BridgeBench result table"><table><caption>{dataset.axes.find(a => a.id === axis)?.label} · higher rating is better</caption>
      <thead><tr><th scope="col">Model and exact result</th><th scope="col">Rating</th><th scope="col">Identity and source date</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><th scope="row"><a href={row.resultUrl}>{row.modelLabel}</a></th>
        <td>{row.value === null ? `Unknown: ${row.missingReason}` : row.value}</td>
        <td>{row.identityVerified ? 'Primary identity confirmed' : `Unverified: ${row.identityReason}`} · retrieved {row.retrievedAt.slice(0, 10)}</td></tr>)}</tbody>
    </table></div>
  </section>;
}
