// Tests the actual production artifact, with private local captures and hashes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { routes } from '../../src/routes.ts';
import { homeRecommendations, taskTypes } from '../../src/home/logic.ts';
import { withBuiltBrowser, browserBuild, readBrowserFile, browserTarget, retainBrowserEvidence } from '../test-harness.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await retainBrowserEvidence('test-results/routes');
await mkdir('test-results/routes', { recursive: true });
const build = browserBuild( { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
await writeFile('test-results/routes/build.log', (build.stdout ?? '') + (build.stderr ?? ''));
assert.equal(build.status, 0, 'production build failed; inspect test-results/routes/build.log');
const dataBytes = await readBrowserFile('public/data.json'); const data = JSON.parse(dataBytes);
const manifestBytes = await readBrowserFile('public/data-manifest.json'); const manifest = JSON.parse(manifestBytes);
const report = { target: browserTarget, at: new Date().toISOString(), sourceDigest: data.sourceDigest, dataSha256: sha(dataBytes), manifestSha256: sha(manifestBytes), buildLogSha256: sha(await readFile('test-results/routes/build.log')), widths: [360, 768, 1280, 1440], screenshots: [], checks: [] };
const record = (name, observed) => report.checks.push({ name, observed });
const entry = await readBrowserFile('dist/index.html', 'utf8');
let initialGzip = 0;
const entryPaths = [...new Set([...entry.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^" ]+\.js)"/g)].map(m => m[1]))];
for (const path of entryPaths) initialGzip += gzipSync(await readBrowserFile('dist' + path)).length;
assert(initialGzip <= 180 * 1024, 'initial JavaScript exceeds the preserved 180 KiB gzip budget');
assert(!entryPaths.some(p => p.includes('observatory-experience')), 'detailed comparisons must stay deferred');
record('initial JavaScript gzip bytes', initialGzip);
const sourcePaths = ['src/routes.ts','src/observatory.tsx','src/observatory-experience.tsx','src/home-comparison.tsx','src/home/logic.ts','src/versions.tsx','src/style.css','assets/surface.js','public/assets/surface.js','index.html','vite.config.ts','scripts/serve.mjs','scripts/project/test-routes.mjs'];
report.currentSource = await Promise.all(sourcePaths.map(async path => ({ path, sha256: sha(await readFile(path)) })));
const now = Date.now();
const picks = homeRecommendations(data.bridgeBench, data.pricing, data.authority, 'reasoning', 12000, 'bridgebench', now);
assert.equal(picks.pricedCount, 1); assert.equal(picks.tiers[0].row.modelKey, 'gemini-3-8-flash');
assert(Math.abs(picks.tiers[0].cost.totalUsd - 0.015) < 1e-10, '10000 input at $0.75/M + 2000 output at $3.75/M = $0.015');
assert.equal(picks.tiers[2].cost.totalUsd, null, 'frontier missing price must remain null');
const unverified = structuredClone(data.bridgeBench); unverified.records.forEach(r => { r.identityVerified = false; });
assert(homeRecommendations(unverified, data.pricing, data.authority, 'reasoning', 12000).tiers.every(t => !t.row));
const absent = structuredClone(data.bridgeBench); absent.records.forEach(r => { r.ratings.reasoning = null; });
assert.equal(homeRecommendations(absent, data.pricing, data.authority, 'reasoning', 12000).ratedCount, 0, 'missing rating is never zero');
assert.equal(homeRecommendations(data.bridgeBench, data.pricing, data.authority, 'reasoning', 12000, 'bridgebench', Date.parse('2027-01-02')).pricedCount, 0, 'stale/expired prices are never quoted');
assert.equal(homeRecommendations(data.bridgeBench, data.pricing, data.authority, 'unknown', 12000).ratedCount, 0);
assert(homeRecommendations(data.bridgeBench, data.pricing, data.authority, 'reasoning', 12000, 'current').tiers.every(t => !t.row), 'publisher ratings cannot enter current independent capability');
record('recommendation adversarial checks', ['hand calculation', 'unverified identity', 'missing rating', 'expired/stale tariff', 'unknown task', 'independent capability separation']);
async function capture(page, name) {
  const path = 'test-results/routes/' + name + '.png'; await page.screenshot({ path, animations: 'disabled' });
  report.screenshots.push({ path, sha256: sha(await readFile(path)) });
}
const mounted = { overview: 'home-comparison', rankings: 'authority-ranking', benchmarks: 'bridgebench', domains: 'domain-weights', pricing: 'task-cost', versions: 'versions', open: 'ow', regional: 'h2h', models: 'catalogue', methods: 'methodology', archive: 'benchmark-library' };
async function ready(page, id) { await page.getByTestId(mounted[id]).waitFor(); await page.evaluate(() => document.fonts.ready); }
const contrast = () => {
  const rgb = s => (s.match(/[\d.]+/g) ?? []).map(Number);
  const lum = c => c.slice(0,3).reduce((sum,v,i) => { v/=255; return sum + (v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i]; },0);
  const failures=[]; let checked=0;
  for (const el of document.querySelectorAll('header *, .hero *, .home-comparison *, .route-heading *, footer *')) {
    if (el.closest('svg,[aria-hidden=true],option,details:not([open]) > :not(summary)') || ![...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim())) continue;
    const rect=el.getBoundingClientRect(); if (!rect.width || !rect.height || el.closest('.overview-heading')) continue;
    const style=getComputedStyle(el); const fg=rgb(style.color); let bg;
    for(let n=el;n;n=n.parentElement){const c=rgb(getComputedStyle(n).backgroundColor);if(c.length===3 || c[3]>=.95){bg=c;break;}}
    bg??=[8,10,15];const ls=[lum(fg),lum(bg)].sort((a,b)=>b-a);const ratio=(ls[0]+.05)/(ls[1]+.05);
    const large=parseFloat(style.fontSize)>=24;checked++;if(ratio<(large?3:4.5))failures.push({text:el.textContent.trim().slice(0,40),ratio,fg,bg});
  }
  return {checked,failures};
};
await withBuiltBrowser(async ({page, origin, newPage}) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.emulateMedia({colorScheme:'light'});
  if (!browserTarget) {
  // A first-paint proof blocks every script and stylesheet, rather than sampling after React.
  const first = await newPage(); await first.emulateMedia({colorScheme:'light'});
  await first.route('**/*', r => ['script','stylesheet'].includes(r.request().resourceType()) ? r.abort() : r.continue());
  await first.goto(origin,{waitUntil:'domcontentloaded'});
  assert.equal(await first.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor), 'rgb(8, 10, 15)');
  assert.equal(await first.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'dark'); await first.close();
  record('dark before first paint with light OS', 'scripts and styles blocked; ink background and dark color-scheme');
  for (const path of ['/missing-page','/assets/missing.js','/data-missing.json','/rankings/missing','/rankings/missing.css']) {
    const response = await page.request.get(origin+path); assert.equal(response.status(),404,path+' must be real HTTP 404'); assert(!response.headers()['content-type']?.includes('text/html'), 'missing resource cannot be the app shell');
  }
  assert.equal((await page.request.get(origin+'/%00')).status(),403);
  assert.equal((await page.request.get(origin+'/%zz')).status(),404);
  record('production missing resources', 'unknown pages, nested paths and assets remain 404; NUL rejected');
  }
  for(const width of report.widths) {
    await page.setViewportSize({width,height:1000});
    for(const route of routes) {
      const htmlPath = route.path === '/' ? 'dist/index.html' : 'dist'+route.path+'/index.html';
      assert((await readBrowserFile(htmlPath,'utf8')).includes('<title>'+route.title+' — AxionBench</title>'));
      const response=await page.goto(origin+route.path,{waitUntil:'networkidle'}); assert.equal(response.status(),200); await ready(page,route.id);
      assert.equal(await page.title(),route.title+' — AxionBench');
      assert.equal(await page.locator('nav a[aria-current=page]').getAttribute('href'),route.path);
      assert.equal(await page.locator('#intelligence-surface').count(),route.id==='overview'?1:0,'hero only belongs to overview');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route.path+' escapes '+width+'px');
      const nav=page.getByRole('navigation',{name:'Main navigation'});
      for(const link of await nav.locator('a').all()) {await link.focus();assert(await link.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1;}), 'keyboard-focused nav link must scroll into view');}
      await nav.locator('a[aria-current=page]').focus();
      assert(parseFloat(await nav.locator('a[aria-current=page]').evaluate(el=>getComputedStyle(el).outlineWidth))>=2);
      await page.evaluate(()=>document.activeElement.blur());
      await capture(page,width+'-'+route.id+'-above-fold');
      if(route.id==='overview') {
        await page.locator('#task-comparison').scrollIntoViewIfNeeded(); await capture(page,width+'-overview-comparisons');
        assert.equal(await page.locator('.recommendation-grid article').count(),3);
        const c=await page.evaluate(contrast); assert.deepEqual(c.failures,[],JSON.stringify(c.failures));record('contrast@'+width,c.checked);
      }
    }
    console.log('Captured and checked all eleven production routes at '+width+'px.');
    await writeFile('test-results/routes/report.json',JSON.stringify({...report,passed:false},null,2)+'\n');
  }
  // Keyboard navigation, title focus and saved query history, including same-route back/forward.
  await page.goto(origin+'/?taskType=backend&tokens=100000',{waitUntil:'networkidle'}); await ready(page,'overview');
  await page.getByLabel('Total task tokens').fill('1000000');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('tokens')==='1000000');
  const homeURL=page.url();
  await page.getByRole('navigation').getByRole('link',{name:'Versions',exact:true}).focus();await page.keyboard.press('Enter');await ready(page,'versions');
  assert.equal(await page.locator('#route-title').evaluate(el=>el===document.activeElement),true);
  assert(!new URL(page.url()).searchParams.has('tokens'),'homepage query cannot leak into versions');
  await page.getByLabel('Version developer').selectOption('openai');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('versionLab')==='openai');
  const versionURL=page.url();
  await page.goBack({waitUntil:'networkidle'});await ready(page,'versions');assert.equal(await page.getByLabel('Version developer').inputValue(),'all');
  await page.goBack({waitUntil:'networkidle'});await ready(page,'overview');
  assert.equal(await page.getByLabel('Total task tokens').inputValue(),'1000000'); assert.equal(await page.getByLabel('Task type').inputValue(),'backend');assert.equal(page.url(),homeURL);
  await page.goForward({waitUntil:'networkidle'});await ready(page,'versions');assert.equal(await page.getByLabel('Version developer').inputValue(),'all');
  await page.goForward({waitUntil:'networkidle'});await ready(page,'versions');assert.equal(page.url(),versionURL);assert.equal(await page.getByLabel('Version developer').inputValue(),'openai');
  await page.reload({waitUntil:'networkidle'});await ready(page,'versions');assert.equal(await page.getByLabel('Version developer').inputValue(),'openai');
  record('history and route-scoped query state', {homeURL:new URL(homeURL).pathname+new URL(homeURL).search,versionURL:new URL(versionURL).pathname+new URL(versionURL).search});
  await page.goto(origin,{waitUntil:'networkidle'}); await ready(page,'overview');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),'#main-content');await page.keyboard.press('Enter');assert.equal(await page.locator('#main-content').evaluate(el=>el===document.activeElement),true);
  for(const type of taskTypes) {
    await page.getByLabel('Task type').selectOption(type.id);
    for(const tokens of [12000,100000,1000000]) {
      await page.getByLabel('Total task tokens').fill(String(tokens));
      const expected=homeRecommendations(data.bridgeBench,data.pricing,data.authority,type.id,tokens);
      for(const tier of expected.tiers) {
        const card=page.getByTestId('recommendation-'+tier.id);
        assert.equal(await card.getAttribute('data-model-key'),tier.row?.modelKey??'');
        assert.equal(await card.getByTestId('recommendation-rating').innerText(),String(tier.row?.ratings[type.axis]??'—'));
        assert.equal(await card.getByTestId('recommendation-cost').innerText(),tier.cost?.totalUsd==null?'Unknown':'$'+tier.cost.totalUsd.toFixed(4));
        if(tier.row)assert.equal(await card.locator('h3 a').getAttribute('href'),tier.row.resultUrl);
      }
    }
  }
  await page.getByLabel('Homepage benchmark').selectOption('current');
  for (const id of ['economy','balanced','frontier']) {
    const card = page.getByTestId('recommendation-' + id);
    await card.getByRole('heading',{name:'No eligible recommendation',exact:true}).waitFor();
    assert.equal(await card.getAttribute('data-model-key'),'');
  }
  assert.equal(await page.locator('.recommendation').count(),3);
  await page.getByLabel('Homepage benchmark').selectOption('bridgebench');await page.reload({waitUntil:'networkidle'});await ready(page,'overview');assert.equal(await page.getByLabel('Task type').inputValue(),'security');
  const pixels=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(250);assert.equal(await page.locator('canvas').evaluate(c=>c.toDataURL()),pixels,'reduced-motion hero remains static');
  record('homepage controls and native source parity', '5 task axes × 3 budgets × 3 tiers; exact ratings/costs/links, independent missing state, reload, keyboard and static reduced motion');
  if (!browserTarget) {
  // Digest tampering fails closed and preserves only the unloaded overview hero.
  const broken=await newPage();await broken.route('**/data.json',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('axionbench-public-v1','axionbench-public-v2')});});
  await broken.goto(origin);await broken.getByRole('alert').waitFor();assert.equal(await broken.getByTestId('home-comparison').count(),0);assert.equal(await broken.locator('canvas').count(),1);await broken.close();
  record('digest failure', 'tampered public data rejected; recommendation cards never render');
  }
  assert.deepEqual(errors,[],'runtime/console errors');
});
await withBuiltBrowser(async({page,origin})=>{
  await page.goto(origin,{waitUntil:'networkidle'});await ready(page,'overview');
  const before=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(300);assert.notEqual(await page.locator('canvas').evaluate(c=>c.toDataURL()),before,'normal hero animates');
  await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));await page.waitForTimeout(200);
  const offscreen=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(300);assert.equal(await page.locator('canvas').evaluate(c=>c.toDataURL()),offscreen,'offscreen hero suspends');
  await page.getByRole('navigation').getByRole('link',{name:'Methods',exact:true}).click();await ready(page,'methods');assert.equal(await page.locator('canvas').count(),0);
  await page.getByRole('navigation').getByRole('link',{name:'Overview',exact:true}).click();await ready(page,'overview');assert.equal(await page.locator('canvas').count(),1);await page.waitForTimeout(200);assert((await page.locator('canvas').evaluate(c=>c.width))>0);
  record('normal motion and lifetime', 'canvas changes while visible, suspends offscreen, disposes on navigation and mounts again');
},{reducedMotion:'no-preference'});
for (const screenshot of report.screenshots) screenshot.bytes=(await readFile(screenshot.path)).length;
report.passed=true;await writeFile('test-results/routes/report.json',JSON.stringify(report,null,2)+'\n');
console.log('Route checks passed: 11 production pages × 4 widths, '+report.screenshots.length+' fresh screenshots, keyboard/history/reload, real 404s, light-OS dark startup, contrast, source/cost parity and motion. Evidence: test-results/routes/report.json');
