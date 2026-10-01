# React and chart foundation

This document records the earlier historical foundation, before the current authority-backed observatory replaced the preview. The legacy root `data.json` and ECharts preview have been archived privately and removed from the product. Current source, pricing, scoring and mounted verification are described in [FRONTIER-EXPERIENCE.md](FRONTIER-EXPERIENCE.md), [METHODOLOGY.md](METHODOLOGY.md) and [PRICING.md](PRICING.md).

This step establishes the portable React/TypeScript/Vite entry point and proves two SVG chart shapes before later work replaces the broader page composition. `npm run verify:foundation` runs a strict typecheck, clean Vite production build, unit regressions and a focused browser smoke against the built output. `npm run test:unit` is also independently runnable.

The ranking and cost/capability scatter consume the existing `data.json` snapshot. The UI explicitly labels it historical and does not present its rows as a current model survey. Ranking omits null capability values. Scatter additionally omits rows without a positive public API price. Both views share lab/capability filters, selection and a table of the same scored rows; SVG marks have keyboard selection and expose values and coverage in accessible names. Motion transitions follow reduced-motion preference. Analytical charting is SVG; canvas is retained only for the original hero sculpture.

`assets/surface.js` remains the original hero implementation. Its separately served copy at `public/assets/surface.js` is checked byte-for-byte by the chart smoke build route. The existing locally hosted Space Grotesk, DM Sans and IBM Plex Mono files are served from `public/assets`; each font's accompanying license text is copied there as well. Source and runtime assets do not depend on a CDN.

The exact package manager is `npm@11.19.0`; dependency versions are exact in `package.json` and `package-lock.json`. Frozen worktree setup can use `npm ci --offline` after dependency preparation has populated the npm cache. Browser smoke needs a cached Chromium or `CHROMIUM_PATH`; it fails with a specific diagnostic when absent instead of silently skipping.

Foundation build observation after the chart review fixes: Vite 8.3.1 emitted a 569.48 kB minified application chunk (177.41 kB gzip) and 6.02 kB CSS (2.07 kB gzip). The chart foundation is within the blueprint's 180 kB gzip JavaScript target. Vite still reports a raw chunk warning above 500 kB; later catalogue/method views should be split if the completed application exceeds its gzip budget.

The coordinator corrected a daemon-only Chromium startup failure after the completed worker contribution: shared `/tmp` is read-only during network-enabled verification, and the supplied scratch path exceeds Unix socket limits. On Linux, the harness holds an open descriptor to an isolated directory under ignored `test-artifacts/` and supplies its short `/proc/<pid>/fd/<fd>` path to Chromium. Files remain inside the writable candidate; the descriptor and temporary directory are cleaned up after browser shutdown. A browser smoke run under the same read-only-root and writable-candidate/scratch restrictions passed. The failed original receipts remain preserved; only a fresh daemon verification can accept the corrected source.

## Evidence boundary

This foundation smoke proves built chart rendering and basic interactions only. It is not the complete responsive visual acceptance, fresh source ingestion, scoring review, independent release review, public-repository readback, production verification or owner-browser evidence required by later workflow stages.
