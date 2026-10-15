# Deployment to Cloudflare Pages

Approved target: `axionbench.jadapps.app` (see `docs/owner-approval.json`). Settings live in `deploy.config.json`. The project is an **independent** Cloudflare Pages project named `axionbench`. Never touch `jad-apps-site-git` (it serves the apex and `www`), nor any other existing project.

## Read-only inspection (2026-10-01)
Through the owner's Wrangler OAuth session, `wrangler pages project list` showed four projects: `jad-apps-site-git` (apex, `www`), `the-system`, `docstudio` (`docs.jadapps.app`) and `jad-apps-site`. No `axionbench` project exists and the approved hostname is attached to none. Details: `evidence/cloudflare-inspection.json`. The owner's earlier exact-host DNS lookup returned HTTP 403, and the owner chose dashboard setup over a DNS token, so DNS state is not inspected or claimed here.

Nothing in this step created the project, deployed, or changed DNS.

## Secrets (names only)
`CLOUDFLARE_API_TOKEN` (Pages edit on this account) and `CLOUDFLARE_ACCOUNT_ID`, as GitHub secrets of the `production` environment. Values are never written to files or logs.

## Repeatable deploy
1. Merge reviewed changes to `main`; CI must be green and `npm run verify:release` must pass on the exact candidate (receipt: `test-results/release-verify.json`).
2. Run the **Deploy** workflow (manual). It runs checks, `npm run build:release` and `wrangler pages deploy dist --project-name axionbench --branch main --commit-dirty=false` with the pinned Wrangler, then `npm run deploy:readback -- --latest --write deployment-record.json`.
3. Local equivalent: `npm run build:release`, `npx wrangler@4.145.0 pages deploy dist --project-name axionbench --branch main`, then `npm run deploy:readback -- --latest` with the two variables set in the environment.

First-time setup (owner-gated, not automated): create the `axionbench` Pages project (direct upload, production branch `main`), then attach `axionbench.jadapps.app` in the Cloudflare dashboard (Pages → axionbench → Custom domains). The dashboard supplies the CNAME target, normally `axionbench.pages.dev`. A CNAME without the custom-domain association can return 522.

## Readback
`deploy:readback` asks Cloudflare for the deployment (and checks it belongs to `axionbench`), then runs the deployment gate against the approved HTTPS hostname only: manifest bytes, `data.json`, every listed file's hash and size, and the `_headers` effects. `evidence/deployment.json` for `npm run verify ... deployment` holds `url`, `repo`, `provider`, `projectId`, `deploymentId`, `sourceCommit`, `productSha256`, `dataSha256`, `publishedAt`.

## Rollback
Pages keeps every deployment. In the dashboard (Pages → axionbench → Deployments) choose the last verified deployment and **Rollback to this deployment**, or redeploy its commit with the steps above. Then rerun `deploy:readback --deployment-id <id>` and confirm the hosted product digest equals that release's `release-manifest.json`. To take the site offline, remove only the `axionbench.jadapps.app` custom domain from the `axionbench` project. Rollback never involves the apex project or unrelated DNS.
