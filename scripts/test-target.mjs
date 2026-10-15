// Selects what the browser suites test: the fresh local build (default) or the
// deployed production site (--url https://axionbench.jadapps.app).
// Production mode never builds and never intercepts hosted product or data
// responses: it loads the hosted manifest, data and pages and first proves they
// are one consistent release (manifest -> every file digest -> data projection).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MANIFEST_NAME, validateManifest } from './release/manifest.mjs';

export const PRODUCTION_URL = 'https://axionbench.jadapps.app';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function parseTarget(argv = process.argv.slice(2)) {
  const known = new Set(['--url', '--product-sha256', '--data-sha256']);
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    assert.ok(known.has(argv[i]), `unsupported option ${argv[i]}`);
    assert.ok(argv[i + 1] !== undefined && !argv[i + 1].startsWith('--'), `${argv[i]} needs a value`);
    assert.ok(!(argv[i] in values), `duplicate option ${argv[i]}`);
    values[argv[i]] = argv[i + 1];
  }
  if (!values['--url']) {
    assert.ok(!values['--product-sha256'] && !values['--data-sha256'], 'digest expectations apply only with --url');
    return { production: false, url: null, expect: {} };
  }
  assert.equal(values['--url'], PRODUCTION_URL, `--url must be exactly ${PRODUCTION_URL}`);
  for (const key of ['--product-sha256', '--data-sha256']) assert.ok(!values[key] || /^[a-f0-9]{64}$/.test(values[key]), `${key} must be a SHA-256`);
  return { production: true, url: PRODUCTION_URL, expect: { productSha256: values['--product-sha256'], dataSha256: values['--data-sha256'] } };
}

const LOCAL_PATHS = { 'data.json': 'public/data.json', 'data-manifest.json': 'public/data-manifest.json' };

/** Bytes of a site file: the local public/dist copy, or the hosted response. */
export async function siteBytes(target, path) {
  if (!target.production) return readFile(LOCAL_PATHS[path] ?? `dist/${path}`);
  const response = await fetch(`${target.url}/${path}`, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `${target.url}/${path}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Hosted HTML for a route path such as "/rankings". */
export async function routeHtml(target, routePath) {
  if (!target.production) return (await readFile(routePath === '/' ? 'dist/index.html' : `dist${routePath}/index.html`)).toString('utf8');
  const response = await fetch(`${target.url}${routePath}`, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `${routePath}: HTTP ${response.status}`);
  return response.text();
}

/** Proves the hosted release is internally consistent before any browser assertion relies on it. */
export async function bindProductionIdentity(target) {
  if (!target.production) return null;
  const manifest = validateManifest(JSON.parse(await siteBytes(target, MANIFEST_NAME)));
  const data = await siteBytes(target, 'data.json');
  assert.equal(sha(data), manifest.dataSha256, 'hosted data.json differs from the hosted manifest');
  if (target.expect.productSha256) assert.equal(manifest.productSha256, target.expect.productSha256, 'hosted product digest differs from the expected release');
  if (target.expect.dataSha256) assert.equal(manifest.dataSha256, target.expect.dataSha256, 'hosted data digest differs from the expected release');
  for (const file of manifest.files) {
    if (file.path === '404.html') continue;
    const hosted = await siteBytes(target, file.path.endsWith('index.html') ? file.path.replace(/index\.html$/, '') : file.path.replace(/\.html$/, ''));
    assert.equal(sha(hosted), file.sha256, `hosted ${file.path} differs from the hosted manifest`);
  }
  return { productSha256: manifest.productSha256, dataSha256: manifest.dataSha256, controlSha256: manifest.controlSha256, sourceCommit: manifest.sourceCommit };
}
