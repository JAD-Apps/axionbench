// One route list drives navigation, static HTML generation and server checks.
export const routes = [
  { id: 'overview', path: '/', title: 'Overview', description: 'Choose a model for the work ahead.' },
  { id: 'rankings', path: '/rankings', title: 'Rankings', description: 'Compare results on the same test and configuration.' },
  { id: 'benchmarks', path: '/benchmarks', title: 'Benchmark scores', description: 'Inspect published results in their original units.' },
  { id: 'domains', path: '/domains', title: 'Domains', description: 'Choose the capabilities that matter to your task.' },
  { id: 'pricing', path: '/task-pricing', title: 'Task pricing', description: 'Estimate an API bill from actual token classes.' },
  { id: 'versions', path: '/versions', title: 'Versions', description: 'Keep exact releases and their evidence separate.' },
  { id: 'open', path: '/open-weights', title: 'Open weights', description: 'Find public weights at the scale you need.' },
  { id: 'regional', path: '/us-china', title: 'US–China', description: 'Compare only tests measured for both selected models.' },
  { id: 'models', path: '/models', title: 'Models', description: 'Search the catalogue, including unscored entries.' },
  { id: 'methods', path: '/methods', title: 'Methods', description: 'Understand sources, coverage and calculation rules.' },
  { id: 'archive', path: '/benchmark-archive', title: 'Benchmark archive', description: 'Inspect the benchmark registry and historical coverage.' },
] as const;
export type RouteId = typeof routes[number]['id'];
export function findRoute(pathname: string) {
  return routes.find(route => route.path === (pathname.replace(/\/$/, '') || '/'));
}
