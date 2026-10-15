// Read-only qualification contracts. Evidence is consumed, never generated.
// Callers supply trusted hashes; a receipt's own identity is not authority.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { routes } from '../../src/routes.ts';
import { validateSource, sha256 } from '../public/boundary.mjs';
import { validateManifest, scanDist, compareWithBuild, pathProblem } from '../release/manifest.mjs';
import { checkHost } from '../release/production-check.mjs';
import { checkRouteFiles } from '../release/production-check.mjs';
import { publishableSource } from '../release/source-identity.mjs';
import { verifyCapture } from '../release/verify-capture.mjs';
import { readReceiptArtifact, verifyArtifact, verifyCommandEvidence, verifyEvidenceBinding, verifyCapturedEvidence } from './receipts.mjs';
import { fingerprintSource } from './source-fingerprint.mjs';

export const PRIVATE_COMMANDS = ['lint','typecheck','test:unit','test:scoring','test:pricing','test:weights','test:cost-weights','test:registry','test:data','data:validate','test:authority','verify:design','test:frontier','test:core-views','test:chart-smoke','test:head-to-head','test:open-weights','test:cohort-views','test:catalogue','test:acceptance','verify:automation','verify:public','build:release','release:check'].map(script => `npm run ${script}`);
export const PUBLIC_COMMANDS = ['lint','data:validate','test:current-policy','test:boundary','typecheck','test:unit','test:scoring','test:pricing','test:weights','build','verify:design','test:routes','test:core-views','test:chart-smoke','test:cost-weights','test:cost-version-views','test:cohort-views','test:acceptance','build:release','release:check'].map(script => `npm run ${script}`);
export const BROWSER_REPORTS = ['routes','core-views','cost-version-views','cohort-views'];
const HEX = /^[a-f0-9]{64}$/;
const PNG = Buffer.from([137,80,78,71,13,10,26,10]);

export function requireIdentity(expected) {
  for (const key of ['sourceSha256','productSha256','dataSha256','controlSha256']) assert.match(expected?.[key], HEX, `trusted ${key} required`);
}
function fresh(at, now, maxAgeMs) {
  const time = Date.parse(at);
  assert(Number.isFinite(time) && time <= now + 60_000 && now - time <= maxAgeMs, 'evidence timestamp is missing, stale or in the future');
}

export async function verifyBrowserEvidence({ sourceRoot, evidenceRoot, descriptors, expected, now = Date.now(), maxAgeMs = 72 * 3600000 }) {
  requireIdentity(expected);
  assert.deepEqual(Object.keys(descriptors).sort(), BROWSER_REPORTS.slice().sort(), 'complete browser report set required');
  let screenshots = 0;
  for (const name of BROWSER_REPORTS) {
    const report = await readReceiptArtifact(evidenceRoot, descriptors[name]);
    verifyEvidenceBinding(report, { passed: true, dataSha256: expected.dataSha256 });
    fresh(report.at, now, maxAgeMs);
    assert(Array.isArray(report.checks) && report.checks.length > 0, `${name}: browser checks missing`);
    assert(Array.isArray(report.currentSource) && report.currentSource.length > 0, `${name}: current source missing`);
    const runner = name === 'routes' ? 'test-routes' : `test-${name}`;
    // Require the actual runner's complete declared source list, not a subset.
    const runnerPath = (await readFile(join(sourceRoot, `scripts/${runner}.mjs`)).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return readFile(join(sourceRoot, `scripts/project/${runner}.mjs`));
    })).toString();
    const declaration = runnerPath.match(/const sourcePaths = \[([^\]]+)\]/)?.[1];
    assert(declaration, `${name}: runner source list missing`);
    const paths = [...declaration.matchAll(/'([^']+)'/g)].map(match => match[1]);
    assert.deepEqual(report.currentSource.map(row => row.path), paths, `${name}: source list incomplete or reordered`);
    for (const row of report.currentSource) {
      assert.equal(pathProblem(row.path), null, 'unsafe browser source path');
      const bytes = await readFile(join(sourceRoot, row.path));
      await verifyArtifact(sourceRoot, { ...row, bytes: bytes.length });
    }
    const manifestBytes = await readFile(join(sourceRoot, 'public/data-manifest.json'));
    assert.equal(report.manifestSha256, sha256(manifestBytes), `${name}: stale data provenance`);
    assert(Array.isArray(report.screenshots) && report.screenshots.length > 0, `${name}: screenshots missing`);
    for (const shot of report.screenshots) {
      // Descriptor sizes must be supplied independently in the sealed contract.
      const artifact = descriptors[name].screenshots?.find(row => (row.originalPath ?? row.path) === shot.path);
      assert(artifact && artifact.sha256 === shot.sha256, `${name}: screenshot descriptor missing or mismatched`);
      const bytes = await verifyArtifact(evidenceRoot, artifact);
      assert(bytes.length >= 33 && bytes.subarray(0,8).equals(PNG), 'browser screenshot is not a PNG');
      assert(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, 'browser screenshot dimensions missing');
      screenshots++;
    }
    assert.equal(descriptors[name].screenshots.length, report.screenshots.length, `${name}: extra screenshot descriptors`);
  }
  return { reports: BROWSER_REPORTS.length, screenshots };
}

export async function qualifyCandidate({ kind, sourceRoot, distDir, evidenceRoot, receipt, browsers, expected, now = Date.now() }) {
  requireIdentity(expected);
  assert(['private','public'].includes(kind), 'candidate kind must be private or public');
  const source = kind === 'private' ? await fingerprintSource(sourceRoot) : await validateSource(sourceRoot);
  assert.equal(source.sourceSha256, expected.sourceSha256, 'current candidate source differs from trusted seal');
  const manifest = validateManifest(JSON.parse(await readFile(join(distDir, 'release-manifest.json'))), kind === 'public' ? { sourceArchiveSha256: expected.sourceSha256 } : {});
  compareWithBuild(manifest, await scanDist(distDir));
  await checkRouteFiles(distDir);
  const provenance = JSON.parse(await readFile(join(distDir, 'data-manifest.json')));
  assert.equal(provenance.projection?.sha256, manifest.dataSha256, 'candidate data provenance mismatch');
  for (const key of ['productSha256','dataSha256','controlSha256']) assert.equal(manifest[key], expected[key], `candidate ${key} mismatch`);
  const commands = await readReceiptArtifact(evidenceRoot, receipt);
  fresh(kind === 'private' ? commands.finishedAt : commands.at, now, 72 * 3600000);
  if (kind === 'private') {
    verifyEvidenceBinding(commands, { schemaVersion: 'axionbench-private-verification-v1', passed: true, sourceUnchanged: true, privateSourceSha256: expected.sourceSha256 });
    for (const key of ['productSha256','dataSha256']) assert.equal(commands.candidate?.[key], expected[key], `private gate candidate ${key} mismatch`);
  } else {
    verifyEvidenceBinding(commands, { schemaVersion: 'axionbench-portable-verification-v1', kind: 'local-command-execution', productSha256: expected.productSha256, dataSha256: expected.dataSha256 });
    await verifyCapturedEvidence(evidenceRoot, commands);
  }
  await verifyCommandEvidence(evidenceRoot, kind === 'private' ? { ...commands, publicSourceSha256: commands.privateSourceSha256 } : commands,
    { sourceSha256: expected.sourceSha256, commands: kind === 'private' ? PRIVATE_COMMANDS : PUBLIC_COMMANDS });
  const browser = await verifyBrowserEvidence({ sourceRoot, evidenceRoot, descriptors: browsers, expected, now });
  const after = kind === 'private' ? await fingerprintSource(sourceRoot) : await validateSource(sourceRoot);
  assert.equal(after.sourceSha256, expected.sourceSha256, 'candidate source changed during qualification');
  return { qualified: true, kind, ...expected, browser, independentReview: false, publicationApproved: false, productionVerified: false };
}

export async function verifyArchiveQualification({ root, descriptor, expected }) {
  requireIdentity(expected);
  const archive = await readReceiptArtifact(root, descriptor);
  verifyEvidenceBinding(archive, { schemaVersion: 'axionbench-archive-verification-v1', passed: true, publicSourceSha256: expected.sourceSha256,
    productSha256: expected.productSha256, dataSha256: expected.dataSha256, privateGatesRetained: 21, independentReview: false, hostedCI: false, candidatePath: 'archive' });
  await verifyArtifact(root, archive.archive);
  await verifyCommandEvidence(root, archive, { sourceSha256: expected.sourceSha256, commands: [
    'node --test tests/project/public-boundary.test.mjs', 'npm ci --include=dev --no-audit --no-fund', 'npm run verify:public'] });
  const candidate = join(root, archive.candidatePath);
  const source = await validateSource(candidate);
  assert.equal(source.sourceSha256, expected.sourceSha256, 'archive candidate source mismatch');
  const portable = await readReceiptArtifact(candidate, archive.archive.portableReceipt);
  await verifyCommandEvidence(candidate, portable, { sourceSha256: expected.sourceSha256, commands: PUBLIC_COMMANDS });
  verifyEvidenceBinding(portable, { productSha256: expected.productSha256, dataSha256: expected.dataSha256, independentReview: false, hostedCI: false });
  await verifyCapturedEvidence(candidate, portable);
  const release = validateManifest(JSON.parse(await readFile(join(candidate, 'dist/release-manifest.json'))), { sourceArchiveSha256: expected.sourceSha256 });
  compareWithBuild(release, await scanDist(join(candidate, 'dist')));
  assert.equal(release.controlSha256, expected.controlSha256, 'archive control identity mismatch');
  assert.equal(release.productSha256, expected.productSha256, 'archive product identity mismatch');
  assert.equal(release.dataSha256, expected.dataSha256, 'archive data identity mismatch');
  return { archiveVerified: true, independentReview: false, hostedCI: false };
}

export async function verifyIndependentReview({ root, descriptor, privateCandidate, publicCandidate, authorIdentity, reviewerIdentity, now = Date.now() }) {
  assert(typeof authorIdentity === 'string' && authorIdentity.length > 0, 'candidate author identity required');
  assert(typeof reviewerIdentity === 'string' && reviewerIdentity.length > 0 && reviewerIdentity !== authorIdentity, 'separate trusted reviewer identity required');
  requireIdentity(privateCandidate); requireIdentity(publicCandidate);
  const review = await readReceiptArtifact(root, descriptor);
  verifyEvidenceBinding(review, { schemaVersion: 'axionbench-independent-review-v1', verdict: 'approved', reviewerIdentity, authorIdentity, privateCandidate, publicCandidate,
    requestedChoice: { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' }, effectiveChoice: { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' }, providerReportedModel: 'gpt-6.1-sol', providerReportedEffort: 'high', fast: false, fallback: false });
  fresh(review.at, now, 72 * 3600000);
  assert(Array.isArray(review.findings) && review.findings.every(row => row.resolved === true), 'unresolved review findings');
  return review;
}

// This is the final production-target acceptance stage, not candidate staging.
// It reads real HTTPS bytes and checks actual playable media via ffprobe.
export function probeHero(file) {
  const media = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60_000 }));
  const frames = execFileSync('ffmpeg', ['-v','error','-i',file,'-t','8','-vf','fps=2','-f','framemd5','-'], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60_000 });
  media.decodedFrameHashes = frames.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
  return media;
}

export async function acceptProduction({ releaseManifest, publishedAt, url, hostname, headersText, fetcher = fetch, captureRoot, captureDescriptor, ownerDescriptor, productionDescriptor, now = Date.now(), probe = probeHero }) {
  assert.equal(hostname, 'axionbench.jadapps.app', 'production target must be the owner-approved hostname');
  validateManifest(releaseManifest);
  assert(publishableSource(releaseManifest), 'production requires a publishable committed source');
  assert(releaseManifest.publication, 'production requires a published revision binding');
  const publishedTime = Date.parse(publishedAt);
  assert(Number.isFinite(publishedTime) && publishedTime >= Date.parse(releaseManifest.builtAt) && publishedTime <= now + 60_000, 'trusted deployment publication time required');
  const target = await checkHost({ url, hostname, expectProduct: releaseManifest.productSha256, expectData: releaseManifest.dataSha256, releaseManifest, headersText, fetcher });
  assert(headersText !== undefined && headersText !== null, 'qualified production header rules required');
  const capture = await readReceiptArtifact(captureRoot, captureDescriptor);
  fresh(capture.capturedAt, now, 72 * 3600000);
  assert(Date.parse(capture.capturedAt) >= publishedTime, 'capture predates production publication');
  await verifyCapture(capture, { root: captureRoot, hostname, releaseManifest });
  assert.equal(capture.url, `${url}/`, 'hero capture must use the exact production homepage');
  assert(typeof capture.browser === 'string' && capture.browser.length, 'capture browser identity required');
  assert(Array.isArray(capture.pages), 'production page evidence required');
  assert.deepEqual(capture.pages.map(row => row.path).sort(), routes.map(row => row.path).sort(), 'all production pages required');
  for (const page of capture.pages) {
    assert.equal(page.title, routes.find(row => row.path === page.path).title, 'production page title mismatch');
    for (const viewport of ['mobile','tablet','desktop']) assert(capture.files.some(file => {
      const width = file.viewport?.width;
      const matches = viewport === 'mobile' ? width >= 320 && width <= 480 : viewport === 'tablet' ? width > 480 && width <= 1024 : width > 1024;
      return file.kind === 'screenshot' && file.page === page.path && file.device === viewport && file.title === page.title && matches;
    }), `${page.path}: ${viewport} production screenshot missing`);
  }
  const hero = capture.files.find(file => file.kind === 'video' && file.page === '/' && file.role === 'animated-hero');
  assert(hero, 'current animated hero MP4 required');
  const video = probe(join(captureRoot, hero.path));
  assert(Number(video.format?.duration) >= 2, 'hero MP4 must contain at least two seconds');
  assert(video.streams?.some(stream => stream.codec_type === 'video' && stream.width > 0 && stream.height > 0 && Number(stream.nb_frames) > 1), 'hero MP4 must contain a playable video stream');
  assert(Array.isArray(video.decodedFrameHashes) && video.decodedFrameHashes.every(hash => /^[a-f0-9]{32}$/.test(hash)) && new Set(video.decodedFrameHashes).size > 1, 'hero MP4 must decode to distinct animated frames');
  const owner = await readReceiptArtifact(captureRoot, ownerDescriptor);
  verifyEvidenceBinding(owner, { schemaVersion: 'axionbench-owner-browser-v1', url, title: routes[0].title, platform: 'Windows', opened: true, productSha256: releaseManifest.productSha256, dataSha256: releaseManifest.dataSha256 });
  fresh(owner.openedAt, now, 72 * 3600000);
  assert(Date.parse(owner.openedAt) >= publishedTime, 'owner opening predates production publication');
  assert(typeof owner.openingMethod === 'string' && owner.openingMethod.length > 0, 'actual owner opening method required');
  assert(['jadbot-browser-bridge','windows-targeted-observation'].includes(owner.observation?.source), 'native owner observation required');
  assert([url, `${url}/`].includes(owner.observation.url) && owner.observation.title === owner.title, 'owner observed URL/title mismatch');
  const observation = await verifyArtifact(captureRoot, { path: owner.observation.receiptPath, sha256: owner.observation.receiptSha256, bytes: owner.observation.receiptBytes });
  assert(observation.length > 50, 'native owner observation receipt required');
  const ownerShot = await verifyArtifact(captureRoot, owner.screenshot);
  assert(ownerShot.length > 20000 && ownerShot.subarray(0,8).equals(PNG), 'owner browser PNG required');
  const production = await readReceiptArtifact(captureRoot, productionDescriptor);
  verifyEvidenceBinding(production, { url, productSha256: releaseManifest.productSha256, dataSha256: releaseManifest.dataSha256, consoleErrors: [] });
  fresh(production.at, now, 72 * 3600000);
  assert(Date.parse(production.at) >= publishedTime, 'interaction evidence predates production publication');
  assert(Array.isArray(production.assertions) && production.assertions.length >= 12 && production.assertions.every(row => row.passed === true && row.name && row.observed !== undefined), 'at least 12 genuine production interaction assertions required');
  assert(new Set(production.assertions.map(row => row.name)).size >= 12, 'production interactions must contain at least 12 distinct checks');
  return { productionVerified: true, target, hero: hero.path, ownerBrowser: true };
}
