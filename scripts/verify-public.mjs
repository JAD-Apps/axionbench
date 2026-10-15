// Private/native integration gate. Checks the portable tree against this exact
// product source before preparing its own frozen dependencies and running its
// real portable gates. Never copies dependencies or private Git history.
import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSource } from './public/boundary.mjs';
import { validateData } from './public/data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function verifyPrivatePublic(product) {
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
return { publicManifest, expected, privateData, privateGatesRetained: requiredPrivateGates.length };
}
