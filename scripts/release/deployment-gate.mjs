// Read-only deployment gate. Local release checks run before any fetch; hosted
// checks then fetch real bytes with an injectable fetcher (tests use fixtures).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MANIFEST_NAME, compareWithBuild, expectedHeaders, parseHeadersFile, scanDist, sha256, validateManifest } from './manifest.mjs';
import { publishableSource } from './source-identity.mjs';

const digest = (value) => assert.match(value, /^[a-f0-9]{64}$/);

// Cloudflare Pages serves HTML without its extension and redirects the
// extension form (/about/index.html -> /about/, /contact.html -> /contact), so
// readback requests the canonical URL with redirects refused. The root 404.html
// is served for unmatched paths with HTTP 404 and is read through a probe path.
export const MISSING_PROBE = '/__axionbench-readback-missing';
export function hostedRequest(path) {
  if (path === '404.html') return { urlPath: MISSING_PROBE, status: 404 };
  if (path === 'index.html') return { urlPath: '/', status: 200 };
  if (path.endsWith('/index.html')) return { urlPath: `/${path.slice(0, -'index.html'.length)}`, status: 200 };
  if (path.endsWith('.html')) return { urlPath: `/${path.slice(0, -'.html'.length)}`, status: 200 };
  return { urlPath: `/${path}`, status: 200 };
}

export async function verifyDeployment({ approval, deployment: d, distDir = 'dist', fetcher = fetch }) {
  assert.equal(d.url, `https://${approval.hostname}`, 'deployment URL must be the exact approved hostname');
  assert.equal(d.repo, approval.repo);
  assert.ok(d.provider && d.projectId && d.deploymentId);
  assert.match(d.sourceCommit, /^[a-f0-9]{40}$/);
  digest(d.productSha256); digest(d.dataSha256);
  assert.ok(Number.isFinite(Date.parse(d.publishedAt)));

  // ---- local checks: nothing below fetches until every one has passed ----
  const localManifestBytes = await readFile(join(distDir, MANIFEST_NAME));
  const localManifest = validateManifest(JSON.parse(localManifestBytes));
  compareWithBuild(localManifest, await scanDist(distDir));
  assert.ok(publishableSource(localManifest), 'a release must be built from a clean committed tree (or clean code plus a validated data overlay)');
  assert.equal(localManifest.sourceCommit, d.sourceCommit, 'local manifest sourceCommit differs from the deployment record');
  assert.equal(localManifest.productSha256, d.productSha256, 'Hosted release must match the verified product build');
  assert.equal(localManifest.dataSha256, d.dataSha256, 'local data hash differs from the deployment record');
  assert.equal(sha256(await readFile(join(distDir, 'data.json'))), d.dataSha256, 'local data.json differs from the deployment record');
  if (d.controlSha256) assert.equal(localManifest.controlSha256, d.controlSha256);
  const headerRules = parseHeadersFile(await readFile(join(distDir, '_headers'), 'utf8'));

  // ---- hosted checks ----
  const get = async (path, status = 200) => {
    const response = await fetcher(`${d.url}${path}`, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    assert.equal(response.status, status, `${d.url}${path}: expected HTTP ${status}`);
    return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  };
  const remoteManifest = await get(`/${MANIFEST_NAME}`);
  assert.ok(remoteManifest.bytes.equals(localManifestBytes), 'hosted manifest bytes differ from the local manifest');
  const manifest = validateManifest(JSON.parse(remoteManifest.bytes));
  assert.equal(manifest.productSha256, d.productSha256);
  assert.equal(manifest.dataSha256, d.dataSha256);
  assert.equal(manifest.sourceCommit, d.sourceCommit);
  assert.equal(sha256((await get('/data.json')).bytes), d.dataSha256, 'hosted data.json differs from the verified data');
  for (const file of manifest.files) {
    const request = hostedRequest(file.path);
    const hosted = await get(request.urlPath, request.status);
    assert.equal(sha256(hosted.bytes), file.sha256, `Hosted artifact mismatch: ${file.path}`);
    assert.equal(hosted.bytes.length, file.bytes, `Hosted artifact size mismatch: ${file.path}`);
  }
  // Control files are not downloadable assets; verify their deployed effects.
  for (const urlPath of ['/', '/data.json', `/${MANIFEST_NAME}`]) {
    const { headers } = await get(urlPath);
    for (const [name, value] of expectedHeaders(headerRules, urlPath)) {
      assert.equal(headers.get(name), value, `deployed header ${name} on ${urlPath} does not match _headers`);
    }
  }
  return d;
}
