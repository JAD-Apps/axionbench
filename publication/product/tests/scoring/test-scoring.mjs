import assert from 'node:assert/strict';
import { admission, comparableValue, comparePanel, decodeWeightSettings, DEFAULT_WEIGHTS, encodeWeightSettings, leaveOneSuiteOut, normalize, rankSensitivity, taskCost } from '../../src/scoring/index.mjs';
import data from '../../scripts/public/scoring-data.mjs';
import registry from '../../data/benchmark-registry.json' with { type: 'json' };

assert.equal(normalize(75,{min:0,max:100,direction:'higher'}),.75);
assert.equal(normalize(25,{min:0,max:100,direction:'lower'}),.75);
assert.equal(normalize(130,{min:0,max:100,direction:'higher'}),null,'out-of-bounds values are invalid, not clamped');
assert.equal(normalize(1,{min:0,max:0,direction:'higher'}),null);
assert.equal(normalize(NaN,{min:0,max:1,direction:'higher'}),null);
assert.equal(admission(data.observations[0], data.configurations.find(c=>c.id===data.observations[0].configurationId)).eligible,false);

const suites = new Map([
 ['a',{domain:'coding',benchmarkFamilyId:'family-x',metric:{min:0,max:100,direction:'higher'}}],
 ['a2',{domain:'coding',benchmarkFamilyId:'family-x',metric:{min:0,max:100,direction:'higher'}}],
 ['b',{domain:'reasoning',benchmarkFamilyId:'family-y',metric:{min:0,max:100,direction:'lower'}}],
 ['safety',{domain:'safety',benchmarkFamilyId:'safety',metric:{min:0,max:100,direction:'higher'}}]
]);
const configs = new Map(['c1','c2'].map(id=>[id,{id,revision:{ref:'main'}}]));
const obs=(modelId,suiteId,rawValue,extra={})=>({id:`${modelId}:${suiteId}`,modelId,suiteId,configurationId:'c1',configurationSignature:'same-harness',benchmarkVersion:'v1',taskId:'task',split:'test',metric:'metric',metricDirection:suites.get(suiteId).metric.direction,rawValue,unit:{status:'documented'},normalization:{status:'normalized'},sourceVerification:{huggingFaceVerified:true,independentReplication:false},...extra});
const rows=[obs('A','a',50),obs('A','a2',100),obs('A','b',20),obs('A','safety',99),obs('B','a',100),obs('B','a2',0),obs('B','b',80)];
const options={models:new Map(),suites,configurations:configs,weights:{coding:1,reasoning:1}};
const result=comparePanel(rows,options);
assert.equal(result.panelSize,3);
assert.equal(result.models.A.domainScores.coding,.75); // family duplicates are averaged, not counted twice
assert.equal(result.models.A.domainScores.reasoning,.8); // lower-is-better
assert.equal(result.models.A.score,.775);
assert.equal(result.models.B.score,.35);
assert.equal(comparePanel(rows.filter(r=>r.modelId!=='B'),{...options,cohort:['A','B']}).eligible,false,'cohort cannot score without shared panel');
assert.equal(comparePanel(rows.map(r=>({...r,unit:{status:'inferred'}})),options).eligible,false);
assert.equal(comparePanel(rows.map(r=>({...r,configurationSignature:r.modelId})),options).eligible,false,'incompatible configurations excluded');
assert.equal(comparePanel(rows.map(r=>({...r,sourceConflicted:true})),options).eligible,false,'source-conflicted observations are excluded from the default panel');
assert.equal(comparePanel(rows, {...options,sourceConflicts:[{observationIds:['A:a']}]}).panelSize,2);
const pr={revision:{ref:'refs/pr/29'}};
assert.equal(admission({...obs('A','a',80)},pr).eligible,false);
assert.equal(leaveOneSuiteOut(rows,options).length,4);
assert.equal(rankSensitivity(result,[{coding:2,reasoning:1}])[0].ranking[0],'A');
assert.equal(rankSensitivity({...result,models:{A:{score:.5,domainScores:{coding:.5,reasoning:.5}},B:{score:.5,domainScores:{coding:.5,reasoning:.5}}}},[{coding:1,reasoning:1}])[0].ties.length,1);
const shareable=encodeWeightSettings({coding:2,reasoning:1});
assert.deepEqual(decodeWeightSettings(`?${shareable}`).weights,{coding:2,reasoning:1});
assert.deepEqual(decodeWeightSettings('?w=nope').weights,DEFAULT_WEIGHTS);
assert.equal(decodeWeightSettings('?w=nope').valid,false);
assert.equal(comparePanel(rows.filter(r=>r.modelId==='A'),options).score,null);

// Adversarial repairs (source-authority step): percent normalized once, duplicates,
// unknown conditions, domain-scoped weights.
const fracSuites=new Map([['p',{domain:'coding',benchmarkFamilyId:'p',metric:{min:0,max:1,direction:'higher'}}],['q',{domain:'reasoning',benchmarkFamilyId:'q',metric:{min:0,max:1,direction:'higher'}}]]);
const pobs=(modelId,suiteId,raw,extra={})=>({...obs(modelId,'a',raw),id:`${modelId}:${suiteId}:${raw}`,suiteId,metricDirection:'higher',rawValue:raw,normalization:{status:'normalized',targetUnit:'fraction',normalizedValue:raw/100},...extra});
assert.equal(comparableValue(pobs('A','p',73.7),fracSuites.get('p').metric),.737,'a raw percent is normalized once before fraction scoring');
const pct=comparePanel([pobs('A','p',73.7),pobs('B','p',50)],{models:new Map(),suites:fracSuites,configurations:configs,weights:{coding:1}});
assert.ok(Math.abs(pct.models.A.score-.737)<1e-12 && pct.models.B.score===.5,'percent rows are not clamped to 1 on a 0–1 metric');
assert.equal(comparePanel([pobs('A','p',73.7,{normalization:{status:'normalized',targetUnit:'fraction',normalizedValue:7.37}}),pobs('B','p',50)],{models:new Map(),suites:fracSuites,configurations:configs,weights:{coding:1}}).eligible,false,'a value outside declared bounds is excluded, not clamped');
const dup=comparePanel([pobs('A','p',70),pobs('A','p',60),pobs('B','p',50)],{models:new Map(),suites:fracSuites,configurations:configs,weights:{coding:1}});
assert.equal(dup.eligible,false,'duplicate rows are not selected by array order');
assert.ok(dup.excludedReasons.some(x=>/duplicate/.test(x.reason)));
const unknownRows=[pobs('A','p',70),pobs('B','p',50)].map(r=>{const {configurationSignature,...rest}=r;return {...rest,configurationId:'missing'};});
assert.equal(comparePanel(unknownRows,{models:new Map(),suites:fracSuites,configurations:configs,weights:{coding:1}}).eligible,false,'unknown conditions are not proof of matching');
assert.throws(()=>comparePanel(rows,{...options,weights:{coding:1,astrology:1}}),/outside the declared capability domains/,'weights must belong to declared domains');
const scoped=comparePanel([pobs('A','p',70),pobs('B','p',50),pobs('A','q',90)],{models:new Map(),suites:fracSuites,configurations:configs,weights:{coding:1,reasoning:0}});
assert.equal(scoped.models.A.score,.7,'zero-weight domains do not affect eligibility or score');
assert.equal(scoped.models.B.score,.5,'a model missing only a zero-weight domain stays eligible');
const rates={currency:'USD',input:1e-6,cachedInputRead:1e-7,cachedInputWrite:2e-6,output:2e-6,reasoning:null,tiers:[{min_prompt_tokens:100,prompt:'3e-6',completion:'4e-6',input_cache_read:'5e-7',input_cache_write:'6e-6'}]};
const baseCost=taskCost(rates,{inputTokens:50,cachedReadTokens:10,cachedWriteTokens:5,outputTokens:10,reasoningTokens:0});
assert.equal(baseCost.status,'priced'); assert.ok(Math.abs(baseCost.totalUsd-0.000081)<1e-15); assert.equal(baseCost.tierMinPromptTokens,null);
assert.equal(taskCost(rates,{inputTokens:100,cachedReadTokens:0,cachedWriteTokens:0,outputTokens:1,reasoningTokens:0}).totalUsd,0.000304);
assert.equal(taskCost(rates,{inputTokens:60,cachedReadTokens:40,cachedWriteTokens:0,outputTokens:1,reasoningTokens:0}).tierMinPromptTokens,100,'override threshold counts all prompt tokens, including cached input');
assert.equal(taskCost({...rates,reasoning:0},{inputTokens:-1,cachedReadTokens:0,cachedWriteTokens:0,outputTokens:0,reasoningTokens:0}).status,'invalid');
assert.equal(taskCost(rates,{inputTokens:0,cachedReadTokens:0,cachedWriteTokens:0,outputTokens:0,reasoningTokens:1}).status,'unsupported');
const free=taskCost({...rates,input:0,output:0,reasoning:0,cachedInputRead:0,cachedInputWrite:0},{inputTokens:10,cachedReadTokens:0,cachedWriteTokens:0,outputTokens:2,reasoningTokens:0});
assert.equal(free.totalUsd,0);
const currentCapabilityDomains=new Set(data.observations.map(o=>registry.suites.find(s=>s.id===o.suiteId)).filter(s=>s && !['safety','preference','professional','audio-video'].includes(s.domain)).map(s=>s.domain));
assert.ok(currentCapabilityDomains.size>=8);
for(const o of data.observations.filter(x=>x.leaderboardSourceId)) {
  assert.ok(o.leaderboardSubmission && Object.hasOwn(o.leaderboardSubmission,'author'));
  assert.equal(o.leaderboardSubmission.verified,o.leaderboardVerified);
  const c=data.configurations.find(x=>x.id===o.configurationId);
  assert.equal(o.leaderboardSubmission.revisionRef,c.revision.ref);
}
assert.equal(data.observations.filter(o=>admission(o,data.configurations.find(c=>c.id===o.configurationId)).eligible).length,0,'inferred units and unverified claims stay out of default scoring');
console.log(`Scoring fixtures passed; current capture admitted ${data.observations.filter(o=>admission(o,data.configurations.find(c=>c.id===o.configurationId)).eligible).length}/${data.observations.length} observations.`);
