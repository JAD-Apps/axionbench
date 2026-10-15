// Synthetic adverse fixtures; these never count as daemon, browser or API proof.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { authenticateStatement, digestStatement, PIN, validateProviderReceipt, requirePublicationApproval, assertIndependentReviewer } from '../../scripts/release/approval.mjs';
import { MODES, verifyNamedReceipt, requiredGateCommands, verifyCandidates } from '../../scripts/project/qualification.mjs';
import { verifyVideo } from '../../scripts/release/verify-capture.mjs';
import { parseBrowserTarget } from '../../scripts/test-harness.mjs';
import { PROJECT } from '../../scripts/project/policy.mjs';
const NOW = 1800000000000;
const SESSION = '11111111-1111-1111-1111-111111111111';
const HEX = 'a'.repeat(64);
const provider = () => ({ sessionId: SESSION, pin:{...PIN}, requested:{...PIN}, effective:{...PIN}, violation:null,
  init:{model:PIN.model,effort:PIN.effort,source:'reported',fastMode:'off',serviceTier:'default'}, observed:[], configurations:[] });
const statement = () => ({schemaVersion:'axionbench-authority-v1',issuedBy:'jadbot',mode:'candidate-review',fixture:false,passed:true,at:NOW-1000,sessionId:SESSION,candidatesSha256:HEX});
function authority(over={}) {
  const s={...statement(),...over};
  const run={id:'run_abcd',projectId:PROJECT,modelPin:{...PIN},plannerChoice:{...PIN},workerChoice:{...PIN},reviewerChoice:{...PIN},collaborate:false,modelReceipts:[provider()],steps:[{sessionId:SESSION,choice:{...PIN},workerChoice:{...PIN},workerLimit:1,status:'passed',exitCode:0,evidence:s}]};
  const session={id:SESSION,runId:run.id,projectId:PROJECT,provider:PIN.provider,model:PIN.model,effort:PIN.effort,requestedChoice:{...PIN},effectiveChoice:{...PIN}};
  return {run,session,reference:{runId:run.id,pointer:'/steps/0/evidence',sha256:digestStatement(s),producerSessionId:SESSION},get:async path=>path.startsWith('/v1/runs/')?run:session};
}
async function owned(fn) {
  await mkdir('test-results/qualification-fixtures',{recursive:true});
  const root=await mkdtemp(resolve('test-results/qualification-fixtures/case-'));
  try {return await fn(root);} finally {await rm(root,{recursive:true,force:true});}
}
const expected={mode:'candidate-review',candidatesSha256:HEX};
test('authority checks a live daemon record, exact revision and actual provider report',async()=>{
  const a=authority(); const result=await authenticateStatement(a.reference,expected,{get:a.get,now:NOW,projectId:PROJECT});
  assert.equal(result.session.id,SESSION);
  await assert.rejects(authenticateStatement(a.reference,{...expected,candidatesSha256:'b'.repeat(64)},{get:a.get,now:NOW,projectId:PROJECT}),/binding/);
  a.run.steps[0].evidence.passed=false;
  await assert.rejects(authenticateStatement(a.reference,expected,{get:a.get,now:NOW,projectId:PROJECT}),/digest/);
});
test('absent reviewer, local hash, stale/replayed and fixture receipts cannot authenticate',async()=>{
  for(const over of [{sessionId:null},{at:NOW-73*3600000},{at:NOW+1},{fixture:true},{passed:false},{schemaVersion:'locally-asserted'}]) {
    const a=authority(over);await assert.rejects(authenticateStatement(a.reference,expected,{get:a.get,now:NOW,projectId:PROJECT}));
  }
  const a=authority();a.run.steps[0].evidence='approved '+HEX;
  await assert.rejects(authenticateStatement(a.reference,expected,{get:a.get,now:NOW,projectId:PROJECT}),/structured/);
  a.run.steps[0].evidence=statement();a.run.collaborate=true;
  await assert.rejects(authenticateStatement(a.reference,expected,{get:a.get,now:NOW,projectId:PROJECT}),/collaboration/);
});
test('every provider routing requirement is enforced without fallback',()=>{
  for(const mutate of [r=>r.init.fastMode='on',r=>r.init.source='echoed',r=>r.effective.model='gpt-6-luna',r=>r.init.serviceTier='fast',r=>r.violation='fallback',r=>r.configurations=[{model:PIN.model,effort:'low',serviceTier:'default'}]]) {
    const r=provider();mutate(r);assert.throws(()=>validateProviderReceipt(r,SESSION));
  }
});
test('publication defaults to disabled without authenticated independent review',async()=>{
  await assert.rejects(requirePublicationApproval({},{packetPath:null}),/publication disabled/);
});
test('named modes all fail on absent evidence and unsupported modes never fall through',async()=>{
  for(const mode of MODES) await assert.rejects(verifyNamedReceipt(mode,{receipts:{}},{packetRoot:'.',candidates:{candidatesSha256:HEX}}),new RegExp('missing '+mode));
  await assert.rejects(verifyNamedReceipt('pretend',{}),/unsupported/);
});
test('receipt candidate binding and fixture flags fail before any authority lookup',()=>owned(async root=>{
  const r={schemaVersion:'axionbench-evidence-v1',mode:'candidate-review',passed:true,fixture:false,at:NOW,candidatesSha256:'b'.repeat(64)};
  const bytes=Buffer.from(JSON.stringify(r));await writeFile(join(root,'receipt.json'),bytes);
  const packet={receipts:{'candidate-review':{artifact:{path:'receipt.json',bytes:bytes.length,sha256:digestStatement(r)},authority:{}}}};
  await assert.rejects(verifyNamedReceipt('candidate-review',packet,{packetRoot:root,now:NOW,candidates:{candidatesSha256:HEX}}),/another candidate/);
}));
test('qualification requires immutable current source and every declared gate',async()=>{
  const privateCommands=requiredGateCommands(await readFile('scripts/release/verify-release.mjs','utf8'));
  assert(privateCommands.length>=21);assert(privateCommands.includes('npm run test:pricing'));assert(privateCommands.includes('npm run test:registry'));
  const portable=requiredGateCommands(await readFile('scripts/public/verify.mjs','utf8'),{portable:true});
  assert(portable.includes('npm run test:core-views'));assert(portable.includes('npm run test:cohort-views'));
  assert.throws(()=>requiredGateCommands('export const GATES = [];'),/declaration/);
  await assert.rejects(verifyCandidates({schemaVersion:'axionbench-qualification-v1',at:NOW,projectId:PROJECT,builderSessionIds:[SESSION],candidates:{}},{packetRoot:'.',now:NOW}),/candidate missing/);
});
test('production targeting rejects alternate origins, credentials, queries and unbound expectations',()=>{
  assert.equal(parseBrowserTarget(['--url','https://axionbench.jadapps.app','--expect-product',HEX]).origin,'https://axionbench.jadapps.app');
  for(const url of ['http://axionbench.jadapps.app','https://axionbench.pages.dev','https://owner:secret@axionbench.jadapps.app','https://axionbench.jadapps.app/?x=1']) assert.throws(()=>parseBrowserTarget(['--url',url]),/approved/);
  assert.throws(()=>parseBrowserTarget(['--expect-product',HEX]),/requires/);
});
const video={codec:'h264',width:1440,height:900,duration:3};
const probe={format:{format_name:'mov,mp4,m4a,3gp,3g2,mj2',duration:'3'},streams:[{codec_type:'video',codec_name:'h264',pix_fmt:'yuv420p',width:1440,height:900,nb_frames:'2'}]};
const frame=(md5,n)=>`0, ${n}, ${n}, 1, 1000, ${md5}\n`;
const frames=frame('a'.repeat(32),0)+frame('b'.repeat(32),1);
const decoder=(p=probe,f=frames)=>tool=>({status:0,stderr:'',stdout:tool.endsWith('ffprobe')?JSON.stringify(p):f});
test('video requires probe, compatible codec, dimensions, full decoding and changing frames',()=>{
  assert.equal(verifyVideo('fixture.mp4',video,{run:decoder()}).frames,2);
  assert.throws(()=>verifyVideo('stub.mp4',null),/metadata/);
  assert.throws(()=>verifyVideo('fixture.mp4',video,{run:()=>({error:{code:'ENOENT'},status:null})}),/unavailable/);
  assert.throws(()=>verifyVideo('fixture.mp4',video,{run:decoder({...probe,streams:[{...probe.streams[0],codec_name:'vp9'}]})}),/codec/);
  assert.throws(()=>verifyVideo('fixture.mp4',{...video,width:390},{run:decoder()}),/width/);
  assert.throws(()=>verifyVideo('fixture.mp4',video,{run:decoder(probe,frame('a'.repeat(32),0)+frame('a'.repeat(32),1))}),/changing/);
  assert.throws(()=>verifyVideo('fixture.mp4',video,{run:decoder({...probe,streams:[{...probe.streams[0],nb_frames:'3'}]})}),/last frame/);
  assert.throws(()=>verifyVideo('fixture.mp4',video,{run:tool=>tool.endsWith('ffprobe')?decoder()(tool):{status:1,stderr:'truncated',stdout:frames}}),/failed/);
});
test('CLI preserves legacy interfaces and rejects missing final evidence',()=>{
  for(const args of [['pretend'],['release-handoff','--packet','test-results/missing-evidence.json']]) {
    const r=spawnSync('node',['scripts/project/verify-receipts.mjs',...args],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/unsupported|ENOENT/);
  }
  const r=spawnSync('node',['scripts/project/qualify-public.mjs','--verify-only','--packet','test-results/missing-evidence.json'],{encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/Qualification blocked.*ENOENT/);
});


test('independent review rejects builder reuse, missing identity, failed steps and routing mismatches',()=>{
  const review={sessionId:SESSION,verdict:'approved'};
  const run={steps:[{sessionId:SESSION,status:'passed',exitCode:0,workerLimit:1,choice:{...PIN},workerChoice:{...PIN}}]};
  assert.doesNotThrow(()=>assertIndependentReviewer(review,run,['builder']));
  assert.throws(()=>assertIndependentReviewer(review,run,[SESSION]),/builder/);
  assert.throws(()=>assertIndependentReviewer({...review,sessionId:null},run,['builder']),/identity/);
  assert.throws(()=>assertIndependentReviewer(review,{steps:[]},['builder']),/successful/);
  run.steps[0].choice.effort='low';assert.throws(()=>assertIndependentReviewer(review,run,['builder']),/choice/);
});


test('qualification never substitutes a gate count for the original foundation checks', async()=> {
  const source=await readFile('scripts/release/verify-release.mjs','utf8');
  assert.throws(()=>requiredGateCommands(source.replace("['test:pricing',", "['test:pretend',")),/original private gates/);
  const a=authority();await assert.rejects(authenticateStatement(a.reference,expected,{get:a.get,now:NOW,projectId:''}));
});
