// Honour the sandbox's writable TMPDIR. Fixtures each create their own empty
// .git marker, so an enclosing temporary repository cannot move their boundary.
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export async function fixtureRoot(root, { candidates = [tmpdir(), join(root, 'test-results')], make = mkdtemp, prepare = mkdir } = {}) {
  const failures = [];
  for (const candidate of [...new Set(candidates.map(path => resolve(path)))]) {
    try {
      await prepare(candidate, { recursive: true });
      return await make(join(candidate, 'axionbench-public-tests-'));
    } catch (error) {
      if (!['EROFS', 'EACCES', 'EPERM', 'ENOENT'].includes(error.code)) throw error;
      failures.push(`${candidate}: ${error.code}`);
    }
  }
  throw new Error(`No writable fixture directory: ${failures.join('; ')}`);
}
