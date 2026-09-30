# Automation: refresh, CI and release product

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

`.github/workflows/refresh-data.yml` runs weekly and on demand. It opens a pull request with `gh pr create`; it never pushes to `main`. CI must pass and a maintainer reviews before merge.

## CI: `.github/workflows/ci.yml`
Frozen `npm ci` (npm pinned to the `packageManager` version), then `lint`, `typecheck`, `test:unit`, registry/data/scoring checks, clean `build:release`, `test:browser` (Chromium via Playwright) and `verify:automation`. Actions are pinned to full commit SHAs and permissions are `contents: read`.

## Release product manifest
`npm run build:release` deletes `dist`, runs the normal build, then writes `dist/release-manifest.json` (schema `axionbench-release-manifest-v1`).

**Canonical digest format `axionbench-product-v1`.** Files are the regular files of `dist` except the manifest and the Cloudflare control files. Paths are relative, `/`-separated, sorted bytewise (UTF-8), and each segment matches `[A-Za-z0-9._@+~-]+`. A path with a leading slash, drive letter, backslash, `?`, `#`, `%`, empty segment, `.` or `..` is rejected. The digest is SHA-256 of the text `axionbench-product-v1\n` followed by one line per file, `<sha256>  <bytes>  <path>\n`. `controlSha256` uses the same layout with header `axionbench-control-v1` over `_headers`, `_redirects` and `_routes.json`, which are listed in `controlFiles`, never as served assets. `dataSha256` is the hash of `data.json`. The manifest also records `sourceCommit`, `sourceDirty`, `builtAt`, `fileCount` and every file's hash and size.

The deployment gate (`scripts/release/deployment-gate.mjs`, used by `verify-workflow.mjs deployment`) validates locally before any fetch: path rules, duplicates, ordering, recomputed digests, the complete clean build against the manifest (nothing omitted, extra, stale or tampered), a clean `sourceDirty: false` tree, and `sourceCommit`/product/data agreement with the deployment record. It then reads the hosted manifest (byte-identical to the local one), `data.json` and every listed file, and checks that the deployed `_headers` effects appear on the live responses. It is read-only.

Evidence-only commits after `sourceCommit` are allowed; the product and data digests bind the hosted content.

## Checks
`npm run verify:automation` runs the workflow checks, `test:automation` (adverse fixtures: omitted/extra/stale/tampered artifacts, invalid paths before fetch, failing BFCL adapter responses, refresh restoration, changed-file bound), a clean release build with manifest verification, and a credential scan. It does no network, deployment, DNS or browser operation.
