# AxionBench design

AxionBench opens as a comparison product: an animated split hero, task controls and three recommendation cards. Detailed comparisons have their own URLs. The default is dark before JavaScript or stylesheets load, even with a light operating system.

## References inspected

On 2 October 2026, Chromium rendered the [Awwwards Vercel collection](https://www.awwwards.com/websites/vercel/) and confirmed links to [BOC Studio](https://www.awwwards.com/sites/boc-studio), [Infinity Signal](https://www.awwwards.com/sites/infinity-signal) and [Driftime’s 2025 Impact Report](https://www.awwwards.com/sites/driftimes-2025-impact-report). Their detail pages and linked live sites returned HTTP 200 and were rendered at 1440 × 1000. The research fetcher timed out; browser rendering supplied the membership evidence. Exact observations and original decisions are in [VISUAL-REFERENCE-REVIEW.md](VISUAL-REFERENCE-REVIEW.md). Third-party screenshots stay in ignored local test results; none are product assets.

## Composition and typography

The canvas is ink black `#080a0f`. Values and headings use white `#f5f7fc`; secondary text uses `#b8c3d5` or `#a9b5ca`. Cyan `#6ce5ef` marks links and primary controls, violet `#aa98ff` identifies the balanced recommendation. Card backgrounds are `#111722` and `#181628`. Quiet rules use `#303849`.

Use Space Grotesk 600 for display headings and large numbers, DM Sans 400/500 for prose and controls, and IBM Plex Mono 400 for short measurement labels. All are locally hosted with their SIL Open Font License files in `public/assets/`. Source projects: [Space Grotesk](https://github.com/floriankarsten/space-grotesk), [DM Sans](https://github.com/googlefonts/dm-fonts), [IBM Plex](https://github.com/IBM/plex). The arrangement, scale and spacing are original. No third-party lettering or artwork is copied.

Desktop content occupies at most 1440 px with roughly 6vw gutters. The split hero uses large white type alongside the original procedural contour field in `assets/surface.js`. The comparison stage follows immediately, with task type, total token budget, budget presets and a benchmark choice. Economy, Balanced and Frontier align their name, result, price and coverage. At tablet widths cards retain readable columns; on phones they stack. Mobile gutters are 24 px. Navigation scrolls horizontally on narrow screens and brings keyboard-focused links into view. Tables scroll in named regions.

## Routes and retained functions

[ROUTES.md](ROUTES.md) lists all eleven pages. Each has a title, active navigation link and directly reloadable production HTML. Focus moves to the route title after navigation and back/forward. Query state belongs to the page that owns the controls. The hero appears only on overview. Pricing retains all token classes, caching, thinking, long-prompt tiers, reset, sharing and exports. Domains retain custom weights and sensitivity. Models retain catalogue search, filtering, paging and source details. Methods retain exclusions, fixed weights, source dates and integrity information. The benchmark archive retains the complete source-linked registry.

## Honest homepage comparisons

BridgeBench is a visible benchmark choice, in native publisher rating units. Task choices use reasoning, front end, back end, one shot or security axes. Its overall rating includes price and speed and is not independent capability evidence. Its protocol is unpublished. Every selected model links to its exact result page; the publisher guide explains the available limits.

Economy is the lowest known task cost among confirmed identities with this task rating. Balanced is the highest rating among those priced identities; lower cost breaks ties. Frontier is the highest published task rating among confirmed identities, with an unknown cost if no qualified tariff exists. Candidates may repeat when the evidence overlap is small. One observed publisher axis is reported as `1 / 1 selected publisher axis`; current independent results are counted separately. This is not comprehensive capability coverage.

The total budget uses a declared 5:1 uncached-input/output split, rounded to whole tokens. The full calculator handles other mixes. Unknown tariffs, expired promotions and stale quotes remain unknown. The current independent capability option shows an explicit insufficient-coverage state when no common current panel supports the task and priced cohort. No old illustrative model counts, scores, coverage or prices are used.

## Motion and chart handoff

The contour preserves its shape, rotation and pointer response, with cyan/violet highlights. It suspends offscreen and when the document is hidden; `prefers-reduced-motion` renders a static frame. Navigation disposes observers and listeners before the hero unmounts. Motion for React remains for useful transitions; animation must convey changed data, use 250–500 ms transitions and finish immediately under reduced motion.

All datasets now use custom Chart.js views. The obsolete visx dependencies and chart components are removed. Motion for React remains for the hero and useful row transitions. Charts share factual projections with accessible values, matching tables and source links; native units, unknowns, explicit scales and named canvases remain mandatory. See [core views](CORE-VIEWS.md), [open weights](OPEN-WEIGHTS.md) and [US–China](HEAD-TO-HEAD.md) for the menus and qualification checks. ECharts and Recharts are prohibited.

## Verification

`npm run verify:design` checks this design contract, routes, dark startup and shipped font licences. `npm run test:routes` builds the production artifact and tests direct navigation, reloads, real 404s, keyboard focus, route-scoped share state, recommendation arithmetic and missingness, source links, light-OS dark startup, contrast, reduced motion and offscreen suspension. It captures navigation and above-fold views at 360, 768, 1280 and 1440 px in ignored `test-results/routes/`. These captures describe this candidate, not a deployed site or independent approval.

The initial JavaScript budget remains 180 KiB gzip. The focused route test measures the actual entry scripts and keeps detailed comparison code deferred. `npm run test:frontier` retains the broader data and frontier checks. Release and independent review remain separate gates; a successful local check does not establish a daemon pass or publication.
