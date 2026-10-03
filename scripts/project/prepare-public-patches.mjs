// node scripts/project/prepare-public-patches.mjs --base <public checkout> --candidate <prepared public tree>
//      --series <series.json> --output <empty directory outside this repository>
// Prepare-only: turns the difference between the public main checkout and a
// prepared public product tree into an ordered series of small patches, one
// per logical change, for the daemon to review and commit later. It never
// commits, pushes or modifies either tree. A throwaway Git index in a scratch
// directory produces standard `git apply` patches; the series is then applied
// to a fresh copy of the base and must reproduce the candidate byte for byte.
//
// series.json: { "schemaVersion": "axionbench-public-series-request-v1",
//   "patches": [{ "slug": "publication-transaction", "subject": "Publish daily data through the Pages API",
//                 "body": "optional plain explanation", "paths": ["scripts/release/", "docs/AUTOMATION.md"] }] }
// A path entry ending in "/" is a prefix; others are exact. Every changed file
// must match exactly one patch.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outsideRepository } from '../public/boundary.mjs';
import { canonicalDigest, pathProblem, sha256 } from '../release/manifest.mjs';

export const SERIES_SCHEMA = 'axionbench-public-patch-series-v1';
const SKIP = new Set(['.git', 'node_modules', 'dist', 'test-results', 'publication']);
const MAX_CHANGED = 2000;

export async function scanTree(root) {
  const files = new Map();
  const visit = async (rel) => {
    for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
      if (!rel && SKIP.has(entry.name)) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      assert.ok(!entry.isSymbolicLink(), `symlink refused: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else {
        assert.ok(entry.isFile(), `non-regular file: ${path}`);
        assert.equal(pathProblem(path), null, `non-canonical path: ${path}`);
        const bytes = await readFile(join(root, path));
        files.set(path, { sha256: sha256(bytes), bytes: bytes.length });
      }
    }
  };
  await visit('');
  return files;
}
const treeDigest = (files) => canonicalDigest([...files].map(([path, f]) => ({ path, ...f })), 'axionbench-public-tree-v1');

export function assignChanges(changes, request) {
  assert.equal(request?.schemaVersion, 'axionbench-public-series-request-v1', 'unknown series request schema');
  assert.ok(Array.isArray(request.patches) && request.patches.length > 0 && request.patches.length <= 100, 'series needs 1-100 patches');
  const slugs = new Set();
  for (const patch of request.patches) {
    assert.match(patch.slug, /^[a-z0-9][a-z0-9-]{0,60}$/, `patch slug ${patch.slug}`);
    assert.ok(!slugs.has(patch.slug), `duplicate slug ${patch.slug}`); slugs.add(patch.slug);
    assert.ok(typeof patch.subject === 'string' && patch.subject.length > 0 && patch.subject.length <= 72, `${patch.slug}: subject must be 1-72 characters`);
    assert.ok(Array.isArray(patch.paths) && patch.paths.length > 0, `${patch.slug}: paths`);
  }
  const matches = (entry, path) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry);
  const groups = request.patches.map((patch) => ({ ...patch, changes: [] }));
  const unassigned = [];
  for (const change of changes) {
    const owners = groups.filter((group) => group.paths.some((entry) => matches(entry, change.path)));
    assert.ok(owners.length <= 1, `${change.path} matches more than one patch: ${owners.map((g) => g.slug).join(', ')}`);
    if (owners.length) owners[0].changes.push(change); else unassigned.push(change.path);
  }
  assert.deepEqual(unassigned, [], `changed files not assigned to any patch: ${unassigned.join(', ')}`);
  for (const group of groups) assert.ok(group.changes.length > 0, `patch ${group.slug} has no changes`);
  return groups;
}

export async function preparePatchSeries({ base, candidate, request, output, now = () => new Date() }) {
  const git = (cwd, args, input) => execFileSync('git', ['-C', cwd, '-c', 'core.fileMode=false', '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, input });
  // Only a checkout rooted at --base counts; an enclosing repository does not.
  let baseCommit = null;
  const top = spawnSync('git', ['-C', base, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.status === 0 && await realpath(top.stdout.trim()) === await realpath(base)) {
    baseCommit = git(base, ['rev-parse', 'HEAD']).trim();
    assert.equal(git(base, ['status', '--porcelain', '--untracked-files=all']).trim(), '', 'base checkout has uncommitted changes; preserve them and prepare from a clean public main');
  }
  await mkdir(output, { recursive: true });
  assert.equal((await readdir(output)).length, 0, 'output directory must be empty');
  const before = await scanTree(base), after = await scanTree(candidate);
  const changes = [];
  for (const path of [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
    const a = before.get(path), b = after.get(path);
    if (a && b && a.sha256 === b.sha256) continue;
    changes.push({ path, change: !a ? 'added' : !b ? 'deleted' : 'modified', before: a?.sha256 ?? null, after: b?.sha256 ?? null });
  }
  assert.ok(changes.length > 0, 'candidate is identical to the base; nothing to prepare');
  assert.ok(changes.length <= MAX_CHANGED, `${changes.length} changed files exceeds ${MAX_CHANGED}`);
  const groups = assignChanges(changes, request);

  const scratch = await mkdtemp(join(tmpdir(), 'axionbench-patches-'));
  try {
    const work = join(scratch, 'work');
    await cp(base, work, { recursive: true, filter: (src) => !SKIP.has(src.slice(base.length + 1).split('/')[0]) });
    git(work, ['init', '--quiet']);
    git(work, ['add', '-A']); // index only; no commit is created
    const patches = [];
    for (const [i, group] of groups.entries()) {
      const paths = group.changes.map((c) => c.path);
      for (const change of group.changes) {
        if (change.change === 'deleted') await rm(join(work, change.path));
        else { await mkdir(dirname(join(work, change.path)), { recursive: true }); await cp(join(candidate, change.path), join(work, change.path)); }
      }
      const added = group.changes.filter((c) => c.change === 'added').map((c) => c.path);
      if (added.length) git(work, ['add', '--intent-to-add', '--', ...added]);
      const diff = git(work, ['diff', '--binary', '--full-index', '--no-color', '--no-ext-diff', '--', ...paths]);
      assert.ok(diff.length > 0, `patch ${group.slug} produced an empty diff`);
      git(work, ['add', '-A', '--', ...paths]);
      const file = `${String(i + 1).padStart(4, '0')}-${group.slug}.patch`;
      await writeFile(join(output, file), diff);
      patches.push({ index: i + 1, slug: group.slug, subject: group.subject, body: group.body ?? '', file, sha256: sha256(Buffer.from(diff)), bytes: Buffer.byteLength(diff), changes: group.changes });
    }
    // Proof: the ordered series reproduces the candidate from a fresh base copy.
    const proof = join(scratch, 'proof');
    await cp(base, proof, { recursive: true, filter: (src) => !SKIP.has(src.slice(base.length + 1).split('/')[0]) });
    for (const patch of patches) {
      const applied = spawnSync('git', ['apply', '--binary', '--whitespace=nowarn', join(output, patch.file)], { cwd: proof, encoding: 'utf8' });
      assert.equal(applied.status, 0, `patch ${patch.file} does not apply in order: ${applied.stderr}`);
    }
    const reproduced = await scanTree(proof);
    assert.equal(treeDigest(reproduced), treeDigest(after), 'the patch series does not reproduce the candidate tree');
    const candidateManifest = await readFile(join(candidate, 'PUBLIC-SOURCE-MANIFEST.json'), 'utf8').then(JSON.parse, () => null);
    const series = { schemaVersion: SERIES_SCHEMA, preparedAt: now().toISOString(), mode: 'prepare-only',
      base: { commit: baseCommit, treeSha256: treeDigest(before), files: before.size },
      candidate: { publicSourceSha256: candidateManifest?.sourceSha256 ?? null, treeSha256: treeDigest(after), files: after.size },
      changedFiles: changes.length, patches, verified: { reproducedTreeSha256: treeDigest(reproduced), matchesCandidate: true },
      operations: { commits: 0, pushes: 0, baseModified: false } };
    await writeFile(join(output, 'series.json'), `${JSON.stringify(series, null, 2)}\n`);
    return series;
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
  for (const name of ['--base', '--candidate', '--series', '--output']) assert.ok(option(name), 'usage: prepare-public-patches.mjs --base <dir> --candidate <dir> --series <series.json> --output <empty dir outside the repository>');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const output = await outsideRepository(root, option('--output'));
  const series = await preparePatchSeries({ base: resolve(option('--base')), candidate: resolve(option('--candidate')), request: JSON.parse(await readFile(option('--series'), 'utf8')), output });
  console.log(`Prepared ${series.patches.length} patches for ${series.changedFiles} files in ${output}; reproduced candidate ${series.candidate.treeSha256}. No commit or push was made.`);
}
