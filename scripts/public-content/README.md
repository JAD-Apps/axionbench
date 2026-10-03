# AxionBench

AxionBench compares model results, coverage and estimated API task costs. Each result keeps its source link and date. Missing scores, unknown prices and incompatible test versions stay explicit.

The dark overview pairs task controls with Economy, Balanced and Frontier comparisons. Rankings, benchmarks, domains, pricing, versions, open weights, US–China, models, methods and the benchmark archive each have their own page. See [page URLs and shared filters](docs/ROUTES.md).

Use Node 24, Python 3 and `npm@11.19.0`, as pinned in `package.json`. Keep `package-lock.json` unchanged when installing:

```sh
npm ci --include=dev
npm run dev
npm run verify:public
npm run build:release
npm run release:check
```

Browser checks need cached Playwright Chromium or `CHROMIUM_PATH`. To install the browser on a CI runner, use `npx playwright-core install --with-deps chromium`. Verification checks scoring, pricing, weights, provenance, source permissions, browser interactions and every release file. It writes command exits and hashed logs into ignored `test-results/`. It does not deploy the site.

A public source archive needs no private captures or Git checkout. Its release manifest records the verified source digest and an explicit uncommitted state. A public Git checkout records its own commit. Neither build borrows a commit from an enclosing repository.

To refresh permitted facts, choose a writable audit directory outside the repository:

```sh
npm run data:refresh -- --audit-dir "$RUNNER_TEMP/axionbench-source-audit"
```

Set `RUNNER_TEMP` to your external scratch directory when running locally. Raw responses stay there. Refresh validates a candidate and restores last-good public files if capture or promotion fails. It updates the permitted authority and licensed tariff facts; catalogue identities and open-weight metadata need a separately reviewed snapshot. The manual GitHub refresh job opens a review branch. The live site is updated daily by a JadBot workflow that runs `npm run publish:daily`, which refreshes, builds and publishes through the Cloudflare Pages API with rollback to the last verified deployment; see [refresh and publication](docs/AUTOMATION.md).

See [public source rules](docs/PUBLIC-SOURCE.md), [methods](docs/METHODOLOGY.md), [pricing](docs/PRICING.md), [comparable versions](docs/VERSIONS.md) and [refresh and publication](docs/AUTOMATION.md). Counts and coverage come from `public/data-manifest.json`. Source hashes bind captured facts; they do not establish an independent evaluation or grant rights to republish raw source pages. Fonts include their local SIL Open Font Licences.
