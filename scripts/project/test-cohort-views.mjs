// Product browser regression: fresh build, original facts, actual Chart.js geometry.
// Outputs are ignored; this check never edits source or fetches new measurements.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { withBuiltBrowser } from '../test-harness.mjs';
import { headToHead, defaultPair, pct } from '../../src/authority/logic.ts';
import { buildCatalogue, applyFilters, CAT_DEFAULTS } from '../../src/catalogue/logic.ts';
import { filterRows, DEFAULT_FILTERS, PARAMETER_BANDS, representatives, formatParameters, PAGE_SIZE } from '../../src/open-weights/logic.ts';
const out = 'test-results/cohort-views';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(out, { recursive: true });
const build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
await writeFile(`${out}/build.log`, (build.stdout ?? '') + (build.stderr ?? ''));
assert.equal(build.status, 0, `build failed; inspect ${out}/build.log`);
const bytes = await readFile('public/data.json'), data = JSON.parse(bytes);
const manifest = JSON.parse(await readFile('public/data-manifest.json'));
const sourcePaths = ['package.json','package-lock.json','src/open-weights.tsx','src/head-to-head.tsx','src/catalogue.tsx','src/catalogue/logic.ts','src/charts/cohort-chart.tsx','src/charts/cohort-rows.ts','src/charts/registry.ts','src/charts/controls.tsx','src/charts/state.ts','src/style.css','scripts/project/test-cohort-views.mjs','docs/OPEN-WEIGHTS.md','docs/HEAD-TO-HEAD.md','docs/CATALOGUE.md'];
const report = { at: new Date().toISOString(), passed: false, independentReview: false, dataSha256: sha(bytes), manifestSha256: sha(await readFile('public/data-manifest.json')), buildLogSha256: sha(await readFile(`${out}/build.log`)), currentSource: await Promise.all(sourcePaths.map(async path => ({ path, sha256: sha(await readFile(path)) }))), checks: [], screenshots: [] };
const record = (name, observed) => report.checks.push({ name, observed });
const approx = (a,b) => assert(Math.abs(a-b)<1e-7, `${a} differs from ${b}`);
const allWeights = filterRows(data.openWeights.rows, DEFAULT_FILTERS);
const pair = defaultPair(data.authority), result = headToHead(data.authority, pair.a, pair.b);
const catalogue = buildCatalogue(data);
// Adding registry identities or a rejected claim cannot create observed coverage.
const pending = structuredClone(data.authority);
pending.models.push({ ...pending.models[0], key: 'pending-identity' });
pending.observations.push({ ...result.matched[0].a, id: 'cohort-rejected', admitted: false, matchable: false, exclusion: 'Unverified pending claim' });
const pendingResult = headToHead(pending, pair.a, pair.b);
assert.deepEqual([pendingResult.matched.length,pendingResult.onlyA.length,pendingResult.onlyB.length], [result.matched.length,result.onlyA.length,result.onlyB.length]);
assert.equal(pendingResult.excluded.length,result.excluded.length+1);
async function geometry(root) {
  const canvas = root.locator('canvas'); await canvas.waitFor();
  await canvas.page().waitForFunction(el => !!el.dataset.chartGeometry, await canvas.elementHandle());
  return JSON.parse(await canvas.getAttribute('data-chart-geometry'));
}
function checkCoordinates(g, expected, parameter = false) {
  assert.equal(g.animation, false);
  assert.equal(g.datasets.length, expected.length);
  for (let dataset=0; dataset<expected.length; dataset++) {
    assert.equal(g.datasets[dataset].data.length, expected[dataset].length);
    expected[dataset].forEach((value,index) => {
      const actual = g.datasets[dataset].data[index];
      approx(typeof actual === 'number' ? actual : actual.x, value);
      const coordinate = parameter ? g.area.left + Math.log(value/g.scales.x.min)/Math.log(g.scales.x.max/g.scales.x.min)*g.area.width : g.scales.x.zero + value*(g.scales.x.one-g.scales.x.zero);
      approx(g.datasets[dataset].elements[index].x, coordinate);
      if (g.type === 'bar') assert(Math.abs(g.datasets[dataset].elements[index].base-g.scales.x.zero)<=.51, 'bars start at zero');
    });
  }
}
async function screenshot(page, root, name) {
  const target = (await root.locator('.cohort-chart').count()) ? root.locator('.cohort-chart').first() : root.locator('table').first();
  await target.evaluate(el => window.scrollTo(0, scrollY + el.getBoundingClientRect().top - 130));
  const path = `${out}/${name}.png`; await page.screenshot({ path, animations:'disabled' });
  report.screenshots.push({ path, sha256: sha(await readFile(path)) });
  const widget=`${out}/${name}-widget.png`;await target.screenshot({path:widget,animations:'disabled'});report.screenshots.push({path:widget,sha256:sha(await readFile(widget))});
}
async function download(page, button, name) {
  const pending = page.waitForEvent('download'); await button.click(); const d=await pending;
  const path=`${out}/${name}.json`; await d.saveAs(path); return JSON.parse(await readFile(path));
}
async function bounded(page, width) {
  assert.equal(Number(await page.locator('html').getAttribute('data-chart-js-instances') ?? 0),await page.locator('.core-chart canvas').count(),'live Chart.js instances match mounted canvases');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page fits ${width}px`);
  for (const c of await page.locator('.cohort-chart canvas').all()) {
    const box=await c.boundingBox(); assert(box && box.x>=0 && box.x+box.width<=width+1, 'actual canvas fits viewport');
  }
}
await withBuiltBrowser(async ({page,origin}) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message)); page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
  assert.equal(sha(await (await page.request.get(origin+'/data.json')).body()),sha(bytes),'browser serves current built snapshot');
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(origin+'/open-weights',{waitUntil:'networkidle'});
    let root=page.getByTestId('ow'); await root.waitFor();
    for (const view of ['buckets','scatter','heatmap','table']) {
      await root.getByTestId('ow-view-'+view).focus(); await page.keyboard.press('Space');
      await page.waitForFunction(v => new URL(location.href).searchParams.get('owView') === v && document.querySelector(`[data-testid=ow-view-${v}]`)?.getAttribute('aria-pressed') === 'true',view);
      assert.equal(new URL(page.url()).searchParams.get('owView'),view);
      const visible = await root.getByTestId('ow-table').locator('tbody tr').evaluateAll(rows=>rows.map(r=>({id:r.dataset.rowId,total:r.querySelector('[data-cell=total]').childNodes[0].textContent,activated:r.querySelector('[data-cell=activated]').childNodes[0].textContent})));
      assert.deepEqual(visible.map(r=>r.id),allWeights.slice(0,PAGE_SIZE).map(r=>r.modelId));
      visible.forEach((r,i)=>{assert.equal(r.total,formatParameters(allWeights[i].total.value));assert.equal(r.activated,allWeights[i].activated.value===null?'Not stated':(allWeights[i].activated.approximate?'~':'')+formatParameters(allWeights[i].activated.value));});
      if (view==='buckets') {
        for (const band of PARAMETER_BANDS) {
          const panel=root.locator(`[data-testid=ow-panel][data-band="${band.id}"]`), expected=representatives(allWeights,band.id);
          assert.deepEqual(await panel.getByTestId('ow-series').evaluateAll(rows=>rows.map(r=>r.dataset.modelId)),expected.map(r=>r.modelId));
          if(band.id==='undisclosed'||!expected.length) assert.equal(await panel.locator('canvas').count(),0);
          else checkCoordinates(await geometry(panel.getByTestId(`ow-${band.id}-chart`)),['total','activated'].map(k=>expected.filter(r=>r[k].value!==null).map(r=>r[k].value)),true);
        }
      } else if (view==='scatter') checkCoordinates(await geometry(root.getByTestId('ow-chart')),['total','activated'].map(k=>allWeights.slice(0,PAGE_SIZE).filter(r=>r[k].value!==null).map(r=>r[k].value)),true);
      else if (view==='heatmap') {
        const g=await geometry(root.getByTestId('ow-chart')); assert.equal(g.datasets[0].data.length,PAGE_SIZE*2);
        assert((await root.getByTestId('ow-chart').locator('.core-scale-note').innerText()).startsWith('Columns: Total · Activated'),'heatmap legend identifies its actual columns');
        const json=await download(page,root.getByTestId('ow-export'),`ow-heatmap-${width}`);
        assert.deepEqual(json.plottedRows.map(r=>r.value),allWeights.slice(0,PAGE_SIZE).flatMap(r=>[r.total.value,r.activated.value]));
        assert(json.plottedRows.some(r=>r.value===null),'unknown cells remain null');
        assert(json.plottedRows.filter(r=>r.value!==null).every(r=>r.sources.length>0),'measured cells carry original sources');
        assert.equal(json.dataDigest,manifest.projection.sha256);
        const pixels=await root.getByTestId('ow-chart').locator('canvas').evaluate((canvas,g)=>{ const ctx=canvas.getContext('2d'),sx=canvas.width/canvas.clientWidth,sy=canvas.height/canvas.clientHeight;return g.datasets[0].elements.map(p=>[...ctx.getImageData(Math.round((p.x+12)*sx),Math.round((p.y-10)*sy),1,1).data]);},g);
        const measured=json.plottedRows.map((r,i)=>r.value===null?null:{i,value:r.value}).filter(Boolean).sort((a,b)=>a.value-b.value);
        assert(new Set(measured.map(r=>pixels[r.i].join(','))).size>2,'measured heatmap cells encode more than a stock uniform fill');
        const missingIndex=json.plottedRows.findIndex(r=>r.value===null);assert.notDeepEqual(pixels[missingIndex],pixels[measured.at(-1).i],'unknown cell paint differs from a measured cell');
      } else assert.equal(await root.locator('canvas').count(),0);
      await bounded(page,width); await screenshot(page,root,`${width}-open-${view}`);
    }
    record('open views@'+width,{totalActivatedGeometry:true,unknowns:true,keyboard:true,allViews:true});
    await page.goto(origin+'/us-china',{waitUntil:'networkidle'}); root=page.getByTestId('h2h'); await root.waitFor();
    for (const view of ['paired','grouped','coverage','table']) {
      await root.getByTestId('h2h-view-'+view).focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(v => new URL(location.href).searchParams.get('h2hView') === v && document.querySelector(`[data-testid=h2h-view-${v}]`)?.getAttribute('aria-pressed') === 'true',view);
      assert.equal(new URL(page.url()).searchParams.get('h2hView'),view);
      const table=root.getByTestId('h2h-table');
      assert.deepEqual(await table.locator('tbody tr[data-row-id]').evaluateAll(rows=>rows.map(r=>r.dataset.rowId)),result.matched.map(r=>r.id));
      for (const row of result.matched) {
        const tr=table.locator(`tr[data-row-id="${row.id}"]`);
        assert((await tr.locator('[data-cell=us]').innerText()).startsWith(pct(row.a.value)));
        assert((await tr.locator('[data-cell=cn]').innerText()).startsWith(pct(row.b.value)));
        assert.deepEqual(await tr.locator('a[data-result-side]').evaluateAll(a=>a.map(el=>el.href)),[row.a.resultUrl,row.b.resultUrl]);
      }
      if (view==='paired'||view==='grouped') {
        checkCoordinates(await geometry(root.getByTestId('h2h-chart')),[result.matched.map(r=>r.a.value),result.matched.map(r=>r.b.value)]);
        checkCoordinates(await geometry(root.getByTestId('h2h-domains-chart')),[result.domains.map(r=>r.a),result.domains.map(r=>r.b)]);
      } else if (view==='coverage') {
        checkCoordinates(await geometry(root.getByTestId('h2h-coverage-chart')),[[result.matched.length,result.matched.length],[result.onlyA.length,result.onlyB.length]]);
        const json=await download(page,root.getByTestId('h2h-export'),`coverage-${width}`);
        assert.deepEqual(json.observedCoverage.map(r=>r.value),[result.matched.length,result.onlyA.length,result.matched.length,result.onlyB.length]);
        assert.equal(json.view,'coverage'); assert.equal(json.dataDigest,manifest.projection.sha256);
        assert.deepEqual(json.matched.map(r=>r.id),result.matched.map(r=>r.id));
        assert(json.observedCoverage.every(r=>r.unit==='observed compatible results'));
      } else assert.equal(await root.locator('canvas').count(),0);
      assert(await root.getByTestId('h2h-unmatched').evaluate(el=>el.open),'unmatched coverage stays visible');
      await bounded(page,width); await screenshot(page,root,`${width}-regional-${view}`);
    }
    record('regional views@'+width,{sharedPanel:true,canvasTableExportParity:true,observedCoverage:true,keyboard:true});
    await page.goto(origin+'/models?catLifecycle=current&foreign=discard',{waitUntil:'networkidle'}); root=page.getByTestId('catalogue'); await root.waitFor();
    assert.equal(new URL(page.url()).searchParams.get('foreign'),null);
    const current=applyFilters(catalogue.rows,{...CAT_DEFAULTS,lifecycle:'current'});
    assert.equal(Number((await root.getByTestId('cat-total').innerText()).replaceAll(',','')),current.length);
    assert(current.length>0); await root.getByTestId('cat-lifecycle').selectOption('archive');
    const archive=applyFilters(catalogue.rows,{...CAT_DEFAULTS,lifecycle:'archive'});
    assert.equal(Number((await root.getByTestId('cat-total').innerText()).replaceAll(',','')),archive.length); assert(archive.length>0);
    await page.reload({waitUntil:'networkidle'}); assert.equal(await root.getByTestId('cat-lifecycle').inputValue(),'archive');
    await root.getByTestId('cat-query').fill('claude');
    const json=await download(page,root.getByTestId('cat-export-json'),`catalogue-${width}`);
    const expected=applyFilters(catalogue.rows,{...CAT_DEFAULTS,lifecycle:'archive',query:'claude'});
    assert.deepEqual(json.rows.map(r=>r.id),expected.map(r=>r.id)); assert(expected.every(r=>r.sourceUrl?.startsWith('https://')&&r.version));
    await bounded(page,width); const path=`${out}/${width}-catalogue.png`;await page.screenshot({path,animations:'disabled'});report.screenshots.push({path,sha256:sha(await readFile(path))});
  }
  // Each view/filter/bucket has its own reproducible URL, including history.
  for (const [route,prefix,key,views] of [['open-weights','ow','owView',['buckets','scatter','heatmap','table']],['us-china','h2h','h2hView',['paired','grouped','coverage','table']]]) {
    for (const view of views) {
      const extra=prefix==='ow'?'&owBand=undisclosed&owLab=moonshot-kimi':'&us=gpt-6-astra&cn=kimi-k3&h2hDomain=mathematics&h2hSetting=same';
      await page.goto(`${origin}/${route}?${key}=${view}${extra}&foreign=discard`,{waitUntil:'networkidle'});
      assert.equal(await page.getByTestId(`${prefix}-view-${view}`).getAttribute('aria-pressed'),'true');assert.equal(new URL(page.url()).searchParams.get('foreign'),null);
      const saved=page.url();await page.reload({waitUntil:'networkidle'});assert.equal(page.url(),saved);
      const json=await download(page,page.getByTestId(prefix+'-export'),`${prefix}-${view}-restored`);assert.equal(json.view,view);
      if(prefix==='ow'){assert.equal(json.filters.band,'undisclosed');assert(json.rows.every(r=>r.band==='undisclosed'));if(view==='buckets')assert.deepEqual(json.plottedRows,[],'Undisclosed bucket has no exported numerical plot');}else{assert.equal(json.filters.domain,'mathematics');assert.equal(json.filters.sameSetting,true);}
    }
    await page.goto(`${origin}/${route}`,{waitUntil:'networkidle'});await page.getByTestId(prefix+'-view-table').click();await page.waitForFunction(k=>new URL(location.href).searchParams.get(k)==='table',key);const saved=page.url();
    await page.goBack({waitUntil:'networkidle'});assert.notEqual(new URL(page.url()).searchParams.get(key),'table');
    await page.goForward({waitUntil:'networkidle'});assert.equal(page.url(),saved);assert.equal(await page.getByTestId(prefix+'-view-table').getAttribute('aria-pressed'),'true');
  }
  await page.goto(origin+'/us-china?us=gpt-6-astra&cn=kimi-k3&h2hSource=bfcl-v4&h2hView=paired',{waitUntil:'networkidle'});
  assert.equal(await page.getByTestId('h2h-chart').count(),0);assert.equal(await page.getByTestId('h2h-empty').count(),1,'missing pair has no score marks');
  await page.getByTestId('h2h-view-coverage').click();const empty=headToHead(data.authority,'gpt-6-astra','kimi-k3',{domain:'all',sameSetting:false,sourceId:'bfcl-v4'});
  checkCoordinates(await geometry(page.getByTestId('h2h-coverage-chart')),[[0,0],[empty.onlyA.length,empty.onlyB.length]]);
  // Keyboard factual inspection and reduced motion are real canvas observations.
  await page.goto(origin+'/open-weights?owView=scatter',{waitUntil:'networkidle'});
  const value=page.getByTestId('ow-values').locator('button').first();await value.focus();assert((await page.getByTestId('ow-tooltip').innerText()).includes(allWeights[0].name));
  record('URL/export qualification',{allEightReloaded:true,backForward:true,bucketFilter:true,unknownsNotZero:true});
  assert.deepEqual(errors,[],'no browser errors');
});
await withBuiltBrowser(async({page,origin})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin+'/open-weights?owView=scatter',{waitUntil:'networkidle'});
  const root=page.getByTestId('ow-chart');await root.waitFor();await root.locator('canvas').scrollIntoViewIfNeeded();await page.waitForTimeout(450);
  const frames=await page.evaluate(async()=>{
    const select=document.querySelector('[data-testid=ow-lab]');select.value='meta';select.dispatchEvent(new Event('change',{bubbles:true}));
    const frames=[],start=performance.now();while(performance.now()-start<600){await new Promise(requestAnimationFrame);frames.push(document.querySelector('[data-testid=ow-chart] canvas').toDataURL());}return frames;
  });
  assert(new Set(frames).size>3,'parameter data changes animate in the actual canvas');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-testid=ow-chart]')?.dataset.reducedMotion==='true');
  assert.equal((await geometry(root)).animation,false);
  record('live reduced motion',{uniqueCanvasFrames:new Set(frames).size,animationOff:true});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(origin+'/us-china?h2hView=grouped',{waitUntil:'networkidle'});await page.getByTestId('h2h-chart').locator('canvas').scrollIntoViewIfNeeded();await page.waitForTimeout(450);
  const regionalFrames=await page.evaluate(async()=>{const us=document.querySelector('[data-testid=h2h-us]'),cn=document.querySelector('[data-testid=h2h-cn]');us.value='gpt-6-astra';us.dispatchEvent(new Event('change',{bubbles:true}));cn.value='kimi-k3';cn.dispatchEvent(new Event('change',{bubbles:true}));const frames=[],start=performance.now();while(performance.now()-start<600){await new Promise(requestAnimationFrame);frames.push(document.querySelector('[data-testid=h2h-chart] canvas').toDataURL());}return frames;});
  assert(new Set(regionalFrames).size>3,'changing the regional pair animates actual grouped comparison values');
  assert.equal(await page.getByTestId('h2h-us').inputValue(),'gpt-6-astra','batched pair selection preserves US model');assert.equal(await page.getByTestId('h2h-cn').inputValue(),'kimi-k3','batched pair selection preserves China model');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-testid=h2h-chart]')?.dataset.reducedMotion==='true');assert.equal((await geometry(page.getByTestId('h2h-chart'))).animation,false);
  record('regional normal/live reduced motion',{uniqueCanvasFrames:new Set(regionalFrames).size,animationOff:true});
  const selectedPair=headToHead(data.authority,'gpt-6-astra','kimi-k3');checkCoordinates(await geometry(page.getByTestId('h2h-chart')),[selectedPair.matched.map(r=>r.a.value),selectedPair.matched.map(r=>r.b.value)]);
  assert.deepEqual(errors,[],'normal-motion data updates have no browser errors');
},{reducedMotion:'no-preference'});
assert(!Object.keys(JSON.parse(await readFile('package-lock.json')).packages).some(key=>/@visx|echarts/.test(key)),'obsolete chart packages are absent');
report.passed=true;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
console.log('Cohort views passed: eight Chart.js/table views at 390/768/1440px, factual geometry and exports, unknowns, coverage, URL reload/history, keyboard and live reduced motion. Evidence: '+out+'/report.json');
