# AxionBench

An evidence-led observatory for comparing AI systems. The animated contour hero leads into custom visx/Motion charts, explicit token task costs, matched US–China comparisons, open weights grouped by total parameters, a broad catalogue and transparent methods. Missing data stays unknown.

Use Node 24, Python 3 and the exact npm version in `package.json`:

```sh
npm ci --include=dev
npm run dev
npm run verify:public
npm run build:release
npm run release:check
```

Browser checks require cached Playwright Chromium or `CHROMIUM_PATH`. To prepare it, run `npx playwright-core install --with-deps chromium`. Verification runs serially and records real command exits, logs and hashes in ignored `test-results/`. It performs no publication or owner-browser operations. Local results do not establish hosted CI, independent review or deployment.

The frozen catalogue contains 508 supported-source identities, including Meta and unscored entries, 118 inspectable community claims, and 289 open-weight entries. Those community claims do not enter default scoring. The initial authority snapshot contains 1,433 observations, including publisher comparison claims that are excluded, and covers 23 admitted capability suite versions across 8 domains. Authority counts can change on reviewed refresh; current counts are recomputed in `public/data-manifest.json`. The default frontier chooses ten representatives from the original DeepSWE panel. Scoring requires shared tests, known configurations, fixed weights and family caps. Missing positively weighted domains prevent an aggregate; sensitivity is a scenario, not a confidence interval.

Task tariffs cover eleven exact Google standard paid text endpoints under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), attributed to [Google's original pricing](https://ai.google.dev/gemini-api/docs/pricing). Cache storage, prompt tiers, thinking billed once, expiry and freshness are explicit. Other endpoint tariffs remain unknown. Scenario costs do not reproduce historical benchmark spend or imply cost per success.

```sh
npm run data:refresh -- --audit-dir /tmp/axionbench-source-audit
```

Refresh captures original authority and licensed price bytes outside the repository, stages only permitted facts, validates the candidate and retains last-good data on failure. It never stages or commits Git files. The frozen catalogue, community observations and open-weight facts require a separate reviewed snapshot; refresh does not claim to update them. See [public boundary](docs/PUBLIC-SOURCE.md), [automation](docs/AUTOMATION.md), [methods](docs/METHODOLOGY.md) and [pricing](docs/PRICING.md).

Every result retains its original URL and source hash. Raw payloads, routed prices, source artwork, reference videos, owner/workflow records and private Git ancestry are excluded. Fonts are local with their included SIL Open Font Licences. `PUBLIC-SOURCE-MANIFEST.json` lists every public source byte; the release manifest separately binds served product/data bytes. This source candidate does not certify publication or HTTPS deployment.
