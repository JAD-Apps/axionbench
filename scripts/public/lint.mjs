// Works from a source archive as well as a Git checkout.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scanSource } from './boundary.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const files = await scanSource(root);
for (const { path } of files) {
  if (path.endsWith('.mjs')) { const result = spawnSync('node', ['--check', path], { cwd: root, encoding: 'utf8' }); assert.equal(result.status, 0, `${path}: ${result.stderr}`); }
  if (path.endsWith('.json')) JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8'));
  if (/\.(?:mjs|ts|tsx|md|css|yml)$/.test(path)) assert(!/^(?:<{7}|>{7}) /m.test(await readFile(new URL('../../' + path, import.meta.url), 'utf8')), `${path}: conflict marker`);
}
console.log(`Portable lint passed: ${files.length} files.`);
