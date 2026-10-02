// Restore the supplied original tariff bytes into private ignored audit storage.
// This never fetches a replacement source or changes the public price facts.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../release/manifest.mjs';
const preservedHash = 'b1cf5d3eec2479602d6757520c61351becb27b8cc6a509aec1b8b491605cab92';
export async function restorePrivatePrice({ facts, target, preserved }) {
  assert.equal(facts.source.sha256, preservedHash, 'new price source requires its own qualified private input');
  let bytes;
  try { bytes = await readFile(target); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    bytes = await readFile(preserved);
    assert.equal(bytes.length, facts.source.bytes, 'preserved tariff byte count');
    assert.equal(sha256(bytes), preservedHash, 'preserved original tariff hash');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
  }
  assert.equal(bytes.length, facts.source.bytes, 'private tariff byte count');
  assert.equal(sha256(bytes), preservedHash, 'private original tariff hash');
  return { bytes: bytes.length, sha256: preservedHash };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await restorePrivatePrice({ facts: JSON.parse(await readFile('data/public-price-facts.json', 'utf8')),
    target: `data/source-snapshots/blobs/${preservedHash.slice(0, 2)}/${preservedHash}.html`,
    preserved: `../../preservation/concurrency-opus-20261001/axionbench-direct-price-audit/${preservedHash}.html` });
  console.log('Qualified original tariff bytes available for mandatory private replay.');
}
