# Public source rules

The public tree contains the product, local licensed fonts, permitted factual projections and tests that run from an archive. `scripts/public/allowlist.json` names every product and data file. Adding a file requires an explicit allowlist change. Raw provider responses, private source captures, owner approvals, workflow receipts, reference images, credentials and private Git history are excluded. The boundary also rejects symlinks, absolute owner paths and imports of private files.

Use Node 24, Python 3 and the pinned `npm@11.19.0`:

```sh
npm ci --include=dev
npm run verify:public
npm run build:release
npm run release:check
```

The public verification entry point runs 14 checks: portable lint, data recomputation, negative boundary fixtures, TypeScript, unit and scoring tests, pricing and weights tests, a build, chart and task/weight browser tests, viewport/accessibility acceptance, a release build and exact release readback. Browser checks need cached Playwright Chromium or `CHROMIUM_PATH`. Fixtures use a bounded directory under `test-results/scratch` and remove only their own created directories. A failed scratch allocation fails the check; it does not relax filesystem permissions.

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

## Local qualification and evidence

From the private working tree:

```sh
npm run test:public-boundary
npm run verify:public
npm run verify:release
node scripts/project/verify-public-boundary.mjs --archive-test
npm run public:prepare -- --output publication/product
```

`npm run verify:release` followed by `node scripts/project/verify-public-boundary.mjs --archive-test` is the saved native step contract. The daemon owns final acceptance. A worker run is supporting evidence, not a substitute for that execution.

The native boundary verifier constructs a fresh source tree, compares its factual semantics with the current private projection, creates a tar archive from only explicit allowed files, validates every archive member before extraction, and installs with the pinned `npm ci --include=dev --no-audit --no-fund`. It copies no `node_modules`, disables inherited module/Git/private-audit injection, and verifies the unchanged lockfile. Every portable gate runs in that extracted tree. Receipts and archives stay in ignored `test-results/public-boundary/`; they are not public product files.

| Assertion | Private release | Portable equivalent |
| --- | --- | --- |
| Source bytes and identities | Original-byte hash checks, registry retrieval audit, adapter replay | Frozen fact hashes, exact identities and source/result joins; raw replay remains private |
| Scoring | Hand/adversarial scoring, admission and common panels | Same scoring tests with an adapted permitted fixture import, same mathematical implementation |
| Pricing | Mandatory original HTML replay and independent task arithmetic | Licensed cell/rate agreement, extraction fixtures, same independent arithmetic and billing rules |
| Coverage and provenance | Registry, data, authority and catalogue gates | Recomputed authority floor, catalogue/parameter coverage, units, permissions and exclusion checks |
| UI | Frontier, charts, weights, task costs and acceptance browser gates | Same chart, task/weights and viewport/keyboard/contrast/reduced-motion acceptance checks |
| Automation | Private approvals, CI/deployment checks and source refresh | Pinned public CI plus permitted refresh, failure and rollback fixtures |
| Release integrity | Actual commit and exact served/control-file manifest | Exact served/control-file manifest with actual checkout or explicit archive identity |

`verify:release` retains its gate lock and all 21 existing gates, and adds the public archive gate. The recovered private pricing replay is connected to `test:pricing`. Earlier release receipts/logs are archived before replacing the latest local report. No source audit or approval gate is replaced by file existence.

Reusable read-only helpers in `scripts/project/receipts.mjs` verify bounded artifact sizes/hashes, refuse traversal/symlinks, bind caller-supplied source/version identities and verify ordered command exits and log hashes. Later candidate, publication and browser stages can use them with their own trusted receipt descriptors. These helpers do not authenticate an author merely because JSON says `passed`, and do not manufacture independent review or provider-model observations.

The supplied recovery archive was checked against SHA-256 `d83ba8c9cd0c2982d7728cee27529035f44bf8864f60456f2e67a2824265a71b`. Its actual native release failed: 21 private gates passed, while the added portable boundary test failed with `EROFS` when creating fixtures under `/tmp`. The failed receipt and exact log are retained privately under `evidence/local/public-boundary-recovery/`. The recovered runner/package additions and portable code are reused; no old UI, private capture or public draft Git history is adopted. The public draft remains preserved by the preceding admission step.

The restored private tariff gate initially found its original HTML absent from this worktree (`ENOENT` for the content-addressed blob). The supplied preservation directory contains the matching original HTML: SHA-256 `b1cf5d3eec2479602d6757520c61351becb27b8cc6a509aec1b8b491605cab92`. `scripts/project/restore-private-price.mjs` verifies its original hash and byte count before restoring the single ignored private blob for mandatory replay. A missing preservation input, a different source hash or changed bytes fails the gate. It never fetches or substitutes new HTML. Future private worktrees need this qualified preservation input; public archives neither include nor depend on it.
