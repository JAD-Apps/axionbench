// Release gate: every meaningful unit, scoring, registry, data, interaction,
// accessibility and clean-build check, in dependency order. Each gate runs even
// after an earlier failure so one run records every problem; the receipt at
// test-results/release-verify.json keeps each command, exit code and duration.
// Nothing here deploys, writes DNS, opens a GUI browser or pushes to Git. The
// registry gate performs read-only HTTPS GETs of captured primary source URLs.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
export const GATES = [
  ['lint', 'static parse, JSON and conflict-marker lint'],
  ['typecheck', 'strict TypeScript'],
  ['test:unit', 'unit regression suite (vitest)'],
  ['test:scoring', 'hand-calculated and adversarial scoring fixtures'],
  ['test:registry', 'benchmark registry breadth and live source reachability'],
  ['test:data', 'ingestion adapter fixtures'],
  ['data:validate', 'public data contract validation'],
  ['test:authority', 'benchmark-authority adapters and publisher facts'],
  ['verify:design', 'design blueprint contract'],
  ['test:frontier', 'frontier build, bundle budget and browser checks'],
  ['test:chart-smoke', 'hero preservation and chart smoke in Chromium'],
  ['test:head-to-head', 'matched US–China comparison'],
  ['test:open-weights', 'open-weight parameter groups'],
  ['test:catalogue', 'catalogue, methods and snapshots'],
  ['test:acceptance', 'visual and interaction acceptance at 320–1920 px'],
  ['verify:automation', 'refresh, CI and deployment tooling (offline)'],
  ['build:release', 'clean release build and manifest'],
  ['release:check', 'dist matches its release manifest'],
];

const results = [];
for (const [script, label] of GATES) {
  console.log(`\n=== ${script} — ${label}`);
  const started = Date.now();
  const run = spawnSync(npm, ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' });
  const exitCode = run.error ? null : run.status;
  results.push({ script, label, exitCode, error: run.error?.message ?? null, seconds: Math.round((Date.now() - started) / 100) / 10 });
  if (exitCode !== 0) console.error(`!!! ${script} failed (exit ${exitCode ?? run.error?.message}). Rerun with: npm run ${script}`);
}

let candidate = null;
try {
  const manifest = JSON.parse(await readFile('dist/release-manifest.json', 'utf8'));
  candidate = { productSha256: manifest.productSha256, dataSha256: manifest.dataSha256, sourceCommit: manifest.sourceCommit, sourceDirty: manifest.sourceDirty, fileCount: manifest.fileCount };
} catch { /* build:release failed; its receipt row already records why */ }
const failed = results.filter((row) => row.exitCode !== 0);
await mkdir('test-results', { recursive: true });
await writeFile('test-results/release-verify.json', JSON.stringify({ finishedAt: new Date().toISOString(), passed: failed.length === 0, candidate, results }, null, 2) + '\n');
console.log('\nRelease verification summary');
for (const row of results) console.log(`${row.exitCode === 0 ? 'pass' : 'FAIL'}  ${row.script.padEnd(18)} ${String(row.seconds).padStart(6)} s  ${row.label}${row.error ? ` — ${row.error}` : ''}`);
if (candidate) console.log(`Candidate product ${candidate.productSha256} data ${candidate.dataSha256} commit ${candidate.sourceCommit}${candidate.sourceDirty ? ' (dirty tree)' : ''}`);
if (failed.length) {
  console.error(`\nverify:release failed: ${failed.map((row) => row.script).join(', ')}. Receipt: test-results/release-verify.json`);
  process.exit(1);
}
console.log('\nverify:release passed. No deployment, DNS, Git push or GUI operation was performed.');
