// Runs against a fresh production build. No private paths or provider captures:
// the same browser gate is copied into the allowlisted public source archive.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { withBuiltBrowser } from '../test-harness.mjs';
import { bindProductionIdentity, parseTarget, siteBytes } from '../test-target.mjs';
const out = 'test-results/core-views';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(out, {recursive:true});
const target = parseTarget(); const identity = await bindProductionIdentity(target);
if(!target.production){
const build = spawnSync('npm',['run','build'],{encoding:'utf8',maxBuffer:8*1024*1024});
await writeFile(`${out}/build.log`,(build.stdout??'')+(build.stderr??''));
assert.equal(build.status,0,`build failed; inspect ${out}/build.log`);
}else await writeFile(`${out}/build.log`,'production target: no build\n');
const bytes = await siteBytes(target,'data.json'); const data = JSON.parse(bytes);
const sourcePaths = ['package.json','package-lock.json','src/charts/rows.ts','src/charts/state.ts','src/charts/controls.tsx','src/charts/core-chart.tsx','src/charts/heatmap.ts','src/charts/registry.ts','src/charts/reduced-motion.ts','src/authority-ranking.tsx','src/bridgebench.tsx','src/domain-weights.tsx','src/observatory-experience.tsx','src/observatory.tsx','src/style.css','tests/core-views.test.ts','scripts/project/test-core-views.mjs'];
const report = {at:new Date().toISOString(),passed:false,dataSha256:sha(bytes),manifestSha256:sha(await siteBytes(target,'data-manifest.json')),target:target.production?{url:target.url,...identity}:'local build',buildLogSha256:sha(await readFile(`${out}/build.log`)),currentSource:await Promise.all(sourcePaths.map(async path=>({path,sha256:sha(await readFile(path))}))),checks:[],screenshots:[]};
const record=(name,observed)=>report.checks.push({name,observed});
const approx=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} differs from ${b}`);
const current=data.authority.observations.filter(r=>r.currentPolicy?.scoringEligible && r.admitted).sort((a,b)=>b.value-a.value || a.modelKey.localeCompare(b.modelKey));
const representatives=current.filter((r,i)=>current.findIndex(s=>s.modelKey===r.modelKey)===i);
const modelName=key=>data.authority.models.find(m=>m.key===key).name;
const expectedRanking=representatives.map(r=>({id:r.id,modelKey:r.modelKey,label:modelName(r.modelKey),value:r.value,nativeValue:r.rawValue,valueLabel:`${r.rawText} ${r.rawUnit}`,source:r.resultUrl,unit:r.rawUnit}));
const ratings=axis=>data.bridgeBench.records.map(r=>({id:r.id,modelKey:r.modelKey,label:r.modelLabel,value:r.ratings[axis],nativeValue:r.ratings[axis],valueLabel:r.ratings[axis]===null?`Unknown: ${r.missingReasons.ratings[axis]}`:String(r.ratings[axis]),source:r.resultUrl,unit:r.unit})).sort((a,b)=>a.value===null?(b.value===null?a.modelKey.localeCompare(b.modelKey):1):b.value===null?-1:b.value-a.value || a.modelKey.localeCompare(b.modelKey));
const captured=data.observations.filter(r=>r.suiteId==='hle-original').sort((a,b)=>b.value-a.value).map(r=>({id:r.id,value:r.value,nativeValue:r.value,valueLabel:r.unit?.label?`${r.valueText} ${r.unit.label}`:`${r.valueText} · unit ${r.unit?.status??'unknown'}`,unit:r.unit?.label??`unit ${r.unit?.status??'unknown'}`,source:r.resultUrl}));
const expectedDomains={'claude-opus-4-5-20251101':(.7747+.3347)/2,'claude-haiku-4-5-20251001':(.687+.2526)/2};
async function geometry(root){const c=root.locator('canvas');await c.waitFor();await c.page().waitForFunction(el=>!!el?.dataset.chartGeometry,await c.elementHandle());return JSON.parse(await c.getAttribute('data-chart-geometry'));}
async function tableParity(root,testId,expected){
 const table=root.getByTestId(testId); const details=table.locator('xpath=ancestor::details[1]');if(await details.count())await details.evaluate(el=>el.open=true);
 assert(await table.locator('caption').innerText());assert.equal(await table.locator('tbody tr').count(),expected.length);
 const actual=await table.locator('tbody tr').evaluateAll(els=>els.map(el=>({id:el.dataset.rowId,value:el.querySelector('[data-cell=value]')?.childNodes[0]?.textContent,urls:[...el.querySelectorAll('a')].map(a=>a.getAttribute('href'))})));
 for(let i=0;i<expected.length;i++){assert.equal(actual[i].id,expected[i].id);assert.equal(actual[i].value,expected[i].valueLabel);if(expected[i].source)assert(actual[i].urls.includes(expected[i].source));}
 assert.equal(await table.locator('tbody th[scope=row]').count(),expected.length);
 await table.locator('..').focus();assert(await table.locator('..').evaluate(el=>el===document.activeElement));
}
async function linearParity(root,expected,view,normalized){
 const g=await geometry(root);const ds=g.datasets[0];const measured=expected.filter(r=>r.value!==null);
 if(measured.every(r=>r.label))assert.deepEqual(g.scales.y.labels,measured.map(r=>r.label),'every graphical row has its actual model axis label');
 assert.equal(ds.elements.length,measured.length);assert.equal(g.type,view==='bars'?'bar':'scatter');assert.equal(g.animation,false);
 for(let i=0;i<measured.length;i++){
  const value=measured[i].value;
  approx(view==='bars'?ds.data[i]:ds.data[i].x,value);
  const coordinate=g.scales.x.zero+value*(g.scales.x.one-g.scales.x.zero);
  approx(ds.elements[i].x,coordinate);
  if(view==='bars'){assert(Math.abs(ds.elements[i].base-g.scales.x.zero)<=.51,'bar starts at zero with Chart.js half-pixel grid alignment');assert(Math.abs(ds.elements[i].width-Math.abs(coordinate-g.scales.x.zero))<=.51,'bar length must encode its actual value from zero');}
 }
 if(normalized){assert.equal(g.scales.x.min,0);assert.equal(g.scales.x.max,1);}
 return g;
}
async function saveScreenshot(page,root,name){await root.locator('.core-view-controls').first().evaluate(el=>window.scrollTo(0,scrollY+el.getBoundingClientRect().top-130));const path=`${out}/${name}.png`;await page.screenshot({path,animations:'disabled'});report.screenshots.push({path,sha256:sha(await readFile(path))});}
async function download(page,button,name){const promise=page.waitForEvent('download');await button.click();const d=await promise;const path=`${out}/${name}.json`;await d.saveAs(path);return JSON.parse(await readFile(path));}
async function counts(page,expected){assert.equal(Number(await page.locator('html').getAttribute('data-chart-js-instances')??0),expected,'live Chart.js registry count');assert.equal(await page.locator('.core-chart canvas').count(),expected,'mounted core canvas count');}
async function restored(page,rootId,key,button,changed){
 await page.getByTestId(button).focus();await page.keyboard.press('Space');await page.waitForFunction(([k,v])=>new URL(location.href).searchParams.get(k)===v,[key,changed]);const saved=page.url();
 await page.goBack({waitUntil:'networkidle'});await page.getByTestId(rootId).waitFor();assert.notEqual(new URL(page.url()).searchParams.get(key),changed);
 await page.goForward({waitUntil:'networkidle'});await page.getByTestId(rootId).waitFor();assert.equal(page.url(),saved);assert.equal(await page.getByTestId(button).getAttribute('aria-pressed'),'true');
 await page.reload({waitUntil:'networkidle'});await page.getByTestId(rootId).waitFor();assert.equal(await page.getByTestId(button).getAttribute('aria-pressed'),'true');
}
await withBuiltBrowser(async({page,origin,newPage})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 assert.equal(sha(await (await page.request.get(origin+'/data.json')).body()),sha(bytes),'browser serves the exact freshly built public data');
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:1000});
  await page.goto(origin+'/rankings',{waitUntil:'networkidle'});let root=page.getByTestId('authority-ranking');await root.waitFor();
  for(const view of ['bars','dots','table']){
   await root.getByTestId('ranking-view-'+view).click();await tableParity(root,'authority-table',expectedRanking);
   if(view!=='table'){await linearParity(root,expectedRanking,view,true);await counts(page,1);}
   else await counts(page,0);
   if(width===1440)await saveScreenshot(page,root,`${width}-rankings-${view}`);
  }
  assert.equal(new URL(page.url()).searchParams.get('authorityVersion'),data.authority.suites.find(s=>s.id===current[0].suiteId).version);
  record('ranking views@'+width,{rows:expectedRanking.length,nativeValues:true,actualCanvasGeometry:true,sourceLinks:true});
  await page.goto(origin+'/benchmarks?cohort=reported&suite=hle-original',{waitUntil:'networkidle'});root=page.getByTestId('bridgebench');await root.waitFor();
  for(const view of ['bars','dots','table']){
   await root.getByTestId('bridge-view-'+view).click();await tableParity(root,'bridge-table',ratings('overall'));
   if(view!=='table')await linearParity(root,ratings('overall'),view,false);
   if(width===1440)await saveScreenshot(page,root,`${width}-bridgebench-${view}`);
  }
  for(const axis of data.bridgeBench.axes){await root.getByLabel('Rating axis').selectOption(axis.id);await tableParity(root,'bridge-table',ratings(axis.id));}
  await root.getByLabel('Rating axis').selectOption('reasoning');await root.getByTestId('bridge-view-dots').click();await linearParity(root,ratings('reasoning'),'dots',false);
  await root.locator('.core-row-control').first().focus();const first=ratings('reasoning')[0];
  const tooltip=root.getByTestId('bridgebench-tooltip');assert.match(await tooltip.innerText(),new RegExp(first.valueLabel));assert((await tooltip.innerText()).includes(first.unit));assert.equal(await tooltip.locator('a').first().getAttribute('href'),first.source);
  const g=await geometry(root);const mark=g.datasets[0].elements[1];await root.locator('canvas').evaluate(el=>window.scrollTo(0,scrollY+el.getBoundingClientRect().top-130));const box=await root.locator('canvas').boundingBox();await page.mouse.move(box.x+mark.x,box.y+mark.y);await page.waitForFunction(label=>document.querySelector('[data-testid=bridgebench-tooltip]')?.textContent.includes(label),ratings('reasoning')[1].label);
  const frontier=page.locator('#frontier');
  for(const view of ['bars','dots','table']){
   await page.getByTestId('view-'+view).click();const table=frontier.getByTestId('result-table');const details=table.locator('xpath=ancestor::details[1]');if(await details.count())await details.evaluate(el=>el.open=true);
   assert.equal(await table.locator('tbody tr').count(),captured.length);const labels=await table.locator('tbody tr td:first-of-type').allTextContents();assert.deepEqual(labels,captured.map(r=>r.valueLabel));
   const links=await table.locator('a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));for(const row of captured)assert(links.includes(row.source));
   if(view!=='table'){await linearParity(frontier,captured,view,false);await counts(page,2);await frontier.locator('.ranking-row').first().focus();assert((await frontier.getByTestId('captured-tooltip').innerText()).includes(captured[0].valueLabel));}
   else await counts(page,1);
   if(width===1440)await saveScreenshot(page,frontier,`${width}-captured-${view}`);
  }
  record('benchmark views@'+width,{publishedModels:27,axes:10,capturedRows:captured.length,nativeRatings:true,unverifiedVisible:true,hoverAndKeyboardTooltips:true});
  await page.goto(origin+'/domains',{waitUntil:'networkidle'});root=page.getByTestId('domain-weights');await root.waitFor();
  assert.match(await root.getByTestId('weight-score').innerText(),/Insufficient common coverage/);
  for(const view of ['heatmap','radar','table']){
   await root.getByTestId('domain-view-'+view).click();const table=root.getByTestId('domain-table');const details=table.locator('xpath=ancestor::details[1]');if(await details.count())await details.evaluate(el=>el.open=true);
   assert.equal(await table.locator('tbody tr').count(),22);const actual=await table.locator('tbody tr').evaluateAll(els=>els.map(el=>({id:el.dataset.rowId,value:el.querySelector('[data-cell=value]').childNodes[0].textContent,links:[...el.querySelectorAll('a')].map(a=>a.href)})));
   for(const row of actual){const [key,domain]=row.id.split('|');assert.equal(row.value,domain==='tool-use'?`${(expectedDomains[key]*100).toFixed(1)}%`:'No compatible current common panel');if(domain==='tool-use')assert.deepEqual(row.links,[...new Set(current.filter(r=>r.modelKey===key).map(r=>r.resultUrl))]);}
   if(view==='radar'){const chart=await geometry(root);assert.equal(chart.scales.r.min,0);assert.equal(chart.scales.r.max,1);for(const ds of chart.datasets){assert.equal(ds.fill,false);assert.equal(ds.spanGaps,false);assert.equal(ds.data.filter(v=>v!==null).length,1);assert.equal(ds.elements.filter(e=>e.skip).length,10);approx(ds.data.find(v=>v!==null),expectedDomains[data.authority.models.find(m=>m.name===ds.label).key]);}assert.match(await root.innerText(),/1\/11 comparable spokes/);}
   if(view==='heatmap'){const chart=await geometry(root);assert.equal(chart.datasets[0].elements.length,22);assert.deepEqual(chart.scales.x.labels,Object.keys(data.scoring.defaultWeights).map(d=>d.replaceAll('-',' ')));assert.deepEqual(chart.scales.y.labels,['claude-opus-4-5-20251101','claude-haiku-4-5-20251001'].map(modelName));assert.match(await root.innerText(),/Hatched — cells/);}
   await counts(page,view==='table'?0:1);
   if(width===1440 || view==='heatmap')await saveScreenshot(page,root,`${width}-domains-${view}`);
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'core views fit viewport '+width);
  record('domain views@'+width,{cells:22,comparableSpokes:1,missingSpokes:10,radarNullsSkipped:true,familyMeanHandCalculation:expectedDomains,defaultComposite:null});
 }
 // Stateful views and filters survive same-route history and hard reload.
 await page.goto(origin+'/rankings',{waitUntil:'networkidle'});await page.getByTestId('authority-ranking').waitFor();await restored(page,'authority-ranking','rankingView','ranking-view-dots','dots');
 await page.getByTestId('authority-cohort').selectOption('all');await page.goBack({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('[data-testid=authority-cohort]')?.value==='representatives');assert.equal(await page.getByTestId('authority-cohort').inputValue(),'representatives');await page.goForward({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('[data-testid=authority-cohort]')?.value==='all');assert.equal(await page.getByTestId('authority-cohort').inputValue(),'all');
 let exported=await download(page,page.getByRole('button',{name:'Export ranking rows'}),'rankings-export');assert.equal(exported.rows.length,current.length);for(const row of exported.rows){const r=current.find(r=>r.id===row.id);assert.equal(row.nativeValue,r.rawValue);assert.equal(row.sources[0].url,r.resultUrl);}
 await page.getByLabel('Ranking scoring policy').selectOption('historical');await page.getByTestId('authority-panel').selectOption('deepswe-v1.1|deep-swe|pass@1');assert((await page.getByTestId('authority-rows').locator('li').count())>=10);assert.match(await page.getByTestId('authority-ranking').innerText(),/Historical qualified measurements/i);
 await page.goto(origin+'/benchmarks',{waitUntil:'networkidle'});await page.getByTestId('bridgebench').waitFor();await restored(page,'bridgebench','bridgeView','bridge-view-dots','dots');
 await page.getByLabel('Rating cohort').selectOption('confirmed');await page.getByLabel('Rating axis').selectOption('reasoning');await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('Rating cohort').inputValue(),'confirmed');assert.equal(await page.getByLabel('Rating axis').inputValue(),'reasoning');
 exported=await download(page,page.getByRole('button',{name:'Export rating rows'}),'bridgebench-export');assert.equal(exported.rows.length,data.bridgeBench.records.filter(r=>r.identityVerified).length);for(const row of exported.rows){const r=data.bridgeBench.records.find(r=>r.id===row.id);assert.equal(row.value,r.ratings.reasoning);assert.equal(row.unit,r.unit);assert.equal(row.sources[0].url,r.resultUrl);}
 await page.getByTestId('cohort-filter').selectOption('reported');await page.getByTestId('suite-filter').selectOption('hle-original');await restored(page,'bridgebench','view','view-dots','dots');assert.equal(await page.getByTestId('cohort-filter').inputValue(),'reported');assert.equal(await page.getByTestId('suite-filter').inputValue(),'hle-original');
 exported=await download(page,page.getByRole('button',{name:'Export captured rows'}),'captured-export');assert.deepEqual(exported.rows.map(r=>[r.id,r.valueLabel,r.sources[0].url]),captured.map(r=>[r.id,r.valueLabel,r.source]));
 await page.getByTestId('lab-filter').selectOption(data.models.find(m=>m.id===data.observations.find(r=>r.suiteId==='hle-original').modelId).labId);await page.reload({waitUntil:'networkidle'});assert.notEqual(await page.getByTestId('lab-filter').inputValue(),'all');
 await page.goto(origin+'/domains',{waitUntil:'networkidle'});await page.getByTestId('domain-weights').waitFor();await restored(page,'domain-weights','domainView','domain-view-radar','radar');await page.getByTestId('weight-covered').click();assert.match(await page.getByTestId('weight-score').innerText(),/55\.5%/);await page.getByLabel('tool-use weight',{exact:true}).fill('2');await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('tool-use weight',{exact:true}).inputValue(),'2');assert.equal(await page.getByTestId('domain-view-radar').getAttribute('aria-pressed'),'true');
 exported=await download(page,page.getByTestId('weight-export'),'domains-export');assert.equal(exported.view,'radar');assert.equal(exported.productDataDigest,sha(bytes));for(const row of exported.viewRows){if(row.domain==='tool-use')approx(row.value,expectedDomains[row.modelKey]);else assert.equal(row.value,null);}
 await page.getByTestId('weight-reset').click();assert.match(await page.getByTestId('weight-score').innerText(),/Insufficient/);assert(await page.getByTestId('weight-sensitivity-table').locator('tbody tr').count()>2);assert.match(await page.getByTestId('weight-independent').innerText(),/Insufficient/);
 record('URL, share and export restoration',{ranking:true,bridgebench:true,captured:true,domains:true,weightReset:true,sensitivityRetained:true,versionKeys:['authorityVersion','bridgeVersion','suiteVersion','domainSuites','domainSnapshot']});
 // The default release-identity watchlist is missing measurements, not zeros.
 await page.goto(origin+'/benchmarks',{waitUntil:'networkidle'});await page.getByTestId('bridgebench').waitFor();await page.getByTestId('view-table').click();
 const watch=data.models.filter(m=>m.identityVerified);const missingExport=await download(page,page.getByRole('button',{name:'Export captured rows'}),'missing-captured-export');
 assert.equal(missingExport.rows.length,watch.length);assert.equal(await page.getByTestId('result-table').locator('tbody tr').count(),watch.length);
 for(const row of missingExport.rows){assert.equal(row.value,null);assert.equal(row.nativeValue,null);assert.equal(row.missingReason,'No captured result');const m=watch.find(m=>m.id===row.id);if(m.originalSourceUrl)assert.equal(row.sources[0].url,m.originalSourceUrl);}
 record('missing watchlist export parity',{identities:watch.length,measuredRows:0,nullValues:true,releaseLinks:true});
 await page.goto(origin+'/domains',{waitUntil:'networkidle'});await page.getByTestId('domain-weights').waitFor();
 // Lifecycle, runtime reduced-motion changes, and actual source-link activation.
 for(let i=0;i<4;i++)for(const view of ['heatmap','radar','table']){await page.getByTestId('domain-view-'+view).click();await counts(page,view==='table'?0:1);}
 await page.getByTestId('domain-view-heatmap').click();let root=page.getByTestId('domain-weights');await root.locator('.core-row-control').first().focus();assert.match(await root.getByTestId('domains-tooltip').innerText(),/No compatible current common panel/);
 const canvas=root.locator('canvas');const still=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(180);assert.equal(await canvas.evaluate(c=>c.toDataURL()),still);assert.equal((await geometry(root)).animation,false);assert.equal(await root.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
 const stale=await canvas.elementHandle();await page.getByRole('navigation').getByRole('link',{name:'Methods',exact:true}).click();await page.getByTestId('methodology').waitFor();await counts(page,0);assert.equal(await stale.evaluate(el=>el.isConnected),false);
 await page.getByRole('navigation').getByRole('link',{name:'Rankings',exact:true}).click();await page.getByTestId('authority-ranking').waitFor();await counts(page,1);
 await page.context().route(u=>u.protocol==='https:'&&u.origin!==new URL(origin).origin,r=>r.fulfill({status:200,contentType:'text/html',body:'<title>Local external navigation fixture</title>'}));const link=page.getByTestId('authority-rows').locator('a').first();const href=await link.getAttribute('href');const popupPromise=page.waitForEvent('popup');await link.click();const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),href);await popup.close();
 const invalid=await newPage();await invalid.goto(origin+'/rankings?rankingView=bogus&authority=bogus',{waitUntil:'networkidle'});assert.equal(await invalid.getByTestId('ranking-view-bars').getAttribute('aria-pressed'),'true');assert.equal(new URL(invalid.url()).searchParams.get('rankingView'),'bars');await invalid.close();
 assert.deepEqual(errors,[]);record('lifetime and reduced motion',{cycles:12,detachedCanvasDestroyed:true,registryMatchesMounted:true,canvasStatic:true,noRunningMotion:true,sourcePopupExactUrl:href,invalidURLFallback:true});
},{hasTouch:true});
await withBuiltBrowser(async({page,origin})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/benchmarks',{waitUntil:'networkidle'});const root=page.getByTestId('bridgebench');await root.waitFor();
 await root.locator('canvas').scrollIntoViewIfNeeded();
 const beforeSort=await geometry(root);
 const samples=await page.evaluate(async()=>{
  const s=document.querySelector('.bridgebench select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'reasoning');s.dispatchEvent(new Event('change',{bubbles:true}));const seen=[];const start=performance.now();
  while(performance.now()-start<700){await new Promise(requestAnimationFrame);const canvas=document.querySelector('.bridgebench canvas');seen.push({ms:performance.now()-start,geometry:JSON.parse(canvas.dataset.currentGeometry),pixels:canvas.toDataURL()});}return seen;
 });
 assert(new Set(samples.map(s=>s.pixels)).size>3,'normal canvas animates changed values and sorted identities');
 const settled=samples.at(-1).geometry;assert.deepEqual(settled.datasets[0].data,ratings('reasoning').map(r=>r.value));assert.equal(settled.animation.duration,380);
 const nextLabels=ratings('reasoning').map(r=>r.label);assert.deepEqual(settled.labels,nextLabels);
 const oldY=new Map(beforeSort.labels.map((label,i)=>[label,beforeSort.datasets[0].elements[i].y]));
 const changed=samples.filter(s=>JSON.stringify(s.geometry.labels)===JSON.stringify(nextLabels));
 assert(changed.some(s=>s.geometry.datasets[0].elements.some((e,i)=>Math.abs(e.y-settled.datasets[0].elements[i].y)>1)), 'stable model identities move to their newly sorted rows');
 for(const sample of changed)for(const [i,element] of sample.geometry.datasets[0].elements.entries()){
  const from=oldY.get(nextLabels[i]),to=settled.datasets[0].elements[i].y;
  assert(element.y>=Math.min(from,to)-1 && element.y<=Math.max(from,to)+1,'sorting carries each mark from its own previous model position');
 }

 assert.equal(samples.at(-1).pixels,samples.at(-2).pixels,'animation settles');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-testid=bridgebench-chart]')?.dataset.reducedMotion==='true');await root.getByLabel('Rating axis').selectOption('backend');const g=await geometry(root);assert.equal(g.animation,false);const still=await root.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(120);assert.equal(await root.locator('canvas').evaluate(c=>c.toDataURL()),still);assert.deepEqual(errors,[]);
 record('normal and live reduced motion',{frames:samples.length,uniqueCanvasFrames:new Set(samples.map(s=>s.pixels)).size,durationMs:380,stableIdentitySorting:true,finalNativeValues:true,livePreferenceChange:true});
},{reducedMotion:'no-preference'});
report.passed=true;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
console.log('Core views passed: rankings / publisher ratings / captured scores bars+dots+table; domains heatmap+radar+table; 390/768/1440px, native values, real canvas geometry, source links, keyboard/touch, history/reload, exports, sparse radar, lifecycle and reduced motion. Evidence: '+out+'/report.json');
