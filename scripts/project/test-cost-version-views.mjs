// Real production browser checks, plus clearly labelled adversarial fixtures.
// This product gate is portable; it never depends on owner captures or paths.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { withBuiltBrowser } from '../test-harness.mjs';
import { bindProductionIdentity, parseTarget, siteBytes } from '../test-target.mjs';
import { DEFAULT_TASK, estimateTask } from '../../src/pricing/logic.ts';
import { taskCostViewRows } from '../../src/pricing/views.ts';
import { comparisonIdentity, pairAvailability, trendSeries, versionRows } from '../../src/versions/logic.ts';
import { homeRecommendations, homeTask, taskTypes } from '../../src/home/logic.ts';
const out = 'test-results/cost-version-views';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Chart.js bars align the zero baseline to a half CSS pixel for grid strokes.
const gridAligned = (a,b) => assert(Math.abs(a-b) <= .51, `${a} differs from ${b} beyond the half-pixel baseline alignment`);
const close = (a,b) => assert(Math.abs(a-b) < 1e-9, `${a} differs from independently calculated ${b}`);
await mkdir(out,{recursive:true});
const target = parseTarget(); const identity = await bindProductionIdentity(target);
if(!target.production){
const build = spawnSync('npm',['run','build'],{encoding:'utf8',maxBuffer:8*1024*1024});
await writeFile(`${out}/build.log`,(build.stdout??'')+(build.stderr??''));
assert.equal(build.status,0,`build failed; inspect ${out}/build.log`);
}else await writeFile(`${out}/build.log`,'production target: no build\n');
const bytes = await siteBytes(target,'data.json'), data = JSON.parse(bytes);
const manifest = JSON.parse(await siteBytes(target,'data-manifest.json'));
const sourcePaths = ['package.json','package-lock.json','src/pricing/logic.ts','src/pricing/views.ts','src/task-cost.tsx','src/versions/logic.ts','src/versions.tsx','src/charts/comparison-chart.tsx','src/charts/core-chart.tsx','src/charts/registry.ts','src/charts/state.ts','src/home/logic.ts','src/home-comparison.tsx','src/observatory-experience.tsx','src/style.css','docs/PRICING.md','docs/VERSIONS.md','scripts/test-cost-weights.mjs','scripts/chart-smoke.mjs','scripts/project/test-cost-version-views.mjs','scripts/public/allowlist.json','scripts/public/boundary.mjs','scripts/public/verify.mjs','scripts/project/test-routes.mjs','scripts/public-content/README.md'];
const report = {at:new Date().toISOString(),passed:false,dataSha256:sha(bytes),manifestSha256:sha(await siteBytes(target,'data-manifest.json')),target:target.production?{url:target.url,...identity}:'local build',currentSource:await Promise.all(sourcePaths.map(async path=>({path,sha256:sha(await readFile(path))}))),checks:[],screenshots:[],fixtures:[]};
const record=(name,observed)=>{report.checks.push({name,observed});console.log('Verified: '+name);};
const panel = 'epoch-hub|gpqa-diamond|score|Epoch AI run';
const vpanel = 'bfcl-v4|bfcl-v4|overall accuracy';
const keys = ['claude-sonnet-4-5-20250929','claude-opus-4-5-20251101'];
assert(data.authority.observations.some(r=>[r.sourceId,r.suiteId,r.metric].join('|')===vpanel),'qualified fixture panel must exist');
const flash=data.pricing.records.find(p=>p.endpointModelId==='gemini-3.8-flash');
const pro=data.pricing.records.find(p=>p.endpointModelId==='gemini-3.1-pro-preview');
const captureNow=Date.parse(data.pricing.source.retrievedAt);
close(estimateTask(flash,DEFAULT_TASK,captureNow).totalUsd,.015);
close(estimateTask(pro,{...DEFAULT_TASK,inputTokens:200000},captureNow).totalUsd,.424);
close(estimateTask(pro,{...DEFAULT_TASK,inputTokens:200001},captureNow).totalUsd,.836004);
close(estimateTask(pro,{...DEFAULT_TASK,inputTokens:100000,cachedReadTokens:100001,cacheStoredTokens:100001,cacheHours:1},captureNow).totalUsd,(100000*4+100001*.4+2000*18+100001*4.5)/1e6);
const expiry=Date.parse(flash.expiresAt);const freshPromo={...flash,retrievedAt:new Date(expiry-86400000).toISOString()};
close(estimateTask(freshPromo,DEFAULT_TASK,expiry-1).totalUsd,.015);
assert.equal(estimateTask(freshPromo,DEFAULT_TASK,expiry).totalUsd,null,'promotion expires exactly at its timestamp');
assert.equal(estimateTask(flash,{...DEFAULT_TASK,cachedWriteTokens:1},captureNow).totalUsd,null);
record('independent tariff hand arithmetic',{defaultFlash:.015,exact200000:.424,exact200001:.836004,aggregatePromptThreshold:true,expiryMinusOneMs:true,expiryAtTimestampUnavailable:true,unknownUsedClassUnavailable:true});
const originalRows=versionRows(data.authority,data.currentModels,keys,vpanel,'BFCL FC','all');
assert.deepEqual(originalRows.map(r=>r.value),[73.24,77.47]);assert.equal(pairAvailability(originalRows).available,false);
assert.match(pairAvailability(originalRows).reason,/reasoning setting is unreported/);
assert(trendSeries(originalRows).every(s=>s.key.startsWith('isolated:')));
// Positive comparison behaviour is exercised with a clearly marked fixture:
// production BFCL records do not establish reasoning settings.
const fixture=structuredClone(data);
fixture.authority.observations.forEach(r=>{if(r.sourceId==='bfcl-v4' && keys.includes(r.modelKey) && r.configuration.condition==='BFCL FC')r.configuration.setting='none';});
const compatible=versionRows(fixture.authority,fixture.currentModels,keys,vpanel,'BFCL FC','none');
assert.equal(pairAvailability([{...compatible[0],comparisonKey:null},{...compatible[1],comparisonKey:null}]).available,false,'two unknown comparison keys cannot match');
assert.equal(pairAvailability(compatible).available,true);close(compatible[1].value-compatible[0].value,4.23);
const fixtureObservation=fixture.authority.observations.find(r=>r.modelKey===keys[0]&&r.sourceId==='bfcl-v4'&&r.configuration.condition==='BFCL FC');
const signature=comparisonIdentity(fixture.authority,fixtureObservation).key;
assert(signature);
for(const [name,change] of [
 ['source',r=>r.sourceId='different-source'],['metric',r=>r.metric='different-metric'],['suite',r=>r.suiteId='gpqa-diamond'],
 ['version identity',r=>r.currentPolicy.versionId='different-version'],['native unit',r=>r.rawUnit='fraction'],['provenance',r=>r.provenance='publisher-own'],['harness revision',r=>r.currentPolicy.harnessVersion='different-revision'],
 ['reasoning',r=>r.configuration.setting='high'],['conditions',r=>r.configuration.condition='different-condition']]){
 const r=structuredClone(fixtureObservation);change(r);assert.notEqual(comparisonIdentity(fixture.authority,r).key,signature,name+' changes comparison identity');
 const changed=[structuredClone(compatible[0]),structuredClone(compatible[1])];changed[1].comparisonKey=comparisonIdentity(fixture.authority,r).key;
 assert.equal(pairAvailability(changed).available,false,name+' prohibits pairing');
}
for(const change of [r=>r.currentPolicy.versionId=null,r=>r.currentPolicy.harnessVersion=null,r=>r.configuration.setting=null,r=>r.configuration.conditionsKnown=false]){
 const r=structuredClone(fixtureObservation);change(r);assert.equal(comparisonIdentity(fixture.authority,r).key,null);
}
const suiteChanged=structuredClone(fixture.authority);suiteChanged.suites.find(s=>s.id==='bfcl-v4').version='V5';assert.notEqual(comparisonIdentity(suiteChanged,fixtureObservation).key,signature);
const gap={...compatible[0],id:'gap',modelKey:'gap',releaseDate:'2025-10-15',value:null,comparisonKey:null};
const series=trendSeries([...compatible,gap]);assert.equal(series.length,1);assert.deepEqual(series[0].values,[73.24,null,77.47]);
const noDate={...compatible[0],releaseDate:null,retrievedAt:'2030-01-01',createdAt:'2020-01-01'};
assert.equal(trendSeries([noDate]).length,0,'catalogue/retrieval time cannot substitute for release time');
const invalidDateModels=structuredClone(fixture.currentModels);invalidDateModels.find(m=>m.key===keys[0]).releaseDate='2026-02-30';assert.equal(versionRows(fixture.authority,invalidDateModels,keys,vpanel,'BFCL FC','none')[0].releaseDate,null);
const duplicates=structuredClone(fixture.authority);duplicates.observations.push(structuredClone(fixtureObservation));
assert.equal(versionRows(duplicates,fixture.currentModels,keys,vpanel,'BFCL FC','none')[0].value,null,'duplicate claims stay unavailable');
record('strict version comparison fixtures',{productionPairAvailable:false,fixturePairDeltaNative:4.23,signatureFieldsTested:9,unknownFieldsFailClosed:true,missingMiddleReleaseBreaksLine:true,unknownReleaseDateUnplaced:true,duplicateClaimsUnavailable:true});
async function geometry(root){const c=root.locator('canvas');await c.waitFor();await root.page().waitForFunction(el=>!!el?.dataset.chartGeometry,await c.elementHandle());return JSON.parse(await c.getAttribute('data-chart-geometry'));}
function xy(g,point,element){close(element.x,g.area.left+(point.x-g.scales.x.min)/(g.scales.x.max-g.scales.x.min)*(g.area.right-g.area.left));close(element.y,g.area.bottom-(point.y-g.scales.y.min)/(g.scales.y.max-g.scales.y.min)*(g.area.bottom-g.area.top));}
async function download(page,button,name){const promise=page.waitForEvent('download');await button.click();const d=await promise;const path=`${out}/${name}.json`;await d.saveAs(path);return JSON.parse(await readFile(path));}
async function shot(page,root,name){const home=name.includes('homepage');const target=home?root:root.locator('.core-view-controls').first();await target.evaluate(el=>window.scrollTo(0,scrollY+el.getBoundingClientRect().top-115));const path=`${out}/${name}.png`;if(home)await root.screenshot({path,animations:'disabled'});else await page.screenshot({path,animations:'disabled'});report.screenshots.push({path,sha256:sha(await readFile(path))});}
async function history(page,rootId,button,key,value){await page.getByTestId(button).focus();await page.keyboard.press('Space');const url=page.url();assert.equal(new URL(url).searchParams.get(key),value);await page.goBack({waitUntil:'networkidle'});await page.getByTestId(rootId).waitFor();assert.notEqual(new URL(page.url()).searchParams.get(key),value);await page.goForward({waitUntil:'networkidle'});await page.getByTestId(rootId).waitFor();assert.equal(page.url(),url);await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByTestId(button).getAttribute('aria-pressed'),'true');}
await withBuiltBrowser(async({page,origin,newPage})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 assert.equal(sha(await(await page.request.get(origin+'/data.json')).body()),sha(bytes));
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:1000});
  await page.goto(origin+'/task-pricing?view=radar&versionLab=anthropic',{waitUntil:'networkidle'});let root=page.getByTestId('task-cost');await root.waitFor();
  assert(!new URL(page.url()).searchParams.has('versionLab'));assert(!new URL(page.url()).searchParams.has('view'));
  for(const view of ['scatter','costbars','table']){
   await root.getByTestId('cost-view-'+view).click();const expected=taskCostViewRows(data.authority,data.pricing,panel,DEFAULT_TASK);
   const actual=await root.getByTestId('cost-table').locator('tbody tr').evaluateAll(els=>els.map(e=>({id:e.dataset.rowId,text:e.textContent,links:[...e.querySelectorAll('a')].map(a=>a.href)})));
   assert.equal(actual.length,expected.length);const scrollTable=root.getByTestId('cost-table').locator('..');assert((await scrollTable.boundingBox()).height<=561,'the complete cohort stays in a bounded scrollable table');
   if(view==='table'){await scrollTable.focus();assert(await scrollTable.evaluate(el=>el===document.activeElement));await page.keyboard.press('PageDown');await page.waitForFunction(el=>el.scrollTop>0,await scrollTable.elementHandle());}
   for(const [i,row]of actual.entries()){assert.equal(row.id,expected[i].id);assert(row.text.includes(expected[i].costRow.observation.rawText));assert(row.text.includes(expected[i].sourceClass));assert(row.text.includes(expected[i].eligibility));for(const source of expected[i].sources)assert(row.links.includes(source.url));}
   const plotted=expected.filter(r=>r.scenarioUsd!==null);
   if(view==='scatter'){const g=await geometry(root);assert.equal(g.type,'scatter');assert.equal(g.datasets[0].data.length,plotted.length);for(const [i,p]of g.datasets[0].data.entries()){close(p.x,plotted[i].scenarioUsd);close(p.y,plotted[i].benchmarkValue);xy(g,p,g.datasets[0].elements[i]);}assert.match(await root.innerText(),/does not reproduce.*evaluation/);}
   if(view==='costbars'){const g=await geometry(root);assert.equal(g.type,'bar');close(g.scales.x.max,Math.max(.000001,...plotted.map(r=>r.scenarioUsd))*1.08);assert.deepEqual(g.datasets[0].data,plotted.map(r=>r.scenarioUsd));for(const [i,e]of g.datasets[0].elements.entries()){gridAligned(e.base,g.scales.x.zero);close(e.x,g.scales.x.zero+plotted[i].scenarioUsd*(g.scales.x.one-g.scales.x.zero));gridAligned(e.width,(g.area.right-g.area.left)*plotted[i].scenarioUsd/(g.scales.x.max-g.scales.x.min));}}
   if(view==='table')assert.equal(await root.locator('canvas').count(),0);
   const exported=await download(page,root.getByTestId('cost-export'),`${width}-cost-${view}`);assert.equal(exported.view,view);assert.equal(exported.productDataDigest,sha(bytes));assert.deepEqual(exported.viewRows,expected);assert.deepEqual(exported.rows,expected.map(r=>r.costRow));
   await shot(page,root,`${width}-pricing-${view}`);
  }
  await page.goto(origin+'/versions?costView=costbars&task=bad',{waitUntil:'networkidle'});root=page.getByTestId('versions');await root.waitFor();assert(!new URL(page.url()).searchParams.has('task'));assert(!new URL(page.url()).searchParams.has('costView'));
  assert.equal(await root.getByLabel('Version A',{exact:true}).inputValue(),keys[0]);assert.equal(await root.getByLabel('Version B',{exact:true}).inputValue(),keys[1]);
  for(const view of ['trend','paired','table']){
   await root.getByTestId('version-view-'+view).click();const rows=await root.getByTestId('version-table').locator('tbody tr').evaluateAll(els=>els.map(e=>({id:e.dataset.rowId,value:e.querySelector('[data-cell=value]').childNodes[0].textContent,links:[...e.querySelectorAll('a')].map(a=>a.href)})));
   assert.deepEqual(rows.map(r=>[r.id,r.value]),originalRows.map(r=>[r.id,r.valueLabel]));
   for(const [i,r]of rows.entries())for(const source of originalRows[i].sources)assert(r.links.includes(source.url));
   if(view==='trend'){const g=await geometry(root);assert.equal(g.type,'line');assert(g.datasets.every(d=>d.spanGaps===false));assert.equal(g.datasets.length,2);for(const d of g.datasets){assert.equal(d.data.filter(p=>p.y!==null).length,1);for(const [i,p]of d.data.entries())if(p.y===null)assert.equal(d.elements[i].skip,true,'incompatible trend points stay real Chart.js gaps');}}
   else assert.equal(await root.locator('canvas').count(),0,'unavailable pairs and table have no misleading chart');
   assert.match(await root.getByTestId('version-availability').innerText(),/unavailable.*reasoning setting is unreported/);
   const exported=await download(page,root.getByRole('button',{name:'Export version rows'}),`${width}-versions-${view}`);assert.equal(exported.productDataDigest,sha(bytes));assert.equal(exported.view,view);assert.deepEqual(exported.rows,originalRows);
   await shot(page,root,`${width}-versions-${view}`);
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'responsive views fit '+width);
  record('all six production views@'+width,{costRows:await page.request.get(origin+'/data.json').then(()=>taskCostViewRows(data.authority,data.pricing,panel,DEFAULT_TASK).length),nativeUnits:true,actualChartGeometry:true,exportParity:true,versionPairHonestGap:true});
 }
 await page.goto(origin+'/task-pricing',{waitUntil:'networkidle'});let root=page.getByTestId('task-cost');await root.waitFor();await history(page,'task-cost','cost-view-costbars','costView','costbars');
 await root.getByTestId('cost-inputTokens').fill('200000');let row=root.getByTestId('cost-table').locator('tbody tr').filter({hasText:'gemini-3.1-pro-preview'});assert((await row.innerText()).includes('$0.4240'));
 await root.getByTestId('cost-inputTokens').fill('200001');assert((await row.innerText()).includes('$0.836004'));await root.getByTestId('cost-table').locator('tbody tr').filter({hasText:'gemini-3.1-pro-preview'}).locator('button').click();assert((await root.getByTestId('cost-rate-detail').innerText()).includes('200,001'));
 await root.getByTestId('cost-cachedWriteTokens').fill('1');assert.equal(await root.getByTestId('cost-points').locator('button').count(),0);const unavailable=await download(page,root.getByTestId('cost-export'),'unknown-class');assert(unavailable.rows.every(r=>r.cost.totalUsd===null));
 await root.getByTestId('cost-reset').click();await root.getByTestId('cost-view-scatter').click();await root.getByTestId('cost-points').locator('button').first().focus();assert.match(await root.getByTestId('task-cost-tooltip').innerText(),/USD \/ scenario task/);
 await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});await root.getByTestId('cost-share').click();await page.waitForFunction(()=>/Scenario link copied|address bar/.test(document.querySelector('[data-testid=task-cost]')?.textContent));assert.match(await root.locator('[role=status]').last().innerText(),/Scenario link copied|address bar/);
 await page.reload({waitUntil:'networkidle'});assert.equal(await root.getByTestId('cost-inputTokens').inputValue(),'10000');
 await page.goto(origin+'/versions',{waitUntil:'networkidle'});await page.getByTestId('versions').waitFor();await history(page,'versions','version-view-paired','versionView','paired');
 await page.getByLabel('Version A',{exact:true}).selectOption('gpt-6-1-sol');await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('Version A',{exact:true}).inputValue(),'gpt-6-1-sol');
 await page.getByLabel('Version B',{exact:true}).selectOption('gpt-6-1-sol');assert.equal(await page.getByTestId('version-table').locator('tbody tr').count(),1);assert.match(await page.getByTestId('version-availability').innerText(),/two different exact identities/);await page.getByLabel('Version B',{exact:true}).selectOption(keys[1]);
 await page.getByTestId('version-view-trend').click();assert.match(await page.getByTestId('versions').innerText(),/1 selected identities have no established release date/);
 await page.getByLabel('Version developer').selectOption('xai');assert(await page.getByTestId('version-table').locator('tbody tr').count()<=1);assert.match(await page.getByTestId('version-availability').innerText(),/two different exact identities/);
 record('pricing/version URL and keyboard',{historyAndReload:true,exactVersionRestored:'gpt-6-1-sol',unrelatedStateRemoved:true,keyboardTooltip:true,resetAndShare:true,thresholdTableParity:true,unknownUsedTariffExport:null});
 // Homepage cards, candidate chart/table and exports use one projection.
 await page.goto(origin+'/?costView=table',{waitUntil:'networkidle'});root=page.getByTestId('home-comparison');await root.waitFor();assert(!new URL(page.url()).searchParams.has('costView'));
 await root.locator('.home-data').evaluate(e=>e.open=true);
 for(const task of taskTypes)for(const tokens of [12000,1000000]){
  await root.getByLabel('Task type',{exact:true}).selectOption(task.id);await root.getByLabel('Total task tokens').fill(String(tokens));
  const expected=homeRecommendations(data.bridgeBench,data.pricing,data.authority,task.id,tokens,'bridgebench');
  for(const tier of expected.tiers){const card=root.getByTestId('recommendation-'+tier.id);assert.equal(await card.getAttribute('data-model-key'),tier.row?.modelKey??'');assert.equal(await card.getByTestId('recommendation-rating').innerText(),tier.capability?.valueLabel??'—');assert.equal(await card.getByTestId('recommendation-cost').innerText(),tier.cost?.totalUsd===null||!tier.cost?'Unknown':'$'+tier.cost.totalUsd.toFixed(4));}
  const exported=await download(page,root.getByRole('button',{name:'Export recommendation values'}),`home-${task.id}-${tokens}`);
  assert.equal(exported.productDataDigest,sha(bytes));assert.deepEqual(exported.task,homeTask(tokens));
  assert.deepEqual(exported.rows.map(r=>[r.id,r.value,r.scenarioUsd]),expected.candidates.map(r=>[r.row.modelKey,r.capability.value,r.cost.totalUsd]));
  assert.equal(await root.getByTestId('home-table').locator('tbody tr').count(),exported.rows.length);
  await root.getByTestId('home-view-bars').click();let g=await geometry(root);assert.deepEqual(g.datasets[0].data,exported.rows.map(r=>r.value));
  await root.getByTestId('home-view-dots').click();g=await geometry(root);assert.deepEqual(g.datasets[0].data.map(r=>r.x),exported.rows.map(r=>r.value));
 }
 await root.getByLabel('Task type',{exact:true}).selectOption('reasoning');await root.getByLabel('Total task tokens').fill('12000');
 const priceHref=await root.getByTestId('recommendation-economy').getByRole('link',{name:'Price this task'}).getAttribute('href');
 const linked=await newPage();await linked.goto(origin+priceHref,{waitUntil:'networkidle'});assert.equal(await linked.getByTestId('cost-inputTokens').inputValue(),'10000');assert.equal(await linked.getByTestId('cost-outputTokens').inputValue(),'2000');assert.match(await linked.getByTestId('cost-rate-detail').innerText(),/gemini-3\.8-flash/);await linked.close();
 console.log('Checking exact homepage calculator links');
 const frontierHref=await root.getByTestId('recommendation-frontier').getByRole('link',{name:'Price this task'}).getAttribute('href');const unknownPrice=await newPage();await unknownPrice.goto(origin+frontierHref,{waitUntil:'networkidle'});assert.equal(await unknownPrice.getByTestId('cost-rate-detail').count(),0);assert.match(await unknownPrice.getByTestId('cost-rate-unavailable').innerText(),/no permitted exact endpoint quote/);await unknownPrice.close();
 for(const type of taskTypes){
  await root.getByLabel('Task type',{exact:true}).selectOption(type.id);await root.getByLabel('Homepage benchmark').selectOption('current');
  const expected=homeRecommendations(data.bridgeBench,data.pricing,data.authority,type.id,12000,'current',Date.now(),undefined,data.currentModels);
  for(const tier of expected.tiers){const card=root.getByTestId('recommendation-'+tier.id);assert.equal(await card.getAttribute('data-model-key'),tier.row?.modelKey??'');if(!tier.row)assert.equal(await card.locator('h3').innerText(),'No eligible recommendation');}
  if(type.id==='security')for(const id of ['economy','balanced','frontier'])assert.equal(await root.getByTestId('recommendation-'+id).getByRole('link',{name:'Compare results'}).getAttribute('href'),'/domains');
 }
 await root.getByLabel('Task type',{exact:true}).selectOption('reasoning');
 await root.getByLabel('Homepage benchmark').selectOption('current');for(const id of ['economy','balanced','frontier'])assert.equal(await root.getByTestId('recommendation-'+id).getAttribute('data-model-key'),'');
 await root.locator('.home-weights').evaluate(e=>e.open=true);await root.getByRole('button',{name:'Use covered tool-use domain'}).click();
 const expectedCurrent=homeRecommendations(data.bridgeBench,data.pricing,data.authority,'reasoning',12000,'current',Date.now(),{'tool-use':1},data.currentModels);
 assert.equal(expectedCurrent.ratedCount,2);close(expectedCurrent.tiers[2].capability.value,(.7747+.3347)/2);
 assert.equal(await root.getByTestId('recommendation-frontier').getByTestId('recommendation-rating').innerText(),'55.5%');
 for(const id of ['economy','balanced'])assert.match(await root.getByTestId('recommendation-'+id).innerText(),/No usable licensed tariff/);
 await root.getByLabel('Homepage tool-use weight',{exact:true}).fill('2');await page.reload({waitUntil:'networkidle'});assert.equal(await root.getByLabel('Homepage tool-use weight',{exact:true}).inputValue(),'2');await root.locator('.home-weights').evaluate(e=>e.open=true);
 await root.locator('.home-data').evaluate(e=>e.open=true);const currentExport=await download(page,root.getByRole('button',{name:'Export recommendation values'}),'home-current-weights');
 assert.equal(currentExport.weights['tool-use'],2);assert.deepEqual(currentExport.rows.map(r=>[r.id,r.value,r.scenarioUsd]),expectedCurrent.candidates.map(c=>[c.row.modelKey,c.capability.value,c.cost.totalUsd]));
 await root.getByTestId('home-view-bars').click();assert.deepEqual((await geometry(root)).datasets[0].data,currentExport.rows.map(r=>r.value));
 const currentTable=await root.getByTestId('home-table').locator('tbody tr').evaluateAll(els=>els.map(e=>({id:e.dataset.rowId,value:e.querySelector('[data-cell=value]').childNodes[0].textContent,links:[...e.querySelectorAll('a')].map(a=>a.href)})));
 assert.deepEqual(currentTable.map(r=>[r.id,r.value]),currentExport.rows.map(r=>[r.id,r.valueLabel]));for(const [i,r]of currentTable.entries())for(const s of currentExport.rows[i].sources)assert(r.links.includes(s.url));
 await root.getByLabel('Homepage reasoning weight',{exact:true}).fill('1');for(const id of ['economy','balanced','frontier'])assert.equal(await root.getByTestId('recommendation-'+id).getAttribute('data-model-key'),'');
 await root.getByRole('button',{name:'Reset homepage weights'}).click();assert.equal(await root.getByLabel('Use custom homepage weights').isChecked(),false);
 record('homepage three-card parity',{taskTypes:taskTypes.length,tokenBudgets:[12000,1000000],nativePublisherRatings:true,chartTableExportParity:true,currentCoveredDomainHandValue:.5547,missingTariffsRemainUnknown:true,weightsReload:true,missingDomainDisablesAllThree:true,deeperCalculatorInputs:true});
 await root.getByLabel('Homepage benchmark').selectOption('bridgebench');await root.locator('.home-data').evaluate(e=>e.open=false);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});await shot(page,root,`${width}-homepage-cards`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 let g; // local adverse fixtures below are labelled in the report and never run against production
 if(!target.production){
 // Fixture readbacks have manifest hashes matching their actual test payloads.
 const fixturePage=await newPage();const fbytes=Buffer.from(JSON.stringify(fixture));const fm={...manifest,projection:{...manifest.projection,bytes:fbytes.length,sha256:sha(fbytes)}};
 await fixturePage.route('**/data.json',r=>r.fulfill({contentType:'application/json',body:fbytes}));await fixturePage.route('**/data-manifest.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(fm)}));
 await fixturePage.goto(origin+'/versions?versionView=paired&versionSetting=none',{waitUntil:'networkidle'});const froot=fixturePage.getByTestId('versions');await froot.waitFor();assert.match(await froot.getByTestId('version-availability').innerText(),/comparison available/);
 g=await geometry(froot);assert.deepEqual(g.datasets[0].data,[73.24,77.47]);assert.equal(g.scales.y.min,0);
 for(const [i,e]of g.datasets[0].elements.entries()){gridAligned(e.base,g.scales.y.zero);close(e.y,g.area.bottom-(g.datasets[0].data[i]-g.scales.y.min)/(g.scales.y.max-g.scales.y.min)*(g.area.bottom-g.area.top));}
 await froot.getByTestId('version-view-trend').click();g=await geometry(froot);assert.equal(g.datasets.length,1);assert.deepEqual(g.datasets[0].data.map(p=>p.y),[73.24,77.47]);assert.equal(g.datasets[0].spanGaps,false);for(const [i,p]of g.datasets[0].data.entries())xy(g,p,g.datasets[0].elements[i]);
 report.fixtures.push({name:'explicit reasoning fixture; not published data',dataSha256:sha(fbytes),pairedAndConnectedTrend:true,nativeValues:[73.24,77.47]});await fixturePage.close();
 const expiredPage=await newPage();const expiredData=structuredClone(data);
 expiredData.pricing.records.forEach(p=>p.retrievedAt='2026-12-31T00:00:00Z');const eb=Buffer.from(JSON.stringify(expiredData));const em={...manifest,projection:{...manifest.projection,bytes:eb.length,sha256:sha(eb)}};
 await expiredPage.addInitScript(now=>{Date.now=()=>now;},expiry);
 await expiredPage.route('**/data.json',r=>r.fulfill({contentType:'application/json',body:eb}));await expiredPage.route('**/data-manifest.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(em)}));
 await expiredPage.goto(origin+'/task-pricing',{waitUntil:'networkidle'});const eroot=expiredPage.getByTestId('task-cost');await eroot.waitFor();
 const expiredExport=await download(expiredPage,eroot.getByTestId('cost-export'),'fixture-expired-promotion');const expiredFlash=expiredExport.viewRows.find(r=>r.modelKey==='gemini-3-8-flash');assert.equal(expiredFlash.scenarioUsd,null);assert.match(expiredFlash.costRow.cost.reason,/introductory tariff has expired/);
 assert.match(await eroot.getByTestId('cost-table').locator('tbody tr').filter({hasText:'gemini-3.8-flash'}).innerText(),/Unsupported.*expired/s);
 g=await geometry(eroot);assert.equal(g.datasets[0].data.length,expiredExport.viewRows.filter(r=>r.scenarioUsd!==null).length);assert(!JSON.parse(await eroot.locator('canvas').getAttribute('data-row-ids'))[0].includes(expiredFlash.id));
 report.fixtures.push({name:'fresh tariff timestamps at exact promotion expiry; not published data',dataSha256:sha(eb),clock:expiry,expiredFlashUnavailableInTableChartExport:true});await expiredPage.close();
 }else report.fixtures.push({name:'local adverse fixtures skipped on production: hosted responses are never intercepted'});
 // No chart remains after route change; reduced motion paints a static canvas.
 await page.goto(origin+'/task-pricing',{waitUntil:'networkidle'});root=page.getByTestId('task-cost');await root.waitFor();g=await geometry(root);assert.equal(g.animation,false);const still=await root.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(120);assert.equal(await root.locator('canvas').evaluate(c=>c.toDataURL()),still);
 const stale=await root.locator('canvas').elementHandle();await page.getByRole('navigation').getByRole('link',{name:'Methods',exact:true}).click();await page.getByTestId('methodology').waitFor();assert.equal(await stale.evaluate(el=>el.isConnected),false);assert.equal(Number(await page.locator('html').getAttribute('data-chart-js-instances')),0);
 assert.deepEqual(errors,[]);record('reduced-motion and lifecycle',{staticCanvas:true,animation:false,destroyedAfterNavigation:true,runtimeErrors:errors});
},{hasTouch:true});
// Live normal-to-reduced preference changes, and actual animated cost updates.
await withBuiltBrowser(async({page,origin})=>{
 await page.goto(origin+'/task-pricing',{waitUntil:'networkidle'});const root=page.getByTestId('task-cost');await root.waitFor();await root.locator('canvas').scrollIntoViewIfNeeded();
 const frames=await page.evaluate(async()=>{const input=document.querySelector('[data-testid=cost-inputTokens]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'200001');input.dispatchEvent(new Event('input',{bubbles:true}));const frames=[];const start=performance.now();while(performance.now()-start<650){await new Promise(requestAnimationFrame);const c=document.querySelector('[data-testid=task-cost-chart] canvas');frames.push(c.toDataURL());}return frames;});
 assert(new Set(frames).size>3,'changed scenario values animate in the real Chart.js canvas');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-testid=task-cost-chart]')?.dataset.reducedMotion==='true');assert.equal((await geometry(root)).animation,false);
 record('normal and live reduced motion',{uniqueCanvasFrames:new Set(frames).size,durationMs:380,livePreferenceChange:true});
},{reducedMotion:'no-preference'});
report.passed=true;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
console.log('Task pricing and versions passed: six views at 390/768/1440px; native chart/table/export parity, tariff hand calculations, strict version gaps, homepage tiers/weights, history/reload, keyboard, lifecycle and reduced motion. Evidence: '+out+'/report.json');
