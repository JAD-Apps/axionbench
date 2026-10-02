# Core comparison views — step 4

This phase pins Chart.js 4.5.1 and adds `src/charts/` for explicit controller registration, custom dark bars/dots/radar, an original scatter-backed heatmap plugin, shared factual rows, accessible controls/tables, source-aware tooltips, live reduced-motion handling and lifecycle cleanup. Rankings, BridgeBench and captured claims offer bars/dots/table; domains offer heatmap/radar/table. The replaced core visx code is removed. Pricing, open-weight and regional imports remain for their replacement phases.

The current ranking policy and the historical selector remain distinct. Four eligible BFCL configurations cover two exact identities; the domain pair has one comparable domain. The default eleven-domain composite stays unavailable. Family caps, strict common settings/conditions, covered-domain selection, reset/share/export and all sensitivity scenarios remain intact. Native rating/percentage/fraction units, missingness, coverage, source classes, dates and exact result links remain in the shared projections. Missing captured release-identity rows also export as nulls with their release links.

Changed areas: `package.json` / lockfile; seven `src/charts/` files; authority ranking, BridgeBench, domain weights, captured comparisons, the shell history restoration and chart CSS; the core browser gate and six projection regressions; affected chart smoke/frontier/cost-weight/acceptance/BridgeBench assertions; private/public verification wiring and public source allowlist/preparation; the core view guide and related design/routes/methodology docs. No source fact, scoring arithmetic, pricing calculator, private capture, expected source hash or admission gate was weakened.

Two integration fixes were required. Back after hard reload must restore controls even when the shell's earlier URL key is identical. Public preparation must relocate the product route/core browser entry points outside the private `scripts/project` namespace; only those two checks are generated as `scripts/test-routes.mjs` and `scripts/test-core-views.mjs`. The boundary ban on private project files remains unchanged.

Local evidence is in ignored `test-results/core-views/`. The browser report binds current source/data/build hashes and captures all selectable views at 390/768/1440 px, native-value and actual canvas-coordinate parity, axis labels, keyboard/touch inspection, direct source navigation, history/reload, exports and missing watchlist states, radar skips, registry/disposal checks, stable-identity sorting and live reduced motion. Separate logs record chart-smoke, frontier and cost/weights exits. Acceptance's final successful run is `test-acceptance-baseline.log`; earlier reporting-variable and moving-baseline failures remain in their original logs. The latter was fixed by anchoring bar bases to the current zero axis when label widths move the plot edge.

Focused private checks passed: typecheck; unit suite (12 Vitest checks plus 59 project checks); scoring and weights; core projection suite (6 checks); core browser gate; chart smoke; frontier; cost/weights; visual/interaction acceptance. The portable receipt records a fresh `npm ci --include=dev --no-audit --no-fund`, typecheck, unit and the same core browser gate from sealed public source, then resealing/type/browser verification after the final bar-baseline fix. This is local portable evidence, not hosted CI or independent review. See `test-results/core-views/portable.json` and its actual command logs.

The daemon owns acceptance of the exact saved command:

```
npm run typecheck && npm run test:unit && npm run test:scoring && npm run test:weights && node scripts/project/test-core-views.mjs
```

Full release-only qualification, independent private/public review, hosted public CI, native daily registration/API publication and negative/rollback proof, deployment, owner-browser proof and hero MP4 belong to their later stages. No commit, push, deployment, scheduler change, sub-agent or alternative AI provider/model was initiated here. Provider-reported worker model/Fast observations must come from the daemon's genuine stage receipt; this handoff is not such a receipt.
