// Route health for a release.
//   node scripts/release/production-check.mjs --dist dist
//     Offline: every page route has its static HTML, the 404 page, data files
//     and publication record exist, and the tree matches its release manifest.
//   node scripts/release/production-check.mjs --url https://axionbench.jadapps.app [--expect-product <sha256>]
//     Read-only HTTPS check of the approved hostname: every route answers 200
//     with HTML (directly or by one same-origin redirect to its canonical
//     form), unknown paths answer 404, and the hosted manifest, data and
//     publication record agree. Prints a JSON report; writes nothing.
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from '../../src/routes.ts';
import { MISSING_PROBE, hostedRequest } from './deployment-gate.mjs';
import { compareWithBuild, MANIFEST_NAME, scanDist, sha256, validateManifest } from './manifest.mjs';

export const routeFile = (path) => path === '/' ? 'index.html' : `${path.slice(1)}/index.html`;
export const REQUIRED_FILES = ['404.html', 'data.json', 'data-details.json', 'data-manifest.json', 'publication.json', 'robots.txt', 'sitemap.xml'];

export async function checkRouteFiles(dir) {
  for (const route of routes) await access(join(dir, routeFile(route.path))).catch(() => { throw new Error(`route ${route.path} has no ${routeFile(route.path)}`); });
  for (const file of REQUIRED_FILES) await access(join(dir, file)).catch(() => { throw new Error(`release is missing ${file}`); });
  const publication = JSON.parse(await readFile(join(dir, 'publication.json'), 'utf8'));
  assert.equal(publication.schemaVersion, 'axionbench-publication-v1', 'publication.json schema');
  assert.ok(['published', 'unpublished'].includes(publication.status), 'publication.json status');
  return routes.length;
}

export async function checkDist(dir) {
  const manifest = validateManifest(JSON.parse(await readFile(join(dir, MANIFEST_NAME), 'utf8')));
  compareWithBuild(manifest, await scanDist(dir));
  const count = await checkRouteFiles(dir);
  const dataManifest = JSON.parse(await readFile(join(dir, 'data-manifest.json'), 'utf8'));
  assert.equal(dataManifest.projection?.sha256, manifest.dataSha256, 'data-manifest.json does not bind data.json');
  return { mode: 'dist', routes: count, files: manifest.fileCount, productSha256: manifest.productSha256, dataSha256: manifest.dataSha256 };
}

export async function checkHost({ url, hostname, expectProduct = null, fetcher = fetch }) {
  assert.equal(url, `https://${hostname}`, 'production check runs only against the exact approved HTTPS hostname');
  const get = (path, redirect = 'error') => fetcher(`${url}${path}`, { redirect, signal: AbortSignal.timeout(30000) });
  const results = [];
  for (const route of routes) {
    let response = await get(route.path, 'manual');
    let via = null;
    if ([301, 302, 307, 308].includes(response.status)) {
      const target = new URL(response.headers.get('location') ?? '', `${url}${route.path}`);
      assert.equal(target.origin, url, `${route.path} redirects off the approved host`);
      assert.equal(target.pathname, `${route.path}/`, `${route.path} redirects to an unexpected path ${target.pathname}`);
      via = target.pathname;
      response = await get(target.pathname);
    }
    assert.equal(response.status, 200, `${route.path}: HTTP ${response.status}`);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/, `${route.path} is not HTML`);
    const html = await response.text();
    assert.match(html, /<title>[^<]+<\/title>/, `${route.path} has no title`);
    results.push({ path: route.path, status: 200, via });
  }
  const missing = await get(MISSING_PROBE);
  assert.equal(missing.status, 404, `unknown path answered HTTP ${missing.status}`);
  const manifestResponse = await get(`/${MANIFEST_NAME}`);
  assert.equal(manifestResponse.status, 200, 'hosted release manifest missing');
  const manifest = validateManifest(await manifestResponse.json());
  if (expectProduct) assert.equal(manifest.productSha256, expectProduct, 'hosted product differs from the expected release');
  const data = Buffer.from(await (await get('/data.json')).arrayBuffer());
  assert.equal(sha256(data), manifest.dataSha256, 'hosted data.json differs from the hosted manifest');
  for (const file of manifest.files) {
    const request=hostedRequest(file.path), response=await get(request.urlPath);
    assert.equal(response.status,request.status,`hosted ${file.path}: HTTP status`);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length,file.bytes,`hosted ${file.path}: byte count`);
    assert.equal(sha256(bytes),file.sha256,`hosted ${file.path}: hash mismatch`);
  }
  const publication = await (await get('/publication.json')).json();
  assert.equal(publication.schemaVersion, 'axionbench-publication-v1');
  if (manifest.publication) assert.equal(publication.refreshKey, manifest.publication.refreshKey, 'hosted publication record differs from the manifest');
  const final=await get(`/${MANIFEST_NAME}`);
  assert.equal(final.status,200); assert.deepEqual(await final.json(),manifest,'production changed during readback');
  return { mode: 'host', url, routes: results, productSha256: manifest.productSha256, dataSha256: manifest.dataSha256,
    refreshKey: publication.refreshKey ?? null, sourcesRetrievedAt: publication.sourcesRetrievedAt ?? null, builtAt: manifest.builtAt };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
  const config = JSON.parse(await readFile(new URL('../../deploy.config.json', import.meta.url), 'utf8'));
  let report;
  if (option('--dist')) report = await checkDist(option('--dist'));
  else if (option('--url')) report = await checkHost({ url: option('--url'), hostname: config.hostname, expectProduct: option('--expect-product') });
  else throw new Error('usage: production-check.mjs (--dist <dir> | --url https://<approved host> [--expect-product <sha256>])');
  console.log(JSON.stringify(report, null, 2));
}
