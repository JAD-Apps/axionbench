import { useEffect, useState } from 'react';
import type { Dataset } from './observatory-experience';

export default function Versions({ models }: { models: Dataset['currentModels'] }) {
  const [lab, setLab] = useState(() => new URLSearchParams(location.search).get('versionLab') ?? 'all');
  const labs = [...new Set(models.map(m => m.labId))];
  const active = labs.includes(lab) ? lab : 'all';
  useEffect(() => {
    const url = new URL(location.href); if (active === 'all') url.searchParams.delete('versionLab'); else url.searchParams.set('versionLab', active);
    history.replaceState(null, '', url);
  }, [active]);
  return <section className="chapter version-page" data-testid="versions"><p className="route-note">These are exact requested releases. A confirmed name does not establish a comparable score. Trends require the same benchmark version and test conditions.</p>
    <label>Developer <select aria-label="Version developer" value={active} onChange={e => setLab(e.target.value)}><option value="all">All developers</option>{labs.map(l => <option key={l}>{l}</option>)}</select></label>
    <div className="table-scroll" tabIndex={0} aria-label="Scrollable release identities"><table><caption>Source-confirmed identities and selectable previous versions</caption><thead><tr><th>Model</th><th>Exact API identity</th><th>Selection</th><th>Identity evidence</th><th>Release date</th></tr></thead>
      <tbody>{models.filter(m => active === 'all' || m.labId === active).map(m => <tr key={m.key}><th scope="row"><a href={m.originalSourceUrl}>{m.name} ↗</a></th><td>{m.apiId}</td><td>{m.selection} · {m.lifecycle}</td><td>{m.identityVerified ? 'Primary confirmed' : m.identityReason} · retrieved {m.retrievedAt.slice(0,10)}</td><td>{m.releaseDate ?? 'Not established'}</td></tr>)}</tbody></table></div>
  </section>;
}
