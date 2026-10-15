# Cohort views handoff

Step 6 implementation is ready for daemon qualification. No commit, push, deployment, workflow registration or independent-review claim is made here.

## Delivered changes

- `src/open-weights.tsx`: buckets/scatter/heatmap/table, source-qualified total buckets, separate activated counts, undisclosed panel without numerical positions, filters/page/view URLs and bound exports.
- `src/head-to-head.tsx`: paired/grouped/coverage/table, unchanged shared-panel matching and family means, observed compatible coverage, expanded unmatched disclosure, selected country/lab evidence and source drilldown. Functional selection updates preserve rapid pair changes.
- `src/charts/cohort-chart.tsx`, `cohort-rows.ts` and `registry.ts`: shared Chart.js interfaces, native factual projections, logarithmic parameter coordinates and heatmap intensity, distinct pair series, accessible inspection, deterministic reduced motion and chart cleanup. Grouped updates initialize their plugin list before in-place updates.
- `src/catalogue.tsx` and `src/catalogue/logic.ts`: full searchable catalogue retained, exact source/version links, explicit current/archive/unknown filter and CSV/JSON fields. Only primary-confirmed authority identity mappings assign lifecycle; provider revisions remain unknown.
- `package.json` / `package-lock.json`: all four visx dependencies and their unused transitive graph removed; Chart.js, Motion, React and packageManager versions retained exactly. The unused `src/chart-data.ts` helper was removed; its regression cases now exercise the production ranking/pricing logic in `tests/chart-data.test.ts`.
- Existing UI assertions in `scripts/test-head-to-head.mjs`, `test-open-weights.mjs` and `test-frontier.mjs` now inspect actual Chart.js/table values. Extraction, source-hash, setting, family, delta, pricing and missing-value checks remain. The pricing floor remains at least eight real priced keyboard values, with table parity.
- New `scripts/project/test-cohort-views.mjs` covers all eight views at 390/768/1440px, actual canvas geometry/heatmap pixels, sources, exports, filters/buckets, hard reload, back/forward, keyboard, missing intersections, pending/rejected evidence exclusion, lifecycle cleanup and normal/live reduced motion. It captures 51 fresh viewport/widget screenshots.
- Public preparation/allowlist and existing public/release gate lists include the new portable browser test, components and corresponding docs. No new release configuration or quality profile was added. Source-specific docs are `OPEN-WEIGHTS.md`, `HEAD-TO-HEAD.md` and `CATALOGUE.md`; current chart wording was also corrected in `DESIGN.md`, `CORE-VIEWS.md` and `FRONTIER-EXPERIENCE.md`. Obsolete SVG chart styles were removed from `src/style.css`.

## Observed local evidence

The exact saved command exited 0 locally:

`npm run typecheck && npm run test:head-to-head && npm run test:open-weights && npm run test:catalogue && node scripts/project/test-cohort-views.mjs`

Its complete output is `test-results/cohort-views/qualified-step-verification.log`. That execution preceded a final legend-copy correction (heatmap now names its columns) and the corresponding assertion. No mathematical/source logic changed afterward. The final implementation then passed typecheck and the complete focused native browser check; see `final-cohort-browser.log` and `report.json`. The two migrated production-logic unit cases passed separately.

The final prepared public candidate is `publication/cohort-step6-delivery`. Its fresh `npm ci --include=dev --no-audit --no-fund`, typecheck and portable cohort browser check all exited 0. Logs are `public-install-delivery.log`, `public-typecheck-delivery.log` and `public-browser-delivery.log`, under `test-results/cohort-views/`. Its own report and 51 screenshots are under the candidate's ignored `test-results/cohort-views/`. Public source seal: `b2a86c0c903af5f04074aff5c414e6b4cdfc828e4ba514e25a8cfb9f873e52b4` (151 allowlisted files). This is local public-source verification, not hosted CI or publication.

The source fingerprints in `test-results/cohort-views/current-source.json` still matched after the final native/public checks. `git diff --check` passed. Test/build outputs stayed in existing ignored directories; tracked data projections were not changed. The supplied dependency index's SHA-256 was verified before inspection; historical worker receipts were not claimed as these checks.

## Limits and next gate

The snapshot has 289 open-weight entries; 70 totals remain undisclosed. The catalogue retains 820 entries and 87 benchmark suites. Authority lifecycle mappings classify 18 current, 11 archived and 283 unknown identities; all 508 provider-catalogue revisions remain lifecycle unknown. These unknowns are deliberate, not guessed mappings. Historical regional measurements remain inspectable without being promoted to current scoring eligibility. No new source fetch or rating claim was introduced in this step.

The daemon must execute its saved command on the integrated current tree. Independent review, full public CI/release qualification, runtime requested/effective/provider model and Fast observations, native daily API publication, deployment and owner-browser/hero MP4 proof belong to the later assigned stages. This worker has no runtime-attestation API and makes no provider/model/Fast attestation. No new agent or fallback was launched.
