// npm run deploy:readback -- (--deployment-id <id> | --latest --state-dir <dir>) [--write evidence/deployment.json]
// Read-only hosted readback of the approved hostname. Reads CLOUDFLARE_* from
// the environment by name only and never prints them.
//   --deployment-id  builds the record from the local dist manifest plus the provider's deployment
//                    identity and runs the full deployment gate (unchanged behaviour).
//   --latest         verifies the production target recorded by the publication ledger: the
//                    retained canonical snapshot (including its daily data overlay) must be the
//                    provider's canonical production deployment and every hosted byte must match.
//                    It never uses the newest deployment listing or a rebuilt private dist.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDeployment } from './deployment-gate.mjs';
import { createPagesClient, loadCredentials } from './pages-api.mjs';
import { readLastSuccess, verifyPublished, verifySnapshot } from './publication.mjs';

export async function readbackLatest({ stateDir, config, client, fetcher = fetch, verify = verifyDeployment }) {
  assert.ok(stateDir, '--latest needs --state-dir: the production target comes from the publication ledger, not from the newest deployment listing');
  assert.ok(client, 'the provider canonical-deployment readback needs a Pages client');
  const result = await verifyPublished({ stateDir, config, client, fetcher, verify });
  const ledger = await readLastSuccess(stateDir);
  const manifest = await verifySnapshot(stateDir, ledger.current.snapshotSha256);
  const overlay = manifest.dataOverlay?.overlaySha256 ?? null;
  assert.equal(overlay, JSON.parse(await readFile(join(stateDir, 'snapshots', `${ledger.current.snapshotSha256}.json`), 'utf8')).dataOverlaySha256,
    'retained snapshot descriptor disagrees with its manifest about the daily data overlay');
  return { ...result, snapshotSha256: ledger.current.snapshotSha256, dataOverlaySha256: overlay, canonical: true, viaRetainedSnapshot: true };
}

async function main(args) {
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
  const config = JSON.parse(await readFile('deploy.config.json', 'utf8'));
  const approval = JSON.parse(await readFile('docs/owner-approval.json', 'utf8'));
  assert.equal(config.hostname, approval.hostname, 'deploy.config.json hostname must equal the approved hostname');
  const deploymentId = option('--deployment-id');
  assert.ok(deploymentId || args.includes('--latest'), 'usage: npm run deploy:readback -- (--deployment-id <id> | --latest --state-dir <dir>)');
  assert.ok(!(deploymentId && args.includes('--latest')), 'use either --deployment-id or --latest');
  const credentials = loadCredentials();
  if (!deploymentId) {
    const client = createPagesClient({ ...credentials, projectName: config.projectName });
    const result = await readbackLatest({ stateDir: resolve(option('--state-dir') ?? ''), config, client });
    if (option('--write')) await writeFile(option('--write'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Canonical production readback verified for https://${config.hostname}: deployment ${result.deploymentId}, product ${result.productSha256}, data ${result.dataSha256}${result.dataOverlaySha256 ? `, overlay ${result.dataOverlaySha256}` : ''}.`);
    return;
  }
  const { token, accountId: account } = credentials;
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${config.projectName}/deployments`;
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
  if (option('--write')) await writeFile(option('--write'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Hosted readback verified for ${record.url}: deployment ${record.deploymentId}, product ${record.productSha256}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); } catch (error) { console.error(`FAIL ${error.message}`); process.exitCode = 1; }
}
