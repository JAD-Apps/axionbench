import { useEffect, useState } from 'react';

// publication.json is replaced only inside a snapshot published by the daily
// update; other builds ship the "unpublished" placeholder. The published
// refresh date stays separate from source retrieval, validation and build.
type Publication = {
  schemaVersion: string; status: 'published' | 'unpublished'; refreshKey: string | null; refreshDate: string | null;
  validatedAt: string | null; builtAt: string | null;
};

export function PublicationDates({ retrievedAt }: { retrievedAt: string }) {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/publication.json', { cache: 'no-cache' })
      .then((response) => { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json() as Promise<Publication>; })
      .then((next) => { if (!active) return; if (next.schemaVersion === 'axionbench-publication-v1') setPublication(next); else setUnavailable(true); })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, []);
  const published = publication?.status === 'published' ? publication : null;
  const refresh = published ? `${published.refreshDate} (update ${published.refreshKey})`
    : unavailable ? 'Publication record unavailable'
      : publication ? 'Not published by the daily update (local or manual build)' : 'Loading…';
  return <>
    <div><dt>Daily refresh published</dt><dd>{refresh}</dd></div>
    <div><dt>Sources retrieved</dt><dd>{retrievedAt}</dd></div>
    <div><dt>Data validated</dt><dd>{published?.validatedAt ?? 'Not recorded for this build'}</dd></div>
    <div><dt>Site built</dt><dd>{published?.builtAt ?? 'Recorded in release-manifest.json'}</dd></div>
  </>;
}
