// Private, read-only source identity, including uncommitted implementation.
// Ignored browser/build output is excluded; no Git history is exported.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalDigest, pathProblem, sha256 } from '../release/manifest.mjs';

export async function fingerprintSource(root) {
  const paths = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  const files = [];
  for (const path of [...new Set(paths)].sort()) {
    assert.equal(pathProblem(path), null, 'unsafe source path');
    let actual = root;
    for (const part of path.split('/')) { actual = join(actual, part); assert(!(await lstat(actual)).isSymbolicLink(), 'source symlink refused'); }
    assert((await lstat(actual)).isFile(), 'source must be regular');
    const bytes = await readFile(actual);
    files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return { sourceSha256: canonicalDigest(files, 'axionbench-private-source-v1'), files };
}
