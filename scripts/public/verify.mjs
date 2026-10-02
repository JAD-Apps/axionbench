// Records real local exit codes and logs, including failures. This command has
// no publication, deployment, DNS, refresh or owner-browser side effects.
import { spawn } from 'node:child_process';
import { mkdir, rename, writeFile, readFile, cp } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { acquireGateLock } from '../release/gate-lock.mjs';
import { sha256, validateSource } from './boundary.mjs';
import { scanDist } from '../release/manifest.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const gates = ['lint', 'data:validate', 'test:current-policy', 'test:boundary', 'typecheck', 'test:unit', 'test:scoring', 'test:pricing', 'test:weights',
  'build', 'verify:design', 'test:routes', 'test:core-views', 'test:chart-smoke', 'test:cost-weights', 'test:cost-version-views', 'test:acceptance', 'build:release', 'release:check'];
const unlock = await acquireGateLock();
const run = new Date().toISOString().replace(/[:.]/g, '-');
const dir = `test-results/public-${run}`;
await mkdir(dir, { recursive: true });
const results = [];
try {
  for (const script of gates) {
    const logPath = `${dir}/${script.replace(/:/g, '-')}.log`;
    const log = createWriteStream(logPath); const start = Date.now();
    console.log(`Public gate ${script}`);
    const code = await new Promise(resolve => {
      const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], { cwd: root, shell: process.platform === 'win32', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { process.stdout.write(bytes); log.write(bytes); });
      child.once('error', error => { log.write(error.message); resolve(null); });
      child.once('close', code => resolve(code));
    });
    await new Promise(resolve => log.end(resolve));
    const logBytes = await readFile(logPath);
    results.push({ script, command: `npm run ${script}`, exitCode: code, milliseconds: Date.now() - start, log: logPath, logBytes: logBytes.length, logSha256: sha256(logBytes) });
  }
  const manifest = await validateSource(root).catch(() => null);
  const release = JSON.parse(await readFile('dist/release-manifest.json', 'utf8').catch(() => 'null'));
  const artifacts = ['cost-version-views', 'core-views', 'routes', 'acceptance', 'cost-weights', 'public-boundary.json', 'pricing.json', 'weights.json'];
  await mkdir(`${dir}/evidence`, { recursive: true });
  for (const artifact of artifacts) {
    try { await cp(`test-results/${artifact}`, `${dir}/evidence/${artifact}`, { recursive: true, errorOnExist: true }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const capturedEvidence = (await scanDist(`${dir}/evidence`)).files;
  const receipt = { schemaVersion: 'axionbench-portable-verification-v1', at: new Date().toISOString(),
    passed: manifest !== null && release !== null && results.every(row => row.exitCode === 0), publicSourceSha256: manifest?.sourceSha256 ?? null,
    productSha256: release?.productSha256 ?? null, dataSha256: release?.dataSha256 ?? null,
    kind: 'local-command-execution', independentReview: false, hostedCI: false, results, evidenceRoot: `${dir}/evidence`, capturedEvidence };
  await writeFile(`${dir}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
  await writeFile('test-results/public-verify.json.tmp', JSON.stringify(receipt, null, 2) + '\n');
  await rename('test-results/public-verify.json.tmp', 'test-results/public-verify.json');
  console.log(`Public verification ${receipt.passed ? 'passed' : 'FAILED'}: ${dir}/receipt.json`);
  if (!receipt.passed) process.exitCode = 1;
} finally { await unlock(); }
