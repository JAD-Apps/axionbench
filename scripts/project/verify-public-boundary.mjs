// Native preparation -> allowlisted archive -> fresh locked install -> complete
// portable verification. No Git history, installed modules or audit files cross
// the archive boundary. Receipts stay in the private ignored test area.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePublicSnapshot } from '../public-snapshot.mjs';
import { verifyPrivatePublic } from '../verify-public.mjs';
import { PUBLIC_FILES, SOURCE_MANIFEST, validateSource, sha256, jsonBytes } from '../public/boundary.mjs';
import { validateData } from '../public/data.mjs';
import { readReceiptArtifact, verifyCommandEvidence } from './receipts.mjs';
import { validateManifest, scanDist, compareWithBuild } from '../release/manifest.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
export const INSTALL = ['ci', '--include=dev', '--no-audit', '--no-fund'];
export function preparationEnvironment(scratch) {
  const env = {};
  // Same pinned npm ci preparation as native/CI; preserve browser/cache paths,
  // but never inherit injected modules, Git identity or private audit inputs.
  for (const key of ['PATH','HOME','USER','LOGNAME','SHELL','SystemRoot','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA','USERPROFILE','CHROMIUM_PATH','PLAYWRIGHT_BROWSERS_PATH','npm_config_cache']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, { TMPDIR: scratch, TMP: scratch, TEMP: scratch, PYTHONDONTWRITEBYTECODE: '1',
    GIT_CEILING_DIRECTORIES: scratch });
  return env;
}

export function extractPublicArchive(archive, destination, source) {
  // Standard-library extraction validates every member before writing any byte.
  // Parent directories are created by us; directory/symlink/hardlink members,
  // traversal, duplicate paths and extra runtime files are refused.
  execFileSync('python3', ['-c', `import sys,json,tarfile,pathlib,hashlib
a,d,m=sys.argv[1:]; rows=json.loads(m); root=pathlib.Path(d)
assert not root.exists(), 'archive destination must be new'
with tarfile.open(a) as t:
 members=t.getmembers(); assert len(members)==len(rows), 'archive member count'
 assert len({p.name for p in members})==len(members), 'duplicate archive paths'
 assert {p.name for p in members}==set(rows), 'archive allowlist mismatch'
 payloads=[]
 for p in members:
  assert p.isfile() and not p.name.startswith('/') and all(x not in ('','.', '..') for x in p.name.split('/')), 'nonregular or unsafe archive path'
  r=rows[p.name]; assert p.size==r['bytes'], 'archive byte count mismatch'
  b=t.extractfile(p).read(); assert hashlib.sha256(b).hexdigest()==r['sha256'], 'archive hash mismatch'
  payloads.append((p.name,b))
 root.mkdir()
 for p,b in payloads:
  target=root/p; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(b)
`, archive, destination, JSON.stringify(source)], { maxBuffer: 1024 * 1024, stdio: 'pipe' });
}

export async function verifyPublicBoundary() {
  const scratch = join(root, 'test-results', 'public-boundary');
  await mkdir(scratch, { recursive: true });
  const run = await mkdtemp(join(scratch, 'candidate-'));
  const staged = join(run, 'source');
  const candidate = join(run, 'archive');
  const results = [];
  let source = null, archive = null, error = null, release = null;
  async function execute(label, executable, args, cwd, env) {
    const logPath = join(run, `${label}.log`), log = createWriteStream(logPath);
    const started = Date.now();
    const exitCode = await new Promise(resolve => {
      const child = spawn(executable, args, { cwd, env, shell: process.platform === 'win32' && executable === npm });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log.write(bytes); process.stdout.write(bytes); });
      child.once('error', error => { log.write(error.message); resolve(null); });
      child.once('close', code => resolve(code));
    });
    await new Promise(resolve => log.end(resolve));
    const bytes = await readFile(logPath);
    results.push({ command: [executable === npm ? 'npm' : executable === process.execPath ? 'node' : executable, ...args].join(' '),
      exitCode, milliseconds: Date.now() - started, log: `${label}.log`, logBytes: bytes.length, logSha256: sha256(bytes) });
    assert.equal(exitCode, 0, `${label} failed; see ${logPath}`);
  }
  try {
    assert.equal(execFileSync(npm, ['--version'], { encoding: 'utf8' }).trim(), '11.19.0', 'native preparation must use pinned npm');
    source = await preparePublicSnapshot(staged);
    await verifyPrivatePublic(staged);
    const files = [...source.files, { path: SOURCE_MANIFEST, bytes: (await readFile(join(staged, SOURCE_MANIFEST))).length,
      sha256: sha256(await readFile(join(staged, SOURCE_MANIFEST))) }];
    assert.deepEqual(source.files.map(row => row.path).sort(), PUBLIC_FILES.slice().sort());
    const archivePath = join(run, 'public-source.tar');
    execFileSync('tar', ['--format=ustar', '-cf', archivePath, '-C', staged, '--', ...files.map(row => row.path)]);
    const archiveBytes = await readFile(archivePath);
    archive = { path: 'public-source.tar', bytes: archiveBytes.length, sha256: sha256(archiveBytes) };
    extractPublicArchive(archivePath, candidate, Object.fromEntries(files.map(row => [row.path, row])));
    assert.deepEqual(await validateSource(candidate), source);
    await validateData(candidate);
    await assert.rejects(lstat(join(candidate, 'node_modules')), e => e.code === 'ENOENT');
    await assert.rejects(lstat(join(candidate, '.git')), e => e.code === 'ENOENT');
    const env = preparationEnvironment(run);
    await execute('regressions', process.execPath, ['--test', 'tests/project/public-boundary.test.mjs'], root, env);
    await execute('locked-install', npm, INSTALL, candidate, env);
    assert((await lstat(join(candidate, 'node_modules'))).isDirectory(), 'local locked modules required');
    assert((await readFile(join(candidate, 'package-lock.json'))).equals(await readFile(join(root, 'package-lock.json'))), 'preparation changed lockfile');
    await execute('portable-gates', npm, ['run', 'verify:public'], candidate, env);
    const portableBytes = await readFile(join(candidate, 'test-results/public-verify.json'));
    const portableDescriptor = { path: 'test-results/public-verify.json', bytes: portableBytes.length, sha256: sha256(portableBytes) };
    const portable = await readReceiptArtifact(candidate, portableDescriptor);
    await verifyCommandEvidence(candidate, portable, { sourceSha256: source.sourceSha256, commands:
      ['lint','data:validate','test:boundary','typecheck','test:unit','test:scoring','test:pricing','test:weights','build','test:chart-smoke','test:cost-weights','test:acceptance','build:release','release:check'].map(script => `npm run ${script}`) });
    await validateSource(candidate); await validateData(candidate);
    release = validateManifest(JSON.parse(await readFile(join(candidate, 'dist/release-manifest.json'))), { sourceArchiveSha256: source.sourceSha256 });
    compareWithBuild(release, await scanDist(join(candidate, 'dist')));
    assert.equal(portable.productSha256, release.productSha256, 'portable receipt product identity');
    assert.equal(portable.dataSha256, release.dataSha256, 'portable receipt data identity');
    archive.portableReceipt = portableDescriptor;
  } catch (cause) { error = cause.message; }
  const receipt = { schemaVersion: 'axionbench-archive-verification-v1', at: new Date().toISOString(),
    passed: error === null, publicSourceSha256: source?.sourceSha256 ?? null, productSha256: release?.productSha256 ?? null, dataSha256: release?.dataSha256 ?? null, archive, results, error,
    candidatePath: 'archive', privateGatesRetained: 21, independentReview: false, hostedCI: false };
  await writeFile(join(run, 'receipt.json'), jsonBytes(receipt));
  await writeFile(join(root, 'test-results/public-archive-latest.json'), jsonBytes({ path: run.slice(root.length), ...receipt }));
  if (error) throw new Error(`Public archive FAILED: ${error}; receipt ${run}/receipt.json`);
  await verifyCommandEvidence(run, receipt, { sourceSha256: source.sourceSha256, commands: [
    'node --test tests/project/public-boundary.test.mjs', `npm ${INSTALL.join(' ')}`, 'npm run verify:public'] });
  console.log(`Public archive verified: ${source.fileCount} allowlisted files; source ${source.sourceSha256}; receipt ${run}/receipt.json`);
  return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.slice(2).every(arg => arg === '--archive-test') && process.argv.length <= 3, 'usage: node scripts/project/verify-public-boundary.mjs --archive-test');
  try { await verifyPublicBoundary(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
