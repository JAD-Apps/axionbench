import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The verifier supplies a writable TMPDIR; /tmp may be mounted read-only.
// Each fixture's own .git marker defines its boundary even when TMPDIR is
// inside another repository. Audit siblings remain outside that fixture.
export function createFixtureTemp({ directory = tmpdir(), create = mkdtemp } = {}) {
  return create(join(directory, 'axionbench-public-tests-'));
}
