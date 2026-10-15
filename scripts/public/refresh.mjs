// Public refresh is a staged transaction, never an ingestion of provider
// payloads into Git. Only the reviewed factual files may be promoted.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshAuthority } from '../deepswe-authority.mjs';
import { refreshEpoch } from '../authority/epoch-hub.mjs';
import { refreshBfcl } from '../authority/bfcl.mjs';
import { refreshLongBench } from '../authority/longbench-v2.mjs';
import { FACT_FILES, REFRESH_FILES, SOURCE_MANIFEST, outsideRepository, permittedDeepSwe, validateSource, sealSource, sha256, jsonBytes } from './boundary.mjs';
import { validateData, writePublicData } from './data.mjs';

export async function captureFacts({ stage, auditDir }) {
  const target = path => join(stage, path);
  await refreshAuthority({ output: target(FACT_FILES[0]), auditDir });
  const deepSwe = JSON.parse(await readFile(target(FACT_FILES[0]), 'utf8'));
  await writeFile(target(FACT_FILES[0]), jsonBytes(permittedDeepSwe(deepSwe)));
  await refreshEpoch({ output: target('data/authority/epoch-hub.json'), auditDir });
  await refreshBfcl({ output: target('data/authority/bfcl-v4.json'), auditDir });
  await refreshLongBench({ output: target('data/authority/longbench-v2.json'), auditDir });
  for (const [script, args] of [
    ['scripts/publisher-tables.py', [target('data/publisher-percentage-facts.json'), auditDir]],
    ['scripts/pricing/capture-google.py', ['--output', target('data/public-price-facts.json'), '--audit-dir', auditDir]],
    ['scripts/authority/current-capture.py', ['--output', target('data/current-source-evidence.json'), '--audit-dir', auditDir]],
  ]) {
    const result = spawnSync('python3', [target(script), ...args], { cwd: stage, stdio: 'inherit', timeout: 180000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(result.status, 0, `${script}: source extraction failed (${result.error?.message ?? result.status})`);
  }
}
const atomic = async (path, bytes) => { const temp = `${path}.${process.pid}.promote`; await writeFile(temp, bytes); await rename(temp, path); };
const retrieved = data => data.source?.retrievedAt ?? null;
export async function runPublicRefresh({ root, auditDir, capture = captureFacts, promote = atomic, now = () => new Date() }) {
  assert(auditDir, 'usage: npm run data:refresh -- --audit-dir <directory outside the repository>');
  const audit = await outsideRepository(root, auditDir);
  const beforeManifest = await validateSource(root);
  // A stale last-good capture may be refreshed. Only the candidate promotion
  // and normal prebuild/CI gate require a currently quoteable capture.
  const beforeData = await validateData(root, { requireFreshPrices: false, requireFreshCurrent: false });
  const before = new Map();
  for (const path of REFRESH_FILES) before.set(path, await readFile(join(root, path)));
  await mkdir(audit, { recursive: true, mode: 0o700 });
  const stage = await mkdtemp(join(audit, 'public-stage-'));
  let promoted = false;
  try {
    for (const file of [...beforeManifest.files, { path: SOURCE_MANIFEST }]) {
      const path = join(stage, file.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, await readFile(join(root, file.path)));
    }
    const raw = join(audit, 'raw'); await mkdir(raw, { recursive: true, mode: 0o700 });
    await capture({ stage, auditDir: raw });
    for (const path of FACT_FILES) {
      const a = JSON.parse(before.get(path)), b = JSON.parse(await readFile(join(stage, path)));
      if (retrieved(a)) assert(Date.parse(retrieved(b)) >= Date.parse(retrieved(a)), `${path}: older retrieval refused`);
      if (a.source?.generatedAt && b.source?.generatedAt) assert(Date.parse(b.source.generatedAt) >= Date.parse(a.source.generatedAt), `${path}: older evaluation generation refused`);
    }
    const next = await writePublicData(stage);
    assert(next.projection.authority.floor.suites.length >= beforeData.projection.authority.floor.suites.length, 'admitted suite coverage regressed');
    assert(next.projection.authority.floor.domains.length >= beforeData.projection.authority.floor.domains.length, 'admitted domain coverage regressed');
    assert(next.projection.authority.observations.length >= beforeData.projection.authority.observations.length * .9, 'authority observations fell more than 10%');
    const staged = await sealSource(stage);
    const oldPaths = beforeManifest.files.map(row => row.path);
    assert.deepEqual(staged.files.map(row => row.path), oldPaths, 'refresh cannot add or remove source files');
    const changed = staged.files.filter((file, i) => file.sha256 !== beforeManifest.files[i].sha256).map(file => file.path);
    assert(changed.every(path => REFRESH_FILES.includes(path)), `refresh changed an unpermitted file: ${changed.filter(path => !REFRESH_FILES.includes(path)).join(', ')}`);
    await validateSource(stage); await validateData(stage);
    promoted = true; // even the first partial write must roll back
    for (const path of REFRESH_FILES) await promote(join(root, path), await readFile(join(stage, path)));
    await validateSource(root); await validateData(root);
    const receipt = { schemaVersion: 'axionbench-public-refresh-v1', status: changed.length ? 'promoted' : 'no-change', at: now().toISOString(),
      beforeSourceSha256: beforeManifest.sourceSha256, afterSourceSha256: staged.sourceSha256, changed,
      productDataSha256: next.manifest.projection.sha256, rawPayloadsPromoted: 0, gitOperations: 0,
      frozenCatalogueRefreshed: false };
    const bytes = jsonBytes(receipt);
    await writeFile(join(audit, `refresh-${sha256(bytes)}.json`), bytes, { flag: 'wx', mode: 0o600 });
    return { ok: true, receipt };
  } catch (error) {
    if (promoted) for (const [path, bytes] of before) await atomic(join(root, path), bytes);
    await validateSource(root); await validateData(root, { requireFreshPrices: false });
    const receipt = { schemaVersion: 'axionbench-public-refresh-v1', status: 'failed-last-good-retained', at: now().toISOString(),
      message: error.message, sourceSha256: beforeManifest.sourceSha256, dataSha256: beforeData.manifest.projection.sha256, rawPayloadsPromoted: 0, gitOperations: 0 };
    const bytes = jsonBytes(receipt);
    await writeFile(join(audit, `refresh-failure-${sha256(bytes)}.json`), bytes, { flag: 'wx', mode: 0o600 });
    return { ok: false, receipt };
  } finally { await rm(stage, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--audit-dir');
  assert.equal(args.length, 2, 'provide only --audit-dir <external directory>'); assert.equal(at, 0);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = await runPublicRefresh({ root, auditDir: args[1] });
  console.log(JSON.stringify(result.receipt)); if (!result.ok) process.exitCode = 1;
}
