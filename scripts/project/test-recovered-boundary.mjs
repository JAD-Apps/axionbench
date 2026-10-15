// Run all recovered portable assertions on a disposable private copy. Preserve
// the archived source and original failing logs unchanged.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EVIDENCE, ARCHIVE_SHA, sha256 } from './preflight.mjs';

const root = resolve('.'), dir = join(root, EVIDENCE);
const recovered = join(dir, 'recovery');
const check = spawnSync('python3', ['scripts/project/recover-boundary.py', '--verify', recovered], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr);
const candidate = await mkdtemp(join(dir, 'boundary-candidate-'));
await cp(join(recovered, 'source/publication/product'), candidate, { recursive: true });
for (const name of ['test-boundary.mjs', 'fixture-root.mjs']) {
  await cp(join(root, 'scripts/public', name), join(candidate, 'scripts/public', name));
}
const { sealSource } = await import(pathToFileURL(join(candidate, 'scripts/public/boundary.mjs')).href);
const source = await sealSource(candidate);
const sandboxTmp = join(candidate, 'test-results/sandbox-tmp');
await mkdir(sandboxTmp, { recursive: true });
await mkdir(join(sandboxTmp, '.git')); // the enclosing temporary-repo regression
const result = spawnSync(process.execPath, ['scripts/public/test-boundary.mjs'], {
  cwd: candidate, env: { ...process.env, TMPDIR: sandboxTmp }, encoding: 'utf8', timeout: 120_000,
});
const log = Buffer.from((result.stdout ?? '') + (result.stderr ?? ''));
await writeFile(join(dir, 'boundary-repair.log'), log, { mode: 0o600 });
const portable = JSON.parse(await readFile(join(candidate, 'test-results/public-boundary.json'), 'utf8').catch(() => '{}'));
const receipt = { schemaVersion: 1, at: new Date().toISOString(), command: [process.execPath, 'scripts/public/test-boundary.mjs'],
  exitCode: result.status, error: result.error?.message ?? null, archiveSha256: ARCHIVE_SHA,
  candidate: relative(root, candidate), publicSourceSha256: source.sourceSha256,
  testSha256: sha256(await readFile('scripts/public/test-boundary.mjs')),
  helperSha256: sha256(await readFile('scripts/public/fixture-root.mjs')),
  logSha256: sha256(log), checks: portable.checks ?? [], fixtureTmpdirInsideRepository: true,
  historicalNativePass: false, fullReleaseRerun: false };
await writeFile(join(dir, 'boundary-repair.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
process.stdout.write(log);
assert.equal(result.status, 0, 'portable boundary repair failed; see ignored boundary-repair.log');
assert.equal(portable.passed, true);
const original = await readFile(join(recovered, 'source/scripts/public/test-boundary.mjs'), 'utf8');
const expectedLabels = [...original.matchAll(/await fixture\('([^']+)'/g)].map(match => match[1]);
assert.deepEqual(portable.checks, expectedLabels, 'retain every original boundary fixture');
