# AxionBench

The full redesign is specified in [the product plan](docs/OVERHAUL-PLAN.md) and [the executable JadBot workflow](docs/workflow.json). John approved `JAD-Apps/axionbench` and `axionbench.jadapps.app`. The files below are the working preview baseline; the new chart stack, broad benchmark coverage, catalogue and public deployment are workflow deliverables, not completed claims.

## Baseline preview

A self-contained model benchmark explorer with four animated Apache ECharts views: rankings with missing-result ranges, capability versus estimated task cost, six-axis profiles, and a capability heatmap. The original snapshot’s scores, coverage, missingness, weights, and source dates are preserved. Public pricing uses the supplied blended API rates, without subscription multipliers or personal routing policy.

## Preview

Open `index.html` directly, or run:

```sh
npm run dev
```

Then visit `http://localhost:7942`. Set `PORT` to use another port. Node 18 or newer is sufficient. No package install is needed for preview or build. Fonts, chart code, and data are all local; only outgoing source-result links require a network connection.

## Host

```sh
npm run build
```

Upload the contents of `dist/` to any static host. Paths are relative, so the site can also live in a subdirectory. There is no API, account, database, environment secret, or runtime server to configure.

For Vercel, use **Other** as the framework preset, `npm run build` as the build command, and `dist` as the output directory. The same output works on Netlify, Cloudflare Pages, GitHub Pages, or a plain web server. No deployment has been performed by this project setup.

## Update the snapshot

```sh
python3 scripts/import-data.py /path/to/original-metabench.html
npm run build
```

The importer also accepts an original MetaBench JSON snapshot. It writes `data.json` and the matching classic-script `assets/data.js`, which keeps direct `file://` use working. The site does not fetch prices or benchmark scores automatically. The import requires the original snapshot’s `apiUsdPerMTok` field and strips personal plan metadata.

## Interpretation

- Displayed scores are the original normalized fractions multiplied by 100, not success percentages.
- Whiskers are sensitivity ranges for missing results, not statistical confidence intervals.
- Task prices are estimates for a 30% input / 60% cache-read / 10% output token mix. Changing the task token budget scales all model estimates. Independent per-model token consumption, retries, fees, and taxes are not known.
- Economy maximizes index per dollar within 60% of the leading score; Balanced uses 85%; Frontier chooses the highest score. Coverage remains visible; these are point-estimate choices.
- Profiles require data on all six routed capabilities. Missing heatmap cells stay empty. Security is informational, and 3D is a proxy.
- Every benchmark reference links to its supplied result source, with model-specific links for published BridgeBench models. Other benchmark links use the corresponding BenchLM results page from the original snapshot.

## Release verification

```sh
npm ci
npm run verify:release   # also available as npm run jadbot:verify
```

`verify:release` runs every gate in order: lint, typecheck, unit, scoring, registry, data, authority, design, frontier, chart smoke, head-to-head, open weights, catalogue, visual/interaction acceptance, automation, clean release build and `release:check`. It continues past a failure so one run shows every problem, and writes a receipt to `test-results/release-verify.json`. It never deploys, changes DNS, pushes to Git or opens a GUI browser; the registry gate makes read-only HTTPS requests to captured source URLs.

Browser checks use Playwright's cached Chromium on Linux, or `CHROMIUM_PATH`. `npm run test:acceptance` captures every chapter at 320, 390, 768, 1440 and 1920 px into `test-results/acceptance/`. See `docs/VISUAL-ACCEPTANCE.md` for what it asserts and the reviewed findings.

## Design references and dependencies

Visual references were reviewed in Awwwards’ Vercel catalogue: [Vercel Ship 2025](https://www.awwwards.com/sites/vercel-ship-2025) for typographic scale and negative space, [Boc.Studio](https://www.awwwards.com/sites/boc-studio) for dimensional forms, and [Infinity Signal](https://www.awwwards.com/sites/infinity-signal) for compact signal annotations. The canvas sculpture is original procedural artwork, explicitly labelled as an abstract surface; it is not a data chart. No reference artwork or branding is shipped.

Apache ECharts 6.1.0 is bundled under Apache-2.0, with its license and notice in `assets/`. DM Sans, Space Grotesk, and IBM Plex Mono fonts are locally bundled under the included SIL Open Font Licenses. The hero animation pauses off screen, pauses when the tab is hidden, and honors reduced-motion preferences along with the chart animations.
