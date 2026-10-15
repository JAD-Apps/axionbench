import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSource, validateSource, sealSource, SOURCE_MANIFEST, REFRESH_FILES, sha256, jsonBytes, readJson, outsideRepository } from './boundary.mjs';
import { validateData, writePublicData } from './data.mjs';
import { runPublicRefresh } from './refresh.mjs';
import { boundaryTestDirectory } from './temp-directory.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = await validateSource(root);
await validateData(root);
const base = await boundaryTestDirectory({ temporaryRoot: join(root, 'test-results', 'scratch') });
const checks = [];
async function fixture(label, work) {
  const dir = join(base, String(checks.length)); await mkdir(dir);
  for (const { path } of [...manifest.files, { path: SOURCE_MANIFEST }]) {
    await mkdir(dirname(join(dir, path)), { recursive: true }); await writeFile(join(dir, path), await readFile(join(root, path)));
  }
  // Model a repository boundary independently of any enclosing temporary
  // sandbox Git marker. This contains no objects, commits or copied ancestry.
  await mkdir(join(dir, '.git'));
  await work(dir); checks.push(label); console.log(`ok ${label}`);
}
async function mutate(dir, path, operation, { frozen = false } = {}) {
  const value = await readJson(dir, path); operation(value); const bytes = jsonBytes(value); await writeFile(join(dir, path), bytes);
  if (frozen) { const contract = await readJson(dir, 'FROZEN-SNAPSHOT.json'); contract.files[path] = sha256(bytes); await writeFile(join(dir, 'FROZEN-SNAPSHOT.json'), jsonBytes(contract)); }
}
try {
  await fixture('portable CI runs real gates and refresh stages only the exact fact allowlist', async dir => {
    const pkg = await readJson(dir, 'package.json');
    assert.equal(pkg.packageManager, 'npm@11.19.0');
    assert.equal(pkg.scripts.prebuild, 'node scripts/public/validate.mjs');
    assert.equal(pkg.scripts['verify:public'], 'node scripts/public/verify.mjs');
    for (const name of ['ci', 'refresh-data']) {
      const text = await readFile(join(dir, `.github/workflows/${name}.yml`), 'utf8');
      assert.match(text, /^on:\s*$/m); assert.match(text, /^jobs:\s*$/m); assert(!/pull_request_target/.test(text));
      assert.match(text, /npm ci --include=dev/); assert.match(text, /npm run verify:public/);
      assert.match(text, /npm install --global npm@11\.19\.0/); assert.match(text, /timeout-minutes: \d+/);
      const actions = [...text.matchAll(/uses:\s*(\S+)/g)].map(match => match[1]);
      assert(actions.length >= 2); for (const action of actions) assert.match(action, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
      for (const [, script] of text.matchAll(/npm run ([\w:-]+)/g)) assert(pkg.scripts[script], `workflow missing script ${script}`);
    }
    const ci = await readFile(join(dir, '.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /contents: read/); assert.match(ci, /pull_request:/); assert.match(ci, /workflow_dispatch:/);
    const refresh = await readFile(join(dir, '.github/workflows/refresh-data.yml'), 'utf8');
    assert.match(refresh, /--audit-dir "\$RUNNER_TEMP\/axionbench-source-audit"/); assert.match(refresh, /gh pr create --base main/);
    assert.match(refresh, /workflow_dispatch:/); assert(!/^\s+schedule:/m.test(refresh), 'the GitHub cron is not the authoritative updater');
    const stage = /^\s+git add (.+)$/m.exec(refresh); assert(stage);
    assert.deepEqual(stage[1].trim().split(/\s+/).sort(), REFRESH_FILES.slice().sort(), 'CI cannot stage raw directories or unrelated files');
    assert(!/git push[^\n]*\bmain\b|pages deploy|wrangler|git add (?:\.|-A|--all)(?:\s|$)/m.test(refresh));
    const quality = await readJson(dir, 'jadbot.quality.json');
    assert.equal(quality.release.artifact, 'dist/release-manifest.json');
    assert.deepEqual(quality.health, ['npm run release:check', 'node scripts/release/production-check.mjs --dist dist']);
    assert.deepEqual(quality.recovery[0], { fault: 'rm -f dist/index.html', assert: '! npm run release:check', recover: 'npm run build:release', assertRecovered: 'npm run release:check' });
    for (const row of quality.recovery) { assert.match(row.assert, /^! /); assert.equal(row.recover, 'npm run build:release'); }
    assert(quality.validation.some(command => command.startsWith('node scripts/release/publish.mjs candidate')), 'candidate artifact command');
    for (const command of [...quality.validation, ...quality.health, ...quality.recovery.flatMap(row => [row.assert, row.assertRecovered])])
      for (const [, script] of command.matchAll(/node (scripts\/[\w/.-]+\.mjs)/g)) await readFile(join(dir, script));
    const deploy = await readJson(dir, 'deploy.config.json');
    assert.deepEqual([deploy.projectName, deploy.hostname, deploy.repo], ['axionbench', 'axionbench.jadapps.app', 'JAD-Apps/axionbench']);
  });
  await fixture('manifest rejects tampered asset and omitted/extra files', async dir => {
    const path = 'public/assets/surface.js'; await writeFile(join(dir, path), 'tampered');
    await assert.rejects(validateSource(dir), /every actual file byte/);
    await writeFile(join(dir, path), await readFile(join(root, path)));
    await writeFile(join(dir, 'extra.json'), '{}'); await assert.rejects(validateSource(dir), /every actual file byte/);
  });
  await fixture('raw source, private records and symlink audit boundaries fail closed', async dir => {
    await mkdir(join(dir, 'data/source-snapshots')); await writeFile(join(dir, 'data/source-snapshots/raw.json'), '{}');
    await assert.rejects(scanSource(dir), /private directory/); await rm(join(dir, 'data/source-snapshots'), { recursive: true });
    await writeFile(join(dir, 'docs/owner-approval.json'), '{}'); await assert.rejects(scanSource(dir), /private file/); await rm(join(dir, 'docs/owner-approval.json'));
    await assert.rejects(outsideRepository(dir, join(dir, 'audit')), /outside the repository/);
    await symlink(dir, join(base, 'alias'), 'dir'); await assert.rejects(outsideRepository(dir, join(base, 'alias/audit')), /outside the repository/);
  });
  await fixture('frozen byte digest rejects invented identity', async dir => {
    await mutate(dir, 'data/frozen-catalogue.json', d => { d.models[0].name = 'invented'; });
    await assert.rejects(validateData(dir), /frozen snapshot changed/);
  });
  await fixture('missing permitted facts fail before validation or build', async dir => {
    await rm(join(dir, 'data/public-price-facts.json'));
    await assert.rejects(scanSource(dir), /missing permitted public source file/);
    await assert.rejects(validateData(dir), error => error.code === 'ENOENT');
  });
  await fixture('credential-shaped content and private imports cannot hide in permitted files', async dir => {
    const path = join(dir, 'public/privacy.html');
    const before = await readFile(path);
    for (const value of ['ghp_' + 'a'.repeat(30), 'AKIA' + 'A'.repeat(16), 'Bearer ' + 'x'.repeat(40), 'CLOUDFLARE_API_TOKEN=' + 'x'.repeat(40)]) {
      await writeFile(path, value); await assert.rejects(scanSource(dir), /credential/);
    }
    await writeFile(path, before);
    await writeFile(join(dir, 'scripts/public/scoring-data.mjs'), 'import data from ' + JSON.stringify(['..', '..', 'data', 'ingestion.json'].join('/')) + ';');
    await assert.rejects(scanSource(dir), /private.*dependency/);
  });
  await fixture('invalid provenance and invented replication claims are rejected', async dir => {
    await mutate(dir, 'data/authority/bfcl-v4.json', d => { d.provenance = 'publisher-own'; });
    await assert.rejects(validateData(dir), /BFCL provenance/);
    await writeFile(join(dir, 'data/authority/bfcl-v4.json'), await readFile(join(root, 'data/authority/bfcl-v4.json')));
    await mutate(dir, 'data/publisher-percentage-facts.json', d => { d.sources[0].cells[0].independentReplication = true; });
    await assert.rejects(validateData(dir));
  });
  await fixture('private metadata cannot hide in an allowed factual projection', async dir => {
    await mutate(dir, 'data/frozen-catalogue.json', d => { d.models[0].subscription = { quota: 123 }; });
    await assert.rejects(scanSource(dir), /private field/);
  });
  await fixture('exact configuration joins reject related-model transfer', async dir => {
    await mutate(dir, 'data/frozen-catalogue.json', d => { d.configurations[d.observations[0].configurationId].modelId = d.models.find(m => m.id !== d.observations[0].modelId).id; }, { frozen: true });
    await assert.rejects(validateData(dir), /exact config join/);
  });
  await fixture('source references and original URLs reject dangling evidence', async dir => {
    await mutate(dir, 'data/frozen-catalogue.json', d => { d.models[0].sourceIds.push('unknown-source'); }, { frozen: true });
    await assert.rejects(validateData(dir), /unknown frozen source/);
  });
  await fixture('authority score/hash and undocumented units rejected', async dir => {
    await mutate(dir, 'data/authority/bfcl-v4.json', d => { d.rows[0].overallPercent += 1; });
    await assert.rejects(validateData(dir), /projected rows were altered/);
    await writeFile(join(dir, 'data/authority/bfcl-v4.json'), await readFile(join(root, 'data/authority/bfcl-v4.json')));
    await mutate(dir, 'data/authority/bfcl-v4.json', d => { d.metric.evidence = null; });
    await assert.rejects(validateData(dir));
  });
  await fixture('unlicensed or unpermitted nested fact payloads are rejected', async dir => {
    await mutate(dir, 'data/authority/epoch-hub.json', d => { d.licence.name = 'unknown'; });
    await assert.rejects(validateData(dir), /CC BY 4.0/);
    await writeFile(join(dir, 'data/authority/epoch-hub.json'), await readFile(join(root, 'data/authority/epoch-hub.json')));
    await mutate(dir, 'data/authority-deepswe.json', d => { d.rows[0].responseBody = { routedPrice: 99 }; });
    await assert.rejects(validateData(dir), /unpermitted or missing fact fields/);
  });
  await fixture('licensed source cells reject tariff changes', async dir => {
    await mutate(dir, 'data/public-price-facts.json', d => { d.records[0].input *= 2; });
    await assert.rejects(validateData(dir), /source cell\/rate mismatch/);
  });
  await fixture('pricing freshness gate rejects stale/future captures', async dir => {
    const data = await readJson(dir, 'data/public-price-facts.json');
    await assert.rejects(validateData(dir, { now: Date.parse(data.source.retrievedAt) + 8 * 86400000 }), /freshness/);
    await mutate(dir, 'data/public-price-facts.json', d => { d.source.retrievedAt = new Date(Date.now() + 86400000).toISOString(); for (const row of d.records) row.retrievedAt = d.source.retrievedAt; });
    await assert.rejects(validateData(dir), /future retrieval/);
  });
  await fixture('failing source capture retains every last-good byte and a failure receipt', async dir => {
    const before = await validateSource(dir);
    const result = await runPublicRefresh({ root: dir, auditDir: join(base, 'failure-audit'), capture: async ({ stage }) => { await writeFile(join(stage, 'data/public-price-facts.json'), '{}'); throw new Error('fixture HTTP 503'); } });
    assert.equal(result.ok, false); assert.match(result.receipt.message, /fixture HTTP 503/);
    assert.deepEqual(await validateSource(dir), before); await validateData(dir);
  });
  await fixture('refresh refuses raw payloads and changes outside admitted files', async dir => {
    const result = await runPublicRefresh({ root: dir, auditDir: join(base, 'raw-audit'), capture: async ({ stage }) => { await mkdir(join(stage, 'data/source-snapshots')); await writeFile(join(stage, 'data/source-snapshots/raw.json'), '{}'); } });
    assert.equal(result.ok, false); assert.match(result.receipt.message, /private directory/); assert.deepEqual(await validateSource(dir), manifest);
  });
  await fixture('refresh rejects raw data hidden inside a permitted JSON filename', async dir => {
    const result = await runPublicRefresh({ root: dir, auditDir: join(base, 'nested-audit'), capture: async ({ stage }) => {
      await mutate(stage, 'data/authority-deepswe.json', d => { d.rows[0].responseBody = { privateTariff: 99 }; });
    } });
    assert.equal(result.ok, false); assert.match(result.receipt.message, /unpermitted or missing fact fields/); assert.deepEqual(await validateSource(dir), manifest);
  });
  await fixture('partial promotion rolls back bytes including its source manifest', async dir => {
    let writes = 0;
    const result = await runPublicRefresh({ root: dir, auditDir: join(base, 'partial-audit'), capture: async () => {}, promote: async (path, bytes) => { await writeFile(path, bytes); if (++writes === 2) throw new Error('fixture disk failure'); } });
    assert.equal(result.ok, false); assert.match(result.receipt.message, /fixture disk failure/); assert.deepEqual(await validateSource(dir), manifest);
  });
  await fixture('successful fixture promotion only admits facts, preserves frozen catalogue and validates new hashes', async dir => {
    const frozenBefore = sha256(await readFile(join(dir, 'data/frozen-catalogue.json')));
    const result = await runPublicRefresh({ root: dir, auditDir: join(base, 'success-audit'), capture: async ({ stage }) => {
      await mutate(stage, 'data/public-price-facts.json', d => { d.source.retrievedAt = new Date().toISOString(); for (const row of d.records) row.retrievedAt = d.source.retrievedAt; });
    } });
    assert.equal(result.ok, true); assert.equal(result.receipt.status, 'promoted'); assert.equal(result.receipt.rawPayloadsPromoted, 0);
    assert.equal(frozenBefore, sha256(await readFile(join(dir, 'data/frozen-catalogue.json')))); await validateSource(dir); await validateData(dir);
  });
  await fixture('stale last-good pricing can be repaired through validated refresh', async dir => {
    await mutate(dir, 'data/public-price-facts.json', d => { d.source.retrievedAt = new Date(Date.now() - 8 * 86400000).toISOString(); for (const row of d.records) row.retrievedAt = d.source.retrievedAt; });
    await writePublicData(dir, { requireFreshPrices: false }); await sealSource(dir);
    await assert.rejects(validateData(dir), /freshness/);
    const result = await runPublicRefresh({ root: dir, auditDir: join(base, 'stale-audit'), capture: async ({ stage }) => {
      await mutate(stage, 'data/public-price-facts.json', d => { d.source.retrievedAt = new Date().toISOString(); for (const row of d.records) row.retrievedAt = d.source.retrievedAt; });
    } });
    assert.equal(result.ok, true); await validateData(dir);
  });
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/public-boundary.json', jsonBytes({ passed: true, kind: 'local-adversarial-fixtures', publicSourceSha256: manifest.sourceSha256, checks }));
} finally { await rm(base, { recursive: true, force: true }); }
