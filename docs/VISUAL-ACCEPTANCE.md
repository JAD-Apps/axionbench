# Visual and interaction acceptance

Step 12 of `docs/OVERHAUL-PLAN.md`. This records what was inspected in the rendered site, what was changed, what the automated checks assert and what remains open. Screenshots are real Chromium captures of the built `dist/`. The acceptance run writes them to `test-results/acceptance/`, which is ignored. The reviewed set from this pass is kept in `evidence/visual-acceptance/`.

## How it was inspected

- Built the site and captured every chapter (hero, frontier, head-to-head, open weights, catalogue, methods) at 320, 390, 768, 1440 and 1920 px, then looked at the images.
- Section captures use the **viewport**, scrolled to each chapter. Chromium's tall-element screenshots redraw transformed SVG layers outside the viewport incorrectly: DeepSWE bars appeared as ~12 px stubs while the DOM held 558 px. Viewport captures show what a visitor sees, so the evidence uses those.
- Measured marks, contrast, target sizes and overflow in the DOM, rather than by eye alone.

## Findings and fixes

| Finding (observed) | Fix | Guarded by |
| --- | --- | --- |
| Frontier ranking labels were drawn on top of the interval whisker, striking through every value (e.g. "74.1%") | Label placed after the larger of value and interval high | `test:acceptance`: label x ≥ whisker end, label inside the plot |
| Bar length was an animated SVG `width`, so a late resize could leave a stale length | Width is a plain attribute; Motion animates only the entry `scaleX` | Bar width = value × zero-based plot width, within 1 px, at every width |
| Motion overrode the transform origin to `50% 50%`, so bars grew from their centre, not from zero | `originX: 0` | During animation every sampled origin starts at `0px` |
| The open-weights chapter kept the foundation's sticky sidebar heading; its table was squeezed into ~60% width, and openness/licence cells wrapped to 6 lines | Heading and lead run across the top; the size ruler, band small multiples (3 → 2 → 1 columns), filters and table use the full width | Screenshots `*-open-weights.jpg`; no-overflow probe |
| `.open-heading>p` outranked `.eyebrow`, so this chapter's eyebrow rendered as large grey body text | Selector removed; the eyebrow matches the other chapters | Screenshots |
| Nine grey text tones measured 3.71–4.43:1 on light surfaces (lab/configuration metadata, table notes, summaries), below WCAG AA 4.5:1 | Mapped to `#5f675e` (≥4.8:1 on paper, mineral and band shading) | Contrast probe over all visible text at 390 and 1440 px |
| At 320 px the nav hid "Methods" off-screen behind a hidden scrollbar | Nav wraps at ≤380 px with 24 px link targets | Every nav link fully visible at every width |
| Checkbox (18 px), catalogue model buttons (18 px tall, "o3" 17 px wide), and library/methods disclosures (16 px) were below the 24 px target size | Minimum 24–28 px targets | ≤390 px target-size check on buttons, selects, inputs and summaries |
| The authority table disclosure ran its label and hint together ("Accessible ranking valuesModel, lab…") | Existing summary layout applied to that `<details>` | Screenshot |
| No skip link | "Skip to the frontier" link, visible on focus | First Tab stop is the skip link, on screen, with a 3 px outline |

The hero is unchanged: `assets/surface.js` is untouched, and `test:chart-smoke` still compares it byte for byte with the served copy and checks that the canvas draws.

## What `npm run test:acceptance` asserts

1. **Responsive (320/390/768/1440/1920):** no horizontal page scroll; no element escapes the viewport unless a deliberate scroll container holds it; every nav link visible; 8–12 frontier ranking marks; zero-based bar lengths; labels clear of whiskers and plot edges; 24 px targets at ≤390 px; WCAG AA text contrast at 390 and 1440 px; no console errors, page errors or failed requests.
2. **Keyboard:** the skip link is the first stop and moves to `#frontier`; the benchmark select shows a visible focus outline; an arrow key changes the panel, the rows and the URL.
3. **Deep link roundtrip:** sets frontier cohort, a China-lab model, an open-weight band and a catalogue search together. The combined URL then reopens in a new page with identical state and counts.
4. **Exports:** the open-weight and catalogue JSON row counts equal the visible totals, and the head-to-head export names the selected model.
5. **Result links:** every ranking and table link is HTTPS and exactly matches a captured `resultUrl`; every `target=_blank` link has `rel=noreferrer`.
6. **Data failure states:** invalid JSON, HTTP 404 and a digest conflict each show "Evidence snapshot unavailable" and keep the hero. No chart renders from unverified data, and no page error is thrown.
7. **Motion:** with motion allowed, bars animate from the zero baseline and settle at full length within 800 ms (measured ~310–325 ms). With reduced motion, every sampled mark is drawn at final length from the first frame.
8. **Touch (390 px, `hasTouch`):** taps select a parameter band, page the catalogue and open a model detail.
9. **Performance:** time from navigation to all chapters ready is recorded per width in `report.json`. The 180 KiB initial-JavaScript gzip budget is enforced by `test:frontier`.

## Release gate

`npm run verify:release` (also `npm run jadbot:verify`) runs 18 gates in order: lint, typecheck, unit, scoring, registry, data, data:validate, authority, design, frontier, chart smoke, head-to-head, open weights, catalogue, acceptance, automation, `build:release` and `release:check`. Every gate runs even after a failure, and the per-gate receipt goes to `test-results/release-verify.json`. `release:check` confirms that `dist/` is exactly the tree `dist/release-manifest.json` describes. `jadbot.quality.json` uses it as the health check, and as the recovery assertion after deleting `dist/index.html` and rebuilding.

The gate performs no deployment, DNS, Git push or GUI browser action. `test:registry` makes read-only HTTPS GETs to captured primary source URLs, so it needs outbound network access.

## Open items (not fixed in this step)

- The frontier's second block (the per-suite explorer) defaults to "Official release matches (9)". That cohort has no benchmark-verified results, so its first view is an honest empty state. The DeepSWE authority ranking above it is the primary plot. Changing that default is a data/product decision for the frontier owner.
- The methods benchmark library lists all 86 suites in two columns (~3,000 px at 1440). It is filterable by domain, but long.
- Pricing and the cost/Pareto view remain withheld by source terms, as before; this step did not change data.
- Contrast is verified for text only. Non-text mark contrast (ticks and band shading) was reviewed visually but is not asserted.
