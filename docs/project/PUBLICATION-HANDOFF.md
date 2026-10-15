# Step 7 handoff: validated snapshot and authenticated publication

For Peter (steps 8–11). Private note; `docs/project/` never enters the public tree.

## Contract the daily JadBot workflow should call

```sh
npm run publish:daily -- --state-dir <persistent dir outside the checkout> --audit-dir <private dir outside the checkout> [--key YYYY-MM-DD.rN]
```

- Run it from a clean public checkout of `JAD-Apps/axionbench` main. It refuses to start if any code file differs from HEAD. Refreshed data files may differ; they become the separately digested `dataOverlay`.
- Credentials: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must be injected as environment variables from JadBot secret storage. Nothing else reads them, and they are never printed.
- The state directory must persist between runs (snapshots, `transactions/`, `receipts/`, `last-success.json`). Losing it loses last-good and idempotency.
- Exit code 0 means `published` or `already-published`. Every other status exits 1 with a JSON result. `failed-restore-unverified` needs a person to look at it.
- Default key is today's UTC date `.r1`. A rerun later the same day with changed data needs `--key <date>.r2`.

## Before enabling the schedule (step 10)

1. The `axionbench` Pages project must exist with production branch `main`, and `axionbench.jadapps.app` must appear in the project's domains. The transaction refuses to upload otherwise.
2. The first run has no last-good deployment. A readback failure there ends as `failed-no-last-good` and the failed deployment may stay live. Do the first run while watching, then `npm run publish:verify -- --state-dir <dir>`.
3. Unproven until the first live run: the SHA-256-derived asset keys (Wrangler uses BLAKE3), the Wrangler-only asset endpoints, and Pages serving `x/index.html` at `/x/` with root `404.html` as HTTP 404. If any of these is wrong, the run fails before recording success; it does not report a false pass.
4. Negative case for the receipts: `npm run publish:rollback -- --state-dir <dir> --to previous` after a second publication, then `npm run receipts:verify -- --state-dir <dir>`.
5. The public README and `docs/AUTOMATION.md` templates describe the daily JadBot update as the live mechanism. Publish them only once the schedule is actually registered and enabled, or adjust the wording.

## Other interfaces

- `npm run production:check -- --url https://axionbench.jadapps.app --expect-product <sha>`: route health of the deployed site.
- `npm run capture:verify -- --capture <capture.json> --release-manifest <file>`: screenshot/MP4 evidence binding for step 11 (schema in `scripts/release/verify-capture.mjs`).
- `npm run public:patches -- --base <public main checkout> --candidate <prepared tree> --series <series.json> --output <empty dir>`: prepare-only patch series with a reproduction proof. It makes no commit or push.

## Also changed

The manual public refresh workflow template staged only 10 of the 11 public refresh files (`data/current-source-evidence.json` was missing since step 2), which made `scripts/public/test-boundary.mjs` fail. The file was added to its `git add` list while the cron was removed.
