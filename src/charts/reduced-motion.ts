import { useSyncExternalStore } from 'react';

let query: MediaQueryList | undefined;
const media = () => query ??= window.matchMedia('(prefers-reduced-motion: reduce)');
const subscribe = (notify: () => void) => {
  media().addEventListener('change', notify);
  return () => media().removeEventListener('change', notify);
};
const snapshot = () => media().matches;

// The pinned Motion hook reads the preference only at mount. Keep the core
// chart and Motion row controls responsive to preference changes while open.
export const useChartReducedMotion = () => useSyncExternalStore(subscribe, snapshot, () => true);
