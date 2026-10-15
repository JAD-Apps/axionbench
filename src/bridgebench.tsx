import { useEffect, useMemo, useState } from 'react';
import type { BridgeDataset } from './current/logic';
import CoreChart from './charts/core-chart';
import { downloadRows, RowControls, ViewControls, ViewTable } from './charts/controls';
import { bridgeViewRows } from './charts/rows';
import { saveQuery, useViewState } from './charts/state';
const views = ['bars', 'dots', 'table'] as const;
export default function BridgeBench({ dataset }: { dataset: BridgeDataset }) {
  const params = new URLSearchParams(location.search);
  const initial = params.get('bridgeAxis');
  const [axis, setAxis] = useState(dataset.axes.some(a => a.id === initial) ? initial! : 'overall');
  const [cohort, setCohort] = useState(params.get('bridgeCohort') === 'confirmed' ? 'confirmed' : 'all');
  const [selected, setSelected] = useState(params.get('bridgeSelected') ?? '');
  const [view, setView] = useViewState('bridgeView', views, 'bars');
  const keys = useMemo(() => cohort === 'confirmed' ? dataset.records.filter(r => r.identityVerified).map(r => r.modelKey) : undefined, [dataset, cohort]);
  const rows = useMemo(() => bridgeViewRows(dataset, axis, keys), [dataset, axis, keys]);
  const select = (id: string) => { saveQuery({ bridgeSelected: id }); setSelected(id); };
  useEffect(() => { saveQuery({ bridgeAxis: axis, bridgeCohort: cohort, bridgeVersion: dataset.version, bridgeSelected: rows.some(r => r.id === selected) ? selected : null }, true); }, [axis, cohort, dataset, rows, selected]);
  return <section className="chapter bridgebench" aria-labelledby="bridgebench-title" data-testid="bridgebench">
    <p className="eyebrow">Selectable publisher dataset</p><h2 id="bridgebench-title">BridgeBench ratings</h2>
    <p>{dataset.methodology} These ratings stay separate from accuracy, Arena Elo and design-gallery qualification. They do not enter the capability index. Overall includes cost and speed; those components are not separate capability evidence.</p>
    <div className="core-filter-row"><label>Rating axis <select value={axis} onChange={e => { saveQuery({ bridgeAxis: e.target.value }); setAxis(e.target.value); }}>{dataset.axes.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
      <label>Rating cohort <select value={cohort} onChange={e => { saveQuery({ bridgeCohort: e.target.value }); setCohort(e.target.value); }}><option value="all">All published identities</option><option value="confirmed">Primary-confirmed identities</option></select></label></div>
    <p><a href={dataset.guideUrl}>Read the publisher’s rating guide</a> · {rows.length} published model ratings · native {dataset.unit} units · snapshot {dataset.version}</p>
    <ViewControls name="BridgeBench views" views={views} value={view} onChange={setView} prefix="bridge-view"/>
    <div className="feature-actions"><button onClick={() => downloadRows('bridgebench', rows, { axis, cohort, view, snapshot: dataset.version, route: location.pathname + location.search })}>Export rating rows</button></div>
    {view !== 'table' && <><CoreChart rows={rows} view={view} name="bridgebench" selected={selected} onSelect={select}/><RowControls rows={rows} selected={selected} onSelect={select}/></>}
    {view === 'table' ? <ViewTable rows={rows} caption={`${dataset.axes.find(a => a.id === axis)?.label} · higher rating is better`} testId="bridge-table"/>
      : <details className="exact-table-slot"><summary>Accessible publisher rating values and sources</summary><ViewTable rows={rows} caption={`${dataset.axes.find(a => a.id === axis)?.label} · higher rating is better`} testId="bridge-table"/></details>}
  </section>;
}
