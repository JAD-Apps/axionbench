// Private-only preparation. The delivered directory is a product source tree,
// never a repository clone. Publication from public ancestry is a later step.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACT_FILES, permittedDeepSwe, sha256, jsonBytes, sealSource } from './public/boundary.mjs';
import { writePublicData } from './public/data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = join(root, 'publication/product');
const copy = async path => { await mkdir(dirname(join(target, path)), { recursive: true }); await writeFile(join(target, path), await readFile(join(root, path))); };
async function copyTree(path) {
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    if (entry.name === '__pycache__') continue;
    if (path === 'tests' && entry.name === 'project') continue; // private admission/recovery fixtures
    if (path === 'scripts/pricing' && entry.name === 'verify-private-capture.mjs') continue;
    assert(!entry.isSymbolicLink(), `source symlink refused: ${path}/${entry.name}`);
    if (entry.isDirectory()) await copyTree(`${path}/${entry.name}`); else await copy(`${path}/${entry.name}`);
  }
}
await mkdir(target, { recursive: true });
try { await lstat(join(target, '.git')); throw new Error('public product must have no copied Git history'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const path of ['src', 'public', 'assets', 'scripts/public', 'scripts/pricing', 'tests']) await copyTree(path);
// Only portable release infrastructure is included. No private gate, raw audit
// workflow, owner permission verifier, ingestion adapter or evidence is copied.
for (const path of ['index.html', 'tsconfig.json', 'vite.config.ts', 'package-lock.json', 'assets/surface.js',
  ...FACT_FILES, 'data/authority/mapping.json', 'data/benchmark-registry.json', 'data/scoring.json',
  ...['compose', 'common', 'epoch-hub', 'bfcl', 'longbench-v2'].map(name => `scripts/authority/${name}.mjs`),
  ...['build', 'check-dist', 'manifest', 'gate-lock'].map(name => `scripts/release/${name}.mjs`),
  'scripts/deepswe-authority.mjs', 'scripts/publisher-tables.py', 'scripts/test-publisher-tables.py',
  'scripts/test-harness.mjs', 'scripts/serve.mjs', 'scripts/chart-smoke.mjs', 'scripts/test-acceptance.mjs',
  'scripts/test-pricing.mjs', 'scripts/test-weights.mjs', 'scripts/test-cost-weights.mjs',
  'docs/METHODOLOGY.md', 'docs/PRICING.md']) await copy(path);
await writeFile(join(target, FACT_FILES[0]), jsonBytes(permittedDeepSwe(JSON.parse(await readFile(join(root, FACT_FILES[0]), 'utf8')))));
const privateData = JSON.parse(await readFile(join(root, 'public/data.json'), 'utf8'));
const { authority, pricing, scoring, ...frozen } = privateData;
assert(authority && pricing && scoring);
const details = JSON.parse(await readFile(join(root, 'public/data-details.json'), 'utf8'));
details.sources = details.sources.filter(row => row.id !== pricing.source.id);
const publicSourceIds = new Set(details.sources.map(row => row.id));
assert.deepEqual(frozen.sourceIds.filter(id => !publicSourceIds.has(id)).sort(), ['registry-url-audit', 'retrieval-receipts'], 'only the two internal audit-receipt IDs lack public metadata');
frozen.sourceIds = frozen.sourceIds.filter(id => publicSourceIds.has(id));
await writeFile(join(target, 'data/frozen-catalogue.json'), jsonBytes(frozen));
await writeFile(join(target, 'data/frozen-source-details.json'), jsonBytes(details));
await writeFile(join(target, 'FROZEN-SNAPSHOT.json'), jsonBytes({ schemaVersion: 'axionbench-frozen-snapshot-v1', sourceDigest: frozen.sourceDigest,
  counts: { models: frozen.models.length, observations: frozen.observations.length, configurations: Object.keys(frozen.configurations).length,
    openWeights: frozen.openWeights.rows.length, sources: details.sources.length, suites: frozen.suites.length },
  files: Object.fromEntries(await Promise.all(['data/frozen-catalogue.json', 'data/frozen-source-details.json', 'data/benchmark-registry.json', 'data/scoring.json']
    .map(async path => [path, sha256(await readFile(join(target, path)))]))),
  limitation: 'A frozen, limited factual projection. Source-reported reuse restrictions and unknowns are retained; this manifest grants no additional permissions. Catalogue identities, community claims and open-weight metadata require a separately reviewed snapshot to change.' }));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
pkg.scripts = {
  dev: 'vite --host 127.0.0.1', preview: 'vite preview --host 127.0.0.1', build: 'vite build', prebuild: 'node scripts/public/validate.mjs',
  'clean:build': 'vite build --emptyOutDir', 'preclean:build': 'node scripts/public/validate.mjs', typecheck: 'tsc --noEmit',
  lint: 'node scripts/public/lint.mjs', 'test:unit': 'vitest run', 'test:scoring': 'node tests/scoring/test-scoring.mjs',
  'test:pricing': 'node scripts/test-pricing.mjs', 'test:weights': 'node scripts/test-weights.mjs',
  'test:boundary': 'node scripts/public/test-boundary.mjs', 'data:validate': 'node scripts/public/validate.mjs',
  'data:refresh': 'node scripts/public/refresh.mjs', 'data:authority': 'node scripts/public/refresh.mjs',
  'test:chart-smoke': 'node scripts/chart-smoke.mjs', 'test:cost-weights': 'node scripts/test-cost-weights.mjs',
  'test:acceptance': 'node scripts/test-acceptance.mjs', 'build:release': 'node scripts/release/build.mjs',
  'release:check': 'node scripts/release/check-dist.mjs', 'verify:public': 'node scripts/public/verify.mjs',
  'verify:release': 'npm run verify:public', verify: 'npm run verify:public', 'jadbot:verify': 'npm run verify:release',
};
await writeFile(join(target, 'package.json'), jsonBytes(pkg));
for (const path of ['README.md', 'docs/AUTOMATION.md', 'docs/PUBLIC-SOURCE.md', '.github/workflows/ci.yml', '.github/workflows/refresh-data.yml', '.gitignore', 'jadbot.quality.json']) {
  await mkdir(dirname(join(target, path)), { recursive: true }); await writeFile(join(target, path), await readFile(join(root, 'scripts/public-content', path)));
}
const scoringTests = await readFile(join(root, 'tests/scoring/test-scoring.mjs'), 'utf8');
const privateImport = "import data from '../../data/ingestion.json' with { type: 'json' };";
assert.equal(scoringTests.split(privateImport).length, 2, 'one exact private scoring fixture import must be replaced');
await writeFile(join(target, 'tests/scoring/test-scoring.mjs'), scoringTests.replace(privateImport, "import data from '../../scripts/public/scoring-data.mjs';"));
await writePublicData(target);
const manifest = await sealSource(target);
console.log(`Prepared publication/product: ${manifest.fileCount} files, ${manifest.sourceSha256}. No Git history, commit, push, deployment or GUI operation.`);
