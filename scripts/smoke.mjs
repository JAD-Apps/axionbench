import assert from 'node:assert/strict';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { createSiteServer } from './serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'test-artifacts');
await mkdir(out, { recursive: true });
const data = JSON.parse(await readFile(join(root, 'data.json'), 'utf8'));
assert.equal(data.models.length, 12);
assert.equal(data.models.filter(m => m.capabilities.code).length, 11);
assert.equal(/planGbp|planFactor|priceUsdPerMTok|"plans"|"POLICY"/.test(JSON.stringify(data)), false);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
let executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) {
  const cache = join(homedir(), '.cache/ms-playwright');
  const versions = (await readdir(cache)).filter(n => /^chromium-\d+$/.test(n)).sort((a,b) => Number(b.split('-')[1])-Number(a.split('-')[1]));
  executablePath = join(cache, versions[0], 'chrome-linux64/chrome');
}
const server = createSiteServer();
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const errors = [];
let checks = 0;
const pass = name => { checks++; console.log('✓ ' + name); };
try {
  const page = await browser.newPage({ viewport: { width:1440, height:1000 }, colorScheme:'light', reducedMotion:'reduce' });
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const failures = [];
  page.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`);});
  await page.goto(origin, {waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  assert.deepEqual(await page.evaluate(()=>window.METABENCH_DATA),data);
  assert.deepEqual(failures,[]); pass('All assets load; the displayed snapshot matches the public JSON');
  assert.equal(await page.locator('#chart svg').count(),1);
  assert.equal(await page.locator('#chart-data-table tbody tr').count(),11);
  assert.equal(await page.locator('#matrix-table tbody tr').count(),12);
  assert.equal(await page.locator('#chart-data-table').textContent().then(s=>s.includes('35% coverage')),true);
  assert.equal(await page.evaluate(()=>window.MetaBench.getChart().getOption().animation),false);
  pass('Rankings preserve missingness and low coverage; reduced motion disables chart animation');
  for (const view of ['tradeoff','profile','heatmap','ranking']) {
    await page.locator(`[data-view="${view}"]`).click();
    const type = {tradeoff:'scatter',profile:'radar',heatmap:'heatmap',ranking:'bar'}[view];
    assert.equal(await page.evaluate(()=>window.MetaBench.getChart().getOption().series[0].type),type);
  }
  await page.locator('[data-view="heatmap"]').click();
  const heat = await page.evaluate(()=>window.MetaBench.getChart().getOption().series[0].data);
  assert.equal(heat.length,data.models.reduce((n,m)=>n+Object.values(m.capabilities).filter(Boolean).length,0));
  assert.equal(heat.some(p=>p.modelId==='claude-haiku-4-5'),false);
  pass('All four chart views work; absent results never become zero-valued heatmap cells');
  await page.locator('[data-view="profile"]').click();
  const checked = page.locator('#profile-models input:checked');
  assert.equal(await checked.count(),3);
  await page.locator('#profile-models input:not(:checked)').first().click();
  assert.equal(await checked.count(),3);
  assert.match(await page.locator('#profile-feedback').textContent(),/up to 3/);
  pass('Profiles cap model selection at three without discarding data');
  await page.locator('[data-view="ranking"]').click();
  for (const cap of Object.keys(data.capabilities)) {
    await page.locator(`[data-cap="${cap}"]`).click();
    assert.equal(await page.locator('#chart-data-table tbody tr').count(),data.models.filter(m=>m.capabilities[cap]).length);
  }
  for (const developer of ['openai','anthropic','google','xai','moonshot']) {
    await page.locator('#developer-filter').selectOption(developer);
    const shown = await page.evaluate(()=>window.MetaBench.getChart().getOption().series[0].data.map(p=>p.modelId));
    assert(shown.every(id=>data.models.find(m=>m.model===id).developer===developer));
  }
  pass('Every capability and developer filter renders the expected model cohort');
  await page.locator('#developer-filter').selectOption('all');
  await page.locator('[data-cap="ui"]').click();
  await page.locator('#model-select').selectOption('gpt-5.4');
  assert.match(await page.locator('#model-detail').textContent(),/No published result/);
  await page.locator('[data-cap="ops"]').click();
  await page.locator('#model-select').selectOption('gpt-6.1-sol');
  assert.match(await page.locator('#model-detail').textContent(),/GPT-6 Sol proxy/);
  assert.match(await page.locator('#model-detail').textContent(),/vendor-reported/);
  await page.locator('[data-cap="code"]').click();
  await page.locator('#model-select').selectOption('gpt-6.1-sol');
  assert.equal(await page.locator('#model-detail a').first().getAttribute('href'),'https://www.bridgebench.ai/leaderboard/gpt-6-1-sol');
  pass('Inspector retains absent estimates, vendor flags, proxy identity, and model-specific source links');
  const unlinkedMentions = await page.evaluate(()=>{
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const found=[];while(walker.nextNode()){
      const node=walker.currentNode;
      if(/BridgeBench|SWE-bench Pro|Terminal-Bench/.test(node.textContent) && !node.parentElement.closest('a,script,style'))found.push(node.textContent.trim());
    }return found;
  });
  assert.deepEqual(unlinkedMentions,[]);pass('Every rendered mention of another benchmark is linked to source results');
  await page.locator('#routing-capability').selectOption('code');
  await page.locator('[data-tokens="100000"]').click();
  assert.match(await page.locator('#routing-cards').textContent(),/GPT-6 Luna[\s\S]*\$0\.0086/);
  await page.locator('[data-tokens="1000000"]').click();
  assert.match(await page.locator('#routing-cards').textContent(),/GPT-6 Luna[\s\S]*\$0\.0860/);
  await page.locator('#routing-capability').selectOption('ops');
  assert.match(await page.locator('.route-card.featured .route-model').textContent(),/Claude Sonnet 5\.5/);
  await page.locator('#task-tokens').fill('0');
  assert.equal(await page.locator('#task-tokens').getAttribute('aria-invalid'),'true');
  assert.equal(await page.evaluate(()=>window.MetaBench.getState().tokens),1000000);
  await page.locator('[data-tokens="100000"]').click();
  pass('Task estimates scale correctly; routing uses API prices; invalid task budgets are rejected');
  await page.locator('#model-search').fill('nothing-matches-this');
  assert.equal(await page.locator('#matrix-count').textContent(),'0');
  await page.locator('#model-search').fill('Luna');
  assert.equal(await page.locator('#matrix-count').textContent(),'1');
  await page.locator('#model-search').fill('');
  await page.locator('[data-sort="cost"]').click();
  assert.match(await page.locator('#matrix-table tbody tr').first().textContent(),/GPT-6 Luna/);
  const jsonDownload = page.waitForEvent('download'); await page.locator('#download-top').click();
  assert.deepEqual(JSON.parse(await readFile(await (await jsonDownload).path(),'utf8')),data);
  const csvDownload = page.waitForEvent('download'); await page.locator('#download-table').click();
  const csv = await readFile(await (await csvDownload).path(),'utf8');
  assert.equal(csv.trim().split('\r\n').length,13);
  assert.equal(/planFactor|ChatGPT Pro|Claude Pro|Copilot Pro/.test(csv),false);
  pass('Search, sorting, JSON export, and CSV export work without personal plan metadata');
  await page.locator('#theme-toggle').click();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  await page.locator('[data-view="heatmap"]').click();
  await page.screenshot({path:join(out,'desktop-dark-heatmap.png'),fullPage:true});
  await page.locator('#theme-toggle').click();
  await page.locator('[data-view="ranking"]').click();
  await page.screenshot({path:join(out,'desktop.png'),fullPage:true});
  for (const width of [320,390,768]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow at ${width}px`);
    for (const view of ['tradeoff','profile','heatmap','ranking']) {
      await page.locator(`[data-view="${view}"]`).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow for ${view} at ${width}px`);
    }
    if(width===390) await page.screenshot({path:join(out,'phone.png'),fullPage:true});
  }
  pass('Both themes and every chart view work at desktop, tablet, and 320/390px phone widths');
  const local=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  local.on('pageerror',e=>errors.push(e.message));
  await local.goto(pathToFileURL(join(root,'index.html')).href,{waitUntil:'load'});
  assert.equal(await local.locator('#chart svg').count(),1);
  assert.equal(await local.locator('#matrix-table tbody tr').count(),12);
  pass('Direct file:// access works without a server or external resource requests');
  assert.deepEqual(errors,[]);pass('No browser console errors or uncaught exceptions');
  console.log(`\n${checks} browser checks passed. Screenshots: ${out}`);
} finally {
  await browser.close();
  await new Promise(done=>server.close(done));
}
