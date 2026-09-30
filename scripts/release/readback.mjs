// npm run deploy:readback -- (--deployment-id <id> | --latest) [--write evidence/deployment.json]
// Read-only hosted readback of the approved hostname. Builds the deployment
// record from the local release manifest plus the provider's own deployment
// identity, then runs the full deployment gate. Reads CLOUDFLARE_* from the
// environment by name only and never prints them.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { verifyDeployment } from './deployment-gate.mjs';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
const config = JSON.parse(await readFile('deploy.config.json', 'utf8'));
const approval = JSON.parse(await readFile('docs/owner-approval.json', 'utf8'));
assert.equal(config.hostname, approval.hostname, 'deploy.config.json hostname must equal the approved hostname');
let deploymentId = option('--deployment-id');
assert.ok(deploymentId || args.includes('--latest'), 'usage: npm run deploy:readback -- (--deployment-id <id> | --latest)');
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
assert.ok(token && account, 'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in the environment');
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${config.projectName}/deployments`;
if (!deploymentId) {
  const listing = await fetch(`${base}?per_page=1&env=production`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  assert.equal(listing.status, 200, `Cloudflare deployment listing failed: HTTP ${listing.status}`);
  deploymentId = (await listing.json()).result?.[0]?.id;
  assert.ok(deploymentId, 'the Pages project has no production deployment');
}
const response = await fetch(`${base}/${deploymentId}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200, `Cloudflare deployment lookup failed: HTTP ${response.status}`);
const { result } = await response.json();
assert.equal(result.project_name, config.projectName, 'deployment belongs to a different Pages project');
assert.equal(result.id, deploymentId);
const manifest = JSON.parse(await readFile('dist/release-manifest.json', 'utf8'));
const record = {
  url: `https://${approval.hostname}`, repo: approval.repo, provider: config.provider, projectId: result.project_id ?? result.project_name,
  projectName: result.project_name, deploymentId: result.id, sourceCommit: manifest.sourceCommit, productSha256: manifest.productSha256,
  controlSha256: manifest.controlSha256, dataSha256: manifest.dataSha256, publishedAt: result.created_on,
  providerUrl: result.url, environment: result.environment,
};
await verifyDeployment({ approval, deployment: record });
const out = option('--write');
if (out) await writeFile(out, `${JSON.stringify(record, null, 2)}\n`);
console.log(`Hosted readback verified for ${record.url}: deployment ${record.deploymentId}, product ${record.productSha256}.`);
