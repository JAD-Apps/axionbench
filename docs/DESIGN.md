# AxionBench visual and chart blueprint

Status: design direction for implementation; not evidence of a completed redesign or rendered acceptance. This document references sources by URL and describes only pages inspected during this research pass. No third-party screenshots or artwork are included.

## Research notes and evidence limits

The project brief names [Awwwards’ Vercel collection](https://www.awwwards.com/websites/vercel/) and four Awwwards project pages: [Infinity Signal](https://www.awwwards.com/sites/infinity-signal), [Thirdway](https://www.awwwards.com/sites/thirdway), [Driftime’s 2025 Impact Report](https://www.awwwards.com/sites/driftimes-2025-impact-report), and [BOC Studio](https://www.awwwards.com/sites/boc-studio). During this pass, the collection request timed out and Awwwards project detail requests returned inaccessible responses in the research viewer. Those are requested references, not observations claimed here. The live [Thirdway site](https://www.thirdway.com/) was inspectable below the fold: after its concise “Creation & confidence” introduction it changes scale into a six-team explanation, then team descriptions and project-oriented information. The live [Driftime 2025 report](https://2025.driftime.com/) was inspectable below the fold: it is a long-form editorial sequence with named chapters (“Landscape”, “Moves”, “Moment”, “Horizon”), each opening with a compact theme index and then detailed narrative. These observations inform pacing and section differentiation, not copied layouts or artwork.

The live [Vercel Ship page](https://vercel.com/ship) was inspectable from title through its lower content: concise navigation, one oversized event statement, speaker and session content, an FAQ, partner area and compact footer. The content hierarchy gives the page a clear first focal point, then shifts into dense details without repeating a card grid. The current page is an event page and may change; this is an observation of the page captured on 30 September 2026, not a timeless description of Vercel’s brand system.

## Design premise

Build an editorial data observatory: one preserved animated contour-sphere hero followed by a complete, purposeful visual system for evidence and comparison. Keep `assets/surface.js` and its existing hero behavior, including pointer response and motion handling. The implementation must establish this by code review and browser regression; this blueprint does not certify that preservation. Below the hero, use generous mineral-white reading surfaces alongside graphite comparison stages, cobalt measurement marks and restrained acid-lime interaction states. Original diagrams, marks and data visualizations are drawn in the product itself. Do not recreate reference artwork, screenshots or signature compositions.

## Tokens and layout rules

| Token | Initial value | Use |
| --- | --- | --- |
| `--ink` | `#171918` | Primary text, dark comparison surfaces |
| `--graphite` | `#202321` | Navigation and selected dark stages |
| `--mineral` | `#F2F3EE` | Main editorial canvas |
| `--paper` | `#FAFAF7` | Content blocks and accessible table surface |
| `--cobalt` | `#315CDE` | Measurement and linked benchmark series |
| `--signal` | `#C9F36A` | Current selection, active controls and preserved hero accent |
| `--muted` | `#777D77` | Secondary labels; verify contrast before use |
| `--rule` | `#D4D8D0` | Quiet dividers and chart grid |

Tokens are design targets, not yet contrast-tested production values. Use a locally hosted, licensed expressive sans for headings and body, plus a locally hosted licensed tabular/measurement mono for identifiers, values and annotations. Record font source and licence during implementation. Type scale target: 12/14 px metadata, 16/18 px body, 22/28 px section leads, 40–64 px display headings with tight leading. Avoid extended all-caps prose. Use tabular numerals for values.

Desktop content max-width: 1440 px; 64–96 px outer gutters; 88–128 px section transitions; 24–40 px inside groups. These spacing values are starting tokens for implementation and rendered review. Mobile gutters: 20–24 px; section transitions 56–80 px; chart controls wrap or become compact labeled selectors. At narrow widths replace side-by-side comparisons with aligned stacked rows and preserve a visible shared scale; never compress axes into illegibility. Tables may scroll within their own labeled region. At intermediate widths, drop ancillary columns before shrinking text. Validate at 360, 768, 1280 and 1440 CSS px and at zoom; these are intended review sizes, not current screenshots.

## Page compositions and analytical purpose

### Hero

Preserve the existing contour sphere, its animation and pointer response. Keep headline and entry action readable against the moving visual. A single “Explore frontier” action anchors to the primary comparison. Show snapshot time and coverage only when backed by the loaded data. Respect `prefers-reduced-motion`, pause decorative motion when offscreen, and do not let the hero animation compete with data below it.

### Frontier

Make this the primary, full-width comparison composition. Default to 8–12 verified frontier representatives chosen from the data snapshot, spanning current supported labs; expose the complete supported set through selection and catalogue. Use a custom horizontal ranking or dot plot appropriate to the chosen metric, with direct labels, explicit units and selected model details. A compact cohort/domain/benchmark control strip changes one coherent cohort. Show raw values and test coverage alongside any eligible common-panel score. Missing observations have no mark and are described in coverage; no zero placeholder. A keyboard-operable accessible table mirrors every plotted row. The chart answers “how do these selected frontier systems compare on this declared common panel?” rather than implying universal rank.

### Capability and task cost

Use an explicitly labeled scatter/Pareto view only where comparable capability observations and public API task/token prices both exist. Keep capability and cost as separate dimensions; identify the exact task and input/output mix. Distinguish input, cached input, output and separately billed reasoning. Unknown prices remain unknown and are absent from numerical placement. Never publish subscription plans, user quotas, private workflow economics, or task success cost without a measured success rate. Provide a price table and source/effective-date detail alongside the view.

### US–China head-to-head

Use a focused two-model composition with country attribution derived from verified lab headquarters. Align capability-domain rows on shared scales and use dumbbells only for compatible common observations. Show a common-test coverage count and expandable benchmark-level matched rows, with excluded tests and reasons. Do not assign geography from language, serving provider or model name. Global, multinational and unknown affiliations remain available elsewhere; unmatched data cannot support a winner label.

### Open weights

Give this a distinct exploratory composition, grouped by disclosed **total** parameter count: `<10B`, `10–35B`, `35–100B`, `100–300B`, `300B+`, and `undisclosed`. Keep activated parameter count as a separate MoE fact, never as the group key. Show weights availability separately from OSI/open-source licence status, with source and exact model revision. Use small multiples or a filterable dot plot with a short representative set first; expose all eligible models on demand. Include models with unknown size in the undisclosed group and retain unscored cards without marks.

### Model catalogue

Make this the broad inspection surface, not the hero. Searchable and sortable rows cover every ingested supported-source identity, including unscored and conflicting entries. Filters include lab, family, release/revision, modality, openness, parameter disclosure, source and coverage. Include tested configuration and variant distinctions in detail. Use pagination or virtualization only if needed, with an accessible non-chart table as the canonical row view. Never imply this union is every model in existence.

### Methods and benchmark library

Explain the capability taxonomy, suite/version/split, metric/direction, score transformations, fixed weights, family caps, common-panel eligibility and exclusions. Keep safety, preference, professional, audio/video, latency and price panels distinct where their meaning differs. Show evidence class, original result link, retrieved/published/evaluation dates where known, source conflicts, missingness and stale/unknown states. Make the coverage matrix and changelog downloadable and ensure exports correspond to visible filters and rows.

Navigation remains small and persistent: Frontier, Head-to-head, Open weights, Models, Methods. Shareable query state preserves model IDs, cohort, metric, source tier and view. On mobile, use an accessible compact navigation with clear section headings; avoid hiding primary comparison controls behind hover.

## Type, interaction and chart behavior

Use React with individually imported visx modules for scales, shapes and axes, plus visx responsive sizing where needed. Compose SVG and HTML ourselves; visx provides low-level primitives, not a branded chart skin. Animate stable model IDs with Motion for React, targeting 250–500 ms transitions that explain sorting, filtering and selection. Disable nonessential transitions under reduced motion. Use no canvas for analytical plots. Keep axes, grid, series labels and selection meaning in SVG; place a concise chart title/summary and an equivalent accessible table in the document. SVG root names/description reference visible title and summary; points/marks expose keyboard focus or operate through adjacent controls; selected marks have visible focus and non-color-only distinction. Tooltips are supplemental, never the sole location for a value. Pointer, keyboard and touch selection must agree. Missing values remain missing. Bars start at zero; logarithmic cost axes explicitly say “log scale.”

## Library decision and rejected alternatives

| Choice | Decision | Evidence / tradeoff |
| --- | --- | --- |
| React | Select, pinned 19.3.0 | The locked build and strict typecheck confirm React 19 works with the selected visx and Motion packages. |
| `@visx/scale`, `@visx/shape`, `@visx/axis`, `@visx/responsive` | Select, pinned 4.0.0 | Official visx sources identify v4 support for React 18/19 and MIT licensing. The implementation imports only the required modules rather than the all-in-one `@visx/visx` package. |
| `motion` (`motion/react`) | Select, pinned 13.4.6 | The 30 September 2026 research snapshot found 13.4.1; the locked project uses 13.4.6, and the current production build and reduced-motion browser check pass with that pin. |
| ECharts | Reject for analytical charts | Existing preview dependency was not declared in package.json; the requested SVG composition needs per-mark semantics, stable IDs and custom direct labels. A high-level chart skin makes that bespoke accessible composition less direct. |
| Recharts | Reject | Convenient React charts, but less suitable for the required bespoke SVG layers and deliberate per-observation semantics; introduces another opinionated chart abstraction without reducing the work of accessible custom marks. |
| D3-only imperative rendering | Reject | D3 remains useful for calculations, but imperative ownership of SVG nodes conflicts with React state, stable model selection and declarative Motion transitions. visx already combines D3 calculations with React components. |
| Canvas/WebGL for data charts | Reject | Poor fit for keyboard focus, direct labels and readable per-mark accessible values. Keep canvas only for the existing decorative contour hero. |

### Release, licence and bundle-size evidence

Research snapshot date: 30 September 2026. Official visx GitHub repository reports v4 as current stable, requires React 18 or 19, and describes the package as MIT licensed. The lockfile pins `@visx/scale`, `@visx/shape`, `@visx/axis` and `@visx/responsive` at 4.0.0, `motion` at 13.4.6, and React at 19.3.0. Strict typecheck, clean production build and reduced-motion browser checks run against these exact pins.

The production initial-JavaScript budget is no more than 180 KiB gzip. `npm run test:frontier` measures the JavaScript files referenced by the built HTML's initial script and module-preload tags. The captured production build on 30 September 2026 measured 130,744 bytes (127.68 KiB) with Node's `gzipSync`; Vite/Rolldown reports 131.92 kB for the 433.76 kB initial entry. The chart experience is a deferred chunk (74.48 kB in Vite's gzip report), and catalogue/source details are loaded from digest-bound public JSON rather than embedded in initial JavaScript. Both measurements are below the initial-entry budget; the test enforces its limit on every run.

## Focused blueprint regression contract

The accompanying `scripts/verify-design.mjs` checks that the blueprint preserves the hero contract and specifies all six analytical views, design tokens, breakpoints, custom SVG accessibility, reduced motion, rejected alternatives, release/licence evidence and the measured bundle budget. Rendered chapter screenshots and browser interaction evidence are produced by `npm run test:frontier`; this text check does not replace those rendered checks.

## Research links

- [Awwwards Vercel collection](https://www.awwwards.com/websites/vercel/) — timed out in research viewer during this pass.
- [Awwwards Infinity Signal](https://www.awwwards.com/sites/infinity-signal) — detail inaccessible in research viewer during this pass.
- [Awwwards Thirdway](https://www.awwwards.com/sites/thirdway) — detail inaccessible; [live Thirdway site](https://www.thirdway.com/) inspected below fold.
- [Awwwards Driftime 2025 Impact Report](https://www.awwwards.com/sites/driftimes-2025-impact-report) — detail inaccessible; [live report](https://2025.driftime.com/) inspected below fold.
- [Awwwards BOC Studio](https://www.awwwards.com/sites/boc-studio) — detail inaccessible in research viewer during this pass.
- [Vercel Ship](https://vercel.com/ship) — live page inspected below fold.
- [visx official repository](https://github.com/airbnb/visx), [visx scale package](https://www.npmjs.com/package/@visx/scale), [visx shape package](https://www.npmjs.com/package/@visx/shape), [visx responsive package](https://www.npmjs.com/package/@visx/responsive).
- [Motion React installation](https://motion.dev/docs/react-installation), [Motion React animation](https://motion.dev/docs/react-animation), [Motion npm package](https://www.npmjs.com/package/motion).
