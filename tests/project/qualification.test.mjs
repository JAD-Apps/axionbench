// Adversarial contract fixtures. These are not deployment/browser/runtime receipts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { privateSource } from '../../scripts/project/qualification-source.mjs';
import { fresh, privateCommands, PUBLIC_GATES, validateSeals, validateReview, validateRuntime, validateApiReadback, verifyBrowserEvidence, verifyNegativeProof, PIN } from '../../scripts/project/qualification.mjs';
import { scanDist, sha256 } from '../../scripts/release/manifest.mjs';
import { verifyCapture, probeHero } from '../../scripts/release/verify-capture.mjs';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const seals = () => ({ private: { sourceSha256: 'a'.repeat(64), productSha256: 'b'.repeat(64), dataSha256: 'c'.repeat(64) }, public: { sourceSha256: 'd'.repeat(64), productSha256: 'e'.repeat(64), dataSha256: 'f'.repeat(64) } });
async function owned(fn) {
  await mkdir('test-results/qualification', { recursive: true });
  const root = await mkdtemp(resolve('test-results/qualification/fixture-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test('trusted seals, dates and every original/private/portable gate are required', async () => {
  assert.equal(validateSeals(seals()).public.dataSha256, 'f'.repeat(64));
  for (const kind of ['private','public']) for (const field of ['sourceSha256','productSha256','dataSha256']) {
    const value = seals(); delete value[kind][field]; assert.throws(() => validateSeals(value));
  }
  fresh('2026-10-04T11:00:00Z', { now: NOW });
  for (const value of ['bad','2026-10-05T12:00:00Z','2026-09-30T12:00:00Z']) assert.throws(() => fresh(value, { now: NOW }), /stale/);
  const privateList = await privateCommands('.');
  for (const gate of ['test:pricing','test:registry','test:authority','test:routes','test:cost-version-views','verify:public']) assert(privateList.includes(`npm run ${gate}`));
  const runner = await readFile('scripts/public/verify.mjs', 'utf8');
  const declared = [...runner.match(/const gates = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(PUBLIC_GATES, declared, 'qualification must require the complete portable runner');
});
test('private seal covers actual untracked changes, ignores only declared outputs and refuses symlinks', () => owned(async root => {
  execFileSync('git', ['init','--quiet',root]);
  await writeFile(join(root,'.gitignore'), 'output/\n');
  await writeFile(join(root,'app.js'), 'v1');
  const first = await privateSource(root);
  await mkdir(join(root,'output')); await writeFile(join(root,'output/log.txt'),'ignored');
  assert.equal((await privateSource(root)).sourceSha256, first.sourceSha256);
  await writeFile(join(root,'app.js'), 'v2');
  assert.notEqual((await privateSource(root)).sourceSha256, first.sourceSha256);
  await symlink(join(root,'app.js'),join(root,'alias.js'));
  await assert.rejects(privateSource(root), /symlink/);
  const nested = join(root,'output'); await assert.rejects(privateSource(nested), /own Git root/);
}));
test('independent review binds both exact candidates and rejects self-review, unresolved findings or routing drift', () => {
  const review = { schemaVersion: 'axionbench-independent-review-v1', candidates: seals(), reviewerId: 'reviewer', verdict: 'approved', findings: [], choice: { ...PIN }, fast: false, fallback: false };
  const options = { candidates: seals(), builderIds: ['builder'] };
  validateReview(review, options);
  for (const over of [{ reviewerId:'builder' }, { verdict:'pending' }, { candidates: { ...seals(), public: seals().private } }, { findings:[{ status:'open' }] }, { fast:true }, { fallback:true }, { choice:{ ...PIN, effort:'max' } }]) assert.throws(() => validateReview({ ...review, ...over }, options));
});
test('runtime declarations cannot replace actual requested/effective/provider and Fast observations', () => {
  const runtime = { schemaVersion:'axionbench-runtime-observation-v1', actorId:'reviewer', sessionId:'session', requested:{ ...PIN }, effective:{ ...PIN }, providerReported:{ ...PIN }, fastObserved:false, fallbackUsed:false };
  validateRuntime(runtime, { actorId:'reviewer' });
  for (const key of ['requested','effective','providerReported','fastObserved','fallbackUsed']) { const r = structuredClone(runtime); delete r[key]; assert.throws(() => validateRuntime(r, { actorId:'reviewer' })); }
  assert.throws(() => validateRuntime(runtime, { actorId:'other' }), /actor/);
});
test('raw provider API proof binds deployment, key, snapshot, successful production state and commit', () => {
  const entry = { deploymentId:'deployment', key:'2026-10-04.r1', snapshotSha256:'a'.repeat(64) }, manifest = { sourceCommit:'b'.repeat(40) };
  const result = { success:true, result:{ id:entry.deploymentId, project_name:'axionbench', environment:'production', latest_stage:{ status:'success' }, deployment_trigger:{ metadata:{ commit_hash:manifest.sourceCommit, commit_message:`axionbench data ${entry.key} snapshot ${entry.snapshotSha256}` } } } };
  const record = value => { const body=JSON.stringify(value); return { method:'GET', status:200, url:'https://api.cloudflare.com/client/v4/accounts/'+'c'.repeat(32)+'/pages/projects/axionbench/deployments/deployment', body, bodySha256:sha256(Buffer.from(body)) }; };
  validateApiReadback(record(result), { entry, manifest });
  for (const mutate of [r=>r.result.environment='preview', r=>r.result.id='other', r=>r.result.latest_stage.status='failure', r=>r.result.deployment_trigger.metadata.commit_hash='d'.repeat(40), r=>r.result.deployment_trigger.metadata.commit_message='other']) {
    const bad=structuredClone(result); mutate(bad); assert.throws(() => validateApiReadback(record(bad), { entry, manifest }));
  }
  assert.throws(() => validateApiReadback({ ...record(result), bodySha256:'0'.repeat(64) }, { entry, manifest }), /hash/);
});
test('all browser reports/screenshots must match exact captured bytes and current source/data', () => owned(async root => {
  await writeFile(join(root,'app.js'),'source');
  const receipt={ evidenceRoot:'evidence', capturedEvidence:[] };
  for (const name of ['routes','core-views','cost-version-views','cohort-views','acceptance']) {
    await mkdir(join(root,'evidence',name),{recursive:true});
    const shot=Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(shot); shot.writeUInt32BE(1440,16); shot.writeUInt32BE(900,20);
    const image=name==='acceptance'?Buffer.from([255,216,255,224,0,2,255,217]):shot;
    const file=name==='acceptance'?'home.jpg':'home.png';
    await writeFile(join(root,'evidence',name,file),image);
    await writeFile(join(root,'evidence',name,'report.json'),JSON.stringify({ passed:true, dataSha256:'f'.repeat(64), checks:[{name:'fixture'}], widths:[390,768,1440], screenshots:name==='acceptance'?[file]:[{path:`test-results/${name}/${file}`,sha256:sha256(image)}], currentSource:[{path:'app.js',sha256:sha256(Buffer.from('source'))}] }));
  }
  receipt.capturedEvidence=(await scanDist(join(root,'evidence'))).files;
  await verifyBrowserEvidence(root,receipt,'f'.repeat(64));
  await assert.rejects(verifyBrowserEvidence(root,receipt,'e'.repeat(64)),/browser data/);
  await writeFile(join(root,'app.js'),'changed'); await assert.rejects(verifyBrowserEvidence(root,receipt,'f'.repeat(64)),/browser source/);
  await writeFile(join(root,'app.js'),'source');
  await writeFile(join(root,'evidence/routes/home.png'),'tamper');
  await assert.rejects(verifyBrowserEvidence(root,receipt,'f'.repeat(64)),/inventory/);
}));
test('last-good negative proof requires an actual failed-restored receipt and remote retained identity', () => owned(async root => {
  const current={ key:'2026-10-04.r1', deploymentId:'deployment', snapshotSha256:'a'.repeat(64), productSha256:'b'.repeat(64), dataSha256:'c'.repeat(64) };
  const save=async(path,value)=>{const bytes=Buffer.from(JSON.stringify(value));await writeFile(join(root,path),bytes);return{path,sha256:sha256(bytes),bytes:bytes.length};};
  const failureReceipt=await save('failure.json',{schemaVersion:'axionbench-publication-receipt-v1',status:'failed-restored',lastGood:{...current}});
  const restoredProduction=await save('restored.json',{mode:'host',url:'https://axionbench.jadapps.app',qualifiedManifest:true,productSha256:current.productSha256,dataSha256:current.dataSha256,refreshKey:current.key});
  const proof={schemaVersion:'axionbench-last-good-negative-v1',before:{...current},after:{...current},failureReceipt,restoredProduction};
  await verifyNegativeProof(root,proof,current);
  await assert.rejects(verifyNegativeProof(root,{...proof,after:{...current,deploymentId:'other'}},current),/altered/);
  const unverified=await save('unverified.json',{schemaVersion:'axionbench-publication-receipt-v1',status:'failed-restore-unverified',lastGood:{...current}});
  await assert.rejects(verifyNegativeProof(root,{...proof,failureReceipt:unverified},current),/restoration/);
}));
test('capture refuses unapproved ports, enclosing symlinks and header-only videos as acceptance', () => owned(async root => {
  const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(1440,16);png.writeUInt32BE(900,20);
  await mkdir(join(root,'screens'));await writeFile(join(root,'screens/home.png'),png);await symlink(join(root,'screens'),join(root,'alias'));
  const file={path:'screens/home.png',kind:'screenshot',sha256:sha256(png),bytes:png.length,viewport:{width:1440,height:900}};
  const record={schemaVersion:'axionbench-capture-v1',url:'https://axionbench.jadapps.app/',capturedAt:new Date(NOW).toISOString(),productSha256:'a'.repeat(64),dataSha256:'b'.repeat(64),files:[file]};
  const options={root,hostname:'axionbench.jadapps.app',now:NOW};
  await assert.rejects(verifyCapture({...record,url:'https://axionbench.jadapps.app:8443/'},options),/origin/);
  await assert.rejects(verifyCapture({...record,files:[{...file,path:'alias/home.png'}]},options),/enclosing symlink/);
  await assert.rejects(verifyCapture(record,{...options,requireAcceptance:true}),/exact release manifest/);
  const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(12)]);
  await writeFile(join(root,'header-only.mp4'),mp4);
  await assert.rejects(probeHero(join(root,'header-only.mp4'))); // Missing decoder or undecodable media must fail.
}));
