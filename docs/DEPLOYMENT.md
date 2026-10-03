# Deployment to Cloudflare Pages

Approved target: `axionbench.jadapps.app` (see `docs/owner-approval.json`). Settings live in `deploy.config.json`. The project is an **independent** Cloudflare Pages project named `axionbench`. Never touch `jad-apps-site-git` (it serves the apex and `www`), nor any other existing project.

## Read-only inspection (2026-10-01)
Through the owner's Wrangler OAuth session, `wrangler pages project list` showed four projects: `jad-apps-site-git` (apex, `www`), `the-system`, `docstudio` (`docs.jadapps.app`) and `jad-apps-site`. No `axionbench` project exists and the approved hostname is attached to none. Details: `evidence/cloudflare-inspection.json`. The owner's earlier exact-host DNS lookup returned HTTP 403, and the owner chose dashboard setup over a DNS token, so DNS state is not inspected or claimed here.

Nothing in this step created the project, deployed, or changed DNS.

## Secrets (names only)
`CLOUDFLARE_API_TOKEN` (Pages edit on this account) and `CLOUDFLARE_ACCOUNT_ID`. The daily update gets them from JadBot's local secret storage; the manual GitHub workflow gets them as secrets of the `production` environment. Only `scripts/release/pages-api.mjs` reads them, by name. Values are never written to files, logs, receipts or command lines.

## Daily update (authoritative)
The JadBot daily workflow runs `npm run publish:daily -- --state-dir <dir> --audit-dir <dir>`. It refreshes the data, builds the static site and publishes it through the Pages API as one production deployment, then reads back every hosted byte from `https://axionbench.jadapps.app`. The full transaction, limits, keys and failure handling are in [AUTOMATION.md](AUTOMATION.md#daily-publication). The state directory holds the retained snapshots and `last-success.json`; keep it on persistent storage outside the repository.

API calls (Cloudflare API v4, checked 2026-10-03):

| Purpose | Call |
| --- | --- |
| Project, production deployment, domains | `GET /accounts/{account}/pages/projects/axionbench` |
| Upload token | `GET /accounts/{account}/pages/projects/axionbench/upload-token` |
| Missing assets / upload / keep keys | `POST /pages/assets/check-missing`, `/pages/assets/upload`, `/pages/assets/upsert-hashes` (upload-token JWT) |
| Create deployment | `POST /accounts/{account}/pages/projects/axionbench/deployments` (multipart: `manifest`, `branch`, `commit_hash`, `commit_message`, `commit_dirty`, `_headers`) |
| Readback / reconciliation | `GET .../deployments/{id}`, `GET .../deployments?env=production` |
| Rollback | `POST .../deployments/{id}/rollback` |

Before the first daily run (owner-gated, not automated): the `axionbench` Pages project must exist (direct upload, production branch `main`) and `axionbench.jadapps.app` must be attached under Pages → axionbench → Custom domains. The transaction refuses to upload until the project reports that hostname. The first run has no last-good deployment to restore, so a failure there is reported as `failed-no-last-good`.

## Manual deploy (fallback tooling)
1. Merge reviewed changes to `main`; CI must be green and `npm run verify:release` must pass on the exact candidate (receipt: `test-results/release-verify.json`).
2. Run the **Deploy** workflow (manual). It runs checks, `npm run build:release` and `wrangler pages deploy dist --project-name axionbench --branch main --commit-dirty=false` with the pinned Wrangler, then `npm run deploy:readback -- --latest --write deployment-record.json`.
3. Local equivalent through the same API transaction as the daily update: `npm run publish:site -- --state-dir <dir>`. Use `--dry-run` first to stage and qualify without any network call.

A manual Wrangler deployment is not recorded in the daily state directory; `publish:verify` will report that production is not the recorded deployment until the next daily publication.

## Readback
`deploy:readback` and the daily transaction both use the deployment gate against the approved HTTPS hostname only: manifest bytes, `data.json`, every listed file's hash and size (requested at the URL Pages serves: `/rankings/` for `rankings/index.html`, a missing-path probe for `404.html`), and the `_headers` effects. `npm run publish:verify -- --state-dir <dir>` repeats this read-only for the recorded current deployment and also checks Cloudflare's `canonical_deployment`. `npm run production:check -- --url https://axionbench.jadapps.app` checks every route, the 404 behaviour and the hosted publication record. `evidence/deployment.json` for `npm run verify ... deployment` holds `url`, `repo`, `provider`, `projectId`, `deploymentId`, `sourceCommit`, `productSha256`, `dataSha256`, `publishedAt`.

## Rollback
The daily transaction rolls back automatically when a new deployment fails its status or readback, and verifies the restored deployment by readback. To roll back by hand: `npm run publish:rollback -- --state-dir <dir> --to previous` (or a recorded deployment ID or key). It only accepts deployments whose snapshots are retained and verified, proves the result by HTTPS readback and then records it as current. The dashboard (Pages → axionbench → Deployments → **Rollback to this deployment**) also works; run `publish:verify` afterwards, which reports a mismatch until the state directory agrees. To take the site offline, remove only the `axionbench.jadapps.app` custom domain from the `axionbench` project. Rollback never involves the apex project or unrelated DNS.
