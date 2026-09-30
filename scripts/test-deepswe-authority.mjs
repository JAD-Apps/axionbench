import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectAuthority, refreshAuthority } from './deepswe-authority.mjs';

const snapshot=JSON.parse(await readFile(new URL('../data/authority-deepswe.json',import.meta.url),'utf8'));
assert.equal(snapshot.configurationCount,snapshot.rows.length);
assert.ok(snapshot.modelCount>=20 && snapshot.configurationCount>=50,'useful complete authority cohort required');
assert.equal(snapshot.metrics.passAt1.unit,'fraction');
assert.ok(snapshot.rows.some(r=>r.counts.tasksAttempted<snapshot.taskSetSize),'partial attempted sets must remain explicit');
assert.equal(new Set(snapshot.rows.map(r=>r.configurationId)).size,snapshot.configurationCount);
for(const row of snapshot.rows){
  assert.ok(Math.abs(row.passAt1-row.counts.passed/row.counts.attempted)<1e-12);
  assert.ok(Math.abs(row.passAt4-row.counts.tasksPassedAny/row.counts.tasksAttempted)<1e-12);
}
// Synthetic counterexamples exercise parser invariants; they never enter site data.
const sample={unit:'pass@1 is attempt pass rate. pass@4 is tasks with any pass divided by tasks attempted.',generated_at:'2026-09-22T00:00:00Z',n_tasks_in_set:4,rows:[{model:'fixture-model',harness:'fixture',config:'fixture',source:'deep-swe',pass_at_1:.5,pass_rate:.5,pass_at_4:.75,n_passed:4,n_attempted:8,n_tasks_attempted:4,n_tasks_passed_any:3,n_runs:2}]};
const bytes=Buffer.from(JSON.stringify(sample));assert.equal(projectAuthority(bytes,'2026-09-30T00:00:00Z').rows[0].passAt4,.75);
for(const mutate of [d=>d.rows[0].pass_at_1=.8,d=>d.rows.push({...d.rows[0]}),d=>d.rows[0].n_tasks_attempted=5,d=>d.unit='unknown',d=>d.rows[0].mean_cost_usd=-1]){
  const changed=structuredClone(sample);mutate(changed);assert.throws(()=>projectAuthority(Buffer.from(JSON.stringify(changed)),'2026-09-30T00:00:00Z'));
}
const dir=await mkdtemp(join(tmpdir(),'axion-authority-'));
try {
  const output=join(dir,'data.json'),auditDir=join(dir,'audit');
  await refreshAuthority({output,auditDir,fetcher:async()=>new Response(bytes,{status:200})});
  const lastGood=await readFile(output);
  await assert.rejects(refreshAuthority({output,auditDir,fetcher:async()=>new Response('unavailable',{status:503})}));
  assert.deepEqual(await readFile(output),lastGood,'failed real adapter refresh preserves last-good data');
  await assert.rejects(refreshAuthority({output,auditDir,fetcher:async()=>new Response('{"rows":[]}',{status:200})}));
  assert.deepEqual(await readFile(output),lastGood,'malformed actual response preserves last-good data');
}finally{await rm(dir,{recursive:true,force:true});}
console.log(`DeepSWE authority checks passed: ${snapshot.modelCount} models / ${snapshot.configurationCount} exact configurations; ratios, missing attempts, duplicates, invalid values and real refresh failure preservation.`);
