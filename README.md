# AxionBench

AxionBench compares model results, coverage and estimated API task costs. Each result keeps its source link and date. Missing scores, unknown prices and incompatible test versions stay explicit.

Use Node 24, Python 3 and `npm@11.19.0`, as pinned in `package.json`. Keep `package-lock.json` unchanged when installing:

```sh
npm ci --include=dev
npm run dev
npm run verify:release
node scripts/project/verify-public-boundary.mjs --archive-test
npm run build:release
npm run release:check
```

Browser checks need cached Playwright Chromium or `CHROMIUM_PATH`. To install the browser on a CI runner, use `npx playwright-core install --with-deps chromium`. Verification checks scoring, pricing, weights, provenance, source permissions, browser interactions and every release file. It writes command exits and hashed logs into ignored `test-results/`. It does not deploy the site.

The local release runner preserves all 21 source, mathematical, pricing, browser and release-integrity gates and adds the portable public gate. `verify:public` constructs an allowlisted archive from this source, installs its own locked dependencies through the same pinned `npm ci --include=dev` preparation used by CI, and runs its full portable suite. The archive contains no installed dependencies or private history. For focused boundary regressions, run `npm run test:public-boundary`.

`npm run public:prepare -- --output publication/product` creates an inspectable product tree in an empty directory without committing or publishing it. Each added public file must be listed in `scripts/public/allowlist.json`. See [public source rules](docs/PUBLIC-SOURCE.md) for the private-to-public validation mapping and receipt helpers.

A public source archive needs no private captures or Git checkout. Its release manifest records the verified source digest and an explicit uncommitted state. A public Git checkout records its own commit. Neither build borrows a commit from an enclosing repository.

To refresh permitted facts, choose a writable audit directory outside the repository:

```sh
npm run public:prepare -- --output publication/product
cd publication/product
npm run data:refresh -- --audit-dir "$RUNNER_TEMP/axionbench-source-audit"
```

Set `RUNNER_TEMP` to your external scratch directory when running locally. Raw responses stay there. Refresh validates a candidate and restores last-good public files if capture or promotion fails. It updates the permitted authority and licensed tariff facts; catalogue identities and open-weight metadata need a separately reviewed snapshot. The portable GitHub refresh job opens a review branch. It is not the requested daily JadBot API update; that workflow and remote transaction are still assigned to later implementation stages.

See [public source rules](docs/PUBLIC-SOURCE.md), [methods](docs/METHODOLOGY.md), [pricing](docs/PRICING.md) and [refresh behaviour](docs/AUTOMATION.md). Counts and coverage come from `public/data-manifest.json`. Source hashes bind captured facts; they do not establish an independent evaluation or grant rights to republish raw source pages. Fonts include their local SIL Open Font Licences.
