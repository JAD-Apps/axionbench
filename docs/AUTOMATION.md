# Automation: refresh, daily publication, CI and release product

## Source storage
Source bytes are stored once, content-addressed, at `data/source-snapshots/blobs/<first two hex>/<sha256>.<ext>` (`saveBlob` in `scripts/data-adapters.mjs`). An existing object is verified against its name and never rewritten. `scripts/ingest-data.mjs` reuses the object already referenced by the last-good dataset when the bytes are identical, so an unchanged cached response adds no file. Per-run metadata (manifest, failed-retrieval receipts, non-promoted candidates) goes in `data/source-snapshots/runs/<date>-<time>/`; it is a handful of small files, not a copy of every response.

Identical bytes keep the retrieval date on which they were first captured. The date of a later re-check is stored separately as `lastVerifiedAt`. Publisher HTML and card prose with no redistribution permission stays in the private audit directory passed to `data:authority`; public files hold attributed factual projections and record both the original-response hash and the projection hash.

## Refresh: `npm run data:refresh -- [--audit-dir <private dir>] [--max-changes N]`
`scripts/automation/refresh.mjs` is a transaction around the real adapters (`data:ingest`, `data:authority`, `build-observatory-data`, `data:validate`, `test:data`):

1. Snapshot every committed projection (`data/*.json`, `data/authority/*.json`, `public/data*.json`).
2. Run the adapters. Any non-zero exit restores the snapshot byte for byte.
3. Guard the result: ingestion schema, `retrievedAt` not older than last-good, observed suites/domains not lower, observations and models not down more than 10 %, and at most `--max-changes` changed files (default 1500, below JadBot's 2048-file provenance bound; never raised or bypassed).
4. On success append an entry to `docs/DATA-CHANGELOG.md`: counts before and after, new source objects and the SHA-256 of each changed projection. On failure nothing is appended; a receipt goes to the audit directory (name includes a content hash, so receipts are never overwritten).

Source objects are immutable, so a failed run cannot alter last-good records or the bytes they reference. Objects a failed run added are unreferenced and left in place, and they count toward the bound.

With `--publish --state-dir <dir> [--key YYYY-MM-DD.rN]` a successful refresh continues into the daily publication transaction below. If publication fails, the projections go back to their pre-refresh bytes as well.

`.github/workflows/refresh-data.yml` is a manual tool only (`workflow_dispatch`, no schedule). It opens a pull request with `gh pr create`; it never pushes to `main`. CI must pass and a maintainer reviews before merge. It is not the daily updater.

## Daily publication
`npm run publish:daily -- --state-dir <dir> --audit-dir <dir> [--key YYYY-MM-DD.rN]`

The site stays static. The daily update builds it and uploads it as one Cloudflare Pages production deployment through the Pages API. A JadBot workflow is meant to run this command daily, but none is registered or enabled by this repository; see the native workflow contract at the end of this file.

`scripts/release/publish.mjs daily` does, in order:

1. Refuses to start if any code file differs from the checked-out commit. Earlier data refreshes may differ; they form the data overlay.
2. Records the current refresh outputs (`data/*.json`, `data/authority/*.json`, `public/data*.json`, `PUBLIC-SOURCE-MANIFEST.json`, `docs/DATA-CHANGELOG.md`) as the local last-good.
3. Runs the package's own `npm run data:refresh -- --audit-dir <dir>`: eligible primary sources only, with identity, version, freshness, coverage, licensing and pricing validation. A failed refresh restores its own last-good and nothing is published.
4. Runs `npm run build:release`. The manifest records the clean code commit (`sourceCommit`, `codeDirty: false`) and, separately, every changed data file in `dataOverlay` with its own digest (`axionbench-data-overlay-v1`). `sourceDirty` stays `true` whenever any tracked byte differs; no commit is invented.
5. Runs the publication transaction (next section). If it fails, the local refresh outputs return to the bytes recorded in step 2.

`npm run publish:site -- --state-dir <dir> [--key K] [--no-build] [--dry-run]` publishes the current tree without refreshing. `--dry-run` stages and qualifies a snapshot and makes no network call.

### Transaction
`scripts/release/publication.mjs`, in this order:

| Stage | What happens | On failure |
| --- | --- | --- |
| Snapshot | Copy `dist` into `<state>/snapshots/<snapshotSha256>/`, write `publication.json` (refresh key and dates) and re-derive the manifest. Files are made read-only. | Nothing remote happened. |
| Qualify | Re-hash every file, check limits, every route's HTML, the data-manifest binding and credential-free text. | `failed-qualification`; no Cloudflare call. |
| Project check | The project must be `axionbench`, production branch `main`, with `axionbench.jadapps.app` attached. | `failed-before-deploy`; nothing uploaded. |
| Upload | Get an upload token, ask which asset keys are missing, upload only those in bounded batches, then upsert all keys. | `failed-before-deploy`; production unchanged. |
| Deploy | One production deployment: asset manifest, `branch=main`, `commit_hash`, `commit_message="axionbench data <key> snapshot <sha>"`, `commit_dirty=false`, and `_headers` as a form file. | See reconciliation. |
| Status | Poll the deployment until stage `deploy` is `success`. | Roll back to last-good. |
| Readback | Fetch the approved HTTPS hostname: hosted manifest byte-identical to the snapshot's, `data.json`, every listed file's hash and size, and the `_headers` effects. | Roll back to last-good. |
| Record | Write `last-success.json` (current, previous, last 7 successes), mark the key published, prune unreferenced snapshots. | — |

**Limits.** At most 2,000 files, 25 MiB per file (the Pages limit), 128 MiB in total and 64 KiB of control files. Uploads use at most 500 files or 40 MiB of base64 per request and at most 1,000 keys per check call. Paths must be canonical (`scripts/release/manifest.mjs`). Idempotent API calls (lookups and asset calls) get up to 4 attempts with exponential backoff on HTTP 429/5xx or a network failure; a 4xx answer is final.

**Keys and idempotency.** A key is `YYYY-MM-DD.rN` (UTC date, revision 1–9999), not in the future and at most 3 days old. A key must be newer than the published one. The key is bound to a revision identity: the code commit, `dataSha256` and the overlay digest.
- Same key, same revision, already published: `already-published`, nothing is redeployed.
- Same key, different revision: `rejected-key-conflict` before any Cloudflare call. Use the next revision.
- Same key after a definitive failure: retried, at most 3 runs per key (`rejected-retry-limit` after that).

**Ambiguous timeouts.** Creating a deployment and rolling back are never blindly retried. If the create call times out or returns 5xx, the transaction lists recent production deployments and looks for its own snapshot-specific `commit_message`. Found: it continues with that deployment. Not found after 4 checks: one more create attempt. Still unconfirmed: production is rolled back to last-good. A process killed mid-transaction leaves `transactions/<key>.json` in `prepared`, `uploaded`, `deploying` or `deployed`; the next run with that key resumes from its retained snapshot and reconciles before creating anything.

**Last-good.** `last-success.json` changes only after a verified readback. The previous deployment's snapshot is always retained and re-verified before a new deployment starts. When a deployment may exist and something fails, production is rolled back to the recorded last-good deployment and that rollback is verified by the same HTTPS readback (`failed-restored`). If there is no earlier publication the result is `failed-no-last-good`. If the restore cannot be verified the result is `failed-restore-unverified` and the command exits non-zero; run `publish:verify` and `publish:rollback`.

**State directory.** It must be outside the repository: `snapshots/`, `transactions/<key>.json`, content-addressed `receipts/<time>-<sha12>.json` (never overwritten) and `last-success.json`. Receipts hold statuses, keys, digests, deployment IDs and Cloudflare error codes, never credentials.

### Dates shown on the site
The Methods page shows four separate dates. The daily refresh published (refresh key from `publication.json`), when sources were retrieved (`data-manifest.json`), when the data passed validation, and when the site was built. Builds that were not published by the daily update ship a placeholder `publication.json` with `status: "unpublished"` and say so.

### Verify, roll back, inspect
- `npm run publish:verify -- --state-dir <dir>`: read-only. It re-verifies the current and previous snapshots, checks that Cloudflare's production (`canonical_deployment`) is the recorded deployment, and reads back every hosted byte. `--offline` checks only the retained snapshots. It writes nothing.
- `npm run publish:rollback -- --state-dir <dir> --to previous|<deployment id>|<key>`: rolls production back to a retained, verified deployment, proves it by readback, then records it as current.
- `npm run publish:status -- --state-dir <dir>`: prints `last-success.json`.
- `npm run receipts:verify -- --state-dir <dir>`: checks receipt content addresses, schema, statuses, the journal of the current key and that no credential-shaped text was stored. `--artifact <file>:<sha256>:<bytes>` checks an evidence file.
- `npm run production:check -- --dist dist` (offline) or `-- --url https://axionbench.jadapps.app [--expect-product <sha>]`: every route answers with HTML (directly or via one redirect to its trailing-slash form), unknown paths return 404, and the hosted manifest, data and publication record agree.
- `npm run capture:verify -- --capture <capture.json> [--release-manifest <file>]`: checks that screenshot (PNG, with viewport size) and video (MP4) evidence files are the exact recorded bytes of the approved host and release.
- `npm run public:patches -- --base <public checkout> --candidate <prepared tree> --series <series.json> --output <dir>`: prepare-only. Writes an ordered patch series and `series.json` and proves the series reproduces the candidate. It never commits, pushes or touches either tree.

### Credentials
`CLOUDFLARE_API_TOKEN` (Pages edit for this account) and `CLOUDFLARE_ACCOUNT_ID` come from the environment: JadBot's local secret storage or CI runner injection. Only `scripts/release/pages-api.mjs` reads them, by name. They are sent only in the `Authorization` header and never appear in arguments, logs, receipts, Git or the browser.

### Known limits
- Asset keys use SHA-256 over the same input Wrangler hashes with BLAKE3, truncated to 32 hex characters. Cloudflare does not publish the key derivation as a contract; the first live deployment must show that the upload and deployment calls accept these keys.
- The upload, check-missing and upsert endpoints are the ones Wrangler uses. Cloudflare's public API reference documents deployment creation, lookup, listing and rollback.
- Readback assumes Pages' documented HTML handling (`/x/index.html` is served at `/x/`, `/x.html` at `/x`) and that the root `404.html` answers unmatched paths with HTTP 404.

## CI: `.github/workflows/ci.yml`
Frozen `npm ci` (npm pinned to the `packageManager` version), then `lint`, `typecheck`, `test:unit`, registry/data/scoring checks, clean `build:release`, `test:browser` (Chromium via Playwright) and `verify:automation`. Actions are pinned to full commit SHAs and permissions are `contents: read`.

## Release product manifest
`npm run build:release` deletes `dist`, runs the normal build, then writes `dist/release-manifest.json` (schema `axionbench-release-manifest-v1`).

**Canonical digest format `axionbench-product-v1`.** Files are the regular files of `dist` except the manifest and the Cloudflare control files. Paths are relative, `/`-separated, sorted bytewise (UTF-8), and each segment matches `[A-Za-z0-9._@+~-]+`. A path with a leading slash, drive letter, backslash, `?`, `#`, `%`, empty segment, `.` or `..` is rejected. The digest is SHA-256 of the text `axionbench-product-v1\n` followed by one line per file, `<sha256>  <bytes>  <path>\n`. `controlSha256` uses the same layout with header `axionbench-control-v1` over `_headers`, `_redirects` and `_routes.json`, which are listed in `controlFiles`, never as served assets. `dataSha256` is the hash of `data.json`. The manifest also records `sourceCommit`, `sourceDirty`, `builtAt`, `fileCount` and every file's hash and size.

The deployment gate (`scripts/release/deployment-gate.mjs`, used by `verify-workflow.mjs deployment` and the publication transaction) validates locally before any fetch: path rules, duplicates, ordering, recomputed digests, the complete clean build against the manifest (nothing omitted, extra, stale or tampered), a clean commit (or clean code plus a validated data overlay), and `sourceCommit`/product/data agreement with the deployment record. It then reads the hosted manifest (byte-identical to the local one), `data.json` and every listed file at the URL Pages serves it from, and checks that the deployed `_headers` effects appear on the live responses. It is read-only.

Evidence-only commits after `sourceCommit` are allowed; the product and data digests bind the hosted content. A daily snapshot adds `publication` (refresh key and revision identity) to its own manifest; the `dist` build always keeps the unpublished placeholder.

## Checks
`npm run verify:automation` runs the workflow checks (no GitHub schedule), `test:automation` (adverse fixtures: omitted/extra/stale/tampered artifacts, invalid paths before fetch, failing BFCL adapter responses, refresh restoration, changed-file bound), publication tooling and quality-profile checks, a clean release build with manifest verification, offline route health and candidate staging of the real build, and a credential scan. It does no network, deployment, DNS or browser operation.

`npm run test:update-transaction` (also part of `test:unit`) runs the publication transaction against a fake Pages API and a fake HTTPS host with Pages URL behaviour. It covers success, idempotent reruns, same-key conflicts, stale and old keys, upload failure, refused creation, ambiguous timeouts with and without a created deployment, a killed process resuming from its journal, failed deployment stages, tampered hosted bytes with verified rollback, an unverifiable restore, limits, non-canonical paths, changed code, wrong project or unattached hostname, the read-only verifier, explicit rollback, receipt tampering, capture records and the patch series.

`jadbot.quality.json` declares the release artifact, candidate validation (release check, route health, offline candidate staging), health commands and three corruption/recovery cases (missing page, corrupted data, missing route), each recovered by a clean `build:release`.

## Native JadBot daily workflow: registration contract
The daily update is meant to run as a project-scoped JadBot workflow, not a GitHub schedule. Nothing in this repository registers or enables it, and no document may say the site updates daily until the receipts described in [QUALIFICATION](project/QUALIFICATION.md) exist.

`node scripts/automation/jadbot-daily.mjs template` prints the credential-free registration template: project `axionbench`, **disabled**, daily at 06:30 UTC (`30 6 * * *`, timezone `UTC`), project isolation, `workerLimit` 1, collaboration off, overlapping project runs forbidden, one step running `npm run publish:daily`. Every AI stage (plan, worker, review, retry, debug) uses `codex/gpt-6.1-sol/high`, Fast off, no fallback, set as the workflow choice and as a `modelPin` scoped to that workflow id.

`node scripts/automation/jadbot-daily.mjs verify-registration (--require-disabled | --require-enabled) --trust <trust file> [--receipt <file>] [--now <ISO>]` verifies a JadBot API readback (default `evidence/local/jadbot-registration-readback.json`, ignored by Git). The readback must be an envelope signed by a trusted `jadbot` key; plain JSON proves nothing. It must be dated, name a `/v1/` endpoint and a daemon version, and show: the exact name and project, UTC confirmed by the runtime, `nextRunAt` equal to the computed next 06:30:00 UTC after the observation, a native trigger id, the limits above, and the model choice, pin and effective choice all Sol 6.1/high, Fast off, no fallback. Provider observations (`providerObservations`) must exist exactly for AI stages that executed (`aiStagesExecuted`): one each, Sol 6.1/high, Fast off, and none for a job that has never run. `--require-enabled` also needs `enablement` citing the SHA-256 of the qualification receipt and of the first-deployment receipt. Exactly one state option is required; unknown, duplicate or valueless options are refused. Without a readback the command exits 2 and says nothing was verified. It never registers, enables or contacts JadBot.

Registering, enabling and the first run are separate stages with their own authority.
