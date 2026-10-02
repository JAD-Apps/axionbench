import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';

// Tests stay in the admitted project area by default. Each fixture has its own
// .git boundary; sibling audit fixtures remain outside that boundary. Explicit
// runtime scratch is still supported, without a hidden fallback on failure.
export async function boundaryTestDirectory({ temporaryRoot = process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? join(process.cwd(), 'test-results', 'scratch'), create = mkdtemp } = {}) {
  if (create === mkdtemp) await mkdir(temporaryRoot, { recursive: true });
  return create(join(temporaryRoot, 'axionbench-public-tests-'));
}
