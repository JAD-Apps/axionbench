// Private, read-only qualification. No fixture or local hash can approve release.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { validateSource, sourceDigest, sha256 } from '../public/boundary.mjs';
import { validateData } from '../public/data.mjs';
import { validateManifest, compareWithBuild, scanDist } from '../release/manifest.mjs';
import { verifySnapshot, readLastSuccess } from '../release/publication.mjs';
import { verifyPublished } from '../release/publication.mjs';
import { verifyCapture } from '../release/verify-capture.mjs';
import { createPagesClient, loadCredentials } from '../release/pages-api.mjs';
import { verifyPublicationReceipts } from './verify-receipts.mjs';
import { authenticateStatement, digestStatement, assertIndependentReviewer, daemonGet, validatePinnedRun } from '../release/approval.mjs';
import { validateReadback, validateSchedule, sourceDigest as scheduleSource } from '../automation/jadbot-daily.mjs';
import { verifyArtifact, readReceiptArtifact, verifyCommandEvidence } from './receipts.mjs';
import { BASELINES, PROJECT } from './policy.mjs';
export const MODES = Object.freeze(['candidate-qualification','candidate-review','publication','native-update','deployed-acceptance','owner-browser','hero-mp4','release-handoff']);
export const DEFAULT_PACKET = 'evidence/local/qualification/packet.json';
export const ORIGINAL_PRIVATE_GATES=Object.freeze(['lint','typecheck','test:unit','test:scoring','test:pricing','test:weights','test:cost-weights','test:registry','test:data','data:validate','test:authority','verify:design','test:frontier','test:chart-smoke','test:head-to-head','test:open-weights','test:catalogue','test:acceptance','verify:automation','build:release','release:check']);
export const MAX_AGE_MS = 72 * 3600000;
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const fresh = (at, now, label) => assert(Number.isFinite(at) && at <= now && now - at <= MAX_AGE_MS, `${label} stale/future`);
export async function privateSource(root) {
  assert.equal(git(root,'status','--porcelain','--untracked-files=all'), '', 'private candidate must be sealed and clean');
  const paths = git(root,'ls-files','-z').split('\0').filter(Boolean);
  const files = [];
  for (const path of paths) {
    const info = await lstat(join(root,path)); assert(info.isFile() && !info.isSymbolicLink(), 'private source must be regular files');
    const bytes = await readFile(join(root,path)); files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return { sourceCommit: git(root,'rev-parse','HEAD'), sourceSha256: sourceDigest(files), files };
}
export function requiredGateCommands(text, { portable = false } = {}) {
  if (portable) {
    const block = text.match(/const gates = (\[[\s\S]*?\]);/); assert(block, 'portable gate declaration missing');
    return [...block[1].matchAll(/'([^']+)'/g)].map(m => 'npm run ' + m[1]);
  }
  const block = text.match(/export const GATES = (\[[\s\S]*?\n\]);/); assert(block, 'private gate declaration missing');
  const commands = [...block[1].matchAll(/\['([^']+)',/g)].map(m => 'npm run ' + m[1]);
  const original=ORIGINAL_PRIVATE_GATES.map(script=>'npm run '+script);
  assert.deepEqual(commands.filter(command=>original.includes(command)),original,'original private gates missing, reordered or duplicated'); return commands;
}
export async function verifyCandidates(packet, { packetRoot, now = Date.now() } = {}) {
  assert.equal(packet?.schemaVersion, 'axionbench-qualification-v1', 'qualification packet schema missing');
  fresh(packet.at, now, 'qualification packet'); assert.equal(packet.projectId, PROJECT);
  assert(Array.isArray(packet.builderSessionIds) && packet.builderSessionIds.length && new Set(packet.builderSessionIds).size === packet.builderSessionIds.length, 'builder identities missing/duplicated');
  const identities = {};
  for (const kind of ['private','public']) {
    const c = packet.candidates?.[kind]; assert(c && c.root && c.distDir, `${kind} candidate missing`);
    const root = resolve(packetRoot, c.root), dist = resolve(packetRoot, c.distDir);
    const commit = git(root,'rev-parse','HEAD'); assert.equal(commit,c.sourceCommit, `${kind} candidate commit changed`);
    assert.equal(git(root,'status','--porcelain','--untracked-files=all'), '', `${kind} candidate must be sealed and clean`);
    const source = kind === 'private' ? await privateSource(root) : await validateSource(root);
    assert.equal(source.sourceSha256, c.sourceSha256, `${kind} current source differs from qualification`);
    if (kind === 'public') {
      await validateData(root);
      assert.equal(spawnSync('git',['-C',root,'merge-base','--is-ancestor',BASELINES.public,commit]).status,0,'public ancestry baseline missing');
      assert.equal(spawnSync('git',['-C',root,'merge-base','--is-ancestor',BASELINES.private,commit],{stdio:'ignore'}).status === 0,false,'private ancestry leaked into public candidate');
    }
    const manifest = validateManifest(JSON.parse(await readFile(join(dist,'release-manifest.json'),'utf8')));
    compareWithBuild(manifest,await scanDist(dist)); assert.equal(manifest.sourceCommit,commit);
    assert.equal(manifest.sourceDirty,false,'review candidate must come from sealed source');
    identities[kind] = { sourceCommit: commit, sourceSha256: source.sourceSha256,
      productSha256: manifest.productSha256, dataSha256: manifest.dataSha256, controlSha256: manifest.controlSha256 };
    assert.deepEqual(identities[kind], c.identity, `${kind} candidate identity mismatch`);
  }
  const candidatesSha256 = digestStatement(identities);
  assert.equal(candidatesSha256,packet.candidatesSha256,'candidate pair binding mismatch');
  return { identities, candidatesSha256 };
}
export async function verifyNamedReceipt(mode, packet, { packetRoot, now = Date.now(), get, candidates = null, seen = new Set() } = {}) {
  assert(MODES.includes(mode), `unsupported receipt mode: ${mode}`);
  assert(!seen.has(mode), 'receipt dependency cycle'); const visited = new Set([...seen,mode]);
  const candidate = candidates ?? await verifyCandidates(packet,{packetRoot,now});
  const entry = packet.receipts?.[mode]; assert(entry?.artifact && entry?.authority, `missing ${mode} receipt/authority`);
  const receipt = await readReceiptArtifact(packetRoot,entry.artifact);
  assert.equal(receipt.schemaVersion,'axionbench-evidence-v1'); assert.equal(receipt.mode,mode);
  assert.equal(receipt.passed,true,`${mode} failed`); assert.equal(receipt.fixture,false,'fixtures cannot qualify evidence');
  assert.equal(receipt.candidatesSha256,candidate.candidatesSha256,'receipt from another candidate/revision'); fresh(receipt.at,now,mode);
  const { statement, run } = await authenticateStatement(entry.authority,{ mode, candidatesSha256: candidate.candidatesSha256,
    evidenceSha256: entry.artifact.sha256 },{get,now,projectId:PROJECT});
  assert.equal(statement.sessionId,receipt.sessionId,'receipt producer differs from daemon');
  const dependency = async name => verifyNamedReceipt(name,packet,{packetRoot,now,get,candidates:candidate,seen:visited});
  if (mode === 'candidate-qualification') {
    for (const kind of ['private','public']) {
      const c = packet.candidates[kind], root = resolve(packetRoot,c.root);
      const commands = requiredGateCommands(await readFile(join(root, kind==='private'?'scripts/release/verify-release.mjs':'scripts/public/verify.mjs'),'utf8'),{portable:kind==='public'});
      const e = receipt.commands?.[kind]; assert(e,`${kind} gate receipt missing`);
      await verifyCommandEvidence(packetRoot,e,{sourceSha256:c.identity.sourceSha256,commands});
      assert.equal(e.productSha256,c.identity.productSha256); assert.equal(e.dataSha256,c.identity.dataSha256);
    }
    assert.deepEqual(receipt.install, { packageManager:'npm@11.19.0', command:'npm ci --include=dev --no-audit --no-fund', exitCode:0, isolated:true });
    await verifyArtifact(packetRoot,receipt.installLog);
    assert.equal(receipt.lockSha256,sha256(await readFile(join(resolve(packetRoot,packet.candidates.public.root),'package-lock.json'))));
    validateReadback(await readReceiptArtifact(packetRoot,receipt.schedule),{requireDisabled:true,source:await scheduleSource(),now});
    assert.equal(receipt.publicBaseCommit,packet.publicBaseCommit); assert.match(receipt.publicBaseCommit,/^[a-f0-9]{40}$/);
    const mapping = await readReceiptArtifact(packetRoot,receipt.commitMapping);
    assert(mapping.publicCommits?.length && mapping.exclusions?.length && mapping.privateCommits?.length,'private/public mapping incomplete');
    assert.equal(mapping.publicHead,packet.candidates.public.sourceCommit);
    assert.equal(spawnSync('git',['-C',resolve(packetRoot,packet.candidates.public.root),'merge-base','--is-ancestor',packet.publicBaseCommit,packet.candidates.public.sourceCommit]).status,0,'public series base is not candidate ancestry');
    assert.equal(mapping.privateHead,packet.candidates.private.sourceCommit);
    for(const [kind,commits] of [['private',mapping.privateCommits],['public',mapping.publicCommits]]) {
      const root=resolve(packetRoot,packet.candidates[kind].root);
      for(const commit of commits) { assert.match(commit,/^[a-f0-9]{40}$/); assert.equal(spawnSync('git',['-C',root,'merge-base','--is-ancestor',commit,packet.candidates[kind].sourceCommit]).status,0,`${kind} mapped commit is not actual ancestry`); }
    }
    const series=await readReceiptArtifact(packetRoot,receipt.patchSeries);
    assert.equal(series.schemaVersion,'axionbench-public-patch-series-v1');
    assert.equal(series.base?.commit,packet.publicBaseCommit);
    assert.equal(series.candidate?.publicSourceSha256,packet.candidates.public.sourceSha256);
    assert.equal(series.verified?.matchesCandidate,true);
    assert.equal(series.verified.reproducedTreeSha256,series.candidate.treeSha256);
    assert(series.patches?.length && series.patches.length===mapping.publicCommits.length,'logical public patch/commit mapping incomplete');
    for(const patch of series.patches) await verifyArtifact(resolve(packetRoot,receipt.patchRoot),{path:patch.file,bytes:patch.bytes,sha256:patch.sha256});
    await verifyArtifact(packetRoot,receipt.draftPreservation);
  } else if (mode === 'candidate-review') {
    await dependency('candidate-qualification'); assert.equal(receipt.verdict,'approved','independent reviewer did not approve');
    assertIndependentReviewer({ ...statement, verdict:receipt.verdict },run,packet.builderSessionIds);
    await verifyArtifact(packetRoot,receipt.reviewReport);
  } else if (mode === 'publication' || mode === 'native-update') {
    await dependency(mode==='native-update'?'publication':'candidate-review');
    assert(receipt.stateDir,'canonical publication state missing'); const stateDir=resolve(packetRoot,receipt.stateDir);
    const ledger=await readLastSuccess(stateDir); assert(ledger,'canonical ledger missing');
    const manifest=await verifySnapshot(stateDir,ledger.current.snapshotSha256);
    for (const field of ['key','snapshotSha256','revisionSha256','productSha256','dataSha256','controlSha256','sourceCommit','deploymentId']) assert.equal(receipt.production?.[field],ledger.current[field],`production ${field} differs from canonical snapshot`);
    assert.equal(receipt.production.dataOverlaySha256,manifest.dataOverlay?.overlaySha256??null);
    assert.equal(ledger.current.sourceCommit,packet.candidates.public.sourceCommit,'production code is not the approved public candidate');
    const config=JSON.parse(await readFile(join(resolve(packetRoot,packet.candidates.public.root),'deploy.config.json'),'utf8'));
    await verifyPublicationReceipts(stateDir);
    await verifyPublished({stateDir,config,client:createPagesClient({...loadCredentials(),projectName:config.projectName})});
    // This named mode requires authenticated provider and exact HTTPS readback,
    // not merely the locally content-addressed journal (fixtures exercise it separately).
    assert(receipt.remoteAuthoritySha256 && receipt.remoteReadback,'provider/API readback evidence missing');
    const remoteReadback=await readReceiptArtifact(packetRoot,receipt.remoteReadback);
    for(const field of ['key','snapshotSha256','productSha256','dataSha256','sourceCommit','deploymentId']) assert.equal(remoteReadback[field],ledger.current[field],`remote readback ${field} mismatch`);
    if (mode==='native-update') {
      const liveSchedule=await (get??daemonGet)('/v1/workflow-schedules/'+receipt.schedule?.id);
      validateSchedule(liveSchedule,{requireDisabled:false});
      assert.equal(liveSchedule.enabled,true); assert.equal(liveSchedule.lastRunId,receipt.nativeRunId,'live native schedule trigger differs');
      const nativeRun=await (get??daemonGet)('/v1/runs/'+receipt.nativeRunId); validatePinnedRun(nativeRun,{projectId:PROJECT});
      assert.equal(nativeRun.id,receipt.nativeRunId); assert.equal(nativeRun.status,'completed','native update run did not complete');
      validateSchedule(receipt.schedule,{requireDisabled:false}); assert.equal(receipt.schedule.enabled,true,'native update schedule is disabled');
      assert.equal(receipt.schedule.lastRunId,receipt.nativeRunId,'native trigger run mismatch');
      assert(receipt.schedule.history?.some(r=>r.runId===receipt.nativeRunId),'native trigger history missing');
      assert.equal(receipt.negativeCase?.status,'failed-restored'); assert.equal(receipt.negativeCase.lastGoodUnchanged,true);
      assert(receipt.rollback?.verified===true,'verified rollback proof missing');
      const negative=await readReceiptArtifact(packetRoot,receipt.negativeCase.artifact);
      assert.equal(negative.status,'failed-restored'); assert.equal(negative.lastGood?.snapshotSha256,ledger.current.snapshotSha256,'negative case did not preserve current last-good');
      const rollback=await readReceiptArtifact(packetRoot,receipt.rollback.artifact); assert.equal(rollback.status,'rolled-back');
      assert.equal(rollback.deploymentId,ledger.current.deploymentId,'rollback did not restore canonical release');
    }
  } else if (mode === 'deployed-acceptance') {
    await dependency('native-update'); assert.equal(receipt.url,'https://axionbench.jadapps.app');
    assert.deepEqual(receipt.harnesses?.map(h=>h.name),['test-routes','test-core-views','test-cost-version-views','test-cohort-views','test-acceptance']);
    const production=packet.receipts['native-update']; const remote=await readReceiptArtifact(packetRoot,production.artifact);
    for (const h of receipt.harnesses) {
      const report=await readReceiptArtifact(packetRoot,h.report); assert.equal(report.passed,true,'production browser harness failed');
      assert.equal(report.target?.url,receipt.url); assert.equal(report.target.fixtures,false);
      for (const field of ['productSha256','dataSha256','controlSha256','sourceCommit','dataOverlaySha256','revisionSha256','refreshKey']) {
        assert.equal(report.target[field],remote.production[field==='refreshKey'?'key':field],`browser target mismatch: ${field}`);
      }
      assert(report.screenshots?.length,'browser screenshots missing');
      for (const screenshot of report.screenshots) await verifyArtifact(resolve(packetRoot,h.artifactRoot),screenshot);
    }
    assert.deepEqual(receipt.leases?.map(l=>l.resource),['gui:browser','gui:owner-windows']);
    for (const lease of receipt.leases) assert(lease.issuedBy==='jadbot' && lease.id && lease.sessionId===receipt.sessionId,'daemon GUI lease missing');
  } else if (mode === 'owner-browser') {
    await dependency('deployed-acceptance'); assert.equal(receipt.target?.platform,'windows'); assert.equal(receipt.target.kind,'site-browser');
    assert.equal(receipt.url,'https://axionbench.jadapps.app/'); assert.match(receipt.title,/AxionBench/);
    assert(receipt.target.connected===true && receipt.target.grantId && receipt.target.sessionId,'paired owner browser target missing');
    const computer=await (get??daemonGet)('/v1/computer');
    assert(computer.browsers?.some(b=>b.id===receipt.target.grantId && b.connected && b.origins?.includes('https://axionbench.jadapps.app')),'live owner browser grant missing');
    await verifyArtifact(packetRoot,receipt.screenshot);
  } else if (mode === 'hero-mp4') {
    await dependency('owner-browser');
    const capture=await readReceiptArtifact(packetRoot,receipt.capture);
    assert(capture.files?.some(f=>f.kind==='video'),'hero MP4 missing');
    const deployed=await readReceiptArtifact(packetRoot,packet.receipts['native-update'].artifact);
    assert.equal(capture.productSha256,deployed.production.productSha256); assert.equal(capture.dataSha256,deployed.production.dataSha256);
    await verifyCapture(capture,{root:resolve(packetRoot,receipt.captureRoot),hostname:'axionbench.jadapps.app'});
    assert(receipt.attachment?.issuedBy==='jadbot' && receipt.attachment.id && receipt.attachment.sha256===capture.files.find(f=>f.kind==='video').sha256,'authenticated owner attachment missing');
  } else if (mode === 'release-handoff') {
    await dependency('hero-mp4'); assert.equal(receipt.completionPacketReady,true);
    assert.equal(receipt.finalEvaluation,'pending-daemon','handoff cannot invent a future evaluator verdict');
    assert(receipt.submission?.issuedBy==='jadbot' && receipt.submission.id,'daemon completion submission readiness receipt missing');
  }
  return { mode, passed:true, candidatesSha256:candidate.candidatesSha256, sessionId:statement.sessionId };
}
export async function loadPacket(path=DEFAULT_PACKET) {
  const resolved=resolve(path); return { packet:JSON.parse(await readFile(resolved,'utf8')),packetRoot:dirname(resolved) };
}
