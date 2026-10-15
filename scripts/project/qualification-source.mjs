// Private candidate inventory. Includes tracked and non-ignored untracked files;
// evidence/build outputs are excluded only by the repository's existing ignores.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalDigest, pathProblem, sha256 } from '../release/manifest.mjs';

export async function privateSource(root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(await realpath(root), await realpath(git('rev-parse', '--show-toplevel').trim()), 'candidate must be its own Git root');
  const paths = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))].sort();
  const files = [];
  for (const path of paths) {
    assert.equal(pathProblem(path), null, 'unsafe private source path');
    let current = root;
    for (const part of path.split('/')) { current = join(current, part); assert(!(await lstat(current)).isSymbolicLink(), 'private source symlink refused'); }
    assert((await lstat(current)).isFile(), 'private source must be regular');
    const bytes = await readFile(current);
    files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  assert(files.length > 0, 'private source inventory is empty');
  return { sourceSha256: canonicalDigest(files, 'axionbench-private-source-v1'), files };
}
