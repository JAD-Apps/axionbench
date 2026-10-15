// Focused local regression on a disposable copy. Never a native release receipt.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateSource, sealSource, sha256 } from '../public/boundary.mjs';
const recovery = process.argv[2];
assert(recovery?.startsWith('evidence/local/recovery/') && !recovery.includes('..'), 'provide the private relative recovery directory');
const original = resolve(recovery, 'source/publication/product');
const manifest = await validateSource(original);
const parent = resolve('evidence/local/boundary-regression');
await mkdir(parent, { recursive: true, mode: 0o700 });
const root = await mkdtemp(resolve(parent, 'candidate-'));
for (const row of manifest.files) {
  const bytes = await readFile(resolve(original, row.path));
  assert.equal(sha256(bytes), row.sha256);
  await mkdir(dirname(resolve(root, row.path)), { recursive: true, mode: 0o700 });
  await writeFile(resolve(root, row.path), bytes, { mode: 0o600 });
}
// Include only the current targeted repair. The original source stays immutable.
const repaired = ['scripts/public/boundary.mjs', 'scripts/public/test-boundary.mjs', 'scripts/public/fixture-temp.mjs'];
for (const path of repaired) await writeFile(resolve(root, path), await readFile(path), { mode: 0o600 });
const candidate = await sealSource(root);
await mkdir(resolve(root, '.git')); // independent fixture repository boundary, no Git objects/history
await mkdir(resolve(root, 'test-results'));
const result = spawnSync(process.execPath, ['scripts/public/test-boundary.mjs'], {
  cwd: root, encoding: 'utf8', timeout: 120000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 4 * 1024 * 1024,
});
const log = Buffer.from((result.stdout ?? '') + (result.stderr ?? ''));
await writeFile(resolve(root, 'test-results/boundary-regression.log'), log, { mode: 0o600 });
const receipt = { kind: 'local-disposable-recovered-boundary-regression', nativeAcceptance: false,
  at: new Date().toISOString(), command: [process.execPath, 'scripts/public/test-boundary.mjs'],
  exitCode: result.status, error: result.error?.message ?? null, sourceSha256: candidate.sourceSha256,
  originalSourceSha256: manifest.sourceSha256, repaired, logSha256: sha256(log), root };
await writeFile(resolve(root, 'test-results/regression-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
process.stdout.write(log);
console.log(JSON.stringify(receipt));
if (result.status !== 0) process.exitCode = 1;
