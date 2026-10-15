# Portable source validation and refresh

`npm run verify:public` runs portable lint, data/source validation, adverse boundary/refresh fixtures, strict typecheck, unit tests, hand-calculated scoring, pricing and weight tests, release build, hero/chart checks, mounted task/weight interactions, responsive acceptance and release-integrity validation. Each gate runs even after an earlier failure. Timestamped logs and receipts are retained under ignored `test-results/public-*`; `public-verify.json` points to the latest result. Source, log, product and data hashes are recorded. These are local executions, not a claim that GitHub Actions ran.

`prebuild` recomputes authority from the permitted facts and exact reviewed joins, validates licensed price cells and freshness, validates frozen model/configuration/observation/source references, and compares the generated projection and manifests byte for byte. It neither loads raw captures nor rewrites a failing snapshot. `PUBLIC-SOURCE-MANIFEST.json` covers all delivered source files except itself; its canonical SHA-256 input is `axionbench-public-source-v1\n`, followed by bytewise path-sorted `<sha256>  <bytes>  <path>\n` records. Runtime `.git`, `node_modules`, `dist` and `test-results` directories are excluded from that source digest, and never form part of a release source archive.

The normal prebuild refuses price captures older than seven days or from the future. Historical benchmark update/evaluation dates remain visible even when much older than retrieval. An unchanged source response preserves its original capture time. Refresh does not relabel an old evaluation as new. Expired introductory tariffs remain unsupported in the UI.

`npm run data:refresh -- --audit-dir <external directory>` first checks the current source manifest and last-good structural data. Stale tariffs can be refreshed, but the promoted candidate must pass the normal freshness gate. The audit directory and existing ancestors are resolved physically and must be outside the enclosing Git repository. All source responses, publisher HTML, original price HTML and content-addressed failure receipts stay there. A temporary stage there receives a source copy and the permitted adapter projections. Only the six reviewed authority/price fact files, three public data files and source manifest may change. The adapter does not use Git, credentials or paid evaluation APIs.

Every original source adapter checks complete source shape, units, versions, identities and bounds. DeepSWE historical cost/efficiency fields are removed before admission. Unknown or new publisher mappings fail until reviewed. Suite/domain coverage cannot regress; observation drops greater than 10% are refused. The staged file set must remain identical. Validation recomputes public data and file hashes before promotion. Partial promotion is rolled back byte for byte, including the source manifest. An immutable external receipt records success or failure; raw payloads promoted and Git operations are zero. The frozen catalogue/community/open-weight projection is never edited by this command.

The public CI workflow uses the exact package manager, frozen lockfile installation and actual portable gate; it uploads local execution receipts/screenshots even on failure. The manual refresh workflow (no schedule) runs that same gate and only opens a review branch with an explicit allowlist of factual projections. It never adds an audit directory or pushes `main`. A GitHub-token push does not automatically trigger a follow-up push workflow; a token-created pull request can require approval to run its workflows. Approve the branch CI or dispatch Portable public CI before merge, following [GitHub's documented event behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). Workflows are defined here; their execution must be verified independently after publication.

`npm run build:release` builds a clean static `dist` and binds every served file, control file and `data.json` hash using `axionbench-release-manifest-v1`. `release:check` recomputes the complete build, rejecting omitted, extra or changed files. The original product/control digest formats are preserved. In a checkout the manifest records the code commit; refreshed data files that differ from it are listed separately in `dataOverlay` with their own digest, `sourceDirty` stays `true`, and any changed code file sets `codeDirty: true`.

## Daily site update

The daily update runs as a scheduled JadBot workflow, not a GitHub schedule:

```sh
npm run publish:daily -- --state-dir <persistent dir outside the repository> --audit-dir <private dir outside the repository>
```

It refuses to start if code files differ from the commit, runs `npm run data:refresh`, builds the release and publishes it as one Cloudflare Pages production deployment through the Pages API. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` come from the environment (local secret storage or runner injection), are read only by `scripts/release/pages-api.mjs` and are never printed or stored.

The transaction, in order: an immutable read-only snapshot of the build with `publication.json` (refresh key and dates); qualification (hashes, limits, every route, data binding, credential-free text); a project check (`axionbench`, branch `main`, `axionbench.jadapps.app` attached); upload of only the missing assets; one deployment carrying `commit_message="axionbench data <key> snapshot <sha>"`; deployment status; HTTPS readback of every hosted byte from the approved hostname; and only then `last-success.json`.

- Keys are `YYYY-MM-DD.rN` (UTC, not in the future, at most 3 days old, newer than the published key). Rerunning a published key with the same code and data does nothing; the same key with different content is refused before any Cloudflare call.
- A timed-out deployment create is reconciled through the deployment listing by its snapshot-specific message, never blindly repeated. A killed run resumes from `transactions/<key>.json`.
- Limits: 2,000 files, 25 MiB per file, 128 MiB in total, 500 files or 40 MiB per upload request, up to 4 attempts for idempotent calls.
- If a new deployment fails its status or readback, production is rolled back to the recorded last-good deployment and that is verified by readback. Local data files return to their pre-refresh bytes. `last-success.json` is unchanged.

Other commands: `publish:site` (publish the current tree; `--dry-run` makes no network call), `publish:candidate` (offline staging and qualification), `publish:verify` (read-only; checks Cloudflare's production deployment and every hosted byte), `publish:rollback --to previous|<deployment id>|<key>`, `publish:status`, `production:check -- --dist dist` or `-- --url https://axionbench.jadapps.app`, and `capture:verify` for screenshot/video evidence.

The Methods page shows the published daily refresh, source retrieval, data validation and build dates separately. A build that the daily update did not publish says so.

Known limits: asset keys use SHA-256 where Wrangler uses BLAKE3, and the asset endpoints are the ones Wrangler uses rather than documented API reference entries; the first live deployment has to confirm both. Readback assumes Pages serves `x/index.html` at `/x/` and the root `404.html` with HTTP 404 for unknown paths.

Snapshot checks bind the supplied directory and manifest to the retained content-addressed tree and saved descriptor. Integrity checks also run on idempotent retries; an extra qualification callback cannot replace them. Credential checks include deployment control files. `production:check` reads every hosted asset and verifies its size and hash against the hosted manifest. Final acceptance additionally compares the qualified manifest and deployed security headers.

Schedule registration, first deployment and enabling the daily update need separate verified receipts. Keep the schedule disabled until the release is approved and its first deployment passes readback.

The schedule contract is 06:30 UTC every day (`30 6 * * *`), with overlapping runs skipped. Every AI stage must use `codex/gpt-6.1-sol/high`, Fast off and no fallback. Registration, runtime observations and enablement are verified separately.
