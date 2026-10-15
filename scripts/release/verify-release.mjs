// Release gate: every meaningful unit, scoring, registry, data, interaction,
// accessibility and clean-build check, in dependency order. Each gate runs even
// after an earlier failure so one run records every problem; the receipt at
// test-results/release-verify.json keeps each command, exit code and duration,
// and test-results/release-logs/<gate>.log keeps that gate's complete output.
// Nothing here deploys, writes DNS, opens a GUI browser or pushes to Git. The
// registry gate performs read-only HTTPS GETs of captured primary source URLs.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { acquireGateLock } from './gate-lock.mjs';
import { privateSource } from '../project/qualification-source.mjs';
import { sha256, scanDist } from './manifest.mjs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
export const GATES = [
  ['lint', 'static parse, JSON and conflict-marker lint'],
  ['typecheck', 'strict TypeScript'],
  ['test:unit', 'unit regression suite (vitest)'],
  ['test:scoring', 'hand-calculated and adversarial scoring fixtures'],
  ['test:pricing', 'licensed tariff extraction and independent task-cost calculations'],
  ['test:weights', 'real common-panel weights and sensitivity regressions'],
  ['test:cost-weights', 'mounted task cost, weights, share and export interactions'],
  ['test:registry', 'benchmark registry breadth and live source reachability'],
  ['test:data', 'ingestion adapter fixtures'],
  ['data:validate', 'public data contract validation'],
  ['test:authority', 'benchmark-authority adapters and publisher facts'],
  ['verify:design', 'design blueprint contract'],
  ['test:routes', 'direct routes, default dark, keyboard, contrast and responsive navigation'],
  ['test:frontier', 'frontier build, bundle budget and browser checks'],
  ['test:core-views', 'custom Chart.js values, views, history, lifecycle and reduced motion'],
  ['test:cost-version-views', 'pricing, version and homepage recommendation parity'],
  ['test:chart-smoke', 'hero preservation and chart smoke in Chromium'],
  ['test:head-to-head', 'matched US–China comparison'],
  ['test:open-weights', 'open-weight parameter groups'],
  ['test:cohort-views', 'Chart.js cohort views, coverage, URL state and value parity'],
  ['test:catalogue', 'catalogue, methods and snapshots'],
  ['test:acceptance', 'visual and interaction acceptance at 320–1920 px'],
  ['verify:automation', 'refresh, CI and deployment tooling (offline)'],
  ['verify:public', 'product-only snapshot, source boundary and portable public gates'],
  ['build:release', 'clean release build and manifest'],
  ['release:check', 'dist matches its release manifest'],
];

const LOG_DIR = 'test-results/release-logs';
const logPath = (script) => `${LOG_DIR}/${script.replace(/[^a-z0-9]+/gi, '-')}.log`;

// Runs one gate, streaming its output to the terminal and to its own log file.
function runGate(script) {
  return new Promise((resolve) => {
    const log = createWriteStream(logPath(script));
    const child = spawn(npm, ['run', script], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    child.stdout.on('data', (chunk) => { process.stdout.write(chunk); log.write(chunk); });
    child.stderr.on('data', (chunk) => { process.stderr.write(chunk); log.write(chunk); });
    const finish = (exitCode, error) => log.end(() => resolve({ exitCode, error }));
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (code, signal) => finish(code, signal ? `terminated by ${signal}` : null));
  });
}

// Gates rebuild and serve the shared dist/; a second run in this worktree waits here.
const releaseLock = await acquireGateLock();
const startedAt = new Date().toISOString();
const initialSource = await privateSource(process.cwd());
const evidenceDir = `test-results/release-runs/${startedAt.replace(/[:.]/g, '-')}`;
// Retain authentic earlier logs/receipts, including failures, before replacing
// the working latest receipt. Historical direct receipts stay historical.
try {
  const previous = await readFile('test-results/release-verify.json');
  const archive = `test-results/release-history/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await mkdir(archive, { recursive: true });
  await writeFile(`${archive}/receipt.json`, previous, { flag: 'wx' });
  await cp(LOG_DIR, `${archive}/logs`, { recursive: true, errorOnExist: true });
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await rm(LOG_DIR, { recursive: true, force: true });
await mkdir(LOG_DIR, { recursive: true });
const results = [];
for (const [script, label] of GATES) {
  console.log(`\n=== ${script} — ${label}`);
  const started = Date.now();
  const { exitCode, error } = await runGate(script);
  const log = await readFile(logPath(script));
  results.push({ script, label, command: `npm run ${script}`, exitCode, error, milliseconds: Date.now() - started,
    seconds: Math.round((Date.now() - started) / 100) / 10, log: `${evidenceDir}/logs/${script.replace(/[^a-z0-9]+/gi, '-')}.log`, logBytes: log.length, logSha256: sha256(log) });
  if (exitCode !== 0) console.error(`!!! ${script} failed (exit ${exitCode ?? error}). Full output: ${logPath(script)}. Rerun with: npm run ${script}`);
}

let candidate = null;
try {
  const manifest = JSON.parse(await readFile('dist/release-manifest.json', 'utf8'));
  candidate = { productSha256: manifest.productSha256, dataSha256: manifest.dataSha256, sourceCommit: manifest.sourceCommit, sourceDirty: manifest.sourceDirty, fileCount: manifest.fileCount };
} catch { /* build:release failed; its receipt row already records why */ }
const failed = results.filter((row) => row.exitCode !== 0);
const finalSource = await privateSource(process.cwd());
const sourceUnchanged = initialSource.sourceSha256 === finalSource.sourceSha256;
await mkdir(evidenceDir, { recursive: true });
await cp(LOG_DIR, `${evidenceDir}/logs`, { recursive: true, errorOnExist: true });
await mkdir(`${evidenceDir}/evidence`, { recursive: true });
for (const artifact of ['routes', 'core-views', 'cost-version-views', 'cohort-views', 'acceptance', 'cost-weights', 'pricing.json', 'weights.json']) {
  try { await cp(`test-results/${artifact}`, `${evidenceDir}/evidence/${artifact}`, { recursive: true, errorOnExist: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const capturedEvidence = (await scanDist(`${evidenceDir}/evidence`)).files;
await mkdir('test-results', { recursive: true });
const receipt = { schemaVersion: 'axionbench-private-verification-v1', startedAt, finishedAt: new Date().toISOString(),
  passed: failed.length === 0 && sourceUnchanged, privateSourceSha256: initialSource.sourceSha256, sourceUnchanged,
  candidate, results, evidenceRoot: `${evidenceDir}/evidence`, capturedEvidence };
await writeFile(`${evidenceDir}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
await writeFile('test-results/release-verify.json', JSON.stringify(receipt, null, 2) + '\n');
await releaseLock();
console.log('\nRelease verification summary');
for (const row of results) console.log(`${row.exitCode === 0 ? 'pass' : 'FAIL'}  ${row.script.padEnd(18)} ${String(row.seconds).padStart(6)} s  ${row.label}${row.error ? ` — ${row.error}` : ''}${row.exitCode === 0 ? '' : ` — see ${row.log}`}`);
if (candidate) console.log(`Candidate product ${candidate.productSha256} data ${candidate.dataSha256} commit ${candidate.sourceCommit}${candidate.sourceDirty ? ' (dirty tree)' : ''}`);
if (failed.length || !sourceUnchanged) {
  if (!sourceUnchanged) console.error('Verification changed source files; candidate is not qualified.');
  console.error(`\nverify:release failed: ${failed.map((row) => row.script).join(', ')}. Receipt: test-results/release-verify.json`);
  process.exit(1);
}
console.log('\nverify:release passed. No deployment, DNS, Git push or GUI operation was performed.');
