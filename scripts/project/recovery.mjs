import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_SHA, BASELINES, sha256 } from './policy.mjs';

const ROOT = 'evidence/local/recovery';
const PRESERVED = '../../preservation/concurrency-opus-20261001/axionbench-drained-native-boundary-20261001';
const json = async path => JSON.parse(await readFile(path));
export function archiveCommit(bytes) {
  // Git consumes only the first two tar blocks and closes stdin. Sending the
  // entire preserved archive can race that close and produce EPIPE.
  return execFileSync('git', ['get-tar-commit-id'], { input: bytes.subarray(0, 1024), encoding: 'utf8' }).trim();
}
export async function checkRows(directory, files) {
  assert(Array.isArray(files) && files.length, 'missing recovery hashes');
  for (const file of files) {
    assert(!file.path.startsWith('/') && !file.path.split('/').some(part => !part || ['.', '..'].includes(part)), 'unsafe archive path');
    if (file.deleted) continue;
    const path = `${directory}/${file.path}`;
    assert((await lstat(path)).isFile(), 'recovery file is not regular');
    const bytes = await readFile(path);
    assert.equal(bytes.length, file.bytes, `${path}: byte count mismatch`);
    assert.equal(sha256(bytes), file.sha256, `${path}: recovery digest mismatch`);
  }
}
export async function verifyRecovery() {
  const manifest = await json(`${ROOT}/manifest.json`);
  assert.equal(manifest.runId, 'run_a898861f6684');
  assert.equal(manifest.baseCommit, BASELINES.private);
  assert.equal(manifest.status, 'failed'); assert.equal(manifest.nativeExitCode, 1);
  assert.equal(manifest.passedPrivateGates, 21); assert.equal(manifest.failedAddedGate, 'verify:public');
  assert.equal(manifest.archiveSha256, ARCHIVE_SHA);
  assert.equal(sha256(await readFile(`${ROOT}/private-boundary-source-and-receipts.tar.gz`)), ARCHIVE_SHA);
  assert.equal(sha256(await readFile(`${ROOT}/tracked.patch`)), manifest.trackedPatchSha256);
  await checkRows(`${ROOT}/boundary`, manifest.sourceManifest);
  assert.equal(manifest.sourceManifest.length, 526);
  const receipt = await json(`${ROOT}/recovery.json`);
  assert.deepEqual(receipt.baselines, BASELINES);
  assert.equal(receipt.archiveSha256, ARCHIVE_SHA);
  assert.equal(sha256(await readFile(`${ROOT}/private-baseline.tar`)), receipt.privateBaselineSha256);
  const privateCommit = archiveCommit(await readFile(`${ROOT}/private-baseline.tar`));
  assert.equal(privateCommit, BASELINES.private, 'private recovery archive baseline mismatch');
  const publicManifest = await json(`${ROOT}/public-draft/manifest.json`);
  assert.equal(publicManifest.baseline, BASELINES.public);
  assert.equal(sha256(await readFile(`${ROOT}/public-draft/manifest.json`)), receipt.publicDraftManifestSha256);
  assert.deepEqual(publicManifest.gitMetadataBefore, publicManifest.gitMetadataAfter, 'public Git metadata changed');
  await checkRows(`${ROOT}/public-draft`, publicManifest.artifacts);
  const publicCommit = archiveCommit(await readFile(`${ROOT}/public-draft/baseline.tar`));
  assert.equal(publicCommit, BASELINES.public, 'public recovery archive baseline mismatch');
  // Validate every preserved draft byte inside the hashed tar as well.
  execFileSync('python3', ['-c', `import tarfile,json,hashlib
m=json.load(open('${ROOT}/public-draft/manifest.json'))
with tarfile.open('${ROOT}/public-draft/files.tar.gz') as t:
 rows=[r for r in m['files'] if not r.get('deleted')]
 assert set(t.getnames())=={r['path'] for r in rows}
 for r in rows:
  member=t.getmember(r['path']); assert member.isfile() and member.mode==r['mode']
  b=t.extractfile(member).read(); assert len(b)==r['bytes'] and hashlib.sha256(b).hexdigest()==r['sha256']
`]);
  await checkRows('.', receipt.recoveredSource);
  const repair = await json(`${ROOT}/boundary-repair.json`);
  assert.equal(repair.exitCode, 0, 'boundary repair failed');
  assert.equal(repair.checks, 16, 'boundary regression coverage lost');
  assert.equal(sha256(await readFile(`${ROOT}/boundary-repair.log`)), repair.logSha256);
  assert.equal(sha256(await readFile(`${ROOT}/repaired-boundary-candidate/test-results/public-boundary.json`)), repair.reportSha256);
  const boundaryReport = await json(`${ROOT}/repaired-boundary-candidate/test-results/public-boundary.json`);
  assert.equal(boundaryReport.passed, true); assert.equal(boundaryReport.checks.length, 16);
  await checkRows('.', repair.source);
  for (const row of repair.source) assert((await readFile(row.path)).equals(await readFile(`${ROOT}/repaired-boundary-candidate/${row.path}`)), 'repair candidate differs from current source');
  const native = await json(`${ROOT}/boundary/test-results/release-verify.json`);
  assert.equal(native.passed, false);
  assert.equal(native.results.filter(row => row.exitCode === 0).length, 21);
  assert.deepEqual(native.results.filter(row => row.exitCode !== 0).map(row => [row.script, row.exitCode]), [['verify:public', 1]]);
  const log = await readFile(`${ROOT}/boundary/test-results/public-candidate-2026-10-01T19-36-50-844Z/portable-gates.log`, 'utf8');
  assert(log.includes('EROFS: read-only file system, mkdtemp') && log.includes('/tmp/axionbench-public-tests-'), 'exact negative receipt missing');
  const gates = await readFile('scripts/release/verify-release.mjs', 'utf8');
  const original = execFileSync('git', ['show', `${BASELINES.private}:scripts/release/verify-release.mjs`], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  for (const [, gate] of original.matchAll(/^  \['([^']+)',/gm)) assert(gates.includes(`['${gate}',`), `private release gate lost: ${gate}`);
  assert.equal(JSON.parse(await readFile('package.json')).packageManager, 'npm@11.19.0');
  const lock = execFileSync('git', ['show', `${BASELINES.private}:package-lock.json`]);
  assert((await readFile('package-lock.json')).equals(lock), 'lockfile changed during recovery');
  return { archiveFiles: manifest.sourceManifest.length, publicDraftFiles: publicManifest.files.length };
}
export async function bindRecoveredSource() {
  const manifest = await json(`${ROOT}/manifest.json`);
  const paths = [];
  for (const row of manifest.sourceManifest) if (row.path.startsWith('scripts/public/') || row.path.startsWith('scripts/public-content/') || ['scripts/public-snapshot.mjs', 'scripts/verify-public.mjs', 'scripts/pricing/verify-private-capture.mjs'].includes(row.path)) {
    paths.push({ path: row.path, archivedSha256: row.sha256, bytes: (await readFile(row.path)).length, sha256: sha256(await readFile(row.path)) });
  }
  return paths;
}
export async function recover() {
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  for (const path of ['manifest.json', 'tracked.patch', 'private-boundary-source-and-receipts.tar.gz']) await copyFile(`${PRESERVED}/${path}`, `${ROOT}/${path}`);
  assert.equal(sha256(await readFile(`${ROOT}/private-boundary-source-and-receipts.tar.gz`)), ARCHIVE_SHA);
  const manifest = await json(`${ROOT}/manifest.json`);
  assert.equal(manifest.baseCommit, BASELINES.private);
  const baseline = execFileSync('git', ['archive', '--format=tar', BASELINES.private], { maxBuffer: 128 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  await writeFile(`${ROOT}/private-baseline.tar`, baseline, { mode: 0o600 });
  // Extraction refuses symlinks, traversal, unexpected members or mismatched
  // manifest bytes; never inspects the drained worker's live worktree.
  execFileSync('python3', ['-c', `import tarfile,json,pathlib,hashlib
root=pathlib.Path('${ROOT}'); m=json.loads((root/'manifest.json').read_text())
with tarfile.open(root/'private-boundary-source-and-receipts.tar.gz') as t:
 assert set(t.getnames())=={r['path'] for r in m['sourceManifest']}
 for member in t.getmembers():
  assert member.isfile() and not pathlib.PurePosixPath(member.name).is_absolute() and '..' not in pathlib.PurePosixPath(member.name).parts
 t.extractall(root/'boundary',filter='data')
for r in m['sourceManifest']:
 b=(root/'boundary'/r['path']).read_bytes(); assert len(b)==r['bytes'] and hashlib.sha256(b).hexdigest()==r['sha256']
`]);
  execFileSync('python3', ['scripts/project/preserve-public.py'], { stdio: 'inherit' });
  const paths = await bindRecoveredSource();
  const receipt = { schemaVersion: 1, at: new Date().toISOString(), baselines: BASELINES, archiveSha256: ARCHIVE_SHA,
    privateBaselineSha256: sha256(baseline), publicDraftManifestSha256: sha256(await readFile(`${ROOT}/public-draft/manifest.json`)),
    recoveredSource: paths, deliveredCommit: 'unavailable: daemon reports failed uncommitted worker; recovery uses supplied immutable archive/content hashes',
    failure: '21 private gates passed; verify:public failed exit 1 because hard-coded Linux /tmp was read-only (EROFS)',
    repair: 'test fixtures use runtime TMPDIR; original .git and symlink external-audit assertions retained',
    adoptedUI: false, nativePassClaimed: false, publicationClaimed: false };
  await writeFile(`${ROOT}/recovery.json`, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log('Recovery preserved. Run the repaired boundary candidate and save its real receipt before --verify.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--recover')) {
      // Recovery is dependent on admission; fail before touching artifacts.
      const { validateAdmission } = await import('./preflight.mjs');
      const evidence = await json('evidence/local/preflight/admission.json');
      validateAdmission(evidence, { currentSessionId: evidence.currentSessionId });
      await recover();
    } else if (process.argv.includes('--verify')) console.log(await verifyRecovery());
    else throw new Error('usage: node scripts/project/recovery.mjs --recover | --verify');
  } catch (error) { console.error(`Recovery FAILED: ${error.message}`); process.exitCode = 1; }
}
