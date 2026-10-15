// Private-only preparation. The delivered directory is a product source tree,
// never a repository clone. Publication from public ancestry is a later step.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACT_FILES, permittedDeepSwe, sha256, jsonBytes, sealSource } from './public/boundary.mjs';
import { writePublicData } from './public/data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
import allowlist from './public/allowlist.json' with { type: 'json' };

export async function preparePublicSnapshot(target = join(root, 'publication/product')) {
const copy = async path => { await mkdir(dirname(join(target, path)), { recursive: true }); await writeFile(join(target, path), await readFile(join(root, path))); };
await mkdir(target, { recursive: true });
assert.equal((await readdir(target)).length, 0, 'public output must be empty; choose a fresh owned directory');
for (const path of allowlist.copy) {
  // Refuse symlinks in any component, including an enclosing asset directory.
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part); assert(!(await lstat(current)).isSymbolicLink(), `source symlink refused: ${path}`);
  }
  assert((await lstat(join(root, path))).isFile(), `regular source required: ${path}`);
  await copy(path);
}
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
  'test:current-policy': 'node scripts/test-current-policy.mjs',
  'test:core-views': 'node scripts/test-core-views.mjs',
  'test:cohort-views': 'node scripts/test-cohort-views.mjs',
  'test:cost-version-views': 'node scripts/test-cost-version-views.mjs',
  'test:routes': 'node scripts/test-routes.mjs', 'verify:design': 'node scripts/verify-design.mjs',
  'test:boundary': 'node scripts/public/test-boundary.mjs', 'data:validate': 'node scripts/public/validate.mjs',
  'data:refresh': 'node scripts/public/refresh.mjs', 'data:authority': 'node scripts/public/refresh.mjs',
  'test:chart-smoke': 'node scripts/chart-smoke.mjs', 'test:cost-weights': 'node scripts/test-cost-weights.mjs',
  'test:acceptance': 'node scripts/test-acceptance.mjs', 'build:release': 'node scripts/public/release.mjs',
  'release:check': 'node scripts/public/check-release.mjs', 'verify:public': 'node scripts/public/verify.mjs',
  'verify:release': 'npm run verify:public', verify: 'npm run verify:public', 'jadbot:verify': 'npm run verify:release',
  'publish:daily': 'node scripts/release/publish.mjs daily', 'publish:site': 'node scripts/release/publish.mjs run',
  'publish:candidate': 'node scripts/release/publish.mjs candidate', 'publish:verify': 'node scripts/release/publish.mjs verify',
  'publish:rollback': 'node scripts/release/publish.mjs rollback', 'publish:status': 'node scripts/release/publish.mjs status',
  'production:check': 'node scripts/release/production-check.mjs', 'capture:verify': 'node scripts/release/verify-capture.mjs',
};
await writeFile(join(target, 'package.json'), jsonBytes(pkg));
for (const path of allowlist.templates) {
  await mkdir(dirname(join(target, path)), { recursive: true }); await writeFile(join(target, path), await readFile(join(root, 'scripts/public-content', path)));
}
const scoringTests = await readFile(join(root, 'tests/scoring/test-scoring.mjs'), 'utf8');
const privateImport = "import data from '../../data/ingestion.json' with { type: 'json' };";
assert.equal(scoringTests.split(privateImport).length, 2, 'one exact private scoring fixture import must be replaced');
await writeFile(join(target, 'tests/scoring/test-scoring.mjs'), scoringTests.replace(privateImport, "import data from '../../scripts/public/scoring-data.mjs';"));
// Portable browser entry points live outside the private project namespace.
// Copy only these product checks; admission/audit scripts remain forbidden.
for (const name of ['test-routes.mjs', 'test-core-views.mjs', 'test-cost-version-views.mjs', 'test-cohort-views.mjs']) {
  const original = await readFile(join(root, 'scripts/project', name), 'utf8');
  assert(original.includes("from '../test-harness.mjs'"), 'expected browser harness import');
  const portable = original.replaceAll("from '../../src/", "from '../src/")
    .replaceAll("from '../test-harness.mjs'", "from './test-harness.mjs'")
    .replaceAll("from '../test-target.mjs'", "from './test-target.mjs'")
    .replaceAll('scripts/project/' + name, 'scripts/' + name)
    .replaceAll('scripts/project/test-routes.mjs', 'scripts/test-routes.mjs')
    .replaceAll('scripts/public-content/README.md', 'README.md');
  await writeFile(join(target, 'scripts', name), portable);
}
await writePublicData(target);
const manifest = await sealSource(target);
return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--output'), 'usage: npm run public:prepare -- [--output <empty directory>]');
  const manifest = await preparePublicSnapshot(args.length ? resolve(args[1]) : undefined);
  console.log(`Prepared public source: ${manifest.fileCount} files, ${manifest.sourceSha256}. No Git or publication operation.`);
}
