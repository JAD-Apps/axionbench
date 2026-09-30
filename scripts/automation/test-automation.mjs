// Focused regression checks for refresh, release manifest and deployment gate.
// Everything runs against temporary fixtures; no network, no external writes.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshBfcl } from '../authority/bfcl.mjs';
import { saveBlob } from '../data-adapters.mjs';
import { verifyDeployment } from '../release/deployment-gate.mjs';
import { CONTROL_FILES, buildManifest, canonicalDigest, compareWithBuild, expectedHeaders, parseHeadersFile, pathProblem, scanDist, sha256, validateManifest } from '../release/manifest.mjs';
import { runRefresh } from './refresh.mjs';

const scratch = await mkdtemp(join(tmpdir(), 'axionbench-automation-'));
const rejects = async (promise, pattern, label) => { await assert.rejects(promise, pattern, label); };
const throwsWith = (fn, pattern, label) => assert.throws(fn, pattern, label);
const clone = (value) => JSON.parse(JSON.stringify(value));
try {
  // ---------- canonical paths ----------
  for (const good of ['index.html', 'assets/app-Ab1_2.js', 'data.json', 'assets/fonts/a+b@2x.ttf']) assert.equal(pathProblem(good), null, good);
  const bad = { '../x': /traversal/, 'a/../b': /traversal/, '/abs': /absolute/, 'C:/x': /drive/, 'a\\b': /backslash/, 'a?b': /query/, 'a#b': /fragment/, 'a//b': /empty/, './a': /dot/, 'a/': /empty/, '%2e%2e/x': /percent/, '': /non-empty/, 'a b': /non-canonical/ };
  for (const [path, pattern] of Object.entries(bad)) assert.match(pathProblem(path) ?? '', pattern, `path ${JSON.stringify(path)}`);

  // ---------- manifest on a fixture build ----------
  const dist = join(scratch, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  const files = { 'index.html': '<!doctype html><title>t</title>', 'data.json': '{"models":[]}', 'assets/app.js': 'console.log(1)', 'assets/app.js.map': '{}', '_headers': '/*\n  X-Content-Type-Options: nosniff\n/data.json\n  Cache-Control: public, max-age=300\n', 'stale-old.txt': 'x' };
  delete files['stale-old.txt'];
  for (const [path, text] of Object.entries(files)) await writeFile(join(dist, path), text);
  const commit = 'a'.repeat(40);
  const manifest = await buildManifest(dist, { sourceCommit: commit, sourceDirty: false, builtAt: '2026-10-01T00:00:00.000Z' });
  validateManifest(manifest);
  assert.deepEqual(manifest.files.map((f) => f.path), ['assets/app.js', 'assets/app.js.map', 'data.json', 'index.html'], 'bytewise sorted served files');
  assert.deepEqual(manifest.controlFiles.map((f) => f.path), ['_headers'], 'control files are separate from served assets');
  assert.equal(manifest.fileCount, 4);
  assert.equal(manifest.dataSha256, sha256(Buffer.from(files['data.json'])));
  // Hand-computed digest: sha256("axionbench-product-v1\n" + "<sha>  <bytes>  <path>\n" ...)
  const manual = 'axionbench-product-v1\n' + manifest.files.map((f) => `${sha256(Buffer.from(files[f.path]))}  ${Buffer.byteLength(files[f.path])}  ${f.path}\n`).join('');
  assert.equal(manifest.productSha256, sha256(Buffer.from(manual)), 'product digest follows the documented format');
  assert.equal(canonicalDigest([...manifest.files].reverse()), manifest.productSha256, 'digest is input-order independent');
  compareWithBuild(manifest, await scanDist(dist));

  // adverse manifests (structure)
  const mutate = (fn) => { const m = clone(manifest); fn(m); return m; };
  throwsWith(() => validateManifest(mutate((m) => { m.productSha256 = '0'.repeat(64); })), /productSha256 does not match/, 'claimed digest must be recomputed');
  throwsWith(() => validateManifest(mutate((m) => { m.files[0].sha256 = '1'.repeat(64); })), /productSha256 does not match/, 'tampered listed hash');
  throwsWith(() => validateManifest(mutate((m) => { m.files.push(clone(m.files[0])); m.fileCount += 1; })), /twice|sorted/, 'duplicate path');
  throwsWith(() => validateManifest(mutate((m) => { m.files.reverse(); })), /sorted/, 'unsorted');
  throwsWith(() => validateManifest(mutate((m) => { m.files[0].path = '../escape'; })), /traversal/, 'traversal');
  throwsWith(() => validateManifest(mutate((m) => { m.files[0].path = '/abs.js'; })), /absolute/, 'absolute');
  throwsWith(() => validateManifest(mutate((m) => { m.files[0].path = 'a.js?v=1'; })), /query/, 'query');
  throwsWith(() => validateManifest(mutate((m) => { m.files[0].path = 'a.js#x'; })), /fragment/, 'fragment');
  throwsWith(() => validateManifest(mutate((m) => { m.files.push(clone(m.controlFiles[0])); m.files.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))); m.fileCount += 1; })), /control files must not be listed/, 'control file presented as served asset');
  throwsWith(() => validateManifest(mutate((m) => { m.dataSha256 = '2'.repeat(64); })), /dataSha256/, 'data hash');
  throwsWith(() => validateManifest(mutate((m) => { m.sourceCommit = 'abc'; })), /full commit/, 'short commit');
  throwsWith(() => validateManifest(mutate((m) => { m.fileCount = 99; })), /fileCount/, 'file count');
  assert.ok(CONTROL_FILES.includes('_headers') && CONTROL_FILES.includes('_redirects'));

  // adverse manifests (against the actual build)
  const omitted = mutate((m) => { m.files = m.files.filter((f) => f.path !== 'assets/app.js.map'); m.fileCount = m.files.length; m.productSha256 = canonicalDigest(m.files); });
  throwsWith(() => compareWithBuild(validateManifest(omitted), { files: manifest.files, controlFiles: manifest.controlFiles }), /omits served build file assets\/app.js.map/, 'omitted artifact');
  const extra = mutate((m) => { m.files.push({ path: 'zzz.js', sha256: '3'.repeat(64), bytes: 1 }); m.fileCount = m.files.length; m.productSha256 = canonicalDigest(m.files); });
  throwsWith(() => compareWithBuild(validateManifest(extra), { files: manifest.files, controlFiles: manifest.controlFiles }), /absent from the build: zzz.js/, 'extra artifact');
  await writeFile(join(dist, 'assets/app.js'), 'console.log(2)');
  const scannedChanged = await scanDist(dist);
  throwsWith(() => compareWithBuild(manifest, scannedChanged), /differs from the manifest hash/, 'tampered build file');
  await writeFile(join(dist, 'assets/app.js'), 'console.log(1)');
  await writeFile(join(dist, 'unlisted.js'), 'x');
  throwsWith(() => compareWithBuild(manifest, { files: [...manifest.files, { path: 'unlisted.js', sha256: sha256(Buffer.from('x')), bytes: 1 }], controlFiles: manifest.controlFiles }), /omits served build file unlisted.js/, 'unlisted build file');
  await rm(join(dist, 'unlisted.js'));
  await mkdir(join(dist, 'bad dir'), { recursive: true }); await writeFile(join(dist, 'bad dir/x.js'), 'x');
  await rejects(scanDist(dist), /non-canonical/, 'build file with a non-canonical name');
  await rm(join(dist, 'bad dir'), { recursive: true });

  // _headers parsing
  const rules = parseHeadersFile(files['_headers']);
  assert.equal(expectedHeaders(rules, '/data.json').get('cache-control'), 'public, max-age=300');
  assert.equal(expectedHeaders(rules, '/').get('x-content-type-options'), 'nosniff');
  assert.equal(expectedHeaders(rules, '/index.html').has('cache-control'), false);

  // ---------- deployment gate ----------
  const approval = { hostname: 'axionbench.jadapps.app', repo: 'JAD-Apps/axionbench' };
  const record = { url: `https://${approval.hostname}`, repo: approval.repo, provider: 'cloudflare-pages', projectId: 'axionbench', deploymentId: 'fixture-deployment', sourceCommit: commit, productSha256: manifest.productSha256, dataSha256: manifest.dataSha256, controlSha256: manifest.controlSha256, publishedAt: '2026-10-01T01:00:00Z' };
  await writeFile(join(dist, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const headersFor = (path) => Object.fromEntries([...expectedHeaders(rules, path)]);
  const host = (overrides = {}, counter = { n: 0 }) => async (url) => {
    counter.n += 1;
    const path = new URL(url).pathname;
    const name = path === '/' ? 'index.html' : path.slice(1);
    const body = overrides[path] ?? await readFile(join(dist, name)).catch(() => null);
    if (body === null) return new Response('not found', { status: 404 });
    return new Response(body, { status: 200, headers: { ...headersFor(path), ...(overrides[`headers:${path}`] ?? {}) } });
  };
  await verifyDeployment({ approval, deployment: record, distDir: dist, fetcher: host() });
  await rejects(verifyDeployment({ approval, deployment: record, distDir: dist, fetcher: host({ '/assets/app.js': 'console.log(3)' }) }), /Hosted artifact mismatch: assets\/app.js/, 'tampered hosted byte');
  await rejects(verifyDeployment({ approval, deployment: record, distDir: dist, fetcher: host({ '/data.json': '{"models":[1]}' }) }), /hosted data.json differs|Hosted artifact mismatch: data.json/, 'tampered hosted data');
  await rejects(verifyDeployment({ approval, deployment: record, distDir: dist, fetcher: host({ '/release-manifest.json': JSON.stringify({ ...manifest, builtAt: '2026-10-02T00:00:00.000Z' }) }) }), /hosted manifest bytes differ/, 'stale/different hosted manifest');
  await rejects(verifyDeployment({ approval, deployment: record, distDir: dist, fetcher: host({ 'headers:/data.json': { 'cache-control': 'no-store' } }) }), /deployed header cache-control on \/data.json/, 'control-file effect absent on the host');
  await rejects(verifyDeployment({ approval, deployment: { ...record, url: 'https://axionbench.pages.dev' }, distDir: dist, fetcher: host() }), /exact approved hostname/, 'not the approved hostname');
  await rejects(verifyDeployment({ approval, deployment: { ...record, sourceCommit: 'b'.repeat(40) }, distDir: dist, fetcher: host() }), /sourceCommit differs/, 'stale source commit');
  await rejects(verifyDeployment({ approval, deployment: { ...record, productSha256: '4'.repeat(64) }, distDir: dist, fetcher: host() }), /Hosted release must match/, 'stale product digest');
  // Invalid manifests are rejected before any fetch.
  for (const [label, edit, pattern] of [
    ['traversal', (m) => { m.files[0].path = '../x'; }, /traversal/],
    ['duplicate', (m) => { m.files.splice(1, 0, clone(m.files[0])); m.fileCount += 1; }, /twice|sorted/],
    ['query', (m) => { m.files[0].path = 'a.js?x=1'; }, /query/],
    ['absolute', (m) => { m.files[0].path = '/a.js'; }, /absolute/],
  ]) {
    const broken = clone(manifest); edit(broken);
    await writeFile(join(dist, 'release-manifest.json'), JSON.stringify(broken));
    const counter = { n: 0 };
    await rejects(verifyDeployment({ approval, deployment: record, distDir: dist, fetcher: host({}, counter) }), pattern, `${label} manifest`);
    assert.equal(counter.n, 0, `${label}: no fetch may happen before local validation`);
  }
  const dirty = { ...clone(manifest), sourceDirty: true };
  await writeFile(join(dist, 'release-manifest.json'), JSON.stringify(dirty));
  await rejects(verifyDeployment({ approval, deployment: record, distDir: dist, fetcher: host() }), /clean committed tree/, 'dirty build');
  await writeFile(join(dist, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // ---------- content-addressed source storage ----------
  const blobRoot = join(scratch, 'blobs');
  const first = await saveBlob(Buffer.from('original bytes'), 'json', { root: blobRoot });
  const second = await saveBlob(Buffer.from('original bytes'), 'json', { root: blobRoot });
  assert.deepEqual(first, second, 'identical bytes map to one object');
  assert.match(first.path, /\/[a-f0-9]{2}\/[a-f0-9]{64}\.json$/);
  await writeFile(first.path, 'corrupted');
  await rejects(saveBlob(Buffer.from('original bytes'), 'json', { root: blobRoot }), /no longer matches/, 'corrupted object is detected, never overwritten');
  assert.equal(await readFile(first.path, 'utf8'), 'corrupted');
  await rejects(saveBlob(Buffer.from('x'), '../x', { root: blobRoot }), /unsafe/, 'unsafe extension');

  // ---------- real BFCL adapter: refresh failure and last-good retention ----------
  const csv = (percentSign = '%', rows = 25) => ['Rank,Model,Overall Acc,Organization,License,Model Link', ...Array.from({ length: rows }, (_, i) => `${i + 1},Model ${i} (FC),${90 - i}${percentSign},Lab,MIT,https://example.org/m${i}`)].join('\n');
  const page = (date) => `<h1>Berkeley Function Calling Leaderboard (BFCL) V4</h1><p>Last Updated: ${date}</p><p>evaluated using commit abcdef1</p><p>Overall Accuracy is the unweighted average of all the sub-categories</p>`;
  const serve = ({ csvText = csv(), date = '2026-09-20', csvStatus = 200 } = {}) => async (url) => url.endsWith('.csv') ? new Response(csvText, { status: csvStatus }) : new Response(page(date), { status: 200 });
  const output = join(scratch, 'authority', 'bfcl.json');
  const audit = join(scratch, 'audit');
  const good = await refreshBfcl({ output, auditDir: audit, fetcher: serve() });
  const lastGood = await readFile(output);
  assert.equal(good.rowCount, 25);
  const firstRetrieval = good.source.retrievedAt;
  await new Promise((done) => setTimeout(done, 15));
  const same = await refreshBfcl({ output, auditDir: audit, fetcher: serve() });
  assert.equal(same.source.retrievedAt, firstRetrieval, 'unchanged source keeps its original retrieval date');
  const archived = await readdir(audit);
  assert.equal(archived.length, 2, 'unchanged raw responses are stored once, content-addressed');
  for (const [label, options, pattern] of [
    ['server error', { csvStatus: 503 }, /HTTP 503/],
    ['truncated table', { csvText: csv('%', 5) }, /truncated/],
    ['inferred units (no percent sign)', { csvText: csv('') }, /literal percent/],
    ['older than last-good', { date: '2026-09-01' }, /stale refresh refused/],
  ]) {
    await rejects(refreshBfcl({ output, auditDir: audit, fetcher: serve(options) }), pattern, label);
    assert.ok((await readFile(output)).equals(lastGood), `${label}: last-good projection bytes must be unchanged`);
  }
  assert.deepEqual(await readdir(join(scratch, 'authority')), ['bfcl.json'], 'no temporary files left behind');
  // A refused stale response is kept as immutable private evidence; earlier raw objects are untouched.
  const afterFailures = await readdir(audit);
  for (const name of archived) assert.ok(afterFailures.includes(name), 'earlier raw objects remain');
  for (const name of afterFailures) assert.equal(sha256(await readFile(join(audit, name))), name.split('.')[0], 'raw objects stay content-addressed');
  assert.equal(afterFailures.length, 3, 'only the refused stale page was additionally archived');

  // ---------- refresh transaction ----------
  const makeRoot = async (name, suites = 20) => {
    const root = join(scratch, name);
    for (const dir of ['data/authority', 'public', 'data/source-snapshots/blobs', 'docs']) await mkdir(join(root, dir), { recursive: true });
    const ingestion = (n, at) => JSON.stringify({ schemaVersion: 2, retrievedAt: at, coverage: { catalogueModels: 100, observations: 1000, observedSuites: n, observedDomains: 8 }, models: [1], configurations: [1], sources: [1], observations: [1] });
    await writeFile(join(root, 'data/ingestion.json'), ingestion(suites, '2026-09-30T00:00:00.000Z'));
    await writeFile(join(root, 'data/authority/x.json'), '{"last":"good"}');
    await writeFile(join(root, 'public/data.json'), '{"published":"last-good"}');
    await writeFile(join(root, 'data/source-snapshots/blobs/old.json'), 'immutable');
    return { root, ingestion };
  };
  const audit2 = join(scratch, 'refresh-audit');
  // success: promotes, logs, changelog
  {
    const { root, ingestion } = await makeRoot('ok');
    const result = await runRefresh({ root, auditDir: audit2, commands: [['ingest']], now: () => new Date('2026-10-01T02:00:00Z'), run: () => ({ status: 0 }) });
    assert.equal(result.receipt.status, 'no-change');
    const run = (command) => {
      writeFileSync(join(root, 'data/ingestion.json'), ingestion(22, '2026-10-01T01:00:00.000Z'));
      mkdirSync(join(root, 'data/source-snapshots/blobs/ab'), { recursive: true });
      writeFileSync(join(root, 'data/source-snapshots/blobs/ab/new.json'), 'new');
      return { status: 0 };
    };
    const promoted = await runRefresh({ root, auditDir: audit2, commands: [['x']], now: () => new Date('2026-10-01T02:00:00Z'), run });
    assert.equal(promoted.ok, true); assert.equal(promoted.receipt.status, 'promoted'); assert.equal(promoted.receipt.newSourceObjects, 1);
    const log = await readFile(join(root, 'docs/DATA-CHANGELOG.md'), 'utf8');
    assert.match(log, /suites 20 → 22/); assert.match(log, /data\/ingestion\.json` sha256 `[a-f0-9]{64}`/);
  }
  // failing command: last-good projections and referenced bytes are unchanged
  for (const [label, mutateRoot, minSuites, pattern] of [
    ['adapter exits non-zero', (root) => { writeFileSync(join(root, 'data/ingestion.json'), '{"half":"written"}'); writeFileSync(join(root, 'public/data.json'), 'broken'); return { status: 1 }; }, 20, /exit 1/],
    ['observed suites regress', (root) => { writeFileSync(join(root, 'data/ingestion.json'), JSON.stringify({ schemaVersion: 2, retrievedAt: '2026-10-01T00:00:00.000Z', coverage: { catalogueModels: 100, observations: 1000, observedSuites: 12, observedDomains: 8 }, models: [1], configurations: [1], sources: [1], observations: [1] })); return { status: 0 }; }, 20, /observed suites fell/],
    ['older than last-good', (root) => { writeFileSync(join(root, 'data/ingestion.json'), JSON.stringify({ schemaVersion: 2, retrievedAt: '2026-09-01T00:00:00.000Z', coverage: { catalogueModels: 100, observations: 1000, observedSuites: 25, observedDomains: 8 }, models: [1], configurations: [1], sources: [1], observations: [1] })); return { status: 0 }; }, 20, /older than last-good/],
    ['schema violation', (root) => { writeFileSync(join(root, 'data/ingestion.json'), JSON.stringify({ schemaVersion: 3 })); return { status: 0 }; }, 20, /schemaVersion/],
    ['over the changed-file bound', (root) => { for (let i = 0; i < 6; i += 1) writeFileSync(join(root, `data/source-snapshots/blobs/n${i}.json`), String(i)); writeFileSync(join(root, 'data/ingestion.json'), JSON.stringify({ schemaVersion: 2, retrievedAt: '2026-10-01T00:00:00.000Z', coverage: { catalogueModels: 100, observations: 1000, observedSuites: 25, observedDomains: 8 }, models: [1], configurations: [1], sources: [1], observations: [1] })); return { status: 0 }; }, 20, /over the 5-file bound/],
  ]) {
    const { root } = await makeRoot(`fail-${label.replace(/\W+/g, '-')}`, minSuites);
    const before = { ingestion: await readFile(join(root, 'data/ingestion.json')), publicData: await readFile(join(root, 'public/data.json')), author: await readFile(join(root, 'data/authority/x.json')), blob: await readFile(join(root, 'data/source-snapshots/blobs/old.json')) };
    const result = await runRefresh({ root, auditDir: audit2, commands: [['go']], maxChanges: 5, now: () => new Date('2026-10-01T03:00:00Z'), run: (command, dir) => mutateRoot(dir) });
    assert.equal(result.ok, false, label);
    assert.match(`${result.receipt.stage} ${result.receipt.message}`, pattern, label);
    assert.ok((await readFile(join(root, 'data/ingestion.json'))).equals(before.ingestion), `${label}: ingestion restored`);
    assert.ok((await readFile(join(root, 'public/data.json'))).equals(before.publicData), `${label}: public projection restored`);
    assert.ok((await readFile(join(root, 'data/authority/x.json'))).equals(before.author), `${label}: authority restored`);
    assert.ok((await readFile(join(root, 'data/source-snapshots/blobs/old.json'))).equals(before.blob), `${label}: referenced source bytes unchanged`);
    await assert.rejects(readFile(join(root, 'docs/DATA-CHANGELOG.md')), /ENOENT/, `${label}: no changelog entry for a failed refresh`);
  }
  const receipts = (await readdir(audit2)).filter((name) => name.startsWith('refresh-failure-'));
  assert.ok(receipts.length >= 5, 'each failed refresh leaves its receipt in the private audit directory');
  console.log('Automation regression checks passed: canonical manifest, adverse fixtures, deployment gate, content-addressed storage, real BFCL adapter failures and refresh transaction.');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
