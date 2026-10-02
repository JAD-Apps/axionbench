# Pages and URL state

| URL | Purpose |
| --- | --- |
| `/` | Animated overview and Economy/Balanced/Frontier task comparisons |
| `/rankings` | Same-panel model rankings |
| `/benchmarks` | BridgeBench native ratings and exact captured benchmark values |
| `/domains` | Custom domain weights, common coverage and sensitivity |
| `/task-pricing` | Token, cache, thinking and long-context task costs |
| `/versions` | Exact current and previous release identities with primary links |
| `/open-weights` | Public weights grouped by disclosed total parameters |
| `/us-china` | Matched US/China comparisons and coverage |
| `/models` | Searchable complete catalogue, filters and exports |
| `/methods` | Scoring rules, licences, missingness, sources and digest |
| `/benchmark-archive` | Complete benchmark registry and historical coverage |

Links are normal URLs and work in a new tab. Unmodified clicks between pages use browser history and focus the new route title. Back/forward remounts the route with its saved URL filters. The skip link reaches the main content. The narrow-screen navigation scrolls horizontally; Tab brings focused links into view.

Homepage state uses `taskType`, `tokens` and `benchmark`. Benchmark ratings use `bridgeAxis`; exact captured result controls keep `suite`, `cohort`, `domain`, `lab`, `view` and `selected`. Existing ranking, pricing, weights, catalogue and open-weight query keys remain on their owning routes. A navigation link starts a fresh destination query; browser history retains earlier page filters. Copy the address to share the active page and its controls.

`npm run build` writes an `index.html` for each declared route with its title and canonical URL. Assets use absolute paths. Cloudflare Pages can serve these directories directly. A top-level `404.html` disables its implicit single-page-app catch-all: missing assets and unknown routes keep HTTP 404. No wildcard redirect masks missing files. This follows [Cloudflare’s documented route and 404 behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/).

For local production checks, run `npm run build`, then `node scripts/serve.mjs` (default port 7942; set `PORT` to change it). The server serves `dist/`, maps only known page paths to their actual HTML and returns 404 for unknown paths and missing assets. `node scripts/project/test-routes.mjs` builds and exercises this exact artifact in Chromium. Do not use a development-server fallback as proof of production hard reloads.
