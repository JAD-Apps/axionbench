// Private, read-only qualification. Expected seals come from the coordinator;
// a receipt's own claimed identity is never the expected candidate identity.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSource } from '../public/boundary.mjs';
import { validateData } from '../public/data.mjs';
import { scanDist, sha256, validateManifest, compareWithBuild, pathProblem } from '../release/manifest.mjs';
import { checkDist } from '../release/production-check.mjs';
import { verifyCapture } from '../release/verify-capture.mjs';
import { sourceIdentity, publishableSource } from '../release/source-identity.mjs';
import { verifyPublicationReceipts } from './verify-receipts.mjs';
import { verifyArtifact, readReceiptArtifact, verifyCommandEvidence, verifyEvidenceBinding } from './receipts.mjs';
import { privateSource } from './qualification-source.mjs';
import { validateReadback, sourceDigest } from '../automation/jadbot-daily.mjs';
import { routes } from '../../src/routes.ts';
import { hostedRequest } from '../release/deployment-gate.mjs';

export const TARGET = Object.freeze({ repo: 'JAD-Apps/axionbench', url: 'https://axionbench.jadapps.app' });
export const PIN = Object.freeze({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
export const PUBLIC_GATES = ['lint','data:validate','test:current-policy','test:boundary','typecheck','test:unit','test:scoring','test:pricing','test:weights','build','verify:design','test:routes','test:core-views','test:chart-smoke','test:cost-weights','test:cost-version-views','test:cohort-views','test:acceptance','build:release','release:check'];
const HEX = /^[a-f0-9]{64}$/;
const REPORTS = ['routes','core-views','cost-version-views','cohort-views','acceptance'];
const commands = gates => gates.map(gate => `npm run ${gate}`);

// Read the existing gate declaration without importing its executable runner.
export async function privateCommands(root) {
  const runner = await readFile(join(root, 'scripts/release/verify-release.mjs'), 'utf8');
  const list = runner.match(/export const GATES = \[([\s\S]*?)\n\];/)?.[1];
  assert(list, 'private release gate declaration missing');
  const gates = [...list.matchAll(/^\s*\['([^']+)',/gm)].map(match => match[1]);
  const foundation = ['lint','typecheck','test:unit','test:scoring','test:pricing','test:weights','test:cost-weights','test:registry','test:data','data:validate','test:authority','verify:design','test:frontier','test:chart-smoke','test:head-to-head','test:open-weights','test:catalogue','test:acceptance','verify:automation','build:release','release:check'];
  for (const gate of [...foundation, 'verify:public', 'test:routes','test:core-views','test:cost-version-views','test:cohort-views']) assert(gates.includes(gate), `required private gate removed: ${gate}`);
  assert.equal(new Set(gates).size, gates.length, 'duplicate private gate');
  return commands(gates);
}

export function validateSeals(expected) {
  for (const kind of ['private', 'public']) for (const key of ['sourceSha256', 'productSha256', 'dataSha256']) assert.match(expected?.[kind]?.[key], HEX, `trusted ${kind}.${key} required`);
  return expected;
}
export function fresh(value, { now = Date.now(), maxAgeMs = 72 * 3600_000 } = {}) {
  const time = Date.parse(value);
  assert(Number.isFinite(time) && time <= now + 60_000 && now - time <= maxAgeMs, 'evidence time invalid, future or stale');
  return time;
}

export async function verifyBrowserEvidence(root, receipt, dataSha256) {
  assert(Array.isArray(receipt.capturedEvidence) && receipt.capturedEvidence.length, 'captured browser evidence missing');
  // Exact inventory: no missing screenshots, omitted reports, symlinks or extra files.
  const actual = (await scanDist(join(root, receipt.evidenceRoot))).files;
  assert.deepEqual(actual, receipt.capturedEvidence, 'captured evidence inventory differs');
  for (const file of actual) await verifyArtifact(root, { ...file, path: `${receipt.evidenceRoot}/${file.path}` });
  const inventory = new Map(actual.map(file => [file.path, file]));
  for (const name of REPORTS) {
    const report = await readReceiptArtifact(root, { ...inventory.get(`${name}/report.json`), path: `${receipt.evidenceRoot}/${name}/report.json` });
    assert.equal(report.passed, true, `${name}: browser checks failed`);
    if (report.dataSha256 !== undefined) assert.equal(report.dataSha256, dataSha256, `${name}: browser data differs`);
    assert(Array.isArray(report.checks) && report.checks.length, `${name}: browser checks missing`);
    if (report.failures) assert.deepEqual(report.failures, [], `${name}: browser failures`);
    for (const source of report.currentSource ?? []) {
      assert.equal(pathProblem(source.path), null, 'unsafe browser source path');
      assert.equal(sha256(await readFile(join(root, source.path))), source.sha256, `${name}: browser source changed: ${source.path}`);
    }
    assert(Array.isArray(report.screenshots) && report.screenshots.length, `${name}: screenshots missing`);
    for (const shot of report.screenshots) {
      const path = typeof shot === 'string' ? shot : shot.path;
      const relative = path.startsWith('test-results/') ? path.slice('test-results/'.length) : path.includes('/') ? path : `${name}/${path}`;
      assert.equal(pathProblem(relative), null, 'unsafe screenshot evidence path');
      const file = inventory.get(relative);
      assert(file, `${name}: screenshot absent from captured inventory: ${path}`);
      if (typeof shot !== 'string') assert.equal(file.sha256, shot.sha256, `${name}: screenshot hash mismatch`);
      const bytes = await readFile(join(root, receipt.evidenceRoot, relative));
      if (relative.endsWith('.png')) {
        assert(bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `${name}: screenshot is not PNG`);
        assert(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, `${name}: screenshot dimensions missing`);
      } else {
        assert(/\.jpe?g$/.test(relative) && bytes.subarray(0,3).equals(Buffer.from([255,216,255])) && bytes.subarray(-2).equals(Buffer.from([255,217])), `${name}: screenshot is not JPEG`);
      }
    }
  }
  const routeReport = JSON.parse(await readFile(join(root, receipt.evidenceRoot, 'routes/report.json'), 'utf8'));
  assert(routeReport.widths?.some(w => w <= 430) && routeReport.widths.some(w => w >= 700 && w <= 1024) && routeReport.widths.some(w => w >= 1280), 'mobile/tablet/desktop route evidence missing');
  return { reports: REPORTS.length, artifacts: actual.length };
}

export async function qualifyCandidates({ privateRoot, publicRoot, evidenceRoot, record, expected, now = Date.now() }) {
  validateSeals(expected);
  assert.equal(record?.schemaVersion, 'axionbench-qualification-request-v1');
  assert.equal(record.publicationEnabled, false, 'qualification must leave publication disabled');
  const sealed = await privateSource(privateRoot);
  assert.equal(sealed.sourceSha256, expected.private.sourceSha256, 'private candidate source changed');
  const publicSource = await validateSource(publicRoot);
  assert.equal(publicSource.sourceSha256, expected.public.sourceSha256, 'public candidate source changed');
  await validateData(publicRoot);
  const privateReceipt = await readReceiptArtifact(privateRoot, record.privateReceipt);
  assert.equal(privateReceipt.schemaVersion, 'axionbench-private-verification-v1');
  assert.equal(privateReceipt.sourceUnchanged, true, 'private verification mutated source');
  fresh(privateReceipt.finishedAt, { now });
  await verifyCommandEvidence(privateRoot, privateReceipt, { bindingKey: 'privateSourceSha256', sourceSha256: expected.private.sourceSha256, commands: await privateCommands(privateRoot) });
  verifyEvidenceBinding(privateReceipt.candidate, { productSha256: expected.private.productSha256, dataSha256: expected.private.dataSha256 });
  const archive = await readReceiptArtifact(evidenceRoot, record.archiveReceipt);
  assert.equal(archive.schemaVersion, 'axionbench-archive-verification-v1');
  assert.equal(archive.privateGatesRetained, 21);
  assert.equal(archive.independentReview, false);
  assert.equal(archive.hostedCI, false);
  assert.equal(archive.error, null);
  fresh(archive.at, { now });
  const archiveRoot = join(evidenceRoot, dirname(record.archiveReceipt.path));
  await verifyCommandEvidence(archiveRoot, archive, { sourceSha256: expected.public.sourceSha256, commands: ['node --test tests/project/public-boundary.test.mjs','npm ci --include=dev --no-audit --no-fund','npm run verify:public'] });
  await verifyArtifact(archiveRoot, archive.archive);
  assert.equal(archive.candidatePath, 'archive');
  assert.equal(await realpath(publicRoot), await realpath(join(archiveRoot, archive.candidatePath)), 'public candidate is not the verified extracted archive');
  const portable = await readReceiptArtifact(publicRoot, archive.archive.portableReceipt);
  assert.equal(portable.schemaVersion, 'axionbench-portable-verification-v1');
  fresh(portable.at, { now });
  await verifyCommandEvidence(publicRoot, portable, { sourceSha256: expected.public.sourceSha256, commands: commands(PUBLIC_GATES) });
  verifyEvidenceBinding(archive, { productSha256: expected.public.productSha256, dataSha256: expected.public.dataSha256 });
  verifyEvidenceBinding(portable, { productSha256: expected.public.productSha256, dataSha256: expected.public.dataSha256 });
  for (const [kind, root, identity] of [['private',privateRoot,{}],['public',publicRoot,{ sourceArchiveSha256: expected.public.sourceSha256 }]]) {
    const manifest = validateManifest(JSON.parse(await readFile(join(root, 'dist/release-manifest.json'), 'utf8')), identity);
    compareWithBuild(manifest, await scanDist(join(root, 'dist')));
    verifyEvidenceBinding(manifest, { productSha256: expected[kind].productSha256, dataSha256: expected[kind].dataSha256 });
    await checkDist(join(root, 'dist'), identity);
  }
  const browser = { private: await verifyBrowserEvidence(privateRoot, privateReceipt, expected.private.dataSha256), public: await verifyBrowserEvidence(publicRoot, portable, expected.public.dataSha256) };
  return { schemaVersion: 'axionbench-qualified-candidates-v1', status: 'qualified', candidates: expected, browser,
    publicationEnabled: false, independentReview: false, hostedCI: false, production: false };
}

// This validates later-stage evidence; it performs no publish/enable operation.
export function validateReview(review, { candidates, builderIds }) {
  validateSeals(candidates);
  assert.equal(review?.schemaVersion, 'axionbench-independent-review-v1');
  assert.equal(review.verdict, 'approved', 'independent review did not approve');
  assert(typeof review.reviewerId === 'string' && review.reviewerId.length > 0 && Array.isArray(builderIds) && builderIds.length > 0 && !builderIds.includes(review.reviewerId), 'reviewer must be independent of candidate builders');
  assert.deepEqual(review.candidates, candidates, 'review names different sealed candidates');
  assert.deepEqual(review.choice, PIN, 'review must use codex/gpt-6.1-sol/high');
  assert.equal(review.fast, false, 'review Fast observation must be OFF');
  assert.equal(review.fallback, false, 'review must have no fallback');
  assert(Array.isArray(review.findings) && !review.findings.some(f => f.status !== 'resolved'), 'review has unresolved findings');
  return review;
}

export function validateRuntime(runtime, { actorId }) {
  assert.equal(runtime?.schemaVersion, 'axionbench-runtime-observation-v1');
  assert.equal(runtime.actorId, actorId, 'runtime actor mismatch');
  assert(typeof runtime.sessionId === 'string' && runtime.sessionId.length, 'runtime session missing');
  for (const key of ['requested','effective','providerReported']) assert.deepEqual(runtime[key], PIN, `${key}: actual model observation missing or mismatched`);
  assert.equal(runtime.fastObserved, false, 'runtime Fast OFF observation missing');
  assert.equal(runtime.fallbackUsed, false, 'runtime fallback observation missing');
  return runtime;
}

export function validateApiReadback(api, { entry, manifest }) {
  assert.equal(api?.method, 'GET');
  assert.equal(api.status, 200);
  assert.match(api.url, /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[a-f0-9]{32}\/pages\/projects\/axionbench\/deployments\/[^/?#]+$/);
  assert.equal(api.bodySha256, sha256(Buffer.from(api.body)), 'API raw response hash mismatch');
  const result = JSON.parse(api.body);
  assert.equal(result.success, true);
  verifyEvidenceBinding(result.result, { id: entry.deploymentId, project_name: 'axionbench', environment: 'production' });
  assert.equal(result.result.latest_stage?.status, 'success', 'API deployment is not successful');
  assert.equal(result.result.deployment_trigger?.metadata?.commit_hash, manifest.sourceCommit, 'API code commit differs');
  assert.equal(result.result.deployment_trigger?.metadata?.commit_message, `axionbench data ${entry.key} snapshot ${entry.snapshotSha256}`, 'API snapshot/key differs');
  return api;
}

export async function verifyNegativeProof(root, proof, current) {
  assert.equal(proof?.schemaVersion, 'axionbench-last-good-negative-v1');
  assert.deepEqual(proof.before, proof.after, 'negative case altered last-good');
  for (const key of ['key','deploymentId','snapshotSha256','productSha256','dataSha256']) assert.equal(proof.after?.[key], current[key], 'negative case names different last-good');
  const failure = await readReceiptArtifact(root, proof.failureReceipt);
  assert.equal(failure.schemaVersion, 'axionbench-publication-receipt-v1');
  assert.equal(failure.status, 'failed-restored', 'negative case did not prove verified remote restoration');
  for (const key of ['key','deploymentId','snapshotSha256']) assert.equal(failure.lastGood?.[key], current[key], 'failure receipt last-good differs');
  const restored = await readReceiptArtifact(root, proof.restoredProduction);
  verifyEvidenceBinding(restored, { mode: 'host', url: TARGET.url, qualifiedManifest: true, productSha256: current.productSha256, dataSha256: current.dataSha256 });
  assert.equal(restored.refreshKey, current.key, 'restored remote key differs');
  return proof;
}

export async function acceptProduction({ root, publicRoot, record, expectedManifest, candidates, builderIds, stateDir, now = Date.now() }) {
  assert.equal(record?.schemaVersion, 'axionbench-production-acceptance-v1');
  validateManifest(expectedManifest);
  assert(publishableSource(expectedManifest), 'production requires clean committed code and an explicitly validated data overlay');
  assert(publicRoot, 'actual public checkout required for ancestry and source acceptance');
  const git = (...args) => execFileSync('git', ['-C', publicRoot, ...args], { encoding: 'utf8' });
  assert.match(git('remote','get-url','origin').trim(), /^(?:https:\/\/github\.com\/|git@github\.com:)JAD-Apps\/axionbench(?:\.git)?$/, 'public repository origin mismatch');
  assert.equal(git('rev-parse','HEAD').trim(), expectedManifest.sourceCommit, 'public checkout differs from production code commit');
  git('merge-base','--is-ancestor','b6fa8b0376aef8efec44e2399f17120b560f2d0c',expectedManifest.sourceCommit);
  const source = await sourceIdentity(publicRoot);
  assert.equal(source.codeDirty, false, 'public checkout contains changed code');
  await validateSource(publicRoot); await validateData(publicRoot);
  assert.equal(sha256(await readFile(join(publicRoot,'public/data.json'))), expectedManifest.dataSha256, 'production data differs from validated public checkout');
  const review = await readReceiptArtifact(root, record.review);
  validateReview(review, { candidates, builderIds });
  fresh(review.reviewedAt, { now });
  validateRuntime(await readReceiptArtifact(root, review.runtime), { actorId: review.reviewerId });
  const ci = await readReceiptArtifact(root, record.hostedCI);
  verifyEvidenceBinding(ci, { repo: TARGET.repo, sourceCommit: expectedManifest.sourceCommit, publicSourceSha256: candidates.public.sourceSha256, passed: true, hostedCI: true });
  assert(typeof ci.runUrl === 'string' && ci.runUrl.startsWith(`https://github.com/${TARGET.repo}/actions/runs/`), 'real public CI run missing');
  fresh(ci.finishedAt, { now });
  await verifyCommandEvidence(root, ci, { sourceSha256: candidates.public.sourceSha256, commands: commands(PUBLIC_GATES) });
  const mapping = await readReceiptArtifact(root, record.publicMapping);
  verifyEvidenceBinding(mapping, { repo: TARGET.repo, publicSourceSha256: candidates.public.sourceSha256, sourceCommit: expectedManifest.sourceCommit,
    publicBaseCommit: 'b6fa8b0376aef8efec44e2399f17120b560f2d0c', privateSourceSha256: candidates.private.sourceSha256 });
  assert(Array.isArray(mapping.commits) && mapping.commits.length > 0, 'actual logical public commits missing');
  for (const commit of mapping.commits) { assert.match(commit.publicCommit, /^[a-f0-9]{40}$/); assert.match(commit.privateSourceSha256, HEX); await verifyArtifact(root, commit.patch); }
  const health = await readReceiptArtifact(root, record.production);
  verifyEvidenceBinding(health, { mode: 'host', url: TARGET.url, qualifiedManifest: true, productSha256: expectedManifest.productSha256,
    dataSha256: expectedManifest.dataSha256, sourceCommit: expectedManifest.sourceCommit, controlSha256: expectedManifest.controlSha256, publicationStatus: 'published' });
  fresh(health.checkedAt, { now });
  assert.deepEqual(health.assets?.map(({ status, ...file }) => file), expectedManifest.files, 'production asset evidence incomplete');
  for (const file of health.assets) assert.equal(file.status, hostedRequest(file.path).status, 'production artifact HTTP status mismatch');
  assert.deepEqual(health.routes?.map(route => route.path), routes.map(route => route.path), 'production route evidence incomplete');
  assert(health.routes.every(route => route.status === 200), 'production route evidence failed');
  const publication = await verifyPublicationReceipts(stateDir);
  assert(publication.current, 'verified native API publication missing');
  for (const key of ['sourceCommit','productSha256','dataSha256','controlSha256']) assert.equal(publication.current[key], expectedManifest[key], 'retained deployment differs from accepted release');
  const capture = await readReceiptArtifact(root, record.capture);
  await verifyCapture(capture, { root: join(root, dirname(record.capture.path)), hostname: 'axionbench.jadapps.app', releaseManifest: expectedManifest, requireAcceptance: true, now });
  // Windows proof and native execution/negative proof are separately captured;
  // declared success without a bound artifact never qualifies.
  const owner = await readReceiptArtifact(root, record.ownerBrowser);
  verifyEvidenceBinding(owner, { url: `${TARGET.url}/`, platform: 'win32', opened: true, productSha256: expectedManifest.productSha256, dataSha256: expectedManifest.dataSha256 });
  fresh(owner.capturedAt, { now });
  assert(typeof owner.title === 'string' && owner.title.includes('AxionBench'), 'owner browser title missing');
  await verifyArtifact(root, owner.screenshot);
  assert(capture.files.some(file => file.kind === 'screenshot' && file.sha256 === owner.screenshot.sha256 && file.bytes === owner.screenshot.bytes), 'owner browser screenshot is absent from the deployed capture');
  const native = await readReceiptArtifact(root, record.nativeExecution);
  verifyEvidenceBinding(native, { source: 'jadbot-api', scheduleId: 'wfs_361f98ad3bac', status: 'passed', remoteApiVerified: true, lastGoodRetained: true });
  assert(typeof native.runId === 'string' && native.runId.length, 'actual native run id missing');
  fresh(native.finishedAt, { now });
  assert.deepEqual(native.choice, PIN);
  assert.equal(native.fast, false); assert.equal(native.fallback, false);
  assert.equal(native.remoteSnapshotSha256, publication.current.snapshotSha256, 'native API readback differs from retained publication');
  assert.equal(native.deploymentId, publication.current.deploymentId);
  validateApiReadback(await readReceiptArtifact(root, native.apiReadback), { entry: publication.current, manifest: expectedManifest });
  await verifyNegativeProof(root, await readReceiptArtifact(root, native.negativeCase), publication.current);
  validateRuntime(await readReceiptArtifact(root, native.runtime), { actorId: native.actorId });
  validateReadback(await readReceiptArtifact(root, native.schedule), { requireDisabled: true, now, source: await sourceDigest() });
  const evaluation = await readReceiptArtifact(root, record.finalEvaluation);
  verifyEvidenceBinding(evaluation, { schemaVersion: 'axionbench-final-evaluation-v1', verdict: 'passed', productSha256: expectedManifest.productSha256, dataSha256: expectedManifest.dataSha256, sourceCommit: expectedManifest.sourceCommit });
  fresh(evaluation.finishedAt, { now });
  assert(typeof evaluation.evaluatorId === 'string' && evaluation.evaluatorId.length && !builderIds.includes(evaluation.evaluatorId), 'final evaluator must be independent');
  validateRuntime(await readReceiptArtifact(root, evaluation.runtime), { actorId: evaluation.evaluatorId });
  assert(Array.isArray(evaluation.checks) && evaluation.checks.length > 0 && evaluation.checks.every(check => check.passed === true), 'final evaluation checks missing or failed');
  for (const check of evaluation.checks) await verifyArtifact(root, check.evidence);
  return { status: 'accepted', url: TARGET.url, productSha256: expectedManifest.productSha256, publicationEnabled: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
  assert(args.includes('--record') && args.includes('--expected') && args.includes('--private-root') && args.includes('--public-root'), 'usage: qualification.mjs --record <request.json> --expected <trusted-seals.json> --private-root <checkout> --public-root <extracted archive>');
  const recordPath = resolve(option('--record'));
  const report = await qualifyCandidates({ privateRoot: resolve(option('--private-root')), publicRoot: resolve(option('--public-root')),
    evidenceRoot: dirname(recordPath), record: JSON.parse(await readFile(recordPath, 'utf8')), expected: JSON.parse(await readFile(option('--expected'), 'utf8')) });
  console.log(JSON.stringify(report, null, 2));
}
