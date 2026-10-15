// Synthetic contracts exercise fail-closed validation; these are not release receipts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routes } from '../../src/routes.ts';
import { buildManifest, sha256 } from '../../scripts/release/manifest.mjs';
import { stageSnapshot } from '../../scripts/release/publication.mjs';
import { fingerprintSource } from '../../scripts/project/source-fingerprint.mjs';
import { verifyCapturedEvidence } from '../../scripts/project/receipts.mjs';
import { BROWSER_REPORTS, PRIVATE_COMMANDS, PUBLIC_COMMANDS, qualifyCandidate, verifyBrowserEvidence, verifyIndependentReview, verifyArchiveQualification, acceptProduction } from '../../scripts/project/qualification.mjs';
const NOW = Date.parse('2026-10-04T10:00:00Z');
const choice = { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' };
const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(1440,16); png.writeUInt32BE(900,20);
const dirs = [];
async function scratch() { const dir = await mkdtemp(join(tmpdir(), 'axionbench-qualification-')); dirs.push(dir); return dir; }
test.after(async () => { for (const dir of dirs) await rm(dir, { recursive: true, force: true }); });
async function artifact(root, path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  await mkdir(join(root,path,'..'), { recursive: true }); await writeFile(join(root,path),bytes);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}
async function fixture() {
  const root = await scratch(), evidenceRoot = join(root, 'evidence'), distDir = join(root, 'dist');
  await writeFile(join(root,'.gitignore'), 'dist/\nevidence/\n'); execFileSync('git',['init','-q',root]);
  const data = '{}', dataSha256 = sha256(Buffer.from(data));
  const dm = JSON.stringify({ projection: { sha256: dataSha256 } });
  await artifact(root,'public/data-manifest.json',Buffer.from(dm));
  const browsers = {};
  for (const name of BROWSER_REPORTS) {
    const path = `scripts/test-${name}.mjs`, text = "const sourcePaths = ['public/data-manifest.json'];";
    await artifact(root,path,Buffer.from(text));
    const shot = await artifact(evidenceRoot,`${name}/screenshot.png`,png);
    const report = { passed: true, at: new Date(NOW).toISOString(), dataSha256, manifestSha256: sha256(Buffer.from(dm)), currentSource: [{ path: 'public/data-manifest.json', sha256: sha256(Buffer.from(dm)) }], checks: [{ name: 'synthetic fixture' }], screenshots: [{ path: shot.path, sha256: shot.sha256 }] };
    browsers[name] = { ...await artifact(evidenceRoot,`${name}/report.json`,report), screenshots: [shot] };
  }
  const files = { 'data.json': data, 'data-manifest.json': dm, 'data-details.json': '{}', 'publication.json': '{"schemaVersion":"axionbench-publication-v1","status":"unpublished"}', '404.html': '<title>Not found</title>', 'robots.txt':'robots', 'sitemap.xml':'<xml/>', '_headers': '/*\n  X-Content-Type-Options: nosniff\n' };
  for (const route of routes) files[route.path === '/' ? 'index.html' : `${route.path.slice(1)}/index.html`] = `<title>${route.title}</title>`;
  for (const [path, value] of Object.entries(files)) await artifact(distDir,path,Buffer.from(value));
  const manifest = await buildManifest(distDir, { sourceCommit: 'a'.repeat(40), sourceDirty: false, builtAt: new Date(NOW).toISOString() });
  await artifact(distDir,'release-manifest.json',manifest);
  const expected = { sourceSha256: (await fingerprintSource(root)).sourceSha256, productSha256: manifest.productSha256, dataSha256, controlSha256: manifest.controlSha256 };
  const log = await artifact(evidenceRoot,'gate.log',Buffer.from('synthetic successful exit fixture'));
  const result = { finishedAt: new Date(NOW).toISOString(), passed: true, schemaVersion:'axionbench-private-verification-v1', privateSourceSha256: expected.sourceSha256, sourceUnchanged: true, candidate: { productSha256: expected.productSha256, dataSha256 }, results: PRIVATE_COMMANDS.map(command => ({ command, exitCode:0, milliseconds:1, log:log.path,logBytes:log.bytes,logSha256:log.sha256 })) };
  const receipt = await artifact(evidenceRoot,'receipt.json',result);
  return { kind:'private', sourceRoot:root, distDir, evidenceRoot, browsers, expected, receipt, now:NOW, manifest, result };
}

test('command contracts retain every declared private and public gate in order', async () => {
  const privateRunner = await readFile('scripts/release/verify-release.mjs','utf8');
  const privateList = privateRunner.match(/export const GATES = \[([\s\S]*?)\n\];/)[1];
  assert.deepEqual([...privateList.matchAll(/\['([^']+)',/g)].map(row => `npm run ${row[1]}`), PRIVATE_COMMANDS);
  const publicRunner = await readFile('scripts/public/verify.mjs','utf8');
  const publicList = publicRunner.match(/const gates = \[([\s\S]*?)\];/)[1];
  assert.deepEqual([...publicList.matchAll(/'([^']+)'/g)].map(row => `npm run ${row[1]}`), PUBLIC_COMMANDS);
  assert.equal(PRIVATE_COMMANDS.length,24); assert.equal(PUBLIC_COMMANDS.length,20);
});

test('complete candidate qualification keeps review and publication pending', async () => {
  const f = await fixture(), result = await qualifyCandidate(f);
  assert.equal(result.qualified,true); assert.equal(result.browser.screenshots,4);
  assert.equal(result.independentReview,false); assert.equal(result.publicationApproved,false); assert.equal(result.productionVerified,false);
  assert.equal((await fingerprintSource(f.sourceRoot)).sourceSha256,f.expected.sourceSha256);
});

test('stale source, candidate, provenance, command exits, logs and missing evidence fail closed', async () => {
  const f = await fixture();
  for (const field of ['sourceSha256','productSha256','dataSha256','controlSha256']) await assert.rejects(qualifyCandidate({ ...f, expected:{ ...f.expected,[field]:'0'.repeat(64) } }));
  await assert.rejects(qualifyCandidate({ ...f,receipt:{ ...f.receipt,path:'missing.json' } }), /ENOENT/);
  const bad = structuredClone(f.result); bad.results[0].exitCode = 1;
  await assert.rejects(qualifyCandidate({ ...f,receipt:await artifact(f.evidenceRoot,'failed.json',bad) }), /command failed/);
  bad.results[0].exitCode=0; bad.results.pop();
  await assert.rejects(qualifyCandidate({ ...f,receipt:await artifact(f.evidenceRoot,'omitted.json',bad) }), /command evidence/);
  await writeFile(join(f.evidenceRoot,'gate.log'),'changed');
  await assert.rejects(qualifyCandidate(f), /byte count mismatch|hash mismatch/);
});

test('browser reports require all sources, provenance, fresh screenshots and exact hashes', async () => {
  const f = await fixture(), args = { sourceRoot:f.sourceRoot,evidenceRoot:f.evidenceRoot,descriptors:f.browsers,expected:f.expected,now:NOW };
  await assert.rejects(verifyBrowserEvidence({ ...args,descriptors:{ routes:f.browsers.routes } }), /complete browser report/);
  const report = JSON.parse(await readFile(join(f.evidenceRoot,f.browsers.routes.path)));
  for (const [key,value,pattern] of [['currentSource',[],/current source missing/],['manifestSha256','0'.repeat(64),/stale data provenance/],['at','2020-01-01',/stale/],['passed',false,/binding mismatch/]]) {
    const desc = { ...await artifact(f.evidenceRoot,'bad-report.json',{ ...report,[key]:value }),screenshots:f.browsers.routes.screenshots };
    await assert.rejects(verifyBrowserEvidence({ ...args,descriptors:{ ...f.browsers,routes:desc } }),pattern);
  }
  await writeFile(join(f.evidenceRoot,'routes/screenshot.png'),Buffer.alloc(png.length));
  await assert.rejects(verifyBrowserEvidence(args), /hash mismatch/);
});

test('captured portable evidence rejects omissions, extra files and altered bytes', async () => {
  const root = await scratch(), files=[];
  for (const name of [...BROWSER_REPORTS,'acceptance','cost-weights']) {
    const desc=await artifact(root,`captured/${name}/report.json`,{}); files.push({ ...desc,path:`${name}/report.json` });
  }
  files.sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
  const receipt={ evidenceRoot:'captured',capturedEvidence:files };
  await verifyCapturedEvidence(root,receipt);
  await assert.rejects(verifyCapturedEvidence(root,{ ...receipt,capturedEvidence:files.slice(1) }),/every actual byte/);
  await artifact(root,'captured/extra.json',{});
  await assert.rejects(verifyCapturedEvidence(root,receipt),/every actual byte/);
});

test('archive qualification refuses missing artifacts and unsupported review or CI claims', async () => {
  const f=await fixture();
  const receipt={ schemaVersion:'axionbench-archive-verification-v1',passed:true,publicSourceSha256:f.expected.sourceSha256,productSha256:f.expected.productSha256,dataSha256:f.expected.dataSha256,privateGatesRetained:21,independentReview:false,hostedCI:false,candidatePath:'archive',archive:{path:'missing.tar',bytes:1,sha256:'a'.repeat(64)} };
  const args={root:f.evidenceRoot,expected:f.expected,descriptor:await artifact(f.evidenceRoot,'archive-receipt.json',receipt)};
  await assert.rejects(verifyArchiveQualification(args),/ENOENT/);
  for (const claim of ['independentReview','hostedCI']) await assert.rejects(verifyArchiveQualification({...args,descriptor:await artifact(f.evidenceRoot,'bad-archive-receipt.json',{...receipt,[claim]:true})}),/binding mismatch/);
});

test('independent review binds both exact candidates and actual routing observations', async () => {
  const f=await fixture(), root=f.evidenceRoot;
  const review={ schemaVersion:'axionbench-independent-review-v1',verdict:'approved',authorIdentity:'worker',reviewerIdentity:'reviewer',privateCandidate:f.expected,publicCandidate:f.expected,requestedChoice:choice,effectiveChoice:choice,providerReportedModel:'gpt-6.1-sol',providerReportedEffort:'high',fast:false,fallback:false,findings:[],at:new Date(NOW).toISOString() };
  const args={ root,descriptor:await artifact(root,'review.json',review),privateCandidate:f.expected,publicCandidate:f.expected,authorIdentity:'worker',reviewerIdentity:'reviewer',now:NOW };
  await verifyIndependentReview(args);
  await assert.rejects(verifyIndependentReview({ ...args,reviewerIdentity:'worker' }),/separate trusted/);
  for (const [key,value] of [['fast',true],['providerReportedModel','gpt-other'],['verdict','pending'],['publicCandidate',{ ...f.expected,sourceSha256:'b'.repeat(64) }],['findings',[{ resolved:false }]]]) await assert.rejects(verifyIndependentReview({ ...args,descriptor:await artifact(root,'bad-review.json',{ ...review,[key]:value }) }));
});

test('production acceptance requires exact hosted assets, owner Windows proof and animated playable MP4', async () => {
  const f=await fixture(), url='https://axionbench.jadapps.app';
  const snapshot = await stageSnapshot({ distDir:f.distDir,stateDir:await scratch(),key:'2026-10-04.r1',now:()=>new Date(NOW) });
  f.distDir=snapshot.dir; f.manifest=snapshot.manifest;
  const fetcher=async target => {
    const path=new URL(target).pathname;
    let file=path==='/'?'index.html':path.slice(1);
    if (file.endsWith('/')) file+='index.html';
    let bytes;
    try { bytes=await readFile(join(f.distDir,file)); } catch { if (routes.some(r=>r.path===path)) return new Response(null,{status:308,headers:{location:`${path}/`}}); return new Response(await readFile(join(f.distDir,'404.html')),{status:404}); }
    return new Response(bytes,{headers:{'content-type':file.endsWith('.html')?'text/html':'application/json','x-content-type-options':'nosniff'}});
  };
  const files=[];
  for (const page of routes) for (const device of ['mobile','tablet','desktop']) {
    const width={mobile:390,tablet:768,desktop:1440}[device]; const image=Buffer.alloc(24000); png.copy(image); image.writeUInt32BE(width,16);
    files.push({ ...await artifact(f.evidenceRoot,`${device}-${page.path.replaceAll('/','') || 'home'}.png`,image),kind:'screenshot',page:page.path,title:page.title,device,viewport:{width,height:900} });
  }
  const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(12)]);
  files.push({ ...await artifact(f.evidenceRoot,'hero.mp4',mp4),kind:'video',page:'/',role:'animated-hero' });
  const capture={schemaVersion:'axionbench-capture-v1',url:`${url}/`,capturedAt:new Date(NOW).toISOString(),browser:'fixture browser',productSha256:f.manifest.productSha256,dataSha256:f.manifest.dataSha256,files,pages:routes.map(r=>({path:r.path,title:r.title}))};
  const native = await artifact(f.evidenceRoot,'native-observation.json',{ url, title:routes[0].title, platform:'Windows', fixture:true });
  const owner={schemaVersion:'axionbench-owner-browser-v1',url,title:routes[0].title,platform:'Windows',opened:true,openingMethod:'synthetic fixture',openedAt:new Date(NOW).toISOString(),observation:{source:'windows-targeted-observation',url,title:routes[0].title,receiptPath:native.path,receiptSha256:native.sha256,receiptBytes:native.bytes},productSha256:f.manifest.productSha256,dataSha256:f.manifest.dataSha256,at:new Date(NOW).toISOString(),screenshot:files[0]};
  const media={format:{duration:'3'},streams:[{codec_type:'video',width:1440,height:900,nb_frames:'90'}],decodedFrameHashes:['a'.repeat(32),'b'.repeat(32)]};
  const args={releaseManifest:f.manifest,publishedAt:new Date(NOW).toISOString(),url,hostname:'axionbench.jadapps.app',headersText:await readFile(join(f.distDir,'_headers'),'utf8'),fetcher,captureRoot:f.evidenceRoot,captureDescriptor:await artifact(f.evidenceRoot,'capture.json',capture),ownerDescriptor:await artifact(f.evidenceRoot,'owner.json',owner),productionDescriptor:await artifact(f.evidenceRoot,'production.json',{url,productSha256:f.manifest.productSha256,dataSha256:f.manifest.dataSha256,consoleErrors:[],at:new Date(NOW).toISOString(),assertions:Array.from({length:12},(_,i)=>({name:`fixture ${i}`,passed:true,observed:i}))}),now:NOW,probe:()=>media};
  assert.equal((await acceptProduction(args)).productionVerified,true);
  await assert.rejects(acceptProduction({...args,publishedAt:undefined}),/trusted deployment publication time/);
  await assert.rejects(acceptProduction({...args,publishedAt:new Date(NOW+1000).toISOString()}),/capture predates/);
  await assert.rejects(acceptProduction({ ...args,productionDescriptor:undefined }),/artifact descriptor required/);
  await assert.rejects(acceptProduction({ ...args,hostname:'axionbench.pages.dev' }),/owner-approved/);
  await assert.rejects(acceptProduction({ ...args,probe:()=>({ ...media,decodedFrameHashes:['a'.repeat(32),'a'.repeat(32)] }) }),/animated frames/);
  await assert.rejects(acceptProduction({ ...args,probe:()=>({ format:{duration:'0'},streams:[] }) }),/two seconds/);
  await assert.rejects(acceptProduction({ ...args,ownerDescriptor:await artifact(f.evidenceRoot,'bad-owner.json',{ ...owner,platform:'Linux' }) }),/binding mismatch/);
  await assert.rejects(acceptProduction({ ...args,captureDescriptor:await artifact(f.evidenceRoot,'bad-capture.json',{ ...capture,files:files.filter(row=>row.device!=='mobile') }) }),/mobile production screenshot missing/);
});
