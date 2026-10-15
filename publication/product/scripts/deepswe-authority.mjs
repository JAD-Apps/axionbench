import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ARTIFACT_URL = 'https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json';
export const RESULT_URL = 'https://deepswe.datacurve.ai/';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const integer = (value, name) => assert.ok(Number.isSafeInteger(value) && value >= 0, `${name}: nonnegative integer required`);
const fraction = (value, name) => assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${name}: invalid fraction`);
const same = (a,b,name) => assert.ok(Math.abs(a-b)<1e-12, `${name}: source ratio does not match counts`);

export function validateAuthority(data) {
  assert.ok(data && Array.isArray(data.rows) && data.rows.length, 'empty or malformed authority result');
  assert.ok(Number.isFinite(Date.parse(data.generated_at)), 'missing source generation time');
  assert.match(data.unit, /pass@1.*attempt pass rate/i, 'source must document the pass@1 metric');
  assert.match(data.unit, /pass@4.*tasks.*divided by tasks attempted/i, 'source must document the separate pass@4 metric');
  integer(data.n_tasks_in_set, 'task set');
  const configs = new Set();
  for (const row of data.rows) {
    for (const key of ['model','harness','config','source']) assert.ok(typeof row[key] === 'string' && row[key], `${key}: missing source identity`);
    assert.equal(row.source,'deep-swe','unexpected benchmark source');
    assert.ok(!configs.has(row.config), `duplicate configuration ${row.config}`); configs.add(row.config);
    for (const key of ['n_passed','n_attempted','n_tasks_attempted','n_tasks_passed_any','n_runs']) integer(row[key],key);
    assert.ok(row.n_attempted>0 && row.n_tasks_attempted>0 && row.n_runs>0,'no scored attempts');
    assert.ok(row.n_passed<=row.n_attempted && row.n_tasks_passed_any<=row.n_tasks_attempted && row.n_tasks_attempted<=data.n_tasks_in_set,'inconsistent source counts');
    fraction(row.pass_at_1,'pass@1');fraction(row.pass_at_4,'pass@4');
    same(row.pass_at_1,row.n_passed/row.n_attempted,'pass@1');same(row.pass_at_4,row.n_tasks_passed_any/row.n_tasks_attempted,'pass@4');
    same(row.pass_rate,row.pass_at_1,'pass rate');
    if (row.ci_lo != null || row.ci_hi != null) {
      fraction(row.ci_lo,'CI low'); fraction(row.ci_hi,'CI high');
      assert.ok(row.ci_lo<=row.pass_at_1 && row.pass_at_1<=row.ci_hi,'invalid source interval');
      assert.ok(typeof row.ci_method==='string' && row.ci_method,'interval needs the source method');
    }
    for (const [key,value] of Object.entries(row)) if (/^(mean_|median_)/.test(key) && value!=null) assert.ok(Number.isFinite(value) && value>=0,`invalid efficiency fact ${key}`);
  }
  return data;
}

export function projectAuthority(bytes, retrievedAt) {
  const data=validateAuthority(JSON.parse(bytes.toString('utf8')));
  const rows=data.rows.map(row=>({
    model:row.model, configurationId:row.config, harness:row.harness,
    provider:row.provider??null, reasoningEffort:row.reasoning_effort??null,
    passAt1:row.pass_at_1, passAt4:row.pass_at_4,
    counts:{passed:row.n_passed,attempted:row.n_attempted,tasksAttempted:row.n_tasks_attempted,tasksPassedAny:row.n_tasks_passed_any,runs:row.n_runs},
    interval:row.ci_lo==null?null:{low:row.ci_lo,high:row.ci_hi,method:row.ci_method},
    repeatedRunRates:row.pass_rate_by_attempt??null,
    efficiency:Object.fromEntries(Object.entries(row).filter(([key])=>/^(mean_|median_)/.test(key))),
    costBasis:row.cost_basis??null,
    resultUrl:RESULT_URL,sourceArtifactUrl:ARTIFACT_URL,
  }));
  return {
    schemaVersion:1,benchmark:'DeepSWE',version:'1.1',family:'deep-swe',domain:'coding',
    source:{url:ARTIFACT_URL,resultUrl:RESULT_URL,sha256:sha256(bytes),retrievedAt,generatedAt:data.generated_at,httpStatus:200},
    provenance:'original benchmark-authority measurement',independentReplication:false,
    metrics:{passAt1:{unit:'fraction',direction:'higher',min:0,max:1},passAt4:{unit:'fraction',direction:'higher',min:0,max:1}},
    taskSetSize:data.n_tasks_in_set,configurationCount:rows.length,modelCount:new Set(rows.map(r=>r.model)).size,
    rows,
  };
}

// Validate the complete response before replacing any published last-good data.
// Raw capture goes only to the caller's explicit, private/ignored audit directory.
export async function refreshAuthority({output,auditDir,fetcher=fetch}) {
  assert.ok(output && auditDir,'explicit output and private audit directory are required');
  const response=await fetcher(ARTIFACT_URL,{signal:AbortSignal.timeout(30000),headers:{Accept:'application/json'}});
  assert.equal(response.status,200,`authority retrieval failed: HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const projection=projectAuthority(bytes,new Date().toISOString());
  await mkdir(auditDir,{recursive:true});
  const rawPath=resolve(auditDir,`${projection.source.sha256}.json`);
  try { await writeFile(rawPath,bytes,{flag:'wx',mode:0o600}); }
  catch(error) { if(error.code!=='EEXIST')throw error;assert.equal(sha256(await readFile(rawPath)),projection.source.sha256,'cached raw capture changed'); }
  try {
    const previous=JSON.parse(await readFile(output,'utf8'));
    if(previous.source?.sha256===projection.source.sha256){projection.source.retrievedAt=previous.source.retrievedAt;}
  } catch(error) { if(error.code!=='ENOENT')throw error; }
  await mkdir(dirname(resolve(output)),{recursive:true});
  const temporary=`${resolve(output)}.${process.pid}.tmp`;
  await writeFile(temporary,JSON.stringify(projection,null,2)+'\n');
  await rename(temporary,resolve(output));
  return projection;
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [output,auditDir]=process.argv.slice(2);
  const data=await refreshAuthority({output,auditDir});
  console.log(JSON.stringify({benchmark:data.benchmark,version:data.version,models:data.modelCount,configurations:data.configurationCount,sha256:data.source.sha256}));
}
