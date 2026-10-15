import { useEffect, useMemo, useState } from 'react';
import type { AuthorityBlock } from './authority/logic';
import ComparisonChart from './charts/comparison-chart';
import { downloadRows, RowControls, ViewControls, ViewTable } from './charts/controls';
import { saveQuery, useViewState, useRouteQuery } from './charts/state';
import { pairAvailability, versionPanels, versionRows, type VersionIdentity } from './versions/logic';

const views = ['trend', 'paired', 'table'] as const;
export default function Versions({ models, authority, digest }: { models: VersionIdentity[]; authority: AuthorityBlock; digest: string }) {
  useRouteQuery(['versionLab','version0','version1','versionPanel','versionCondition','versionSetting','versionSuite','versionView']);
  const params = new URLSearchParams(location.search);
  const labs = [...new Set(models.map(m => m.labId))];
  const [lab, setLab] = useState(() => labs.includes(params.get('versionLab') ?? '') ? params.get('versionLab')! : 'all');
  const available = models.filter(m => m.identityVerified && (lab === 'all' || m.labId === lab));
  const defaults = ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101'];
  const [keys, setKeys] = useState(() => defaults.map((fallback,i) => models.some(m => m.identityVerified && m.key === params.get('version' + i)) ? params.get('version' + i)! : fallback));
  const actualKeys = keys.map((key,i) => available.some(m => m.key === key) ? key : available[i]?.key ?? available[0]?.key ?? '');
  const panels = useMemo(() => versionPanels(authority, models), [authority, models]);
  const [panel, setPanel] = useState(() => panels.includes(params.get('versionPanel') ?? '') ? params.get('versionPanel')! : panels.find(p => p.includes('|bfcl-v4|')) ?? panels[0] ?? '');
  const candidates = authority.observations.filter(r => actualKeys.includes(r.modelKey) && `${r.sourceId}|${r.suiteId}|${r.metric}` === panel && r.admitted && r.primary);
  const conditions = [...new Set(candidates.map(r => r.configuration.condition).filter((v): v is string => !!v))].sort();
  const settings = [...new Set(candidates.map(r => r.configuration.setting ?? 'unreported'))].sort();
  const [condition, setCondition] = useState(params.get('versionCondition') ?? 'BFCL FC');
  const [setting, setSetting] = useState(params.get('versionSetting') ?? 'all');
  const actualCondition = conditions.includes(condition) ? condition : 'all';
  const actualSetting = settings.includes(setting) ? setting : 'all';
  const [view, setView] = useViewState('versionView', views, 'trend');
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const rows = useMemo(() => versionRows(authority, models, actualKeys, panel, actualCondition, actualSetting), [authority, models, actualKeys.join(','), panel, actualCondition, actualSetting]);
  const paired = pairAvailability(rows);
  const select = (id: string) => setSelected(id);
  const suite = authority.suites.find(s => s.id === panel.split('|')[1]);
  useEffect(() => {
    saveQuery({ versionLab: lab, version0: actualKeys[0], version1: actualKeys[1], versionPanel: panel,
      versionCondition: actualCondition, versionSetting: actualSetting, versionSuite: suite?.version ?? 'unknown' }, true);
  }, [lab, actualKeys.join(','), panel, actualCondition, actualSetting, suite]);
  function updateModel(i: number, key: string) { const next = [...actualKeys]; next[i] = key; saveQuery({ ['version' + i]: key }); setKeys(next); }
  async function share() { try { await navigator.clipboard.writeText(location.href); setNotice('Version comparison link copied.'); } catch { setNotice('The address bar contains this version comparison.'); } }
  return <section className="chapter version-page" data-testid="versions">
    <p className="route-note">Compare two exact releases on one published panel. A confirmed name does not establish a comparable score. A line requires the same source, suite and harness versions, metric, native unit, test conditions and reasoning setting.</p>
    <div className="version-controls">
      <label>Developer<select aria-label="Version developer" value={lab} onChange={e => { saveQuery({ versionLab: e.target.value }); setLab(e.target.value); }}><option value="all">All developers</option>{labs.map(l => <option key={l}>{l}</option>)}</select></label>
      {actualKeys.map((key,i) => <label key={i}>Version {i === 0 ? 'A' : 'B'}<select aria-label={'Version ' + (i === 0 ? 'A' : 'B')} value={key} onChange={e => updateModel(i, e.target.value)}>{available.map(m => <option key={m.key} value={m.key}>{m.name} · {m.apiId}</option>)}</select></label>)}
      <label>Source / benchmark<select aria-label="Version benchmark panel" value={panel} onChange={e => { saveQuery({ versionPanel: e.target.value }); setPanel(e.target.value); }}>{panels.map(p => <option key={p} value={p}>{authority.suites.find(s => s.id === p.split('|')[1])?.name} · {authority.suites.find(s => s.id === p.split('|')[1])?.version} · {p.split('|')[0]} · {p.split('|')[2]}</option>)}</select></label>
      <label>Test conditions<select aria-label="Version conditions" value={actualCondition} onChange={e => { saveQuery({ versionCondition: e.target.value }); setCondition(e.target.value); }}><option value="all">All (single claims only)</option>{conditions.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Reasoning setting<select aria-label="Version reasoning setting" value={actualSetting} onChange={e => { saveQuery({ versionSetting: e.target.value }); setSetting(e.target.value); }}><option value="all">All (single claims only)</option>{settings.map(s => <option key={s}>{s}</option>)}</select></label>
    </div>
    <div className="feature-actions"><button onClick={share}>Share version comparison</button><button onClick={() => downloadRows('versions', rows, { view, models: actualKeys, panel, condition: actualCondition, setting: actualSetting, productDataDigest: digest, paired, chronology: 'Confirmed release dates only; unknown dates are unplaced' })}>Export version rows</button></div>
    <ViewControls name="Version view" views={views} value={view} onChange={setView} prefix="version-view"/>
    <p data-testid="version-availability" role="status">Paired comparison {paired.available ? 'available' : 'unavailable'}: {paired.reason}</p>
    {view === 'trend' && <><ComparisonChart rows={rows} view="trend" name="versions" selected={selected} onSelect={select}/>
      <p className="core-scale-note">Only confirmed release dates place points on this timeline. {rows.filter(r => !r.releaseDate).length} selected identities have no established release date. Missing or incompatible results break lines; an isolated dot is a published claim with no matched trend. Catalogue creation and retrieval timestamps are never release dates.</p></>}
    {view === 'paired' && (paired.available ? <ComparisonChart rows={rows} view="paired" name="versions" selected={selected} onSelect={select}/> : <div className="comparison-unavailable"><strong>No matched pair to draw.</strong><p>{paired.reason} Inspect the selected claims and exact sources below.</p></div>)}
    {view !== 'table' && <RowControls rows={rows} selected={selected} onSelect={select} testId="version-points"/>}
    <ViewTable rows={rows} caption="Selected version claims in published native units" testId="version-table"/>
    <details className="version-identities"><summary>Exact release identities and confirmed dates</summary>
      <div className="table-scroll" tabIndex={0} aria-label="Scrollable release identities"><table><caption>Source-confirmed identities and selectable previous versions</caption><thead><tr><th>Model</th><th>Exact API identity</th><th>Selection</th><th>Identity evidence</th><th>Release date</th></tr></thead>
      <tbody>{models.filter(m => lab === 'all' || m.labId === lab).map(m => <tr key={m.key}><th scope="row"><a href={m.originalSourceUrl}>{m.name} ↗</a></th><td>{m.apiId}</td><td>{m.selection} · {m.lifecycle}</td><td>{m.identityVerified ? 'Primary confirmed' : m.identityReason} · retrieved {m.retrievedAt.slice(0,10)}</td><td>{m.releaseDate ?? 'Not established'}</td></tr>)}</tbody></table></div>
    </details>
    <p className="route-note">Publisher claims and independent results retain their source labels. Historical measurements can appear here without becoming eligible for the current capability index. <a href="/methods">Read the scoring rules ↗</a></p>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
