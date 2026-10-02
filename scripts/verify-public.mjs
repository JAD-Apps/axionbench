// Private/native integration gate. Checks the portable tree against this exact
// product source before preparing its own frozen dependencies and running its
// real portable gates. Never copies dependencies or private Git history.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSource, sha256 } from './public/boundary.mjs';
import { validateData } from './public/data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const product = join(root, 'publication/product');
// The private release gate remains an executable, so don't import its runner.
const requiredPrivateGates = ['lint','typecheck','test:unit','test:scoring','test:pricing','test:weights','test:cost-weights','test:registry','test:data','data:validate','test:authority','verify:design','test:frontier','test:chart-smoke','test:head-to-head','test:open-weights','test:catalogue','test:acceptance','verify:automation','build:release','release:check'];
const gateSource = await readFile(join(root, 'scripts/release/verify-release.mjs'), 'utf8');
for (const gate of requiredPrivateGates) assert(gateSource.includes(`['${gate}',`), `private gate removed: ${gate}`);
assert(gateSource.includes("['verify:public',"), 'private release must run the public gate');
try { await lstat(join(product, '.git')); throw new Error('copied public Git ancestry refused'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const publicManifest = await validateSource(product);
const expected = await validateData(product);
async function mirror(directory) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await mirror(path);
    else if (!/^public\/data(?:-details|-manifest)?\.json$/.test(path)) assert((await readFile(join(root, path))).equals(await readFile(join(product, path))), `current frontend/public asset differs: ${path}`);
  }
}
await mirror('src'); await mirror('public'); await mirror('assets');
for (const path of ['assets/surface.js','index.html','tsconfig.json','vite.config.ts','package-lock.json']) assert((await readFile(join(root, path))).equals(await readFile(join(product, path))), `current build requirement differs: ${path}`);
const pkg = JSON.parse(await readFile(join(root, 'package.json'))), pub = JSON.parse(await readFile(join(product, 'package.json')));
assert.equal(pkg.packageManager, pub.packageManager); assert.deepEqual(pkg.dependencies, pub.dependencies); assert.deepEqual(pkg.devDependencies, pub.devDependencies);
const privateData = JSON.parse(await readFile(join(root, 'public/data.json')));
const { authority: privateAuthority, pricing: privatePricing, scoring: privateScoring, ...privateFrozen } = privateData;
const details = JSON.parse(await readFile(join(root, 'public/data-details.json')));
const publicIds = new Set(details.sources.filter(row => row.id !== privatePricing.source.id).map(row => row.id));
assert.deepEqual(privateFrozen.sourceIds.filter(id => !publicIds.has(id)).sort(), ['registry-url-audit', 'retrieval-receipts']);
privateFrozen.sourceIds = privateFrozen.sourceIds.filter(id => publicIds.has(id));
assert.deepEqual(JSON.parse(await readFile(join(product, 'data/frozen-source-details.json'))), { ...details, sources: details.sources.filter(row => row.id !== privatePricing.source.id) }, 'frozen source rights, hashes and original URLs must match current private evidence');
assert.deepEqual(JSON.parse(await readFile(join(product, 'data/frozen-catalogue.json'))), privateFrozen, 'complete current frozen catalogue, observations, unknowns and open weights retained');
const { inputDigests: _privateDigests, ...privateFacts } = privateAuthority;
const { inputDigests: _publicDigests, ...publicFacts } = expected.projection.authority;
assert.deepEqual(publicFacts, privateFacts, 'public facts and exact joins preserve current private authority semantics');
assert.deepEqual(expected.projection.pricing, privatePricing); assert.deepEqual(expected.projection.scoring, privateScoring);
const scoringTests = await readFile(join(root, 'tests/scoring/test-scoring.mjs'), 'utf8');
assert.equal(await readFile(join(product, 'tests/scoring/test-scoring.mjs'), 'utf8'), scoringTests.replace("import data from '../../data/ingestion.json' with { type: 'json' };", "import data from '../../scripts/public/scoring-data.mjs';"), 'all original hand/adversarial scoring assertions are retained');
const dir = `test-results/public-candidate-${new Date().toISOString().replace(/[:.]/g, '-')}`;
await mkdir(dir, { recursive: true });
const results = [];
// npm run exports user .npmrc settings as npm_config_* variables. npm 11.19
// rejects allow-scripts when that export is mistaken for a project install CLI
// flag. Remove only the derived environment copy; npm ci still reads the actual
// user/global/project .npmrc policy. No configuration file is changed.
const installEnv = { ...process.env };
for (const key of Object.keys(installEnv)) if (key.toLowerCase() === 'npm_config_allow_scripts') delete installEnv[key];
for (const [label, args] of [['frozen-install', ['ci', '--include=dev', '--no-audit', '--no-fund']], ['portable-gates', ['run', 'verify:public']]]) {
  const path = `${dir}/${label}.log`, log = createWriteStream(path);
  const status = await new Promise(resolve => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: product, shell: process.platform === 'win32', env: installEnv });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { process.stdout.write(bytes); log.write(bytes); });
    child.once('error', error => { log.write(error.message); resolve(null); }); child.once('close', code => resolve(code));
  });
  await new Promise(resolve => log.end(resolve));
  results.push({ label, command: ['npm', ...args], exitCode: status, log: path, logSha256: sha256(await readFile(path)) });
  if (status !== 0) break;
}
const receipt = { schemaVersion: 'axionbench-private-public-integration-v1', at: new Date().toISOString(), passed: results.length === 2 && results.every(r => r.exitCode === 0),
  publicSourceSha256: publicManifest.sourceSha256, privateSourceDigest: privateData.sourceDigest, publicDataSha256: expected.manifest.projection.sha256,
  productPath: 'publication/product', privateGatesRetained: requiredPrivateGates.length, results, independentReview: false, hostedCI: false };
await writeFile(`${dir}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
await writeFile('test-results/public-candidate.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(`Private/public source integration ${receipt.passed ? 'passed' : 'FAILED'}: ${dir}/receipt.json`);
if (!receipt.passed) process.exitCode = 1;
