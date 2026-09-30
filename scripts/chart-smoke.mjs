import { withBuiltBrowser } from './test-harness.mjs';
import { readFile } from 'node:fs/promises';

const heroSource = await readFile(new URL('../assets/surface.js', import.meta.url));
const servedHero = await readFile(new URL('../public/assets/surface.js', import.meta.url));
if (!heroSource.equals(servedHero)) throw new Error('public/assets/surface.js differs from the preserved hero source.');

async function canvasPixels(page) {
  return page.locator('#intelligence-surface').evaluate(canvas => {
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0 || canvas.height === 0) return { visiblePixels: 0, hash: 0 };
    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);
    let visiblePixels = 0;
    let hash = 2166136261;
    for (let i = 0; i < pixels.length; i += 32) {
      if (pixels[i + 3] > 0) visiblePixels++;
      hash = Math.imul(hash ^ pixels[i], 16777619);
      hash = Math.imul(hash ^ pixels[i + 1], 16777619);
      hash = Math.imul(hash ^ pixels[i + 2], 16777619);
      hash = Math.imul(hash ^ pixels[i + 3], 16777619);
    }
    return { visiblePixels, hash: hash >>> 0 };
  });
}

await withBuiltBrowser(async ({ page, origin, assert }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false);
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  const before = await canvasPixels(page);
  await page.waitForTimeout(300);
  const after = await canvasPixels(page);
  assert(before.visiblePixels > 0, 'normal-motion contour canvas has painted nontransparent pixels');
  assert(after.visiblePixels > 0, 'normal-motion contour canvas remains painted');
  assert.notEqual(after.hash, before.hash, 'normal-motion contour canvas changes between frames');
  assert.deepEqual(errors, []);
}, { reducedMotion: 'no-preference' });

await withBuiltBrowser(async ({ page, origin, assert }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const failed = [];
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('#intelligence-surface').count(), 1, 'the contour hero canvas is mounted');
  const stillBefore = await canvasPixels(page);
  await page.waitForTimeout(250);
  const stillAfter = await canvasPixels(page);
  assert(stillBefore.visiblePixels > 0, 'reduced-motion contour canvas has painted nontransparent pixels');
  assert(stillAfter.visiblePixels > 0, 'reduced-motion contour canvas remains painted');
  assert.equal(stillAfter.hash, stillBefore.hash, 'reduced-motion contour canvas remains static');
  assert.equal(await page.locator('#chart svg[data-chart-kind]').getAttribute('data-chart-kind'), 'ranking');
  assert.equal(await page.locator('#chart svg[data-chart-kind="ranking"] .axis-title').textContent(), 'Capability score / 100 →');
  const rankingTicks = (await page.locator('#chart svg[data-chart-kind="ranking"] .visx-axis-bottom .visx-axis-tick text').allTextContents()).map(tick => tick.trim());
  assert(rankingTicks.includes('100') && !rankingTicks.includes('1'), `ranking axis ticks use score/100 units: ${rankingTicks.join(', ')}`);
  assert.equal(await page.locator('#chart svg g[role="button"]').count(), 11, 'rank chart omits the unscored model');
  assert.equal(await page.locator('table tbody tr').count(), 11, 'table exposes the same chart rows');
  assert.equal(await page.locator('script[src*="echarts"]').count(), 0, 'ECharts is not loaded');
  await page.locator('#chart svg g[role="button"]').first().focus();
  await page.keyboard.press('Enter');
  assert.match(await page.locator('.selection').textContent(), /\/ 100/);
  await page.getByRole('button', { name: 'Cost × capability' }).click();
  assert.equal(await page.locator('#chart svg[data-chart-kind]').getAttribute('data-chart-kind'), 'scatter');
  assert.equal(await page.locator('#chart svg[data-chart-kind="scatter"] .axis-title').textContent(), 'Capability score / 100 →');
  const scatterTicks = (await page.locator('#chart svg[data-chart-kind="scatter"] .visx-axis-bottom .visx-axis-tick text').allTextContents()).map(tick => tick.trim());
  assert(scatterTicks.includes('100') && !scatterTicks.includes('1'), `scatter axis ticks use score/100 units: ${scatterTicks.join(', ')}`);
  assert.equal(await page.locator('#chart svg[data-chart-kind="scatter"] [data-series-connector]').count(), 0, 'scatter observations are not joined as a sequence');
  assert.equal(await page.locator('#chart svg g[role="button"]').count(), 11, 'scatter contains only rows with a score and public API price');
  await page.getByLabel('Capability', { exact: true }).selectOption('ui');
  assert.equal(await page.locator('#chart svg g[role="button"]').count(), 9, 'missing score values do not become zero marks');
  await page.getByLabel('Capability', { exact: true }).selectOption('code');
  await page.getByLabel('Lab', { exact: true }).selectOption('openai');
  assert.equal(await page.locator('#chart svg g[role="button"]').count(), 6, 'cohort control applies to chart');
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, { timeout: 3000 });
  const mobileWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth, overflow: [...document.querySelectorAll('body *')].map(el => ({ tag: el.tagName, cls: String(el.className), right: el.getBoundingClientRect().right })).filter(row => row.right > innerWidth + 1).slice(0, 8) }));
  assert.equal(mobileWidth.scroll <= mobileWidth.viewport, true, `mobile layout fits viewport: ${JSON.stringify(mobileWidth)}`);
  assert.deepEqual(failed, [], `failed browser requests: ${failed.join(', ')}`);
  assert.deepEqual(errors, []);
  console.log('Chart smoke passed: ranking/scatter units, unconnected observations, data/table parity, selection, cohort, missingness, reduced motion, mobile, and contour pixels/animation.');
});
