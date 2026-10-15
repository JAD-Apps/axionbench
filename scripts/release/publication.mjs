// Daily publication transaction for the static site on Cloudflare Pages.
//
//   candidate dist -> immutable snapshot -> qualification -> authenticated asset
//   upload -> one production deployment -> deployment status -> HTTPS hash
//   readback of the approved hostname -> durable last-success record
//
// State lives in a directory outside the repository (--state-dir):
//   snapshots/<snapshotSha256>/   immutable candidate trees (last 7 successes kept)
//   snapshots/<snapshotSha256>.json descriptor
//   transactions/<key>.json       journal for one date/revision key
//   receipts/<time>-<sha12>.json  immutable outcome receipts
//   last-success.json             current + previous verified deployment
// A failure before the deployment exists leaves production untouched. A failure
// after it may exist rolls production back to the recorded last-good
// deployment and verifies that rollback by HTTPS readback. last-success.json
// changes only after a verified readback.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmod, cp, lstat, mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { findSecrets } from '../automation/secrets.mjs';
import { verifyDeployment } from './deployment-gate.mjs';
import { acquireGateLock } from './gate-lock.mjs';
import { CONTROL_FILES, MANIFEST_NAME, buildManifest, compareWithBuild, scanDist, sha256, validateManifest } from './manifest.mjs';
import { checkRouteFiles } from './production-check.mjs';
import { requirePublicationApproval } from './approval.mjs';
import { publishableSource } from './source-identity.mjs';

const MiB = 1024 * 1024;
export const LIMITS = Object.freeze({
  maxFiles: 2000, // Pages allows 20,000; this site has ~30
  maxFileBytes: 25 * MiB, // Pages per-asset limit
  maxTotalBytes: 128 * MiB,
  maxControlBytes: 64 * 1024,
  maxBatchFiles: 500,
  maxBatchBase64Bytes: 40 * MiB, // Wrangler's upload bucket size
  maxHashesPerCall: 1000,
  maxCreateAttempts: 2,
  reconcileAttempts: 4,
  statusAttempts: 20,
  readbackAttempts: 6,
  pollDelayMs: 5_000,
  maxRunsPerKey: 3,
  maxKeyAgeDays: 3,
});
export const RETAIN_SUCCESSES = 7;
export const PUBLICATION_FILE = 'publication.json';
export const PUBLICATION_SCHEMA = 'axionbench-publication-v1';
export const SNAPSHOT_FORMAT = 'axionbench-snapshot-v1';
export const LEDGER_SCHEMA = 'axionbench-publication-ledger-v1';
export const TRANSACTION_SCHEMA = 'axionbench-publication-transaction-v1';
export const RECEIPT_SCHEMA = 'axionbench-publication-receipt-v1';
const IN_FLIGHT = new Set(['prepared', 'uploaded', 'deploying', 'deployed']);
const HEX64 = /^[a-f0-9]{64}$/;

// ---------- keys ----------
// A key names one data revision of one UTC day: YYYY-MM-DD.rN (N = 1..9999).
export function parseKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})\.r([1-9]\d{0,3})$/.exec(String(key));
  assert.ok(match, `publication key must be YYYY-MM-DD.rN, got ${JSON.stringify(key)}`);
  const [, y, m, d, r] = match;
  const date = new Date(Date.UTC(+y, +m - 1, +d));
  assert.equal(date.toISOString().slice(0, 10), `${y}-${m}-${d}`, `publication key has an invalid date: ${key}`);
  return { key, date: `${y}-${m}-${d}`, revision: Number(r), time: date.getTime() };
}
export function compareKeys(a, b) {
  const x = parseKey(a), y = parseKey(b);
  return x.date === y.date ? x.revision - y.revision : x.date < y.date ? -1 : 1;
}
export function assertFreshKey(key, now = new Date(), maxAgeDays = LIMITS.maxKeyAgeDays) {
  const { time } = parseKey(key);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  assert.ok(time <= today, `publication key ${key} is in the future`);
  assert.ok(today - time <= maxAgeDays * 86_400_000, `publication key ${key} is more than ${maxAgeDays} days old`);
}
export const defaultKey = (now = new Date()) => `${now.toISOString().slice(0, 10)}.r1`;

// ---------- limits and assets ----------
export function checkLimits(manifest, limits = LIMITS) {
  assert.ok(manifest.files.length + 1 <= limits.maxFiles, `release has ${manifest.files.length + 1} files, over the ${limits.maxFiles}-file limit`);
  let total = 0;
  for (const file of manifest.files) {
    assert.ok(file.bytes <= limits.maxFileBytes, `${file.path} is ${file.bytes} bytes, over the ${limits.maxFileBytes}-byte file limit`);
    total += file.bytes;
  }
  assert.ok(total <= limits.maxTotalBytes, `release is ${total} bytes, over the ${limits.maxTotalBytes}-byte limit`);
  const control = manifest.controlFiles.reduce((sum, file) => sum + file.bytes, 0);
  assert.ok(control <= limits.maxControlBytes, `control files are ${control} bytes, over ${limits.maxControlBytes}`);
  return { files: manifest.files.length, bytes: total, controlBytes: control };
}
// Asset keys are 32 hex characters derived from the content and extension.
// Wrangler derives them with BLAKE3; Node has no BLAKE3, so this uses SHA-256
// over the same input. Keys only need to be stable per content.
export const assetKey = (path, bytes) => sha256(Buffer.from(bytes.toString('base64') + extname(path).slice(1))).slice(0, 32);
const TYPES = { html: 'text/html', js: 'application/javascript', mjs: 'application/javascript', css: 'text/css', json: 'application/json', map: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', ttf: 'font/ttf', woff: 'font/woff',
  woff2: 'font/woff2', txt: 'text/plain', xml: 'application/xml', webmanifest: 'application/manifest+json' };
export const contentType = (path) => TYPES[extname(path).slice(1).toLowerCase()] ?? 'application/octet-stream';

// ---------- durable files ----------
async function writeDurable(path, bytes, flag = 'w') {
  const handle = await open(path, flag, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
export async function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeDurable(temporary, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
  await rename(temporary, path);
}
const readJsonOrNull = async (path) => {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const paths = (stateDir) => ({
  snapshots: join(stateDir, 'snapshots'), transactions: join(stateDir, 'transactions'), receipts: join(stateDir, 'receipts'),
  lastSuccess: join(stateDir, 'last-success.json'), lock: join(stateDir, '.publish.lock'), staging: join(stateDir, 'staging'),
});
export async function ensureState(stateDir) {
  for (const dir of Object.values(paths(stateDir)).filter((p) => !p.endsWith('.json') && !p.endsWith('.lock'))) await mkdir(dir, { recursive: true, mode: 0o700 });
}

// Receipts are immutable, content-addressed and checked for credential shapes.
export async function writeReceipt(stateDir, receipt) {
  const body = { schemaVersion: RECEIPT_SCHEMA, ...receipt };
  let text = `${JSON.stringify(body, null, 2)}\n`;
  if (findSecrets(text).length) { body.message = '[redacted: credential-shaped text in message]'; text = `${JSON.stringify(body, null, 2)}\n`; }
  assert.deepEqual(findSecrets(text), [], 'receipt still contains credential-shaped text');
  const name = `${body.at.replace(/[:.]/g, '-')}-${sha256(Buffer.from(text)).slice(0, 12)}.json`;
  await writeDurable(join(paths(stateDir).receipts, name), Buffer.from(text), 'wx');
  return name;
}

// ---------- ledger ----------
function validateEntry(entry, label) {
  assert.ok(entry && typeof entry === 'object', `${label} entry missing`);
  parseKey(entry.key);
  for (const field of ['snapshotSha256', 'revisionSha256', 'productSha256', 'dataSha256', 'controlSha256']) assert.match(entry[field], HEX64, `${label}.${field}`);
  assert.ok(typeof entry.deploymentId === 'string' && entry.deploymentId.length > 0, `${label}.deploymentId`);
  assert.match(entry.sourceCommit, /^[a-f0-9]{40}$/, `${label}.sourceCommit`);
  assert.ok(Number.isFinite(Date.parse(entry.verifiedAt)), `${label}.verifiedAt`);
}
export async function readLastSuccess(stateDir) {
  const ledger = await readJsonOrNull(paths(stateDir).lastSuccess);
  if (!ledger) return null;
  assert.equal(ledger.schemaVersion, LEDGER_SCHEMA, 'unknown last-success schema');
  validateEntry(ledger.current, 'current');
  if (ledger.previous) validateEntry(ledger.previous, 'previous');
  assert.ok(Array.isArray(ledger.history) && ledger.history.length <= RETAIN_SUCCESSES, 'last-success history must be bounded');
  ledger.history.forEach((entry, i) => validateEntry(entry, `history[${i}]`));
  assert.ok(ledger.history.some((entry) => entry.deploymentId === ledger.current.deploymentId), 'current deployment missing from history');
  return ledger;
}
const transactionPath = (stateDir, key) => join(paths(stateDir).transactions, `${parseKey(key).key}.json`);
export const readTransaction = (stateDir, key) => readJsonOrNull(transactionPath(stateDir, key));
async function saveTransaction(stateDir, tx, state, detail, now) {
  tx.state = state;
  tx.events.push({ at: now().toISOString(), state, ...(detail ? { detail: String(detail).slice(0, 500) } : {}) });
  assert.ok(tx.events.length <= 200, 'transaction journal is unbounded');
  await writeJsonAtomic(transactionPath(stateDir, tx.key), tx);
}

// ---------- snapshots ----------
export const revisionIdentity = (manifest) => sha256(Buffer.from(JSON.stringify({
  format: 'axionbench-revision-v1', sourceCommit: manifest.sourceCommit, dataSha256: manifest.dataSha256,
  dataOverlaySha256: manifest.dataOverlay?.overlaySha256 ?? null,
})));
export const snapshotDigest = (manifest, manifestBytes) => sha256(Buffer.from(`${SNAPSHOT_FORMAT}\n${manifest.productSha256}\n${manifest.controlSha256}\n${sha256(manifestBytes)}\n`));

async function makeReadOnly(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await makeReadOnly(path); else await chmod(path, 0o444);
  }
}

// Copies a qualified dist into an immutable snapshot with publication.json
// (the refresh key and dates the site displays) and a re-derived manifest.
export async function stageSnapshot({ distDir, stateDir, key, now = () => new Date(), limits = LIMITS, requirePublishable = true }) {
  const { date } = parseKey(key);
  await ensureState(stateDir);
  const manifest = validateManifest(JSON.parse(await readFile(join(distDir, MANIFEST_NAME), 'utf8')));
  compareWithBuild(manifest, await scanDist(distDir));
  if (requirePublishable) assert.ok(publishableSource(manifest), 'refusing to publish: the build contains changed code files (or no commit identity); only a clean commit with a validated data overlay can be published');
  checkLimits(manifest, limits);
  const dataManifest = JSON.parse(await readFile(join(distDir, 'data-manifest.json'), 'utf8'));
  const staging = join(paths(stateDir).staging, `${process.pid}-${randomBytes(6).toString('hex')}`);
  await cp(distDir, staging, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
  await rm(join(staging, MANIFEST_NAME));
  try {
    const revisionSha256 = revisionIdentity(manifest);
    const publication = {
      schemaVersion: PUBLICATION_SCHEMA, status: 'published', refreshKey: key, refreshDate: date,
      sourcesRetrievedAt: dataManifest.retrievedAt ?? null, validatedAt: now().toISOString(), builtAt: manifest.builtAt,
      codeSourceCommit: manifest.sourceCommit, dataSha256: manifest.dataSha256, dataOverlaySha256: manifest.dataOverlay?.overlaySha256 ?? null,
    };
    await writeFile(join(staging, PUBLICATION_FILE), `${JSON.stringify(publication, null, 2)}\n`);
    const { files, controlFiles, productSha256, controlSha256, fileCount, digestFormat, schemaVersion, publication: _old, ...identity } = manifest;
    const next = await buildManifest(staging, { ...identity, publication: { refreshKey: key, revisionSha256 } });
    validateManifest(next);
    checkLimits(next, limits);
    const manifestBytes = Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
    await writeFile(join(staging, MANIFEST_NAME), manifestBytes);
    const snapshotSha256 = snapshotDigest(next, manifestBytes);
    const dir = join(paths(stateDir).snapshots, snapshotSha256);
    const exists = await lstat(dir).then(() => true, (error) => { if (error.code === 'ENOENT') return false; throw error; });
    if (exists) await rm(staging, { recursive: true, force: true });
    else { await makeReadOnly(staging); await rename(staging, dir); }
    const descriptor = { format: SNAPSHOT_FORMAT, key, snapshotSha256, revisionSha256, productSha256: next.productSha256, controlSha256: next.controlSha256,
      dataSha256: next.dataSha256, sourceCommit: next.sourceCommit, dataOverlaySha256: publication.dataOverlaySha256, builtAt: next.builtAt };
    await writeJsonAtomic(`${dir}.json`, descriptor);
    return { ...descriptor, dir, manifest: await verifySnapshot(stateDir, snapshotSha256) };
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

// Re-verifies a retained snapshot byte for byte before it is used or trusted.
export async function verifySnapshot(stateDir, snapshotSha256) {
  assert.match(snapshotSha256, HEX64, 'snapshot digest');
  const dir = join(paths(stateDir).snapshots, snapshotSha256);
  const manifestBytes = await readFile(join(dir, MANIFEST_NAME));
  const manifest = validateManifest(JSON.parse(manifestBytes));
  compareWithBuild(manifest, await scanDist(dir));
  assert.equal(snapshotDigest(manifest, manifestBytes), snapshotSha256, `snapshot ${snapshotSha256} no longer matches its digest`);
  const publication = JSON.parse(await readFile(join(dir, PUBLICATION_FILE), 'utf8'));
  assert.equal(publication.schemaVersion, PUBLICATION_SCHEMA);
  assert.equal(publication.refreshKey, manifest.publication?.refreshKey, 'publication.json key differs from the manifest binding');
  assert.equal(manifest.publication.revisionSha256, revisionIdentity(manifest), 'snapshot revision identity mismatch');
  return manifest;
}

// Consume the reviewed immutable candidate directly; rebuilding a release
// would change its timestamp and digest even with unchanged source.
export async function loadRetainedSnapshot(stateDir, snapshotSha256) {
  const manifest=await verifySnapshot(stateDir,snapshotSha256);
  return { format:SNAPSHOT_FORMAT,key:manifest.publication.refreshKey,snapshotSha256,
    revisionSha256:manifest.publication.revisionSha256,sourceCommit:manifest.sourceCommit,
    productSha256:manifest.productSha256,dataSha256:manifest.dataSha256,controlSha256:manifest.controlSha256,
    dataOverlaySha256:manifest.dataOverlay?.overlaySha256??null,builtAt:manifest.builtAt,
    dir:join(paths(stateDir).snapshots,snapshotSha256),manifest };
}

// Default qualification of a staged snapshot: integrity, publishability,
// limits, every route file, data manifest binding and credential-free text.
export async function qualifySnapshot(snapshot, { stateDir, limits = LIMITS, requirePublishable = true }) {
  const manifest = await verifySnapshot(stateDir, snapshot.snapshotSha256);
  assert.equal(resolve(snapshot.dir),resolve(paths(stateDir).snapshots,snapshot.snapshotSha256),'snapshot path is not canonical');
  assert.deepEqual(snapshot.manifest,manifest,'snapshot supplied manifest differs from retained bytes');
  for(const field of ['sourceCommit','productSha256','dataSha256','controlSha256']) assert.equal(snapshot[field],manifest[field],`snapshot descriptor ${field} mismatch`);
  assert.equal(snapshot.revisionSha256,manifest.publication.revisionSha256,'snapshot descriptor revision mismatch');
  assert.equal(snapshot.key,manifest.publication.refreshKey,'snapshot descriptor key mismatch');
  if (requirePublishable) assert.ok(publishableSource(manifest), 'snapshot source is not publishable');
  checkLimits(manifest, limits);
  await checkRouteFiles(snapshot.dir);
  const dataManifest = JSON.parse(await readFile(join(snapshot.dir, 'data-manifest.json'), 'utf8'));
  assert.equal(dataManifest.projection?.sha256, manifest.dataSha256, 'data-manifest.json does not bind the published data.json');
  for (const file of manifest.files) {
    if (/\.(png|jpe?g|webp|ico|ttf|woff2?)$/.test(file.path)) continue;
    assert.deepEqual(findSecrets(await readFile(join(snapshot.dir, file.path), 'utf8')), [], `credential-shaped text in ${file.path}`);
  }
  return { files: manifest.files.length + 1, productSha256: manifest.productSha256, publishable: publishableSource(manifest) };
}

// ---------- remote steps ----------
export function checkProject(project, config) {
  assert.equal(project?.name, config.projectName, `Cloudflare returned project ${project?.name}, not the approved ${config.projectName}`);
  assert.ok(!(config.forbiddenProjects ?? []).includes(project.name), 'forbidden Pages project');
  assert.equal(project.production_branch, config.productionBranch, `project production branch is ${project.production_branch}, expected ${config.productionBranch}`);
  assert.ok((project.domains ?? []).includes(config.hostname), `approved hostname ${config.hostname} is not attached to Pages project ${config.projectName}`);
}

async function uploadAssets(client, snapshot, limits) {
  const entries = [];
  for (const file of [...snapshot.manifest.files, { path: MANIFEST_NAME }]) {
    const bytes = await readFile(join(snapshot.dir, file.path));
    if (file.sha256) assert.equal(sha256(bytes), file.sha256, `snapshot file ${file.path} changed before upload`);
    entries.push({ path: file.path, key: assetKey(file.path, bytes), bytes });
  }
  const keys = [...new Set(entries.map((entry) => entry.key))];
  const jwt = await client.getUploadToken();
  const missing = new Set();
  for (let i = 0; i < keys.length; i += limits.maxHashesPerCall) {
    const chunk = keys.slice(i, i + limits.maxHashesPerCall);
    const result = await client.checkMissing(jwt, chunk);
    assert.ok(Array.isArray(result) && result.every((key) => chunk.includes(key)), 'asset check returned keys that were not requested');
    for (const key of result) missing.add(key);
  }
  const pending = [...new Map(entries.filter((entry) => missing.has(entry.key)).map((entry) => [entry.key, entry])).values()];
  let batch = [], size = 0, uploaded = 0;
  const flush = async () => {
    if (!batch.length) return;
    await client.upload(jwt, batch);
    uploaded += batch.length; batch = []; size = 0;
  };
  for (const entry of pending) {
    const value = entry.bytes.toString('base64');
    if (batch.length && (batch.length >= limits.maxBatchFiles || size + value.length > limits.maxBatchBase64Bytes)) await flush();
    batch.push({ key: entry.key, value, metadata: { contentType: contentType(entry.path) }, base64: true });
    size += value.length;
  }
  await flush();
  for (let i = 0; i < keys.length; i += limits.maxHashesPerCall) await client.upsertHashes(jwt, keys.slice(i, i + limits.maxHashesPerCall));
  return { assetManifest: Object.fromEntries(entries.map((entry) => [`/${entry.path}`, entry.key])), uploaded, reused: keys.length - pending.length };
}

const commitMessageFor = (key, snapshotSha256) => `axionbench data ${key} snapshot ${snapshotSha256}`;
const triggerMessage = (deployment) => deployment?.deployment_trigger?.metadata?.commit_message;

async function findDeployment(client, commitMessage, limits, sleep) {
  for (let attempt = 1; attempt <= limits.reconcileAttempts; attempt += 1) {
    const listing = await client.listDeployments({ env: 'production', perPage: 25 });
    assert.ok(Array.isArray(listing), 'deployment listing is not an array');
    const matches = listing.filter((deployment) => triggerMessage(deployment) === commitMessage);
    assert.ok(matches.length <= 1, `more than one deployment carries ${commitMessage}`);
    if (matches.length) return matches[0];
    if (attempt < limits.reconcileAttempts) await sleep(limits.pollDelayMs);
  }
  return null;
}

async function awaitDeployment(client, id, { config, commitMessage, limits, sleep }) {
  for (let attempt = 1; attempt <= limits.statusAttempts; attempt += 1) {
    const deployment = await client.getDeployment(id);
    assert.equal(deployment.id, id, 'deployment lookup returned another deployment');
    assert.equal(deployment.project_name, config.projectName, 'deployment belongs to another project');
    assert.equal(deployment.environment, 'production', 'deployment is not a production deployment');
    if (commitMessage) assert.equal(triggerMessage(deployment), commitMessage, 'deployment metadata does not name this snapshot');
    const stage = deployment.latest_stage ?? {};
    if (stage.status === 'failure' || stage.status === 'canceled') throw new Error(`deployment ${id} ${stage.status} at stage ${stage.name}`);
    if (stage.name === 'deploy' && stage.status === 'success') return deployment;
    if (attempt < limits.statusAttempts) await sleep(limits.pollDelayMs);
  }
  throw new Error(`deployment ${id} did not finish within ${limits.statusAttempts} status checks`);
}

const recordFor = (entry, config, deployment) => ({
  url: `https://${config.hostname}`, repo: config.repo, provider: config.provider, projectId: deployment?.project_id ?? config.projectName,
  deploymentId: entry.deploymentId, sourceCommit: entry.sourceCommit, productSha256: entry.productSha256, controlSha256: entry.controlSha256,
  dataSha256: entry.dataSha256, publishedAt: entry.publishedAt ?? deployment?.created_on ?? entry.verifiedAt,
});

async function readback({ entry, config, deployment, stateDir, fetcher, verify, limits, sleep }) {
  let last;
  for (let attempt = 1; attempt <= limits.readbackAttempts; attempt += 1) {
    try {
      await verify({ approval: { hostname: config.hostname, repo: config.repo }, deployment: recordFor(entry, config, deployment), distDir: join(paths(stateDir).snapshots, entry.snapshotSha256), fetcher });
      return attempt;
    } catch (error) {
      last = error;
      if (attempt < limits.readbackAttempts) await sleep(limits.pollDelayMs);
    }
  }
  throw new Error(`HTTPS readback failed after ${limits.readbackAttempts} attempts: ${last.message}`);
}

async function pruneSnapshots(stateDir, ledger) {
  const keep = new Set(ledger.history.map((entry) => entry.snapshotSha256));
  for (const name of await readdir(paths(stateDir).transactions)) {
    const tx = await readJsonOrNull(join(paths(stateDir).transactions, name));
    if (tx && IN_FLIGHT.has(tx.state)) keep.add(tx.snapshotSha256);
  }
  const removed = [];
  for (const entry of await readdir(paths(stateDir).snapshots, { withFileTypes: true })) {
    const sha = entry.name.replace(/\.json$/, '');
    if (!HEX64.test(sha) || keep.has(sha)) continue;
    await rm(join(paths(stateDir).snapshots, entry.name), { recursive: true, force: true });
    if (entry.isDirectory()) removed.push(sha);
  }
  return removed;
}

// ---------- transaction ----------
export async function publishSnapshot({
  stateDir, snapshot, key, client, config, fetcher = fetch, now = () => new Date(), sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  limits = LIMITS, verify = verifyDeployment, qualify = qualifySnapshot, authorize = requirePublicationApproval, lock = true,
}) {
  parseKey(key);
  await ensureState(stateDir);
  const unlock = lock ? await acquireGateLock({ path: paths(stateDir).lock, waitMs: 60_000, log: () => {} }) : async () => {};
  const at = () => now().toISOString();
  let tx = null, last = null, deployment = null, mayHaveDeployed = false;
  const finish = async (status, extra = {}) => {
    const receipt = { status, at: at(), key, revisionSha256: tx?.revisionSha256 ?? snapshot.revisionSha256, snapshotSha256: tx?.snapshotSha256 ?? snapshot.snapshotSha256,
      deploymentId: tx?.deploymentId ?? null, lastGood: last ? { key: last.current.key, deploymentId: last.current.deploymentId, snapshotSha256: last.current.snapshotSha256 } : null,
      events: tx?.events ?? [], ...extra };
    receipt.receipt = await writeReceipt(stateDir, receipt);
    return { ok: status === 'published' || status === 'already-published', ...receipt };
  };
  try {
    last = await readLastSuccess(stateDir);
    tx = await readTransaction(stateDir, key);
    if (tx) {
      assert.equal(tx.schemaVersion, TRANSACTION_SCHEMA, 'unknown transaction schema');
      if (tx.revisionSha256 !== snapshot.revisionSha256) {
        const conflict = tx; tx = null;
        return await finish('rejected-key-conflict', { message: `key ${key} already names revision ${conflict.revisionSha256}; this candidate is ${snapshot.revisionSha256}`, existingState: conflict.state });
      }
      if (tx.state === 'published') return await finish('already-published', { message: `key ${key} was already published and verified` });
      if (IN_FLIGHT.has(tx.state)) {
        // Resume the interrupted transaction with its own retained snapshot.
        const retained = await verifySnapshot(stateDir, tx.snapshotSha256);
        snapshot = { ...snapshot, key: tx.key, snapshotSha256: tx.snapshotSha256, dir: join(paths(stateDir).snapshots, tx.snapshotSha256), manifest: retained,
          sourceCommit: retained.sourceCommit, productSha256: retained.productSha256, dataSha256: retained.dataSha256, controlSha256: retained.controlSha256,
          revisionSha256: retained.publication.revisionSha256 };
        await saveTransaction(stateDir, tx, tx.state, 'resuming interrupted transaction', now);
      } else {
        if (tx.runs >= limits.maxRunsPerKey) return await finish('rejected-retry-limit', { message: `key ${key} already ran ${tx.runs} times; use the next revision` });
        Object.assign(tx, { runs: tx.runs + 1, snapshotSha256: snapshot.snapshotSha256, deploymentId: null, createAttempts: 0, commitMessage: commitMessageFor(key, snapshot.snapshotSha256) });
        await saveTransaction(stateDir, tx, 'prepared', 'retry after a definitive failure', now);
      }
    } else {
      if (last) assert.ok(compareKeys(key, last.current.key) > 0, `key ${key} is not newer than the published ${last.current.key}`);
      tx = { schemaVersion: TRANSACTION_SCHEMA, key, revisionSha256: snapshot.revisionSha256, snapshotSha256: snapshot.snapshotSha256, runs: 1,
        commitMessage: commitMessageFor(key, snapshot.snapshotSha256), deploymentId: null, createAttempts: 0, state: null, events: [] };
      await saveTransaction(stateDir, tx, 'prepared', null, now);
    }
    if (!snapshot.manifest) snapshot = { ...snapshot, manifest: await verifySnapshot(stateDir, snapshot.snapshotSha256) };
    if (last) await verifySnapshot(stateDir, last.current.snapshotSha256); // last-good must be restorable before anything changes

    // Qualification and project checks happen before any write to Cloudflare.
    try { await qualify(snapshot, { stateDir, limits }); await authorize(snapshot, { now: now().getTime() }); }
    catch (error) { await saveTransaction(stateDir, tx, 'failed-qualification', error.message, now); return await finish('failed-qualification', { message: error.message }); }
    checkProject(await client.getProject(), config);

    if (tx.state === 'prepared' || tx.state === 'uploaded') {
      let uploaded;
      try { uploaded = await uploadAssets(client, snapshot, limits); }
      catch (error) { await saveTransaction(stateDir, tx, 'failed-before-deploy', `upload: ${error.message}`, now); return await finish('failed-before-deploy', { message: `upload failed; production unchanged: ${error.message}` }); }
      tx.assetManifest = uploaded.assetManifest;
      await saveTransaction(stateDir, tx, 'uploaded', `${uploaded.uploaded} uploaded, ${uploaded.reused} already stored`, now);
    }

    if (tx.state === 'deploying') {
      mayHaveDeployed = true;
      deployment = await findDeployment(client, tx.commitMessage, limits, sleep);
      if (deployment) { tx.deploymentId = deployment.id; await saveTransaction(stateDir, tx, 'deployed', 'reconciled an earlier create', now); }
    }
    while (tx.state === 'uploaded' || tx.state === 'deploying') {
      if (tx.createAttempts >= limits.maxCreateAttempts) throw new Error(`deployment could not be confirmed after ${tx.createAttempts} create attempts`);
      tx.createAttempts += 1;
      await saveTransaction(stateDir, tx, 'deploying', `create attempt ${tx.createAttempts}`, now);
      const controlFiles = {};
      for (const name of CONTROL_FILES) {
        const bytes = await readFile(join(snapshot.dir, name)).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
        if (bytes) controlFiles[name] = bytes;
      }
      try {
        mayHaveDeployed = true;
        deployment = await client.createDeployment({ manifest: tx.assetManifest, branch: config.productionBranch, commitHash: snapshot.manifest.sourceCommit,
          commitMessage: tx.commitMessage, commitDirty: false, controlFiles });
        assert.equal(triggerMessage(deployment), tx.commitMessage, 'created deployment does not carry this snapshot');
      } catch (error) {
        if (!error.ambiguous) {
          if (error.status >= 400 && error.status < 500) { await saveTransaction(stateDir, tx, 'failed-before-deploy', `create refused: ${error.message}`, now); return await finish('failed-before-deploy', { message: `deployment refused; production unchanged: ${error.message}` }); }
          throw error;
        }
        deployment = await findDeployment(client, tx.commitMessage, limits, sleep);
        if (!deployment) { await saveTransaction(stateDir, tx, 'deploying', `ambiguous create not found: ${error.message}`, now); continue; }
      }
      tx.deploymentId = deployment.id;
      await saveTransaction(stateDir, tx, 'deployed', `deployment ${deployment.id}`, now);
    }

    mayHaveDeployed = true;
    deployment = await awaitDeployment(client, tx.deploymentId, { config, commitMessage: tx.commitMessage, limits, sleep });
    const entry = { key, snapshotSha256: tx.snapshotSha256, revisionSha256: tx.revisionSha256, deploymentId: deployment.id, productSha256: snapshot.manifest.productSha256,
      controlSha256: snapshot.manifest.controlSha256, dataSha256: snapshot.manifest.dataSha256, sourceCommit: snapshot.manifest.sourceCommit,
      dataOverlaySha256: snapshot.manifest.dataOverlay?.overlaySha256 ?? null, publishedAt: deployment.created_on ?? at(), verifiedAt: null };
    const attempts = await readback({ entry, config, deployment, stateDir, fetcher, verify, limits, sleep });
    entry.verifiedAt = at();
    const ledger = { schemaVersion: LEDGER_SCHEMA, updatedAt: entry.verifiedAt, current: entry, previous: last?.current ?? null,
      history: [entry, ...(last?.history ?? []).filter((old) => old.deploymentId !== entry.deploymentId)].slice(0, RETAIN_SUCCESSES) };
    await writeJsonAtomic(paths(stateDir).lastSuccess, ledger);
    await saveTransaction(stateDir, tx, 'published', `readback verified after ${attempts} attempt(s)`, now);
    const pruned = await pruneSnapshots(stateDir, ledger);
    return await finish('published', { deploymentId: entry.deploymentId, productSha256: entry.productSha256, dataSha256: entry.dataSha256, prunedSnapshots: pruned.length });
  } catch (error) {
    if (!tx) return await finish('failed-before-start', { message: error.message });
    if (!mayHaveDeployed) {
      await saveTransaction(stateDir, tx, 'failed-before-deploy', error.message, now);
      return await finish('failed-before-deploy', { message: `${error.message}; production unchanged` });
    }
    return await restoreLastGood({ stateDir, tx, last, client, config, fetcher, verify, limits, sleep, now, reason: error.message, finish });
  } finally { await unlock(); }
}

// A deployment may exist and may be serving: return production to the
// recorded last-good deployment and prove it by HTTPS readback.
async function restoreLastGood({ stateDir, tx, last, client, config, fetcher, verify, limits, sleep, now, reason, finish }) {
  if (!last) {
    await saveTransaction(stateDir, tx, 'failed-no-last-good', reason, now);
    return finish('failed-no-last-good', { message: `${reason}; no earlier verified deployment exists to restore` });
  }
  const good = last.current;
  try {
    await verifySnapshot(stateDir, good.snapshotSha256);
    try { await client.rollback(good.deploymentId); }
    catch (error) { if (!error.ambiguous) throw error; } // an ambiguous rollback is settled by readback
    const attempts = await readback({ entry: good, config, deployment: null, stateDir, fetcher, verify, limits, sleep });
    await saveTransaction(stateDir, tx, 'failed-restored', `${reason}; last-good ${good.deploymentId} restored and verified after ${attempts} readback attempt(s)`, now);
    return finish('failed-restored', { message: `${reason}; production restored to ${good.key} (${good.deploymentId}) and verified` });
  } catch (error) {
    await saveTransaction(stateDir, tx, 'failed-restore-unverified', `${reason}; restore failed: ${error.message}`, now);
    return finish('failed-restore-unverified', { message: `${reason}; RESTORE NOT VERIFIED: ${error.message}. Run publish:verify and publish:rollback.` });
  }
}

// ---------- read-only verifier ----------
// Writes nothing: checks the retained snapshot, the provider's production
// deployment and every hosted byte against the last-success record.
export async function verifyPublished({ stateDir, config, client = null, fetcher = fetch, verify = verifyDeployment }) {
  const ledger = await readLastSuccess(stateDir);
  assert.ok(ledger, 'no publication has been recorded in this state directory');
  const entry = ledger.current;
  await verifySnapshot(stateDir, entry.snapshotSha256);
  if (ledger.previous) await verifySnapshot(stateDir, ledger.previous.snapshotSha256);
  let deployment = null;
  if (client) {
    const project = await client.getProject();
    checkProject(project, config);
    assert.equal(project.canonical_deployment?.id, entry.deploymentId, `production serves deployment ${project.canonical_deployment?.id}, not the recorded ${entry.deploymentId}`);
    deployment = await client.getDeployment(entry.deploymentId);
    assert.equal(deployment.project_name, config.projectName);
  }
  await verify({ approval: { hostname: config.hostname, repo: config.repo }, deployment: recordFor(entry, config, deployment), distDir: join(paths(stateDir).snapshots, entry.snapshotSha256), fetcher });
  return { key: entry.key, snapshotSha256: entry.snapshotSha256, revisionSha256: entry.revisionSha256, sourceCommit: entry.sourceCommit, controlSha256: entry.controlSha256, dataOverlaySha256: (await verifySnapshot(stateDir, entry.snapshotSha256)).dataOverlay?.overlaySha256 ?? null, deploymentId: entry.deploymentId, productSha256: entry.productSha256, dataSha256: entry.dataSha256, verifiedAt: entry.verifiedAt, previous: ledger.previous?.key ?? null, providerChecked: Boolean(client) };
}

// ---------- explicit rollback ----------
export async function rollbackPublication({ stateDir, to = 'previous', client, config, fetcher = fetch, now = () => new Date(), sleep, limits = LIMITS, verify = verifyDeployment }) {
  sleep ??= (ms) => new Promise((done) => setTimeout(done, ms));
  await ensureState(stateDir);
  const unlock = await acquireGateLock({ path: paths(stateDir).lock, waitMs: 60_000, log: () => {} });
  try {
    const ledger = await readLastSuccess(stateDir);
    assert.ok(ledger, 'no publication has been recorded; nothing to roll back to');
    const target = to === 'previous' ? ledger.previous : ledger.history.find((entry) => entry.deploymentId === to || entry.key === to);
    assert.ok(target, `rollback target ${to} is not a recorded verified deployment`);
    assert.notEqual(target.deploymentId, ledger.current.deploymentId, 'rollback target is already current');
    await verifySnapshot(stateDir, target.snapshotSha256);
    checkProject(await client.getProject(), config);
    try { await client.rollback(target.deploymentId); } catch (error) { if (!error.ambiguous) throw error; }
    const base = { at: now().toISOString(), key: target.key, deploymentId: target.deploymentId, snapshotSha256: target.snapshotSha256, revisionSha256: target.revisionSha256, from: ledger.current.deploymentId };
    try {
      await readback({ entry: target, config, deployment: null, stateDir, fetcher, verify, limits, sleep });
    } catch (error) {
      const receipt = await writeReceipt(stateDir, { ...base, status: 'rollback-unverified', message: error.message });
      return { ok: false, status: 'rollback-unverified', message: error.message, receipt };
    }
    const current = { ...target, verifiedAt: now().toISOString() };
    await writeJsonAtomic(paths(stateDir).lastSuccess, { schemaVersion: LEDGER_SCHEMA, updatedAt: current.verifiedAt, current, previous: ledger.current,
      history: ledger.history.map((entry) => entry.deploymentId === current.deploymentId ? current : entry) });
    const receipt = await writeReceipt(stateDir, { ...base, status: 'rolled-back' });
    return { ok: true, status: 'rolled-back', key: target.key, deploymentId: target.deploymentId, receipt };
  } finally { await unlock(); }
}
