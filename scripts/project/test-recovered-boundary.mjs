// Runs only the recovered adversarial gate in a private candidate; no npm
// install/build, UI adoption, public staging, deployment or Git mutation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { sealSource, sha256 } from '../public/boundary.mjs';
const base = 'evidence/local/recovery';
const candidate = `${base}/repaired-boundary-candidate`;
await cp(`${base}/boundary/publication/product`, candidate, { recursive: true });
const source = [];
for (const path of ['scripts/public/boundary.mjs', 'scripts/public/test-boundary.mjs', 'scripts/public/temp-directory.mjs']) {
  await copyFile(path, `${candidate}/${path}`);
  const bytes = await readFile(path); source.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
}
const manifest = await sealSource(candidate);
const result = spawnSync(process.execPath, ['scripts/public/test-boundary.mjs'], { cwd: candidate, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
const log = Buffer.from((result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? ''));
await writeFile(`${base}/boundary-repair.log`, log, { mode: 0o600 });
const report = result.status === 0 ? await readFile(`${candidate}/test-results/public-boundary.json`) : null;
const receipt = { at: new Date().toISOString(), command: 'node scripts/public/test-boundary.mjs', cwd: 'private repaired boundary candidate',
  exitCode: result.status, checks: report ? JSON.parse(report).checks.length : 0, source, candidateSourceSha256: manifest.sourceSha256,
  logSha256: sha256(log), reportSha256: report ? sha256(report) : null, nativeAcceptance: false, publicReleaseIntegration: false };
await mkdir(`${base}/repair-attempts`, { recursive: true, mode: 0o700 });
const attempt = receipt.at.replace(/[:.]/g, '-');
await writeFile(`${base}/repair-attempts/${attempt}.log`, log, { mode: 0o600 });
await writeFile(`${base}/repair-attempts/${attempt}.json`, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
await writeFile(`${base}/boundary-repair.json`, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
console.log(log.toString());
assert.equal(result.status, 0, 'recovered boundary regression failed; see private receipt');
console.log(`Recovered boundary regression: ${receipt.checks} checks, exit ${receipt.exitCode}.`);
