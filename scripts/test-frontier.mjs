import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { withBuiltBrowser } from './test-harness.mjs';
import { routes } from '../src/routes.ts';

const root = new URL('../', import.meta.url);
const read = (path, encoding) => readFile(new URL(path, root), encoding);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const parse = async (path) => JSON.parse(await read(path, 'utf8'));
const build = spawnSync('npm', ['run', 'build'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'inherit' });
if (build.error) throw build.error;
assert.equal(build.status, 0, 'production build succeeds before browser checks');
await import('./test-browser-runtime.mjs');
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });

const [ingestionBytes, data, manifest, detailBytes, details, html] = await Promise.all([
  read('data/ingestion.json'), parse('public/data.json'), parse('public/data-manifest.json'),
  read('public/data-details.json'), parse('public/data-details.json'), read('dist/index.html', 'utf8'),
]);
assert.equal(data.schemaVersion, 'axionbench-public-v1');
assert.equal(manifest.sourceDigest, sha256(ingestionBytes), 'manifest binds the exact captured ingestion bytes');
assert.equal(data.sourceDigest, manifest.sourceDigest, 'public projection binds to the same ingestion digest');
assert.equal(manifest.projection.bytes, Buffer.byteLength(JSON.stringify(data)), 'projection byte count matches its manifest');
assert.equal(manifest.projection.sha256, sha256(Buffer.from(JSON.stringify(data))), 'projection digest matches its manifest');
assert.equal(manifest.details.bytes, detailBytes.length, 'deferred source detail byte count matches its manifest');
assert.equal(manifest.details.sha256, sha256(detailBytes), 'deferred source detail digest matches its manifest');
assert.equal(details.sourceDigest, manifest.sourceDigest, 'deferred source detail shares the captured ingestion digest');
assert.equal(data.models.length, manifest.counts.models);
assert.equal(data.observations.length, manifest.counts.observations);
assert.equal(data.suites.length, manifest.counts.suites);
assert(data.models.length >= 30 && data.observations.length >= 15, 'release uses the broad admitted source capture');
assert(data.suites.length >= 30 && data.domains.length >= 11, 'registry coverage is retained');
assert(data.models.some((model) => /meta/i.test(model.lab)), 'Meta identities remain in the complete catalogue');
assert.equal(data.sourceLimitations.identityConfirmedModels, 9, 'the captured exact-release watchlist has nine entries');
assert.equal(data.sourceLimitations.verifiedBenchmarkObservations, 0, 'no unverified source claim is promoted to a verified result');
assert.equal(data.sourceLimitations.apiPricesPublished, true, 'licensed original-provider factual tariffs are published');
assert.equal(data.sourceLimitations.restrictedRoutedPricesPublished, false, 'source-restricted routed endpoint rates remain withheld');
assert.equal(data.sourceLimitations.apiPriceRowsObserved, 1328, 'the withheld-rate count comes from the captured ingestion');
assert.equal(data.pricing.records.length, 11, 'the public projection contains eleven licensed exact-endpoint text tariffs');
assert.equal(data.pricing.source.licence, 'CC BY 4.0', 'original pricing reuse permission is explicit');
assert(data.pricing.records.every((price) => price.sourceUrl.startsWith('https://ai.google.dev/gemini-api/docs/pricing#')), 'no restricted routed rates enter the public price projection');
assert.equal(JSON.stringify(data).includes('/data/source-snapshots/'), false, 'local source snapshot paths are not published');
assert(data.observations.every((row) => row.resultUrl?.startsWith('https://') && row.sourceIds.length > 0),
  'each captured observation keeps an HTTPS original result and source identifiers');
assert(details.sources.length > 0, 'deferred source detail preserves inspectable source records');

const initialPaths = [];
for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)) initialPaths.push(match[1]);
for (const match of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+\.js)"/g)) initialPaths.push(match[1]);
assert(initialPaths.length > 0, 'production HTML identifies its initial JavaScript');
const initialFiles = await Promise.all([...new Set(initialPaths)].map((path) => read('dist' + path, undefined)));
const initialGzipBytes = initialFiles.reduce((sum, bytes) => sum + gzipSync(bytes).length, 0);
const initialKiB = Number((initialGzipBytes / 1024).toFixed(2));
assert(initialGzipBytes <= 180 * 1024, 'actual initial JavaScript gzip is below the 180 KiB budget; measured ' + initialGzipBytes + ' bytes');
const entryJs = (await Promise.all(initialPaths.map((path) => read('dist' + path, 'utf8')))).join('\n');
assert.equal(entryJs.includes('"models":['), false, 'the full catalogue is fetched as public data, not embedded in the entry bundle');
assert.equal(initialPaths.some((path) => path.includes('observatory-experience')), false,
  'the chart experience is not preloaded with the initial entry');
const initialAssetNames = new Set(initialPaths.map((path) => path.split('/').at(-1)));
const deferredJs = (await readdir(new URL('../dist/assets/', import.meta.url)))
  .filter((path) => path.endsWith('.js') && !initialAssetNames.has(path));
assert(deferredJs.some((path) => path.includes('observatory-experience')), 'the chart experience is split from the initial entry');

const report = {
  sourceDigest: manifest.sourceDigest,
  counts: manifest.counts,
  withheldPriceRows: data.sourceLimitations.apiPriceRowsObserved,
  initialJavaScriptGzipBytes: initialGzipBytes,
  initialJavaScriptGzipKiB: initialKiB,
  initialAssets: [...new Set(initialPaths)],
  deferredExperienceChunks: deferredJs.filter((path) => path.includes('observatory-experience')),
  renderedEvidence: [],
  browserChecks: [],
  viewportWidths: [360, 390, 768, 1280, 1440],
};

await withBuiltBrowser(async ({ page, newPage, origin, assert: check }) => {
  const errors = [];
  const failures = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) failures.push(response.status() + ' ' + response.url()); });
  check.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true,
    'browser exercises the rendered experience under reduced motion');

  let releaseManifest;
  let markManifestRequested;
  const manifestGate = new Promise((resolve) => { releaseManifest = resolve; });
  const manifestRequested = new Promise((resolve) => { markManifestRequested = resolve; });
  await page.route('**/data-manifest.json', async (route) => {
    markManifestRequested();
    await manifestGate;
    await route.continue();
  });
  const navigation = page.goto(origin, { waitUntil: 'domcontentloaded' });
  await manifestRequested;
  await navigation;
  check.equal(await page.locator('#hero-title').innerText(), 'Find your\nnext model.', 'preserved hero renders before data is released');
  check.equal(await page.locator('#intelligence-surface').count(), 1, 'preserved animated contour canvas is present during load');
  check.equal(await page.getByTestId('frontier-stage').count(), 0, 'frontier waits accessibly while manifest is pending');
  check.equal(await page.getByRole('status').filter({ hasText: 'Validating the public evidence digest' }).count(), 1,
    'deferred data view exposes a useful loading status');
  releaseManifest();
  await page.getByTestId('home-comparison').waitFor();
  await page.goto(origin + '/benchmarks', { waitUntil: 'networkidle' });
  await page.getByTestId('frontier-stage').waitFor();
  await page.getByTestId('view-table').waitFor();
  check.match(await page.locator('.topbar .edition').innerText(), /PUBLIC DATA/);
  check.equal(await page.locator('.plot-empty').count(), 1, 'missing flagship results have no plotted score marks');
  await page.getByTestId('view-table').click();
  check.equal(await page.locator('[data-testid="result-table"] tbody tr').count(), 9, 'exact table mirrors all default flagship entries');
  check.equal(await page.locator('[data-testid="result-table"] .missing-value').count(), 9, 'all nine genuine missing result states remain visible');
  check.equal(await page.locator('[data-testid="result-table"] a[href^="https://"]').count(), 9,
    'each identity match links to its captured original release source');
  for (const [path, testId] of [['/rankings', 'authority-ranking'], ['/us-china', 'h2h'], ['/open-weights', 'ow'], ['/models', 'catalogue'], ['/methods', 'methodology']]) {
    await page.goto(origin + path, { waitUntil: 'networkidle' });
    await page.getByTestId(testId).waitFor();
    const routeTitle = routes.find(route => route.path === path).title;
    check.equal(await page.locator('#route-title').innerText(), routeTitle, 'each focused route renders its own title');
    check.equal(await page.title(), routeTitle + ' — AxionBench', 'each focused route has matching document metadata');
    check.equal(await page.locator('nav a[aria-current=page]').getAttribute('href'), path, 'the active navigation identifies this route');
    const capture = 'test-results/frontier-route-' + testId + '.png';
    await page.screenshot({ path: capture, animations: 'disabled' }); report.renderedEvidence.push(capture);
    if (testId === 'h2h') check.match(await page.getByTestId('h2h-region-definition').innerText(), /never inferred from model language/i);
    if (testId === 'authority-ranking') check.equal(await page.getByTestId('authority-rows').locator('li').count(), new Set(data.authority.observations.filter(r => r.currentPolicy?.scoringEligible).map(r => r.modelKey)).size, 'current ranking shows only qualified exact identities');
    if (testId === 'catalogue') {
      check.equal(await page.locator('#models .directory-count strong').innerText(), (data.models.length + data.authority.models.length).toLocaleString());
      check.equal(await page.locator('a.export[href="/data.json"]').count(), 1);
      await page.getByLabel('Search models, labs or source ID').fill('Meta:'); check.match(await page.locator('#models tbody').innerText(), /Meta/i);
    }
    if (testId === 'ow') { await page.getByRole('button', { name: '10–35B' }).click(); check.equal(await page.getByRole('button', { name: '10–35B' }).getAttribute('aria-pressed'), 'true'); }
  }
  await page.goto(origin + '/task-pricing', { waitUntil: 'networkidle' });
  check.equal(await page.getByTestId('task-cost').count(), 1);
  check.equal(await page.getByTestId('cost-plot').locator('canvas').count(), 1, 'task pricing renders Chart.js');
  check(await page.getByTestId('cost-points').locator('button').count() >= 8, 'at least eight actual priced values are keyboard-accessible');
  check.equal(await page.getByTestId('cost-points').locator('button').count(), (await page.getByTestId('cost-table').locator('tbody tr').evaluateAll(rows => rows.filter(row => row.querySelectorAll('td')[1]?.textContent.trim().startsWith('$')).length)), 'keyboard task-cost values match every priced factual table row');
  await page.goto(origin + '/domains', { waitUntil: 'networkidle' }); check.equal(await page.getByTestId('domain-weights').count(), 1);
  await page.goto(origin + '/benchmarks', { waitUntil: 'networkidle' });
  await page.getByTestId('view-bars').click();
  await page.getByTestId('cohort-filter').selectOption('reported');
  await page.getByTestId('suite-filter').selectOption('hle-original');
  const hleRows = data.observations.filter((row) => row.suiteId === 'hle-original');
  check.equal(await page.locator('.ranking-row').count(), hleRows.length, 'ranking draws actual rows from the selected broad-data suite');
  check.equal(hleRows.length, 8, 'test suite has eight captured rows in this source snapshot');
  check.equal(await page.locator('.ranking-row[aria-label$="unverified"]').count(), hleRows.length,
    'all displayed score claims retain unverified source labels');
  check.deepEqual(await page.locator('#frontier .ranking-row strong').allTextContents(), hleRows.sort((a,b)=>b.value-a.value).map(r=>r.unit?.label ? r.valueText + ' ' + r.unit.label : r.valueText + ' · unit ' + (r.unit?.status ?? 'unknown')),
    'each reported mark retains its exact source value label');
  const firstMark = page.locator('.ranking-row').first();
  await firstMark.focus();
  await page.keyboard.press('Enter');
  check.equal(await firstMark.getAttribute('aria-pressed'), 'true', 'keyboard selection reaches an actual chart mark');
  await page.waitForFunction(() => new URL(location.href).searchParams.has('selected'));
  const selectedUrl = new URL(page.url());
  check.equal(selectedUrl.searchParams.get('selected'), await firstMark.getAttribute('data-observation-id'), 'keyboard selection is shareable');
  const firstReducedWidth = await page.locator('#frontier canvas').evaluate(c=>c.toDataURL());
  await page.waitForTimeout(100);
  check.equal(await page.locator('#frontier canvas').evaluate(c=>c.toDataURL()), firstReducedWidth,
    'reduced-motion preference keeps the mark stable after rendering');
  const secondMark = page.locator('.ranking-row').nth(1);
  await secondMark.tap();
  check.equal(await secondMark.getAttribute('aria-pressed'), 'true', 'touch selection reaches another actual chart mark');
  check.equal(await firstMark.getAttribute('aria-pressed'), 'false', 'selection state stays exclusive');

  await page.getByTestId('view-table').click();
  check.equal(await page.locator('[data-testid="result-table"] tbody tr').count(), hleRows.length,
    'exact accessible table has the same rows as the ranking view');
  check.equal(await page.getByText('Unverified claim', { exact: false }).count(), hleRows.length,
    'table marks each raw source claim as unverified');
  const visibleResultHrefs = await page.locator('[data-testid="result-table"] a[href^="https://"]').evaluateAll((nodes) => nodes.map((node) => node.href));
  for (const row of hleRows) check(visibleResultHrefs.includes(row.resultUrl), 'table links directly to captured result ' + row.id);
  check.equal(await page.locator('.source-disclosure').count(), hleRows.length, 'each result can disclose source detail');
  const detailsResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/data-details.json');
  await page.locator('.source-disclosure summary').first().click();
  const detailResponse = await detailsResponse;
  check.equal(detailResponse.status(), 200, 'expanding source detail fetches its deferred data');
  await page.locator('.source-record').first().waitFor();
  check.match(await page.locator('.source-record').first().innerText(), /Reuse status:[\s\S]*Snapshot SHA-256:/,
    'deferred evidence detail presents recorded rights and integrity hash');
  const link = page.getByRole('link', { name: 'Original result ↗' }).first();
  const expectedLink = await link.getAttribute('href');
  // Keep the regression local while letting the real new-tab navigation retain
  // its original source URL; the inert body is not asserted as source evidence.
  await page.context().route(/^https:\/\//, (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: '<title>External navigation intercepted by browser test</title>',
  }));
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  check.equal(popup.url(), expectedLink, 'activating a result source opens its exact original URL');
  await popup.close();

  await page.getByTestId('view-bars').click();
  await page.getByTestId('domain-filter').selectOption('coding');
  const firstCodingSuite = data.suites.find((suite) => suite.domain === 'coding' && suite.observationCount > 0);
  check.equal(await page.getByTestId('suite-filter').inputValue(), firstCodingSuite.id, 'domain filter chooses an observed suite in the selected domain');
  await page.getByTestId('suite-filter').selectOption('swebench-pro');
  const codingRows = data.observations.filter((row) => row.suiteId === 'swebench-pro');
  const codingLabs = [...new Set(codingRows.map((row) => data.models.find((model) => model.id === row.modelId).labId))];
  const emptyLab = [...new Set(data.models.map((model) => model.labId))]
    .find((id) => !codingRows.some((row) => data.models.find((model) => model.id === row.modelId).labId === id));
  check.ok(emptyLab, 'captured catalogue contains a real lab with no row in the selected coding panel');
  await page.getByTestId('lab-filter').selectOption(emptyLab);
  check.equal(await page.locator('.ranking-row').count(), 0, 'empty cohort filters produce no chart marks');
  check.match(await page.locator('.plot-empty').innerText(), /No captured source claim matches this selected suite/i,
    'empty reported-result state explains the active filters');
  await page.getByTestId('view-table').click();
  check.match(await page.locator('[data-testid="result-table"] tbody').innerText(), /No captured result matches these filters/i,
    'empty result table explains that no rows match');
  await page.getByTestId('view-bars').click();
  const chosenLab = codingLabs[0];
  await page.getByTestId('lab-filter').selectOption(chosenLab);
  const expectedLabRows = codingRows.filter((row) => data.models.find((model) => model.id === row.modelId).labId === chosenLab);
  check.equal(await page.locator('.ranking-row').count(), expectedLabRows.length, 'lab filter recomputes the selected benchmark cohort');
  check.equal(new URL(page.url()).searchParams.get('cohort'), 'reported', 'cohort is retained in the URL');
  check.equal(new URL(page.url()).searchParams.get('domain'), 'coding', 'domain is retained in the URL');
  check.equal(new URL(page.url()).searchParams.get('suite'), 'swebench-pro', 'suite is retained in the URL');
  check.equal(new URL(page.url()).searchParams.get('lab'), chosenLab, 'lab is retained in the URL');
  check.equal(new URL(page.url()).searchParams.get('view'), 'bars', 'view is retained in the URL');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('frontier-stage').waitFor();
  check.equal(await page.getByTestId('cohort-filter').inputValue(), 'reported', 'reload restores shared cohort state');
  check.equal(await page.getByTestId('domain-filter').inputValue(), 'coding', 'reload restores shared domain state');
  check.equal(await page.getByTestId('suite-filter').inputValue(), 'swebench-pro', 'reload restores shared suite state');
  check.equal(await page.getByTestId('lab-filter').inputValue(), chosenLab, 'reload restores shared lab state');
  check.equal(await page.getByTestId('view-bars').getAttribute('aria-pressed'), 'true', 'reload restores a supported view');

  await page.goto(origin + '/benchmarks?view=cost', { waitUntil: 'networkidle' });
  await page.getByTestId('frontier-stage').waitFor();
  check.equal(await page.getByTestId('view-bars').getAttribute('aria-pressed'), 'true', 'unsupported URL view falls back to supported ranking');
  check.equal(await page.getByTestId('view-cost').getAttribute('href'), '/task-pricing', 'functional task-cost section remains reachable after navigation');
  const benchmarkURL = page.url();
  await page.goto(origin + '/task-pricing', { waitUntil: 'networkidle' });
  check(await page.getByTestId('cost-table').locator('tbody tr').count() >= 8, 'licensed exact endpoint estimates remain populated after navigation');
  await page.goto(benchmarkURL, { waitUntil: 'networkidle' });

  const failurePage = await newPage();
  await failurePage.route('**/data-manifest.json', (route) => route.fulfill({ status: 503, contentType: 'text/plain', body: 'Snapshot unavailable in regression fixture.' }));
  await failurePage.goto(origin, { waitUntil: 'networkidle' });
  check.match(await failurePage.getByRole('alert').innerText(), /Evidence snapshot unavailable[\s\S]*HTTP 503[\s\S]*contour field remain available/i,
    'manifest failure exposes a useful accessible message while preserving the hero');
  check.equal(await failurePage.locator('#hero-title').count(), 1, 'hero remains available on data failure');
  check.equal(await failurePage.getByTestId('frontier-stage').count(), 0, 'failed data is not represented as an empty leaderboard');
  await failurePage.close();

  for (const width of report.viewportWidths) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    check(bounds.page <= bounds.viewport, 'page has no horizontal overflow at ' + width + 'px: ' + JSON.stringify(bounds));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('view-table').click();
  await page.evaluate(() => document.getElementById('frontier')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const mobileTableBounds = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  check(mobileTableBounds.page <= mobileTableBounds.viewport, 'mobile exact-table view fits the page shell: ' + JSON.stringify(mobileTableBounds));
  await page.screenshot({ path: new URL('../test-results/frontier-mobile-viewport.png', import.meta.url).pathname, animations: 'disabled' });
  await page.screenshot({ path: new URL('../test-results/frontier-mobile.png', import.meta.url).pathname, fullPage: true, animations: 'disabled' });
  report.renderedEvidence.push('test-results/frontier-desktop.png', 'test-results/frontier-mobile-viewport.png', 'test-results/frontier-mobile.png');
  check.deepEqual(failures, [], 'all same-origin app and data requests succeed: ' + failures.join(', '));
  check.deepEqual(errors, [], 'browser has no uncaught errors or console errors');
  report.browserChecks = [
    'hero during blocked manifest load', 'default 9-model / 8-lab identity watchlist', 'missing and unverified states',
    'five detailed routes and complete directory export', 'Meta directory search and parameter band', 'licensed original-provider task costs and source-restricted routed rows withheld',
    'real suite/domain/lab filters', 'ranking/table parity', 'keyboard and touch selection', 'reduced-motion stability',
    'deferred permission/source hash detail', 'activated original result URL', 'persistent URL cohort/view state',
    'unsupported view rejection', 'horizontal bounds at 360/390/768/1280/1440 px',
    'accessible data failure with preserved hero',
  ];
}, { reducedMotion: 'reduce', hasTouch: true });

await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
await writeFile(new URL('../test-results/frontier-evidence.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log('Frontier browser checks passed. Initial JavaScript gzip: ' + initialGzipBytes + ' bytes (' + initialKiB
  + ' KiB / 180 KiB). Source digest: ' + manifest.sourceDigest + '.');
