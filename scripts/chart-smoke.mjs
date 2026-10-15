import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withBuiltBrowser } from './test-harness.mjs';

const heroSource = await readFile(new URL('../assets/surface.js', import.meta.url));
const servedHero = await readFile(new URL('../public/assets/surface.js', import.meta.url));
const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const models = new Map(data.models.map((model) => [model.id, model]));
if (!heroSource.equals(servedHero)) throw new Error('public/assets/surface.js differs from the preserved hero source.');

async function canvasPixels(page) {
  return page.locator('#intelligence-surface').evaluate((canvas) => {
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

await withBuiltBrowser(async ({ page, origin, assert: check }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  check.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false);
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  const before = await canvasPixels(page);
  await page.waitForTimeout(300);
  const after = await canvasPixels(page);
  check(before.visiblePixels > 0, 'normal-motion contour canvas has painted pixels');
  check(after.visiblePixels > 0, 'normal-motion contour canvas remains painted');
  check.notEqual(after.hash, before.hash, 'normal-motion contour canvas changes between frames');
  check.deepEqual(errors, [], 'normal-motion page has no runtime or console errors');
}, { reducedMotion: 'no-preference' });

await withBuiltBrowser(async ({ page, origin, assert: check }) => {
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) failed.push(response.status() + ' ' + response.url()); });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  check.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  check.equal(await page.locator('#intelligence-surface').count(), 1, 'preserved hero canvas is mounted');
  const stillBefore = await canvasPixels(page);
  await page.waitForTimeout(250);
  const stillAfter = await canvasPixels(page);
  check(stillBefore.visiblePixels > 0, 'reduced-motion contour has painted pixels');
  check(stillAfter.visiblePixels > 0, 'reduced-motion contour remains visible');
  check.equal(stillAfter.hash, stillBefore.hash, 'reduced-motion contour remains static');
  await page.goto(origin + '/benchmarks', { waitUntil: 'networkidle' });
  check.equal(await page.locator('.plot-empty').count(), 1, 'the nine identity-matched flagships show real missing values');
  check.equal(await page.locator('.ranking-row').count(), 0, 'missing benchmark observations create no score marks');
  check.equal(await page.getByTestId('view-cost').getAttribute('href'), '/task-pricing', 'cost control reaches the mounted licensed tariff scenario');
  const benchmarkURL = page.url();
  await page.goto(origin + '/task-pricing', { waitUntil: 'networkidle' });
  check.equal(await page.getByTestId('task-cost').count(), 1, 'permitted task cost is mounted');
  check.equal(await page.getByTestId('cost-points').locator('button').count(), 9, 'the real matched panel plots nine quoted endpoint identities');
  check.equal(await page.getByTestId('cost-table').locator('tbody tr').count(), new Set(data.authority.observations.filter(r => r.admitted && r.primary && r.configuration.conditionsKnown && ['benchmark-authority', 'independent-evaluator'].includes(r.provenance) && [r.sourceId, r.suiteId, r.metric, r.configuration.condition].join('|') === 'epoch-hub|gpqa-diamond|score|Epoch AI run').map(r => r.modelKey)).size, 'accessible cost table retains priced and unpriced exact identities');
  check.equal(data.sourceLimitations.restrictedRoutedPricesPublished, false, 'restricted routed API payloads remain withheld');
  check.equal(await page.locator('script[src*="echarts"]').count(), 0, 'ECharts is not loaded');

  await page.goto(benchmarkURL, { waitUntil: 'networkidle' });
  await page.getByTestId('view-table').click();
  check.equal(await page.locator('[data-testid="result-table"] tbody tr').count(), 9, 'accessible exact table covers the full default cohort');
  check.equal(await page.locator('[data-testid="result-table"] .missing-value').count(), 9, 'all missing states are explicit');
  await page.getByTestId('view-bars').click();
  await page.getByTestId('cohort-filter').selectOption('reported');
  await page.getByTestId('suite-filter').selectOption('hle-original');
  const rows = data.observations.filter((observation) => observation.suiteId === 'hle-original');
  check.equal(await page.locator('.ranking-row').count(), rows.length, 'plot contains actual selected-suite observations');
  check.equal(rows.length, 8, 'captured HLE panel supplies the tested broad-data cohort');
  check.equal(await page.locator('.ranking-row[aria-label$="unverified"]').count(), rows.length,
    'source verification status remains visible per mark');
  const mark = page.locator('.ranking-row').first();
  await mark.focus();
  await page.keyboard.press('Space');
  check.equal(await mark.getAttribute('aria-pressed'), 'true', 'keyboard can select a real mark');
  const nextMark = page.locator('.ranking-row').nth(1);
  await nextMark.tap();
  check.equal(await nextMark.getAttribute('aria-pressed'), 'true', 'touch can select a real mark');
  check.equal(await mark.getAttribute('aria-pressed'), 'false', 'only one selection is active');
  await page.getByTestId('view-table').click();
  check.equal(await page.locator('[data-testid="result-table"] tbody tr').count(), rows.length, 'exact table and chart use the same observation set');
  const hrefs = await page.locator('[data-testid="result-table"] a[href^="https://"]').evaluateAll((nodes) => nodes.map((node) => node.href));
  for (const row of rows) check(hrefs.includes(row.resultUrl), 'accessible row links to original result ' + row.id);
  await page.getByTestId('view-bars').click();
  check.equal(await page.getByTestId('view-bars').getAttribute('aria-pressed'), 'true', 'ranking view transition is explicit');
  await page.getByTestId('domain-filter').selectOption('coding');
  const firstCodingSuite = data.suites.find((suite) => suite.domain === 'coding' && suite.observationCount > 0);
  check.ok(firstCodingSuite, 'captured coding domain has an observed suite');
  await page.waitForFunction((suiteId) => document.querySelector('[data-testid="suite-filter"]')?.value === suiteId, firstCodingSuite.id);
  check.equal(await page.getByTestId('suite-filter').inputValue(), firstCodingSuite.id,
    'domain transition selects the first observed compatible suite');
  await page.getByTestId('suite-filter').selectOption('swebench-pro');
  const codeRows = data.observations.filter((observation) => observation.suiteId === 'swebench-pro');
  const firstLab = models.get(codeRows[0].modelId).labId;
  await page.getByTestId('lab-filter').selectOption(firstLab);
  const filteredCodeCount = codeRows.filter((row) => models.get(row.modelId).labId === firstLab).length;
  await page.waitForFunction((count) => document.querySelectorAll('.ranking-row').length === count, filteredCodeCount);
  check.equal(await page.locator('.ranking-row').count(), codeRows.filter((row) => models.get(row.modelId).labId === firstLab).length,
    'domain, benchmark and lab filters compose on the real source dataset');
  check.equal(new URL(page.url()).searchParams.get('domain'), 'coding', 'domain selection is saved to shareable URL state');
  check.equal(new URL(page.url()).searchParams.get('suite'), 'swebench-pro', 'suite selection is saved to shareable URL state');
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  check(bounds.scroll <= bounds.viewport, 'mobile page fits viewport: ' + JSON.stringify(bounds));
  check.deepEqual(failed, [], 'all page requests succeed: ' + failed.join(', '));
  check.deepEqual(errors, [], 'reduced-motion page has no runtime or console errors');
}, { reducedMotion: 'reduce', hasTouch: true });

console.log('Chart smoke passed: preserved contour motion, source-bound missingness, exact table parity, original result links, keyboard/touch selection, compatible filters, share state, reduced motion and mobile bounds.');
