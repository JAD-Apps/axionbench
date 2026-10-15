// Adversarial fixtures for the daily publication transaction. A fake Cloudflare
// Pages API and a fake HTTPS host with Pages URL semantics stand in for the
// network; nothing here contacts Cloudflare or needs credentials.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { routes } from '../../src/routes.ts';
import { refreshAndPublish } from '../../scripts/automation/refresh.mjs';
import { preparePatchSeries } from '../../scripts/project/prepare-public-patches.mjs';
import { verifyArtifactSpec, verifyPublicationReceipts } from '../../scripts/project/verify-receipts.mjs';
import { hostedRequest, MISSING_PROBE } from '../../scripts/release/deployment-gate.mjs';
import { buildManifest, expectedHeaders, MANIFEST_NAME, parseHeadersFile, validateManifest } from '../../scripts/release/manifest.mjs';
import { AmbiguousError, ApiError, createPagesClient, loadCredentials } from '../../scripts/release/pages-api.mjs';
import { checkDist, checkHost, routeFile } from '../../scripts/release/production-check.mjs';
import { verifyCapture } from '../../scripts/release/verify-capture.mjs';
import {
  LIMITS, assertFreshKey, assetKey, compareKeys, parseKey, publishSnapshot, readLastSuccess, readTransaction, rollbackPublication, stageSnapshot, loadRetainedSnapshot, verifyPublished,
} from '../../scripts/release/publication.mjs';
import { changedPaths, isOverlayPath, overlayDigest, publishableSource, validateOverlay } from '../../scripts/release/source-identity.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const TOKEN = `cfut_${'S'.repeat(40)}`; // credential-shaped fixture value that must never be written
const config = { provider: 'cloudflare-pages', projectName: 'axionbench', productionBranch: 'main', hostname: 'axionbench.jadapps.app', repo: 'JAD-Apps/axionbench', outputDirectory: 'dist', forbiddenProjects: ['jad-apps-site-git'] };
const NOW = new Date('2026-10-03T06:00:00Z');
const now = () => NOW;
const limits = { ...LIMITS, pollDelayMs: 0, readbackAttempts: 2, reconcileAttempts: 2, statusAttempts: 3 };
const sleep = async () => {};
const COMMIT = 'c'.repeat(40);

const scratchDirs = [];
async function scratch() { const dir = await mkdtemp(join(tmpdir(), 'axionbench-publish-')); scratchDirs.push(dir); return dir; }
test.after(async () => { for (const dir of scratchDirs) await rm(dir, { recursive: true, force: true }); });

// A complete miniature release tree with every route and required file.
async function makeDist(dir, { data = '{"models":[1]}', identity = { sourceCommit: COMMIT, sourceDirty: false }, extra = {} } = {}) {
  await mkdir(join(dir, 'assets'), { recursive: true });
  const files = {
    '404.html': '<!doctype html><title>Not found</title>', 'data.json': data, 'data-details.json': '{"sources":[]}',
    'robots.txt': 'User-agent: *', 'sitemap.xml': '<urlset/>', 'assets/app.js': 'console.log(1)',
    'publication.json': JSON.stringify({ schemaVersion: 'axionbench-publication-v1', status: 'unpublished' }),
    _headers: '/*\n  X-Content-Type-Options: nosniff\n/data.json\n  Cache-Control: public, max-age=300, must-revalidate\n/release-manifest.json\n  Cache-Control: no-cache\n',
    ...extra,
  };
  files['data-manifest.json'] = JSON.stringify({ schemaVersion: 'axionbench-data-manifest-v1', retrievedAt: '2026-10-02T20:00:00.000Z', projection: { path: '/data.json', sha256: sha(Buffer.from(data)) } });
  for (const route of routes) files[routeFile(route.path)] = `<!doctype html><title>${route.title}</title>`;
  for (const [path, text] of Object.entries(files)) { await mkdir(join(dir, path, '..'), { recursive: true }); await writeFile(join(dir, path), text); }
  const manifest = await buildManifest(dir, { ...identity, builtAt: '2026-10-03T05:00:00.000Z' });
  validateManifest(manifest);
  await writeFile(join(dir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// Fake Pages API: assets, deployments, production alias and rollback.
function fakeCloudflare() {
  const state = { assets: new Map(), deployments: [], production: null, calls: [], hooks: {},
    project: { name: 'axionbench', production_branch: 'main', domains: ['axionbench.jadapps.app', 'axionbench.pages.dev'] } };
  const call = (name) => state.calls.push(name);
  const view = (d) => ({ id: d.id, project_name: d.project_name, project_id: 'project-id', environment: 'production', created_on: d.created_on, latest_stage: d.latest_stage, deployment_trigger: d.deployment_trigger });
  const client = {
    projectName: 'axionbench',
    async getProject() { call('getProject'); return { ...state.project, canonical_deployment: state.production ? { id: state.production } : null }; },
    async getUploadToken() { call('getUploadToken'); return `jwt-${'u'.repeat(30)}`; },
    async checkMissing(jwt, hashes) { call('checkMissing'); return hashes.filter((h) => !state.assets.has(h)); },
    async upload(jwt, items) {
      call('upload');
      if (state.hooks.upload) await state.hooks.upload(items);
      for (const item of items) { assert.equal(item.base64, true); state.assets.set(item.key, Buffer.from(item.value, 'base64')); }
    },
    async upsertHashes() { call('upsertHashes'); },
    async createDeployment(args) {
      call('create');
      const mode = state.hooks.create?.(args);
      if (mode === 'timeout-before') throw new AmbiguousError('deployment create: timed out; the outcome is unknown');
      if (mode === 'refused') throw new ApiError('deployment create: HTTP 400 (8000000 invalid manifest)', 400);
      const files = {};
      for (const [path, key] of Object.entries(args.manifest)) { assert.ok(state.assets.has(key), `asset ${key} was never uploaded`); files[path.slice(1)] = state.assets.get(key); }
      for (const [name, bytes] of Object.entries(args.controlFiles)) files[name] = Buffer.from(bytes);
      const status = state.hooks.stage?.() ?? 'success';
      const d = { id: `dep-${state.deployments.length + 1}`, project_name: 'axionbench', created_on: NOW.toISOString(), files,
        latest_stage: { name: 'deploy', status }, deployment_trigger: { type: 'ad_hoc', metadata: { branch: args.branch, commit_hash: args.commitHash, commit_message: args.commitMessage, commit_dirty: false } } };
      state.deployments.unshift(d);
      if (status === 'success') state.production = d.id;
      if (mode === 'timeout-after') throw new AmbiguousError('deployment create: timed out; the outcome is unknown');
      return view(d);
    },
    async getDeployment(id) { call('getDeployment'); const d = state.deployments.find((x) => x.id === id); if (!d) throw new ApiError('deployment lookup: HTTP 404', 404); return view(d); },
    async listDeployments() { call('listDeployments'); return state.deployments.map(view); },
    async rollback(id) {
      call('rollback');
      const d = state.deployments.find((x) => x.id === id);
      assert.ok(d && d.latest_stage.status === 'success', 'can only roll back to a successful deployment');
      if (state.hooks.rollback) await state.hooks.rollback(id);
      state.production = id;
      return view(d);
    },
  };
  // HTTPS host with Pages semantics: extension-less HTML, index redirects,
  // root 404.html for unmatched paths, _headers applied.
  const fetcher = async (url, init = {}) => {
    const { hostname, pathname } = new URL(url);
    assert.equal(hostname, 'axionbench.jadapps.app', 'readback must only contact the approved hostname');
    const d = state.deployments.find((x) => x.id === state.production);
    if (!d) return new Response('no deployment', { status: 404 });
    const files = d.files;
    const redirect = (location) => {
      if (init.redirect === 'error') throw new TypeError('fetch failed: redirect mode is error');
      return new Response(null, { status: 308, headers: { location } });
    };
    if (pathname.endsWith('/index.html')) return redirect(pathname.slice(0, -'index.html'.length));
    if (pathname.endsWith('.html')) return redirect(pathname.slice(0, -'.html'.length));
    let name = null;
    if (pathname === '/') name = 'index.html';
    else if (pathname.endsWith('/') && files[`${pathname.slice(1)}index.html`]) name = `${pathname.slice(1)}index.html`;
    else if (files[`${pathname.slice(1)}/index.html`]) return redirect(`${pathname}/`);
    else if (files[`${pathname.slice(1)}.html`]) name = `${pathname.slice(1)}.html`;
    else if (files[pathname.slice(1)] && !['_headers', '_redirects', '_routes.json'].includes(pathname.slice(1))) name = pathname.slice(1);
    const rules = files._headers ? parseHeadersFile(files._headers.toString()) : [];
    const headers = Object.fromEntries(expectedHeaders(rules, pathname));
    if (name?.endsWith('.html')) headers['content-type'] = 'text/html; charset=utf-8';
    if (!name) return new Response(files['404.html'], { status: 404, headers: { ...headers, 'content-type': 'text/html' } });
    let body = files[name];
    if (state.hooks.tamper) body = state.hooks.tamper(d, name, body) ?? body;
    return new Response(body, { status: 200, headers });
  };
  return { state, client, fetcher };
}

async function setup() {
  const root = await scratch();
  const stateDir = join(root, 'state');
  const dist = join(root, 'dist');
  await makeDist(dist);
  return { root, stateDir, dist, cf: fakeCloudflare() };
}
const publish = (ctx, snapshot, key, extra = {}) => publishSnapshot({ stateDir: ctx.stateDir, snapshot, key, client: ctx.cf.client, config, fetcher: ctx.cf.fetcher, now, sleep, limits, authorize: async () => ({ fixture: true }), ...extra });
const stage = (ctx, key, dist = ctx.dist, extra = {}) => stageSnapshot({ distDir: dist, stateDir: ctx.stateDir, key, now, limits, ...extra });
async function treeDigest(dir) {
  const out = [];
  const visit = async (rel) => { for (const e of await readdir(join(dir, rel), { withFileTypes: true })) { const p = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) await visit(p); else out.push(`${p}:${sha(await readFile(join(dir, p)))}`); } };
  await visit('');
  return sha(out.sort().join('\n'));
}
async function allStateText(dir) {
  const parts = [];
  const visit = async (rel) => { for (const e of await readdir(join(dir, rel), { withFileTypes: true })) { const p = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) await visit(p); else parts.push(await readFile(join(dir, p), 'utf8').catch(() => '')); } };
  await visit('');
  return parts.join('\n');
}
async function publishedTwice() {
  const ctx = await setup();
  const first = await publish(ctx, await stage(ctx, '2026-10-02.r1'), '2026-10-02.r1');
  assert.equal(first.status, 'published', first.message);
  const dist2 = join(ctx.root, 'dist2');
  await makeDist(dist2, { data: '{"models":[1,2]}' });
  const second = await publish(ctx, await stage(ctx, '2026-10-03.r1', dist2), '2026-10-03.r1');
  assert.equal(second.status, 'published', second.message);
  return { ...ctx, dist2, first, second };
}

test('keys: date/revision format, ordering and freshness', () => {
  assert.deepEqual(parseKey('2026-10-03.r2'), { key: '2026-10-03.r2', date: '2026-10-03', revision: 2, time: Date.UTC(2026, 9, 3) });
  for (const bad of ['2026-02-30.r1', '2026-10-03', '2026-10-03.r0', '2026-10-03.r01', '../x', '2026-10-03.r1/../x']) assert.throws(() => parseKey(bad), /publication key/, bad);
  assert.ok(compareKeys('2026-10-03.r1', '2026-10-02.r9') > 0);
  assert.ok(compareKeys('2026-10-03.r2', '2026-10-03.r10') < 0);
  assertFreshKey('2026-10-03.r1', NOW);
  assert.throws(() => assertFreshKey('2026-10-04.r1', NOW), /future/);
  assert.throws(() => assertFreshKey('2026-09-29.r1', NOW), /more than 3 days old/);
});

test('source identity: overlay paths, porcelain parsing and tamper-evident overlay digest', () => {
  for (const path of ['data/ingestion.json', 'data/authority/bfcl-v4.json', 'public/data.json', 'public/data-manifest.json', 'PUBLIC-SOURCE-MANIFEST.json', 'docs/DATA-CHANGELOG.md', 'data/source-snapshots/blobs/ab/x.html']) assert.ok(isOverlayPath(path), path);
  for (const path of ['src/main.tsx', 'scripts/release/publication.mjs', 'public/_headers', 'public/publication.json', 'data/authority/x/y.json', 'data/../src/a.json', 'package.json']) assert.ok(!isOverlayPath(path), path);
  assert.deepEqual(changedPaths(' M data/a.json\0R  new.json\0old.json\0?? src/x.ts\0'), [{ status: ' M', path: 'data/a.json' }, { status: 'R ', path: 'new.json' }, { status: 'R ', path: 'old.json' }, { status: '??', path: 'src/x.ts' }]);
  const files = [{ path: 'data/a.json', sha256: 'a'.repeat(64), bytes: 3 }, { path: 'public/data.json', sha256: 'b'.repeat(64), bytes: 4 }];
  const manifest = { sourceCommit: COMMIT, sourceDirty: true, codeDirty: false, dataOverlay: { format: 'axionbench-data-overlay-v1', baseCommit: COMMIT, fileCount: 2, overlaySha256: overlayDigest(files), files } };
  validateOverlay(manifest);
  assert.ok(publishableSource(manifest));
  assert.throws(() => validateOverlay({ ...manifest, dataOverlay: { ...manifest.dataOverlay, files: [{ ...files[0], sha256: 'c'.repeat(64) }, files[1]] } }), /overlaySha256 does not match/);
  assert.throws(() => validateOverlay({ ...manifest, sourceDirty: false }), /sourceDirty must stay true/, 'an overlay can never be labelled clean');
  assert.throws(() => validateOverlay({ ...manifest, dataOverlay: { ...manifest.dataOverlay, files: [{ path: 'src/a.ts', sha256: 'a'.repeat(64), bytes: 1 }], fileCount: 1 } }), /not a refresh output/);
  assert.ok(!publishableSource({ ...manifest, codeDirty: true }), 'changed code is never publishable');
  assert.ok(!publishableSource({ sourceCommit: null, sourceDirty: true }), 'an archive without a commit is not publishable');
});

test('first publication uploads, deploys, reads back every hosted byte and records last-success', async () => {
  const ctx = await setup();
  const snapshot = await stage(ctx, '2026-10-03.r1');
  const publication = JSON.parse(await readFile(join(snapshot.dir, 'publication.json'), 'utf8'));
  assert.equal(publication.status, 'published'); assert.equal(publication.refreshKey, '2026-10-03.r1'); assert.equal(publication.refreshDate, '2026-10-03');
  assert.equal(publication.sourcesRetrievedAt, '2026-10-02T20:00:00.000Z'); assert.equal(publication.builtAt, '2026-10-03T05:00:00.000Z');
  assert.notEqual(publication.validatedAt, publication.sourcesRetrievedAt, 'publication, retrieval and build dates stay separate');
  assert.equal(((await stat(join(snapshot.dir, 'data.json'))).mode & 0o222), 0, 'snapshot files are read-only');
  const result = await publish(ctx, snapshot, '2026-10-03.r1');
  assert.equal(result.status, 'published', result.message);
  assert.equal(ctx.cf.state.production, result.deploymentId);
  const deployment = ctx.cf.state.deployments[0];
  assert.equal(deployment.deployment_trigger.metadata.commit_hash, COMMIT);
  assert.ok(deployment.files._headers, 'control file is sent as a deployment form file, not an asset');
  assert.ok(!Object.keys(deployment.files).some((p) => p === '' || p.startsWith('/')), 'canonical asset manifest paths');
  const ledger = await readLastSuccess(ctx.stateDir);
  assert.equal(ledger.current.key, '2026-10-03.r1'); assert.equal(ledger.previous, null);
  assert.equal(ledger.current.snapshotSha256, snapshot.snapshotSha256);
  assert.equal((await readTransaction(ctx.stateDir, '2026-10-03.r1')).state, 'published');
  const report = await verifyPublicationReceipts(ctx.stateDir);
  assert.equal(report.current.deploymentId, result.deploymentId);
  assert.ok(!(await allStateText(ctx.stateDir)).includes('S'.repeat(40)), 'credential value never reaches state');
  assert.equal(assetKey('a.js', Buffer.from('x')).length, 32);
});

test('same key and revision is idempotent; same key with different content is rejected before any remote call', async () => {
  const ctx = await setup();
  assert.equal((await publish(ctx, await stage(ctx, '2026-10-03.r1'), '2026-10-03.r1')).status, 'published');
  const deployments = ctx.cf.state.deployments.length;
  const again = await publish(ctx, await stage(ctx, '2026-10-03.r1'), '2026-10-03.r1');
  assert.equal(again.status, 'already-published'); assert.equal(again.ok, true);
  assert.equal(ctx.cf.state.deployments.length, deployments, 'no second deployment');
  const changed = join(ctx.root, 'changed');
  await makeDist(changed, { data: '{"models":[9]}' });
  const calls = ctx.cf.state.calls.length;
  const conflict = await publish(ctx, await stage(ctx, '2026-10-03.r1', changed), '2026-10-03.r1');
  assert.equal(conflict.status, 'rejected-key-conflict'); assert.equal(conflict.ok, false);
  assert.equal(ctx.cf.state.calls.length, calls, 'conflict is refused without contacting Cloudflare');
  const stale = await publish(ctx, await stage(ctx, '2026-10-02.r1', changed), '2026-10-02.r1');
  assert.equal(stale.status, 'failed-before-start'); assert.match(stale.message, /not newer/);
  assert.equal(ctx.cf.state.calls.length, calls);
});

test('readback failure rolls production back to the verified last-good and keeps last-success', async () => {
  const ctx = await publishedTwice();
  const before = await readFile(join(ctx.stateDir, 'last-success.json'));
  const dist3 = join(ctx.root, 'dist3');
  await makeDist(dist3, { data: '{"models":[1,2,3]}' });
  ctx.cf.state.hooks.tamper = (d, name, body) => (d.id === 'dep-3' && name === 'assets/app.js' ? Buffer.from('tampered at the edge') : body);
  const result = await publish(ctx, await stage(ctx, '2026-10-03.r2', dist3), '2026-10-03.r2');
  assert.equal(result.status, 'failed-restored', result.message);
  assert.match(result.message, /Hosted artifact mismatch: assets\/app.js/);
  assert.equal(ctx.cf.state.production, ctx.second.deploymentId, 'production returned to the last-good deployment');
  assert.ok((await readFile(join(ctx.stateDir, 'last-success.json'))).equals(before), 'last-success is unchanged by a failed publication');
  assert.ok(ctx.cf.state.calls.includes('rollback'));
  await verifyPublished({ stateDir: ctx.stateDir, config, client: ctx.cf.client, fetcher: ctx.cf.fetcher });
});

test('a failed deployment stage restores last-good; with no last-good the failure is explicit', async () => {
  const ctx = await publishedTwice();
  ctx.cf.state.hooks.stage = () => 'failure';
  const dist3 = join(ctx.root, 'dist3');
  await makeDist(dist3, { data: '{"models":[4]}' });
  const failed = await publish(ctx, await stage(ctx, '2026-10-03.r2', dist3), '2026-10-03.r2');
  assert.equal(failed.status, 'failed-restored', failed.message); assert.match(failed.message, /failure at stage deploy/);
  assert.equal(ctx.cf.state.production, ctx.second.deploymentId);

  const fresh = await setup();
  fresh.cf.state.hooks.tamper = (d, name, body) => (name === 'data.json' ? Buffer.from('{}') : body);
  const none = await publish(fresh, await stage(fresh, '2026-10-03.r1'), '2026-10-03.r1');
  assert.equal(none.status, 'failed-no-last-good'); assert.equal(await readLastSuccess(fresh.stateDir), null);
});

test('upload failure and refused creation leave production and last-success untouched', async () => {
  const ctx = await publishedTwice();
  const before = await readFile(join(ctx.stateDir, 'last-success.json'));
  const dist3 = join(ctx.root, 'dist3');
  await makeDist(dist3, { data: '{"models":[5]}' });
  ctx.cf.state.hooks.upload = () => { throw new ApiError('asset upload: HTTP 503 after 4 attempts', 503); };
  const upload = await publish(ctx, await stage(ctx, '2026-10-03.r2', dist3), '2026-10-03.r2');
  assert.equal(upload.status, 'failed-before-deploy'); assert.match(upload.message, /production unchanged/);
  assert.equal(ctx.cf.state.deployments.length, 2); assert.ok(!ctx.cf.state.calls.includes('rollback'));
  assert.ok((await readFile(join(ctx.stateDir, 'last-success.json'))).equals(before));
  delete ctx.cf.state.hooks.upload;
  ctx.cf.state.hooks.create = () => 'refused';
  const refused = await publish(ctx, await stage(ctx, '2026-10-03.r2', dist3), '2026-10-03.r2');
  assert.equal(refused.status, 'failed-before-deploy'); assert.match(refused.message, /HTTP 400/);
  delete ctx.cf.state.hooks.create;
  const retried = await publish(ctx, await stage(ctx, '2026-10-03.r2', dist3), '2026-10-03.r2');
  assert.equal(retried.status, 'published', 'a definitive failure may be retried with the same key and revision');
  const dist4 = join(ctx.root, 'dist4');
  await makeDist(dist4, { data: '{"models":[8]}' });
  ctx.cf.state.hooks.upload = () => { throw new ApiError('asset upload: HTTP 503 after 4 attempts', 503); };
  for (let run = 1; run <= LIMITS.maxRunsPerKey; run += 1) assert.equal((await publish(ctx, await stage(ctx, '2026-10-03.r3', dist4), '2026-10-03.r3')).status, 'failed-before-deploy');
  const limited = await publish(ctx, await stage(ctx, '2026-10-03.r3', dist4), '2026-10-03.r3');
  assert.equal(limited.status, 'rejected-retry-limit'); assert.match(limited.message, /use the next revision/);
});

test('ambiguous create timeouts reconcile against the deployment listing', async () => {
  // Created despite the timeout: found by its snapshot-specific message, not recreated.
  const ctx = await setup();
  ctx.cf.state.hooks.create = () => 'timeout-after';
  const reconciled = await publish(ctx, await stage(ctx, '2026-10-03.r1'), '2026-10-03.r1');
  assert.equal(reconciled.status, 'published', reconciled.message);
  assert.equal(ctx.cf.state.deployments.length, 1, 'exactly one deployment exists');
  assert.equal(ctx.cf.state.calls.filter((c) => c === 'create').length, 1);
  // Not created: one bounded retry.
  const ctx2 = await setup();
  let first = true;
  ctx2.cf.state.hooks.create = () => { if (first) { first = false; return 'timeout-before'; } return null; };
  const retried = await publish(ctx2, await stage(ctx2, '2026-10-03.r1'), '2026-10-03.r1');
  assert.equal(retried.status, 'published', retried.message);
  assert.equal((await readTransaction(ctx2.stateDir, '2026-10-03.r1')).createAttempts, 2);
  // Never confirmed: stops after the bound and restores last-good.
  const ctx3 = await publishedTwice();
  ctx3.cf.state.hooks.create = () => 'timeout-before';
  const baseline = ctx3.cf.state.calls.filter((c) => c === 'create').length;
  const dist3 = join(ctx3.root, 'dist3');
  await makeDist(dist3, { data: '{"models":[6]}' });
  const unresolved = await publish(ctx3, await stage(ctx3, '2026-10-03.r2', dist3), '2026-10-03.r2');
  assert.equal(unresolved.status, 'failed-restored'); assert.match(unresolved.message, /could not be confirmed after 2 create attempts/);
  assert.equal(ctx3.cf.state.calls.filter((c) => c === 'create').length - baseline, 2, 'two bounded attempts for this key');
  assert.equal(ctx3.cf.state.production, ctx3.second.deploymentId);
});

test('an interrupted transaction resumes from its journal without a duplicate deployment', async () => {
  const ctx = await setup();
  const snapshot = await stage(ctx, '2026-10-03.r1');
  // Simulate a crash right after Cloudflare accepted the create call.
  ctx.cf.state.hooks.create = () => 'timeout-after';
  const listDeployments = ctx.cf.client.listDeployments;
  ctx.cf.client.listDeployments = async () => { throw new Error('process killed'); };
  const crashed = await publish(ctx, snapshot, '2026-10-03.r1');
  assert.equal(crashed.status, 'failed-no-last-good');
  ctx.cf.client.listDeployments = listDeployments;
  delete ctx.cf.state.hooks.create;
  // Put the journal back in the in-flight state a killed process leaves behind.
  const tx = await readTransaction(ctx.stateDir, '2026-10-03.r1');
  Object.assign(tx, { state: 'deploying', createAttempts: 1 });
  await writeFile(join(ctx.stateDir, 'transactions', '2026-10-03.r1.json'), JSON.stringify(tx));
  const creates = ctx.cf.state.calls.filter((c) => c === 'create').length;
  const result = await publish(ctx, await stage(ctx, '2026-10-03.r1'), '2026-10-03.r1');
  assert.equal(result.status, 'published', result.message);
  assert.equal(ctx.cf.state.calls.filter((c) => c === 'create').length, creates, 'resume reconciled the earlier create');
  assert.equal(result.snapshotSha256, snapshot.snapshotSha256, 'resume publishes the journal snapshot');
});

test('qualification, limits, canonical paths, changed code and project checks fail before any upload', async () => {
  const ctx = await setup();
  const snapshot = await stage(ctx, '2026-10-03.r1');
  await chmod(join(snapshot.dir, 'data.json'), 0o644);
  await writeFile(join(snapshot.dir, 'data.json'), '{"models":["corrupted"]}');
  const corrupt = await publish(ctx, snapshot, '2026-10-03.r1');
  assert.equal(corrupt.status, 'failed-qualification'); assert.equal(ctx.cf.state.calls.length, 0);

  const ctx2 = await setup();
  await assert.rejects(stage(ctx2, '2026-10-03.r1', ctx2.dist, { limits: { ...limits, maxFiles: 5 } }), /file limit/);
  await assert.rejects(stage(ctx2, '2026-10-03.r1', ctx2.dist, { limits: { ...limits, maxFileBytes: 10 } }), /byte file limit/);
  await assert.rejects(stage(ctx2, '2026-10-03.r1', ctx2.dist, { limits: { ...limits, maxTotalBytes: 100 } }), /byte limit/);
  const odd = join(ctx2.root, 'odd');
  await makeDist(odd);
  await writeFile(join(odd, 'a b.js'), 'x');
  await assert.rejects(stage(ctx2, '2026-10-03.r1', odd), /manifest omits|non-canonical/);
  const dirty = join(ctx2.root, 'dirty');
  await makeDist(dirty, { identity: { sourceCommit: COMMIT, sourceDirty: true, codeDirty: true } });
  await assert.rejects(stage(ctx2, '2026-10-03.r1', dirty), /changed code files/);
  const files = [{ path: 'public/data.json', sha256: 'b'.repeat(64), bytes: 4 }];
  const overlay = join(ctx2.root, 'overlay');
  await makeDist(overlay, { identity: { sourceCommit: COMMIT, sourceDirty: true, codeDirty: false, dataOverlay: { format: 'axionbench-data-overlay-v1', baseCommit: COMMIT, fileCount: 1, overlaySha256: overlayDigest(files), files } } });
  const overlaySnapshot = await stage(ctx2, '2026-10-03.r1', overlay);
  assert.equal(overlaySnapshot.dataOverlaySha256, overlayDigest(files), 'overlay identity is carried separately from the code commit');

  const ctx3 = await setup();
  ctx3.cf.state.project.domains = ['axionbench.pages.dev'];
  const unattached = await publish(ctx3, await stage(ctx3, '2026-10-03.r1'), '2026-10-03.r1');
  assert.equal(unattached.status, 'failed-before-deploy'); assert.match(unattached.message, /not attached/);
  ctx3.cf.state.project.name = 'jad-apps-site-git';
  const wrong = await publish(ctx3, await stage(ctx3, '2026-10-03.r1'), '2026-10-03.r1');
  assert.match(wrong.message, /not the approved axionbench/);
  assert.ok(!ctx3.cf.state.calls.includes('upload') && !ctx3.cf.state.calls.includes('getUploadToken'));
});

test('restore that cannot be verified is reported, never recorded as success', async () => {
  const ctx = await publishedTwice();
  const before = await readFile(join(ctx.stateDir, 'last-success.json'));
  ctx.cf.state.hooks.tamper = (d, name, body) => (name === 'index.html' ? Buffer.from('edge corruption everywhere') : body);
  const dist3 = join(ctx.root, 'dist3');
  await makeDist(dist3, { data: '{"models":[7]}' });
  const result = await publish(ctx, await stage(ctx, '2026-10-03.r2', dist3), '2026-10-03.r2');
  assert.equal(result.status, 'failed-restore-unverified'); assert.match(result.message, /RESTORE NOT VERIFIED/);
  assert.ok((await readFile(join(ctx.stateDir, 'last-success.json'))).equals(before));
});

test('read-only verifier writes nothing and detects host and provider drift', async () => {
  const ctx = await publishedTwice();
  const digest = await treeDigest(ctx.stateDir);
  const report = await verifyPublished({ stateDir: ctx.stateDir, config, client: ctx.cf.client, fetcher: ctx.cf.fetcher });
  assert.equal(report.key, '2026-10-03.r1'); assert.equal(report.previous, '2026-10-02.r1');
  assert.equal(await treeDigest(ctx.stateDir), digest, 'verification left the state byte-identical');
  ctx.cf.state.hooks.tamper = (d, name, body) => (name === 'data.json' ? Buffer.from('{"models":[]}') : body);
  await assert.rejects(verifyPublished({ stateDir: ctx.stateDir, config, fetcher: ctx.cf.fetcher }), /hosted data.json|Hosted artifact mismatch/);
  delete ctx.cf.state.hooks.tamper;
  ctx.cf.state.production = ctx.first.deploymentId;
  await assert.rejects(verifyPublished({ stateDir: ctx.stateDir, config, client: ctx.cf.client, fetcher: ctx.cf.fetcher }), /not the recorded/);
  assert.equal(await treeDigest(ctx.stateDir), digest);
});

test('explicit rollback moves production to a retained verified deployment and records it', async () => {
  const ctx = await publishedTwice();
  await assert.rejects(rollbackPublication({ stateDir: ctx.stateDir, to: 'dep-unknown', client: ctx.cf.client, config, fetcher: ctx.cf.fetcher, now, sleep, limits }), /not a recorded verified deployment/);
  const result = await rollbackPublication({ stateDir: ctx.stateDir, to: 'previous', client: ctx.cf.client, config, fetcher: ctx.cf.fetcher, now, sleep, limits });
  assert.equal(result.status, 'rolled-back'); assert.equal(ctx.cf.state.production, ctx.first.deploymentId);
  const ledger = await readLastSuccess(ctx.stateDir);
  assert.equal(ledger.current.deploymentId, ctx.first.deploymentId); assert.equal(ledger.previous.deploymentId, ctx.second.deploymentId);
  await verifyPublished({ stateDir: ctx.stateDir, config, client: ctx.cf.client, fetcher: ctx.cf.fetcher });
  const report = await verifyPublicationReceipts(ctx.stateDir);
  assert.equal(report.statuses['rolled-back'], 1);
  // Tampered receipt is detected.
  const [name] = (await readdir(join(ctx.stateDir, 'receipts'))).sort();
  await chmod(join(ctx.stateDir, 'receipts', name), 0o600);
  await writeFile(join(ctx.stateDir, 'receipts', name), (await readFile(join(ctx.stateDir, 'receipts', name), 'utf8')).replace('"status"', '"status" '));
  await assert.rejects(verifyPublicationReceipts(ctx.stateDir), /content address/);
});

test('refresh-and-publish restores local data when publication fails', async () => {
  const root = await scratch();
  await mkdir(join(root, 'data'), { recursive: true }); await mkdir(join(root, 'public'), { recursive: true });
  await writeFile(join(root, 'data/ingestion.json'), 'last-good'); await writeFile(join(root, 'public/data.json'), 'last-good-public');
  const refresh = async () => { await writeFile(join(root, 'data/ingestion.json'), 'refreshed'); await writeFile(join(root, 'public/data.json'), 'refreshed-public'); return { ok: true, changed: true, receipt: { status: 'promoted' } }; };
  const failed = await refreshAndPublish({ root, refresh, publish: async () => ({ ok: false, status: 'failed-restored' }) });
  assert.equal(failed.ok, false); assert.equal(failed.stage, 'publication');
  assert.equal(await readFile(join(root, 'data/ingestion.json'), 'utf8'), 'last-good');
  assert.equal(await readFile(join(root, 'public/data.json'), 'utf8'), 'last-good-public');
  const ok = await refreshAndPublish({ root, refresh, publish: async () => ({ ok: true, status: 'published' }) });
  assert.equal(ok.ok, true); assert.equal(await readFile(join(root, 'data/ingestion.json'), 'utf8'), 'refreshed');
});

test('Pages API client: bounded retries, ambiguity, refusal and credential hygiene', async () => {
  assert.throws(() => loadCredentials({}), /missing credential variables: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID/);
  assert.throws(() => loadCredentials({ CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: 'nope' }), /32-character/);
  const account = 'a'.repeat(32);
  const seen = [];
  const responses = [];
  const fetcher = async (url, init) => {
    seen.push({ url, method: init.method, auth: init.headers.Authorization, redirect: init.redirect });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status });
  };
  const client = createPagesClient({ token: TOKEN, accountId: account, projectName: 'axionbench', fetcher, sleep, attempts: 3 });
  responses.push({ status: 503, body: { success: false, errors: [{ code: 1, message: 'busy' }] } }, { status: 200, body: { success: true, result: { name: 'axionbench' } } });
  assert.equal((await client.getProject()).name, 'axionbench');
  assert.equal(seen.length, 2, 'GET retried once on 503');
  assert.equal(seen[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/axionbench`);
  assert.equal(seen[0].redirect, 'error');
  responses.push({ status: 403, body: { success: false, errors: [{ code: 10000, message: 'Authentication error' }] } });
  const refused = await client.getProject().catch((error) => error);
  assert.equal(refused.status, 403); assert.equal(seen.length, 3, '4xx is not retried');
  assert.ok(!refused.message.includes(TOKEN));
  responses.push(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
  const ambiguous = await client.createDeployment({ manifest: { '/index.html': 'k' }, branch: 'main', commitHash: COMMIT, commitMessage: 'm', commitDirty: false, controlFiles: { _headers: Buffer.from('/*\n  X: y\n') } }).catch((e) => e);
  assert.equal(ambiguous.ambiguous, true, 'create timeout is ambiguous, never retried');
  assert.equal(seen.length, 4);
  responses.push({ status: 502, body: {} });
  assert.equal((await client.rollback('dep-1').catch((e) => e)).ambiguous, true, 'rollback 5xx is ambiguous');
  responses.push({ status: 503, body: {} }, { status: 503, body: {} }, { status: 503, body: {} });
  const exhausted = await client.checkMissing('jwt-token-value-long-enough', ['k']).catch((e) => e);
  assert.match(exhausted.message, /HTTP 503/); assert.equal(seen.at(-1).auth, 'Bearer jwt-token-value-long-enough', 'asset calls use the upload JWT');
  assert.equal(seen.filter((s) => s.url.endsWith('/check-missing')).length, 3, 'idempotent POST bounded to 3 attempts');
  for (const s of seen.slice(0, 5)) assert.equal(s.auth, `Bearer ${TOKEN}`);
});

test('route health: Pages URL mapping and offline/online production checks', async () => {
  assert.deepEqual(hostedRequest('index.html'), { urlPath: '/', status: 200 });
  assert.deepEqual(hostedRequest('rankings/index.html'), { urlPath: '/rankings/', status: 200 });
  assert.deepEqual(hostedRequest('privacy.html'), { urlPath: '/privacy', status: 200 });
  assert.deepEqual(hostedRequest('404.html'), { urlPath: MISSING_PROBE, status: 404 });
  assert.deepEqual(hostedRequest('assets/app.js'), { urlPath: '/assets/app.js', status: 200 });
  const ctx = await publishedTwice();
  const report = await checkHost({ url: 'https://axionbench.jadapps.app', hostname: config.hostname, expectProduct: ctx.second.productSha256, fetcher: ctx.cf.fetcher });
  assert.equal(report.routes.length, routes.length); assert.equal(report.refreshKey, '2026-10-03.r1');
  assert.ok(report.routes.filter((r) => r.path !== '/').every((r) => r.via === `${r.path}/`));
  await assert.rejects(checkHost({ url: 'https://axionbench.pages.dev', hostname: config.hostname, fetcher: ctx.cf.fetcher }), /approved HTTPS hostname/);
  await assert.rejects(checkHost({ url: 'https://axionbench.jadapps.app', hostname: config.hostname, expectProduct: 'f'.repeat(64), fetcher: ctx.cf.fetcher }), /expected release/);
  assert.equal((await checkDist(ctx.dist)).routes, routes.length);
  const broken = join(ctx.root, 'broken');
  await cp(ctx.dist, broken, { recursive: true });
  await rm(join(broken, 'rankings'), { recursive: true });
  await assert.rejects(checkDist(broken), /manifest lists served file absent/);
  await rm(ctx.root, { recursive: true, force: true }).catch(() => {});
});

test('capture records bind exact screenshot/video bytes to the approved host and release', async () => {
  const dir = await scratch();
  const png = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png); png.writeUInt32BE(1440, 16); png.writeUInt32BE(900, 20);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(12)]);
  await writeFile(join(dir, 'home.png'), png); await writeFile(join(dir, 'hero.mp4'), mp4);
  const dist = join(dir, 'dist'); const manifest = await makeDist(dist);
  const record = { schemaVersion: 'axionbench-capture-v1', url: 'https://axionbench.jadapps.app/', capturedAt: NOW.toISOString(), productSha256: manifest.productSha256, dataSha256: manifest.dataSha256,
    files: [{ path: 'home.png', kind: 'screenshot', sha256: sha(png), bytes: png.length, viewport: { width: 1440, height: 900 } }, { path: 'hero.mp4', kind: 'video', sha256: sha(mp4), bytes: mp4.length }] };
  await assert.rejects(verifyCapture(record, { root: dir, hostname: config.hostname, releaseManifest: manifest }), /video|probe|decode|ffprobe/i);
  const screenshotRecord = { ...record, files: [record.files[0]] };
  const ok = await verifyCapture(screenshotRecord, { root: dir, hostname: config.hostname, releaseManifest: manifest });
  assert.deepEqual(ok.kinds, { screenshot: 1 });
  await assert.rejects(verifyCapture({ ...record, url: 'https://axionbench.pages.dev/' }, { root: dir, hostname: config.hostname }), /not the approved/);
  await assert.rejects(verifyCapture({ ...record, productSha256: 'e'.repeat(64) }, { root: dir, hostname: config.hostname, releaseManifest: manifest }), /different release/);
  await assert.rejects(verifyCapture({ ...record, files: [{ ...record.files[1], kind: 'screenshot' }] }, { root: dir, hostname: config.hostname }), /not a PNG/);
  await assert.rejects(verifyCapture({ ...record, files: [{ ...record.files[0], viewport: { width: 390, height: 844 } }] }, { root: dir, hostname: config.hostname }), /PNG width/);
  await assert.rejects(verifyCapture({ ...record, files: [{ ...record.files[0], path: '../home.png' }] }, { root: dir, hostname: config.hostname }), /traversal/);
  await writeFile(join(dir, 'hero.mp4'), Buffer.concat([mp4, Buffer.from('x')]));
  await assert.rejects(verifyCapture(record, { root: dir, hostname: config.hostname }), /size differs/);
  assert.equal((await verifyArtifactSpec(`${join(dir, 'home.png')}:${sha(png)}:${png.length}`)).bytes, png.length);
  await assert.rejects(verifyArtifactSpec(`${join(dir, 'home.png')}:${'0'.repeat(64)}:${png.length}`), /hash mismatch/);
  await rm(dir, { recursive: true, force: true });
});

test('prepare-only public patch series reproduces the candidate without commits', async () => {
  const dir = await scratch();
  const base = join(dir, 'base'), candidate = join(dir, 'candidate'), output = join(dir, 'out');
  const write = async (root, path, bytes) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), bytes); };
  for (const [path, text] of Object.entries({ 'README.md': 'old\n', 'src/a.ts': 'export const a = 1;\n', 'docs/old.md': 'gone\n', 'scripts/keep.mjs': 'same\n' })) await write(base, path, text);
  for (const [path, text] of Object.entries({ 'README.md': 'new\n', 'src/a.ts': 'export const a = 2;\n', 'scripts/keep.mjs': 'same\n', 'scripts/release/p.mjs': 'export {};\n' })) await write(candidate, path, text);
  await write(candidate, 'public/og.png', Buffer.from([0x89, 0x50, 0, 1, 2, 255]));
  const request = { schemaVersion: 'axionbench-public-series-request-v1', patches: [
    { slug: 'publication', subject: 'Publish through the Pages API', paths: ['scripts/release/', 'public/og.png'] },
    { slug: 'docs', subject: 'Update documentation', paths: ['README.md', 'docs/'] },
    { slug: 'source', subject: 'Change the constant', paths: ['src/'] },
  ] };
  const series = await preparePatchSeries({ base, candidate, request, output, now });
  assert.equal(series.patches.length, 3); assert.equal(series.changedFiles, 5);
  assert.equal(series.verified.matchesCandidate, true); assert.deepEqual(series.operations, { commits: 0, pushes: 0, baseModified: false });
  assert.deepEqual(series.patches[1].changes.map((c) => [c.path, c.change]), [['README.md', 'modified'], ['docs/old.md', 'deleted']]);
  assert.match(await readFile(join(output, '0001-publication.patch'), 'utf8'), /GIT binary patch/);
  assert.equal(await readFile(join(base, 'README.md'), 'utf8'), 'old\n', 'base is never modified');
  await assert.rejects(preparePatchSeries({ base, candidate, request: { ...request, patches: request.patches.slice(1) }, output: join(dir, 'o2'), now }), /not assigned to any patch: public\/og.png, scripts\/release\/p.mjs/);
  await assert.rejects(preparePatchSeries({ base, candidate, request: { ...request, patches: [...request.patches, { slug: 'dup', subject: 'Overlap', paths: ['src/a.ts'] }] }, output: join(dir, 'o3'), now }), /more than one patch/);
  await assert.rejects(preparePatchSeries({ base, candidate, request, output, now }), /must be empty/);
  await rm(dir, { recursive: true, force: true });
});


test('default authenticated approval barrier refuses upload and retains all prior evidence', async () => {
  const ctx=await setup(); const snapshot=await stage(ctx,'2026-10-03.r1');
  const result=await publish(ctx,snapshot,'2026-10-03.r1',{authorize:undefined});
  assert.equal(result.status,'failed-qualification'); assert.match(result.message,/publication disabled/);
  assert.equal(ctx.cf.state.calls.length,0); assert.equal(await readLastSuccess(ctx.stateDir),null);
  const descriptor={...snapshot,dir:ctx.dist};
  const wrongPath=await publish(ctx,descriptor,'2026-10-03.r1');
  assert.equal(wrongPath.status,'failed-qualification'); assert.match(wrongPath.message,/canonical/);
  assert.equal(ctx.cf.state.calls.length,0);
});


test('reviewed snapshots are consumed byte-exact without rebuilding or restaging', async()=> {
  const ctx=await setup();const staged=await stage(ctx,'2026-10-03.r1');
  const before=await treeDigest(ctx.stateDir);
  const retained=await loadRetainedSnapshot(ctx.stateDir,staged.snapshotSha256);
  assert.deepEqual(retained.manifest,staged.manifest); assert.equal(retained.key,staged.key);
  assert.equal(retained.productSha256,staged.productSha256); assert.equal(retained.revisionSha256,staged.revisionSha256);
  assert.equal(await treeDigest(ctx.stateDir),before,'loading a reviewed candidate cannot mutate it');
  const published=await publish(ctx,retained,retained.key);assert.equal(published.status,'published',published.message);
  assert.equal(published.snapshotSha256,staged.snapshotSha256);
});
