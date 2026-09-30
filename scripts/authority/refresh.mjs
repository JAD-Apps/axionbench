// npm run data:authority -- <private-audit-dir>
// Refreshes every original authority source (network), validating each complete
// response before atomically replacing its committed factual projection; then
// re-runs the admission gate. Raw bytes stay in the private audit directory.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { refreshAuthority } from '../deepswe-authority.mjs';
import { refreshBfcl } from './bfcl.mjs';
import { refreshEpoch } from './epoch-hub.mjs';
import { refreshLongBench } from './longbench-v2.mjs';

const auditDir = process.argv[2];
assert.ok(auditDir, 'usage: npm run data:authority -- <private-audit-dir outside the repository>');
const root = new URL('../../', import.meta.url).pathname;
const at = (path) => root + path;
await refreshAuthority({ output: at('data/authority-deepswe.json'), auditDir });
await refreshEpoch({ output: at('data/authority/epoch-hub.json'), auditDir });
await refreshBfcl({ output: at('data/authority/bfcl-v4.json'), auditDir });
await refreshLongBench({ output: at('data/authority/longbench-v2.json'), auditDir });
const publisher = spawnSync('python3', ['scripts/publisher-tables.py', 'data/publisher-percentage-facts.json', auditDir], { cwd: root, stdio: 'inherit' });
assert.equal(publisher.status, 0, 'publisher table refresh failed; last-good facts retained');
const build = spawnSync('node', ['scripts/build-observatory-data.mjs'], { cwd: root, stdio: 'inherit' });
assert.equal(build.status, 0, 'refreshed sources failed the admission gate');
