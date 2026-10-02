import { useEffect, useState } from 'react';

export function saveQuery(patch: Record<string, string | null>, replace = false) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') url.searchParams.delete(key); else url.searchParams.set(key, value);
  }
  if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

export function useViewState<T extends string>(key: string, views: readonly T[], fallback: T) {
  const [view, setView] = useState<T>(() => {
    const requested = new URLSearchParams(location.search).get(key);
    return views.includes(requested as T) ? requested as T : fallback;
  });
  useEffect(() => { saveQuery({ [key]: view }, true); }, [key, view]);
  return [view, (next: T) => { saveQuery({ [key]: next }); setView(next); }] as const;
}
