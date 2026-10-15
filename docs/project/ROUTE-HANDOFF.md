# Dark routes and comparison homepage handoff

This step implements the route shell and visual composition. It does not claim publication, independent review, a daily API transaction, owner-browser proof or an MP4; those belong to later assigned stages. No commits or pushes were made here. The npm packageManager stays npm@11.19.0 and package-lock.json is unchanged.

## Current implementation

`src/routes.ts` declares eleven routes. `src/observatory.tsx` owns shared navigation, active links, titles/canonicals, focus, history and the overview-only hero. `src/observatory-experience.tsx` mounts existing functions on their pages and limits exact-benchmark query writes to the benchmark route. `src/home-comparison.tsx` and `src/home/logic.ts` provide the source-linked task comparison and use the audited task calculator. `src/versions.tsx` exposes exact current/previous identities pending the later comparable-view phase.

`vite.config.ts` emits actual route HTML into dist; `scripts/serve.mjs` serves known route files without a catch-all. `public/404.html` disables Cloudflare Pages' implicit SPA fallback. Index metadata, sitemap, fonts, colours and responsive CSS are updated. Procedural contour equations and pointer behavior remain; both source/served copies add lifecycle cleanup and cyan/violet highlights. No generated raster is needed.

Portable source copies now include the implementation, route/design checks and their docs. Public verification adds the route/design gates without dropping existing gates. Route-dependent legacy UI tests navigate their owning pages; existing mathematical, source and data assertions remain. The archive command-evidence list now requires the actual portable gate order, including the inherited current-policy gate and new design/routes gates; its exact equality check is retained.

## Private references and verified dependencies

The complete dependency index SHA-256 matched `0b29fae3d0b193b7abfd5d9e29702c1bce69238ecb5d96caef579e6ba3294123`. The step-2 artifact SHA-256 matched `f3391ef3b0c678fca2003929026cba537433023b9e67e2b6e2e669d66c08f2a0`. Its historical receipts are not claimed as this worker's own runs.

Both supplied private PNGs were viewed through the permitted image tool, with verified hashes:

- hero: `97b3a371ace07ca9769f7cd4d8e5f0861c8e289e296eae9f4fb1348f55ccfa32`
- task comparison: `0c57d0066cd25e2b5851f10f94ef8e1fa15ec0237bc2787533b4c0ce148879e8`

Their original bytes were not changed or added to product/public source. The new page borrows the split hero/control/three-tier comparison structure, without using old figures. Current Awwwards collection and entry/live-site browser captures remain ignored in `test-results/references/`, with file hashes in `review.json`. Public design docs record URLs and original decisions without shipping captures.

## Local verification

The exact saved command `npm run typecheck && npm run verify:design && node scripts/project/test-routes.mjs` exited 0 locally. The daemon still owns the stage verdict. `test-results/routes/report.json` binds current source files and data SHA-256 `338e9adeffec18e02d9f3c8e79b39673d0b57836deda50f45a597907d5024463` and hashes 48 screenshots: every route at 360/768/1280/1440 px plus the four homepage comparison captures. Initial JavaScript gzip is 132,083 bytes, below the unchanged 180 KiB budget.

The route gate tests dark first paint while scripts/styles are blocked on a light OS; real missing-route/asset 404s; titles and active links; keyboard scroll/focus; history, route-local query restoration and reload; 5 task axes × 3 budgets × 3 tiers against actual source ratings/pricing; rejected unverified identities, missing ratings and stale/expired tariffs; independent-capability separation; digest tampering; static reduced motion; animated visible hero, offscreen suspension and remount.

`node scripts/test-acceptance.mjs` also exited 0 locally: 15 recorded checks, 35 fresh screenshots at 320/390/768/1440/1920 px, same-scale marks, source links, source-matched exports, keyboard, touch, reduced motion, actual transitions, data failures, and text contrast including every retained detailed page. Earlier failures exposed and repaired clipped focused navigation, hash focus overrides and US–China label contrast; no gate was weakened. `node scripts/chart-smoke.mjs`, `node scripts/test-frontier.mjs` and `node scripts/project/test-bridgebench-view.mjs` also exited 0 after their route migration. The latter retained digest/count checks, the 180 KiB budget, raw-result missingness and table parity, real source disclosure/new-tab URLs, keyboard/touch selection, shared filters, the data-failure fixture and all responsive bounds.

## Limits for later stages

Only one identity-confirmed BridgeBench model has a licensed usable API tariff in this snapshot. Economy and Balanced therefore both show Gemini 3.8 Flash; Frontier shows its genuine task rating with unknown cost where appropriate. Independent current capability is not inferred from publisher ratings. Homepage absence/limited-coverage states are deliberate, rather than invented recommendations.

Chart.js migration, current-frontier view defaults, comparable versions and visx removal belong to steps 4–6. This step retains those existing chart implementations on their separate pages. The current policy has just four eligible independent rows in tool-use; later view checks must keep that gap visible rather than re-admit historical rows. Runtime requested/provider-reported model/effort/Fast receipts are owned by JadBot; this workspace has no API exposing them, so this handoff makes no new runtime-attestation claim.

## Preserved release blocker from the incoming current-policy UI fixture

`node scripts/test-cost-weights.mjs` exited 1 at `scripts/test-cost-weights.mjs:47`:

```text
assert((await weightPage.getByTestId('weight-omissions').locator('li').count()) >= 2)
AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
```

Pricing, thinking/cache arithmetic, unsupported-cache handling, reset, current-domain custom coverage and the missingness checks before that line executed successfully. The declared current policy has four admitted rows from one real suite (`bfcl-v4`), so the mounted omission list has one entry. The previous UI fixture assumes at least two suites and later expects GPT-6 Astra, which is no longer in its current-policy measured pair. This is an incoming current-policy expectation mismatch, not lost route functionality. The scope permits route-dependent legacy changes; the assertions and admission rules were therefore retained. Phase 4’s current domain/view fixture should verify the exact real current suite set and selected identities, keeping the separate historical math regressions. Do not fabricate rows, re-admit retired evidence or lower the assertion merely to get a pass.

Full log: `test-results/route-cost-weights.log`; pure current-panel diagnostic: `test-results/route-weight-gap.json`. Focused release packaging also passed: `npm run build:release` and `npm run release:check` exited 0, binding 33 served files plus the unchanged `_headers` control file. Product SHA-256 is `c2435fa8b617c0884c3514fbe02549e56d4a7164cdf718ea55fb0b094c8f980c`. The manifest honestly records a dirty private source tree; it is not a public publication receipt. No complete release pass is claimed.
