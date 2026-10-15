# Public source rules

The public tree contains the product, local licensed fonts, permitted factual projections and tests that run from an archive. `scripts/public/allowlist.json` names every product and data file. Adding a file requires an explicit allowlist change. Raw provider responses, private source captures, owner approvals, workflow receipts, reference images, credentials and private Git history are excluded. The boundary also rejects symlinks, absolute owner paths and imports of private files.

Use Node 24, Python 3 and the pinned `npm@11.19.0`:

```sh
npm ci --include=dev
npm run verify:public
npm run build:release
npm run release:check
```

The public verification entry point runs 20 checks: portable lint, data recomputation, negative boundary fixtures, TypeScript, unit and scoring tests, pricing and weights tests, a build, chart and task/weight browser tests, viewport/accessibility acceptance, a release build and exact release readback. Browser checks need cached Playwright Chromium or `CHROMIUM_PATH`. Fixtures use a bounded directory under `test-results/scratch` and remove only their own created directories. A failed scratch allocation fails the check; it does not relax filesystem permissions.

`PUBLIC-SOURCE-MANIFEST.json` lists the size and SHA-256 of every allowed source file. It rejects missing, additional or changed files. `FROZEN-SNAPSHOT.json` separately binds catalogue, source metadata, registry and scoring files. The validator checks model/configuration/result/source joins, total-parameter groups, conflicts, source URLs, units and coverage. It recomputes the served data and its manifest from the permitted inputs. Unknown facts remain unknown.

Authority facts retain the reviewed composition rules for DeepSWE, Epoch, BFCL, LongBench and publisher percentage cells. Scores, counts, documented native units, exact model/version mappings, source hashes and result links remain checked. Publisher comparison claims and unknown test conditions cannot enter strict comparisons. Invalid provenance or invented replication fails validation. Epoch facts keep CC BY 4.0 attribution. Other facts retain their stated extraction basis and reuse limitations; this boundary grants no rights to the raw pages or artwork.

Licensed Google text tariffs retain source coordinates, exact endpoints, cache-storage rates, long-prompt tiers, thinking billed once, promotion expiry and the seven-day quote window. Hand calculations and adversarial fixtures remain mandatory. Unpermitted routed prices and historical benchmark cost fields are excluded. Source capture dates and evaluation dates stay distinct.

Private source replay remains necessary before approving a new catalogue or source projection. Public tests can verify joins, permissions, arithmetic and captured fact hashes, but cannot replay excluded raw bytes. A public source digest is not an independent review, hosted CI pass or deployment receipt.

Archive releases record `sourceCommit: null`, `sourceDirty: true` and the verified source digest. Checkout releases record their own Git commit. Both verify every served/control file size and hash, the data hash and the product digest. Private checkout verification still requires a full actual commit ID.

Refresh needs a writable external audit directory:

```sh
npm run data:refresh -- --audit-dir "$RUNNER_TEMP/axionbench-source-audit"
```

Set `RUNNER_TEMP` when running locally. Only `REFRESH_FILES` in `scripts/public/boundary.mjs` may be promoted. Failed captures, unpermitted nested fields, changed non-data files and partial promotion restore last-good bytes, including the source manifest. The current portable refresh command is local; authenticated remote publication and the native daily JadBot schedule remain later-stage requirements.
