import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Honour the runtime's writable TMPDIR. Linux /tmp can be read-only in a
// verifier container. Each test fixture supplies its own .git boundary, so an
// enclosing scratch repository does not weaken the external-audit assertions.
export async function boundaryTestDirectory({ temporaryRoot = tmpdir(), create = mkdtemp } = {}) {
  return create(join(temporaryRoot, 'axionbench-public-tests-'));
}
