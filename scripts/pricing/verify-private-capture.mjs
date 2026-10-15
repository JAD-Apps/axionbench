// Private-only mandatory original-byte replay. The public tree deliberately
// does not include this script or its raw archive; its tariff checks are facts-only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { sha256 } from '../release/manifest.mjs';
const facts = JSON.parse(await readFile('data/public-price-facts.json', 'utf8'));
const audit = `data/source-snapshots/blobs/${facts.source.sha256.slice(0, 2)}`;
const raw = await readFile(`${audit}/${facts.source.sha256}.html`);
assert.equal(sha256(raw), facts.source.sha256, 'original price response hash');
assert.equal(raw.length, facts.source.bytes, 'original price response byte count');
const result = spawnSync('python3', ['scripts/pricing/test-capture.py', audit], { stdio: 'inherit' });
assert.equal(result.status, 0, 'mandatory all-cell original-source replay');
await mkdir('test-results', { recursive: true });
await writeFile('test-results/pricing-source-replay.json', JSON.stringify({ passed: true, at: new Date().toISOString(),
  sourceSha256: facts.source.sha256, sourceBytes: raw.length, priceFactsSha256: sha256(await readFile('data/public-price-facts.json')),
  capturedAt: facts.source.retrievedAt, replayedRecords: facts.records.length, replayedCells: facts.records.reduce((n, row) => n + row.evidence.length, 0),
  sourcePath: `${audit}/${facts.source.sha256}.html`, kind: 'original-byte-replay', nativeAcceptance: false }, null, 2) + '\n');
