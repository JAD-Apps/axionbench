// Private release step: portable mutation suite plus every original-byte replay.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import '../test-current-policy.mjs';
const result = spawnSync('python3', ['scripts/authority/test-current-capture.py', '--audit-dir', 'evidence/local/current-sources'], { stdio: 'inherit' });
assert.equal(result.status, 0, 'current primary original-byte replay failed; no gate was bypassed');
