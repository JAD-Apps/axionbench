// Publication CLI. State must live outside the repository; credentials come
// from CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment
// (local secret storage or runner injection) and are never printed.
//
//   daily     --state-dir S --audit-dir A [--key YYYY-MM-DD.rN]
//             clean-code check -> npm run data:refresh -> build:release -> publish;
//             local data files return to their last-good bytes on failure
//   run       --state-dir S [--key K] [--no-build] [--dry-run]   publish the current tree
//   candidate --state-dir S [--dist dist] [--key K]              stage + qualify, no network
//   verify    --state-dir S [--offline]                          read-only verifier
//   rollback  --state-dir S --to previous|<deployment id>|<key>  explicit rollback
//   status    --state-dir S                                      print last-success.json
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outsideRepository } from '../public/boundary.mjs';
import { createPagesClient, loadCredentials } from './pages-api.mjs';
import { assertFreshKey, defaultKey, loadRetainedSnapshot, publishSnapshot, qualifySnapshot, readLastSuccess, rollbackPublication, stageSnapshot, verifyPublished, verifySnapshot } from './publication.mjs';
import { sourceIdentity } from './source-identity.mjs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export async function loadConfig(root) {
  const config = JSON.parse(await readFile(join(root, 'deploy.config.json'), 'utf8'));
  assert.equal(config.provider, 'cloudflare-pages');
  assert.match(config.hostname, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'deploy.config.json hostname');
  assert.match(config.repo, /^[\w.-]+\/[\w.-]+$/, 'deploy.config.json repo');
  // In the private repository the immutable owner approval must agree.
  const approval = await readFile(join(root, 'docs/owner-approval.json'), 'utf8').then(JSON.parse, (error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (approval) { assert.equal(approval.status, 'approved'); assert.equal(config.hostname, approval.hostname); assert.equal(config.repo, approval.repo); }
  return config;
}

// Local last-good for the refresh outputs the daily command may change.
const OVERLAY_ROOTS = [['data', /\.json$/], ['data/authority', /\.json$/], ['public', /^data(?:-details|-manifest)?\.json$/], ['.', /^PUBLIC-SOURCE-MANIFEST\.json$/], ['docs', /^DATA-CHANGELOG\.md$/]];
export async function captureOverlay(root) {
  const files = new Map();
  for (const [dir, pattern] of OVERLAY_ROOTS) {
    let entries = [];
    try { entries = await readdir(join(root, dir), { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const entry of entries) if (entry.isFile() && pattern.test(entry.name)) {
      const path = dir === '.' ? entry.name : `${dir}/${entry.name}`;
      files.set(path, await readFile(join(root, path)));
    }
  }
  return files;
}
export async function restoreOverlay(root, files) {
  for (const [path, bytes] of files) {
    const temporary = join(root, `${path}.${process.pid}.restore`);
    await writeFile(temporary, bytes);
    await rename(temporary, join(root, path));
  }
  const now = await captureOverlay(root);
  return [...now.keys()].filter((path) => !files.has(path)); // reported, never deleted silently
}

function run(command, args, root) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  return result.status;
}

// Builds (unless told not to), stages and publishes the current tree.
export async function publishBuilt({ root, stateDir, key, snapshotSha256 = null, build = true, dryRun = false, env = process.env, now = () => new Date() }) {
  const config = await loadConfig(root);
  let snapshot;
  if(snapshotSha256) {
    snapshot=await loadRetainedSnapshot(stateDir,snapshotSha256);
    if(key) assert.equal(key,snapshot.key,'requested key differs from reviewed snapshot');
    key=snapshot.key;
    const code=await sourceIdentity(root);
    assert.equal(code.sourceCommit,snapshot.sourceCommit,'checkout code differs from reviewed snapshot');
    assert.equal(code.codeDirty,false,'checkout code differs from sealed source');
  } else key??=defaultKey(now());
  assertFreshKey(key, now());
  if (build && !snapshot) assert.equal(run(npm, ['run', 'build:release'], root), 0, 'build:release failed; nothing was published');
  snapshot ??= await stageSnapshot({ distDir: join(root, config.outputDirectory), stateDir, key, now });
  if (dryRun) {
    const qualified = await qualifySnapshot(snapshot, { stateDir });
    return { ok: true, status: 'dry-run-qualified', key, snapshotSha256: snapshot.snapshotSha256, revisionSha256: snapshot.revisionSha256, ...qualified };
  }
  const client = createPagesClient({ ...loadCredentials(env), projectName: config.projectName });
  return publishSnapshot({ stateDir, snapshot, key, client, config, now });
}

export async function runDaily({ root, stateDir, auditDir, key, env = process.env, now = () => new Date() }) {
  assertFreshKey(key, now());
  const before = await sourceIdentity(root);
  assert.equal(before.codeDirty, false, 'daily publication needs a clean code checkout; commit or remove changed code files first');
  const lastGood = await captureOverlay(root);
  if (run(npm, ['run', 'data:refresh', '--', '--audit-dir', auditDir], root) !== 0) {
    return { ok: false, status: 'failed-refresh', key, message: 'data:refresh failed and restored its own last-good data; nothing was published' };
  }
  let result;
  try { result = await publishBuilt({ root, stateDir, key, env, now }); }
  catch (error) { result = { ok: false, status: 'failed-before-start', key, message: error.message }; }
  if (!result.ok) result.localDataRestored = { files: lastGood.size, unexpectedNewFiles: await restoreOverlay(root, lastGood) };
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
  const flag = (name) => args.includes(name);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const suppliedState = option('--state-dir') ?? process.env.AXIONBENCH_PUBLICATION_STATE;
  assert.ok(suppliedState, 'usage: publish.mjs <daily|run|candidate|verify|rollback|status> --state-dir <directory outside the repository> ...');
  const stateDir = await outsideRepository(root, suppliedState);
  const key = option('--key') ?? defaultKey();
  let result;
  if (command === 'daily') {
    const suppliedAudit = option('--audit-dir') ?? process.env.AXIONBENCH_AUDIT_DIR;
    assert.ok(suppliedAudit, 'daily needs --audit-dir <private directory outside the repository>');
    result = await runDaily({ root, stateDir, auditDir: await outsideRepository(root, suppliedAudit), key });
  } else if (command === 'run') {
    result = await publishBuilt({ root, stateDir, key:option('--snapshot')?(option('--key')??null):key, snapshotSha256:option('--snapshot'), build: !flag('--no-build'), dryRun: flag('--dry-run') });
  } else if (command === 'candidate') {
    const snapshot = await stageSnapshot({ distDir: option('--dist') ?? join(root, 'dist'), stateDir, key, requirePublishable: false });
    result = { ok: true, status: 'candidate-qualified', key, snapshotSha256: snapshot.snapshotSha256, revisionSha256: snapshot.revisionSha256,
      ...(await qualifySnapshot(snapshot, { stateDir, requirePublishable: false })) };
    if (!result.publishable) result.note = 'integrity checks passed; this candidate contains changed code or no commit identity and would be refused by publication';
  } else if (command === 'verify') {
    const config = await loadConfig(root);
    if (flag('--offline')) {
      const ledger = await readLastSuccess(stateDir);
      assert.ok(ledger, 'no publication has been recorded in this state directory');
      await verifySnapshot(stateDir, ledger.current.snapshotSha256);
      if (ledger.previous) await verifySnapshot(stateDir, ledger.previous.snapshotSha256);
      result = { ok: true, status: 'offline-verified', key: ledger.current.key, deploymentId: ledger.current.deploymentId, previous: ledger.previous?.key ?? null };
    } else {
      const client = createPagesClient({ ...loadCredentials(), projectName: config.projectName });
      result = { ok: true, status: 'verified', ...(await verifyPublished({ stateDir, config, client })) };
    }
  } else if (command === 'rollback') {
    assert.ok(option('--to'), 'rollback needs --to previous|<deployment id>|<key>');
    const config = await loadConfig(root);
    result = await rollbackPublication({ stateDir, to: option('--to'), client: createPagesClient({ ...loadCredentials(), projectName: config.projectName }), config });
  } else if (command === 'status') {
    result = { ok: true, status: 'status', lastSuccess: await readLastSuccess(stateDir) };
  } else throw new Error(`unknown command ${command}`);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
