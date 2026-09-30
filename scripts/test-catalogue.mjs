// npm run test:catalogue — searchable sortable catalogue, benchmark library, model detail and methodology.
// Runs the earlier open-weights gate first (which chains head-to-head, frontier and the production build),
// then hand-written logic fixtures, real-snapshot checks and browser interactions on the built site.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { withBuiltBrowser } from './test-harness.mjs';
import {
  CAT_DEFAULTS, CATALOGUE_PAGE_SIZE, CSV_COLUMNS, applyFilters, buildCatalogue, decodeCatFilters, encodeCatFilters, exportCsv, exportJson, labRegions,
  modelEvidence, opennessOf, paginateRows, snapshotHistory, sortRows,
} from '../src/catalogue/logic.ts';

const root = new URL('../', import.meta.url);
const earlier = spawnSync('npm', ['run', 'test:open-weights'], { cwd: root.pathname, stdio: 'inherit' });
if (earlier.error) throw earlier.error;
assert.equal(earlier.status, 0, 'earlier open-weights gate (with head-to-head, frontier gate and production build) passes first');

// ---- Fixtures: hand-written rows, hand-computed expectations ----
const row = (id, o = {}) => ({ id, name: id, lab: 'Lab', labId: 'lab', origin: 'catalogue', region: 'unknown', regionBasis: '', openness: 'unknown', parameters: null,
  parameterBand: 'undisclosed', activatedParameters: null, inputModalities: [], releaseDate: null, admitted: 0, reported: 0, excluded: 0, suites: 0, domains: 0,
  scoreState: 'unscored', scoreReason: '', freshness: null, sourceUrl: null, sourceId: null, ...o });
const fx = [
  row('a', { name: 'Alpha', parameters: 7e9, parameterBand: 'under-10', admitted: 3, domains: 2, region: 'us', labId: 'x', lab: 'X', inputModalities: ['text', 'image'], freshness: '2026-09-02' }),
  row('b', { name: 'beta', parameters: null, admitted: 3, region: 'cn', labId: 'y', lab: 'Y', openness: 'public-weights', origin: 'authority' }),
  row('c', { name: 'Gamma', parameters: 70e9, parameterBand: '35-100', admitted: 0, reported: 2, freshness: '2026-09-01' }),
  row('d', { name: 'Delta', parameters: 7e9, parameterBand: 'under-10', admitted: 1, releaseDate: '2026-01-05' }),
];
const ids = (rows) => rows.map((r) => r.id);
assert.deepEqual(ids(sortRows(fx, 'parameters', 'asc')), ['a', 'd', 'c', 'b'], 'nulls last ascending; equal values break on stable id');
assert.deepEqual(ids(sortRows(fx, 'parameters', 'desc')), ['c', 'a', 'd', 'b'], 'nulls last descending too');
assert.deepEqual(ids(sortRows(fx, 'name', 'asc')), ['a', 'b', 'd', 'c'], 'names compare case-insensitively');
assert.deepEqual(ids(sortRows(fx, 'evidence', 'desc')), ['a', 'b', 'c', 'd'], 'a/b have 3, c has 2, d has 1');
assert.deepEqual(ids(sortRows(fx, 'release', 'desc')), ['d', 'a', 'b', 'c'], 'unknown release dates last');
assert.deepEqual(ids(sortRows(fx, 'freshness', 'asc')), ['c', 'a', 'b', 'd']);
const F = (patch) => ({ ...CAT_DEFAULTS, ...patch });
assert.deepEqual(ids(applyFilters(fx, F({ region: 'cn' }))), ['b']);
assert.deepEqual(ids(applyFilters(fx, F({ band: 'under-10', sort: 'name', dir: 'asc' }))), ['a', 'd']);
assert.deepEqual(ids(applyFilters(fx, F({ band: 'undisclosed', sort: 'name', dir: 'asc' }))), ['b']);
assert.deepEqual(ids(applyFilters(fx, F({ modality: 'image' }))), ['a']);
assert.deepEqual(ids(applyFilters(fx, F({ origin: 'authority' }))), ['b']);
assert.deepEqual(ids(applyFilters(fx, F({ openness: 'public-weights' }))), ['b']);
assert.deepEqual(ids(applyFilters(fx, F({ evidence: 'none', sort: 'name', dir: 'asc' }))), ['c'], 'unscored entries are filterable');
assert.deepEqual(ids(applyFilters(fx, F({ evidence: 'admitted', sort: 'name', dir: 'asc' }))), ['a', 'b', 'd']);
assert.deepEqual(ids(applyFilters(fx, F({ query: ' GAM ' }))), ['c'], 'search is trimmed and case-insensitive');
assert.deepEqual(ids(applyFilters(fx, F({ query: 'zzz' }))), [], 'no match is an empty list, not an error');
assert.deepEqual(ids(applyFilters(fx, F({ lab: 'x', region: 'us', band: 'under-10', modality: 'text' }))), ['a'], 'filters combine with AND');

const many = Array.from({ length: 51 }, (_, i) => i);
assert.deepEqual(paginateRows([], 0), { page: 0, pages: 1, rows: [], start: 0, end: 0 });
assert.equal(paginateRows(many, 2).rows.length, 1); assert.equal(paginateRows(many, 99).page, 2); assert.equal(paginateRows(many, -1).page, 0);
assert.equal(paginateRows(many, Number.NaN).page, 0); assert.deepEqual([paginateRows(many, 1).start, paginateRows(many, 1).end], [26, 50]);

// URL round trip: non-defaults only, 1-based page, other chapters' keys preserved, invalid values ignored.
const state = F({ region: 'cn', band: '35-100', query: 'qw en', sort: 'name', dir: 'asc', page: 2, model: 'a', lab: 'x' });
const url = encodeCatFilters(state, new URL('https://x.test/?cohort=a&owBand=10-35#models'));
assert.equal(url.search, '?cohort=a&owBand=10-35&catLab=x&catRegion=cn&catBand=35-100&catQ=qw+en&catSort=name&catDir=asc&catPage=3&catModel=a');
assert.equal(url.hash, '#models');
assert.deepEqual(decodeCatFilters(url.searchParams, fx), state);
assert.equal(encodeCatFilters(CAT_DEFAULTS, url).search, '?cohort=a&owBand=10-35', 'reset removes only catalogue keys');
assert.deepEqual(decodeCatFilters(new URLSearchParams('catRegion=mars&catBand=huge&catSort=price&catPage=-4&catModel=nope&catLab=ghost'), fx), CAT_DEFAULTS);
assert.equal(decodeCatFilters(new URLSearchParams('catPage=abc'), fx).page, 0);

// Exports: escaping, formula guard, column parity with the row record.
const tricky = [row('q1', { name: 'He said "hi", ok', lab: 'Line\nBreak' }), row('q2', { name: '=SUM(A1)' })];
const csv = exportCsv(tricky);
assert.equal(csv.split('\r\n')[0], CSV_COLUMNS.join(','));
assert.ok(csv.includes('"He said ""hi"", ok"') && csv.includes('"Line\nBreak"'), 'quotes and newlines are escaped');
assert.ok(csv.includes(",'=SUM(A1),"), 'formula-leading names are neutralized');
assert.ok(csv.endsWith('\r\n') && csv.split('\r\n').length === 4);

assert.equal(opennessOf('public repository; weights not downloaded'), 'public-weights');
assert.equal(opennessOf('gated; not downloaded'), 'gated');
assert.equal(opennessOf('repository referenced; access/license metadata not yet checked here'), 'repository-unchecked');
assert.equal(opennessOf('unknown'), 'unknown');
assert.equal(opennessOf('something new'), 'unknown', 'unrecognised availability text is unknown, never public');
assert.deepEqual([...labRegions({ models: [{ labId: 'm', region: 'us' }, { labId: 'm', region: 'us' }, { labId: 'n', region: 'us' }, { labId: 'n', region: 'cn' },
  { labId: 'o', region: 'unknown' }, { labId: null, region: 'cn' }] })], [['m', 'us']], 'conflicting or unknown regions give no lab region');
const hist = (dates) => snapshotHistory({ authority: { sources: dates.map((d) => ({ retrievedAt: d + 'T10:00:00Z' })) } });
assert.deepEqual([hist(['2026-09-30', '2026-09-30']).chartable, hist(['2026-09-30', '2026-09-30']).captures], [false, ['2026-09-30']]);
assert.equal(hist(['2026-09-30', '2026-10-31']).chartable, true);

// ---- Real data ----
const data = JSON.parse(await readFile(new URL('public/data.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('public/data-manifest.json', root), 'utf8'));
const scoringFile = JSON.parse(await readFile(new URL('data/scoring.json', root), 'utf8'));
assert.deepEqual(data.scoring, scoringFile, 'published scoring block is the checked-in scoring definition verbatim');
const cat = buildCatalogue(data);
const rows = cat.rows;
assert.equal(rows.length, data.models.length + data.authority.models.length, 'every permitted source model is listed');
assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'stable IDs are unique');
assert.ok(rows.every((r) => r.scoreState === 'unscored' && !('score' in r)), 'no catalogue row carries a score');
assert.equal(rows.reduce((n, r) => n + r.admitted, 0), data.authority.observations.filter((o) => o.admitted).length, 'admitted counts add up to the admitted observations');
assert.equal(rows.reduce((n, r) => n + r.excluded, 0), data.authority.observations.filter((o) => !o.admitted).length);
assert.equal(rows.reduce((n, r) => n + r.reported, 0), data.observations.length);
const unscored = rows.filter((r) => r.admitted === 0);
assert.ok(unscored.length > 300 && unscored.every((r) => r.scoreReason.length > 0), 'unscored entries are included with a reason');
assert.ok(rows.some((r) => r.labId === 'meta'), 'Meta is listed');
for (const r of rows) {
  assert.ok(r.parameters === null || r.parameters > 0, 'parameters are null or positive, never zero-filled: ' + r.id);
  if (r.parameters === null) assert.equal(r.parameterBand, 'undisclosed');
}
const known = Object.keys(data.scoring.defaultWeights);
assert.ok(rows.every((r) => r.domains <= known.length));
// Benchmarks: every registered or authority suite, each with a genuine https link.
const suiteIds = new Set([...data.suites.map((s) => s.id), ...data.authority.suites.map((s) => s.id)]);
assert.deepEqual(new Set(cat.benchmarks.map((b) => b.id)), suiteIds, 'library lists every registered and authority suite');
assert.ok(cat.benchmarks.length >= 30);
for (const b of cat.benchmarks) {
  const link = b.results[0]?.url ?? b.url;
  assert.ok(link?.startsWith('https://'), `benchmark ${b.id} has an https link`);
  for (const result of b.results) assert.ok(result.url.startsWith('https://'));
  if (b.admitted + b.reported > 0) assert.ok(b.results.length > 0, `${b.id} has result links for its observations`);
}
for (const o of data.authority.observations) {
  const b = cat.benchmarks.find((x) => x.id === o.suiteId);
  assert.ok(b.results.some((r) => r.url === o.resultUrl), `authority result link is in the library for ${o.id}`);
}
// Model evidence: every observation of a model appears with its own link; numbers come from the source rows.
let evidenceTotal = 0;
for (const r of rows) {
  const ev = modelEvidence(data, r, cat.benchmarks);
  assert.equal(ev.length, r.admitted + r.reported + r.excluded, `evidence rows match counts for ${r.id}`);
  assert.ok(ev.every((e) => e.resultUrl.startsWith('https://') && e.suiteName), 'each result carries a link and benchmark name');
  evidenceTotal += ev.length;
}
assert.equal(evidenceTotal, data.authority.observations.length + data.observations.length);
assert.match(JSON.stringify(exportJson(data, rows, CAT_DEFAULTS)), /redistribution terms are not established/);
assert.doesNotMatch(exportCsv(rows) + JSON.stringify(data.scoring), /subscription|quota|seat price|plan price/i, 'no subscription or quota data');
assert.equal(data.sourceLimitations.apiPricesPublished, false);

// ---- Browser ----
const parseCsv = (text) => {
  const out = []; let cell = ''; let record = []; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { record.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { record.push(cell); out.push(record); record = []; cell = ''; i += 1; }
    else cell += c;
  }
  return out;
};
const report = { rows: rows.length, benchmarks: cat.benchmarks.length, screenshots: [], checks: [] };
await mkdir(new URL('test-results/', root), { recursive: true });
await withBuiltBrowser(async ({ page, newPage, origin, assert: check }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin, { waitUntil: 'networkidle' });
  const table = page.getByTestId('cat-table');
  await table.waitFor();
  const visible = () => page.locator('[data-testid="cat-row"]').evaluateAll((n) => n.map((x) => x.getAttribute('data-id')));
  const total = async () => Number((await page.getByTestId('cat-total').innerText()).replaceAll(',', ''));
  const search = () => new URL(page.url()).searchParams;
  const setState = async (patch) => ({ ...CAT_DEFAULTS, ...patch });
  const expectView = async (filters, label) => {
    const expected = applyFilters(rows, filters);
    check.equal(await total(), expected.length, label + ': count');
    check.deepEqual(await visible(), ids(paginateRows(expected, filters.page).rows), label + ': visible rows');
    return expected;
  };

  let current = await setState({});
  await expectView(current, 'default');
  check.equal(await page.getByTestId('cat-page').innerText(), `Page 1 of ${Math.ceil(rows.length / CATALOGUE_PAGE_SIZE)} · rows 1–${CATALOGUE_PAGE_SIZE}`);

  // Pagination reaches every row, page in URL is 1-based.
  const all = applyFilters(rows, current);
  await page.getByTestId('cat-next').click();
  check.equal(search().get('catPage'), '2');
  check.deepEqual(await visible(), ids(all.slice(CATALOGUE_PAGE_SIZE, CATALOGUE_PAGE_SIZE * 2)), 'second page');
  await page.getByTestId('cat-prev').click();
  check.equal(search().get('catPage'), null);
  const seen = new Set();
  const pages = Math.ceil(all.length / CATALOGUE_PAGE_SIZE);
  for (let p = 0; p < pages; p += 1) {
    for (const id of await visible()) seen.add(id);
    if (p + 1 < pages) await page.getByTestId('cat-next').click();
  }
  check.equal(seen.size, rows.length, 'every entry reachable by pagination');
  check.equal(await page.getByTestId('cat-next').isDisabled(), true);
  await page.getByTestId('cat-reset').click();

  // Sorting, including nulls last.
  current = await setState({ sort: 'parameters', dir: 'asc' });
  await page.getByTestId('cat-sort').selectOption('parameters'); await page.getByTestId('cat-dir').selectOption('asc');
  await expectView(current, 'sort parameters asc');
  check.equal(search().get('catSort'), 'parameters');
  check.ok(rows.filter((r) => r.parameters !== null).length >= CATALOGUE_PAGE_SIZE && (await visible()).every((id) => rows.find((r) => r.id === id).parameters !== null), 'known parameters lead the ascending sort');
  await page.getByTestId('cat-dir').selectOption('desc');
  const desc = applyFilters(rows, await setState({ sort: 'parameters', dir: 'desc' }));
  check.deepEqual(await visible(), ids(desc.slice(0, CATALOGUE_PAGE_SIZE)), 'sort parameters desc');
  await page.getByTestId('cat-sort').selectOption('name'); await page.getByTestId('cat-dir').selectOption('asc');
  await expectView(await setState({ sort: 'name', dir: 'asc' }), 'sort name asc');

  // Filters + search, URL round trip, reload, reset.
  await page.getByTestId('cat-reset').click();
  await page.getByTestId('cat-region').selectOption('cn');
  current = await setState({ region: 'cn' });
  const cn = await expectView(current, 'region cn');
  check.ok(cn.length > 0 && cn.every((r) => r.region === 'cn'));
  await page.getByTestId('cat-origin').selectOption('authority');
  await page.getByTestId('cat-query').fill('qwen');
  current = await setState({ region: 'cn', origin: 'authority', query: 'qwen' });
  const combo = await expectView(current, 'region+source+search');
  check.ok(combo.length > 0, 'Qwen exists among China authority entries');
  check.deepEqual([search().get('catRegion'), search().get('catSource'), search().get('catQ')], ['cn', 'authority', 'qwen']);
  await page.reload({ waitUntil: 'networkidle' });
  await table.waitFor();
  check.equal(await page.getByTestId('cat-region').inputValue(), 'cn', 'reload restores region');
  await expectView(current, 'after reload');
  await page.getByTestId('cat-reset').click();
  check.equal([...search().keys()].filter((k) => k.startsWith('cat')).length, 0, 'reset clears every catalogue key');
  await expectView(await setState({}), 'after reset');
  await page.getByTestId('cat-query').fill('zzzz-no-such-model');
  check.equal(await total(), 0); check.match(await page.locator('#models .cat-empty').innerText(), /No entry matches/);
  await page.getByTestId('cat-reset').click();
  await page.getByTestId('cat-lab').selectOption('meta'); await page.getByTestId('cat-band').selectOption('undisclosed'); await page.getByTestId('cat-openness').selectOption('public-weights');
  await expectView(await setState({ lab: 'meta', band: 'undisclosed', openness: 'public-weights' }), 'lab+band+openness');
  await page.getByTestId('cat-reset').click();
  await page.getByTestId('cat-modality').selectOption('image'); await expectView(await setState({ modality: 'image' }), 'modality');
  await page.getByTestId('cat-reset').click();

  // Unscored entries stay listed and are labelled.
  await page.getByTestId('cat-evidence').selectOption('none');
  const none = await expectView(await setState({ evidence: 'none' }), 'unscored');
  check.equal(none.length, unscored.length);
  check.ok((await page.locator('[data-testid="cat-row"]').first().innerText()).includes('Unscored'));
  await page.getByTestId('cat-reset').click();

  // Exports equal the displayed (filtered, sorted) rows, every page, stable IDs.
  await page.getByTestId('cat-region').selectOption('cn'); await page.getByTestId('cat-sort').selectOption('name'); await page.getByTestId('cat-dir').selectOption('asc');
  const shown = applyFilters(rows, await setState({ region: 'cn', sort: 'name', dir: 'asc' }));
  const csvPromise = page.waitForEvent('download');
  await page.getByTestId('cat-export-csv').click();
  const csvDownload = await csvPromise;
  check.match(csvDownload.suggestedFilename(), /^axionbench-catalogue-[0-9a-f]{12}\.csv$/);
  const table2 = parseCsv(await readFile(await csvDownload.path(), 'utf8'));
  check.deepEqual(table2[0], [...CSV_COLUMNS]);
  check.deepEqual(table2.slice(1).map((r) => r[0]), ids(shown), 'CSV ids equal the filtered rows in order');
  check.deepEqual(table2.slice(1).map((r) => r[1]), shown.map((r) => r.name), 'CSV names equal the filtered rows');
  check.deepEqual((await visible()), table2.slice(1, 1 + CATALOGUE_PAGE_SIZE).map((r) => r[0]), 'visible page is the export prefix');
  const jsonPromise = page.waitForEvent('download');
  await page.getByTestId('cat-export-json').click();
  const exported = JSON.parse(await readFile(await (await jsonPromise).path(), 'utf8'));
  check.deepEqual(exported.rows.map((r) => r.id), ids(shown), 'JSON ids equal the filtered rows');
  check.equal(exported.count, shown.length); check.equal(exported.sourceDigest, data.sourceDigest);
  check.equal(exported.filters.region, 'cn'); check.ok(exported.notice.authoritySources.length === data.authority.sources.length && exported.notice.providerCatalogue);
  check.deepEqual(exported.rows, JSON.parse(JSON.stringify(shown)), 'JSON rows are the displayed records');
  await page.getByTestId('cat-reset').click();

  // Model detail deep link + result links.
  const target = rows.find((r) => r.admitted >= 3 && r.origin === 'authority');
  await page.goto(origin + '/?catModel=' + encodeURIComponent(target.id), { waitUntil: 'networkidle' });
  const detail = page.getByTestId('model-detail');
  await detail.waitFor();
  check.equal(await detail.getAttribute('data-id'), target.id);
  check.match(await detail.innerText(), /Unscored/);
  const expectedEvidence = modelEvidence(data, target, cat.benchmarks);
  const mentions = await detail.locator('a.benchmark-mention').evaluateAll((n) => n.map((x) => [x.getAttribute('data-suite'), x.getAttribute('href')]));
  check.deepEqual(mentions, expectedEvidence.map((e) => [e.suiteId, e.resultUrl]), 'every benchmark mention links to that observation\'s original result');
  check.ok(await detail.evaluate((n) => { const r = n.getBoundingClientRect(); return r.top < window.innerHeight; }), 'deep link scrolls the detail into view');
  const nullTarget = rows.find((r) => r.admitted === 0 && r.reported === 0 && r.origin === 'catalogue');
  await page.goto(origin + '/?catModel=' + encodeURIComponent(nullTarget.id), { waitUntil: 'networkidle' });
  check.match(await page.getByTestId('model-detail').innerText(), /stays in the catalogue as unscored/);
  check.match(await page.getByTestId('model-detail').innerText(), /Undisclosed|Unknown/);
  await page.getByTestId('model-close').click();
  check.equal(search().get('catModel'), null);
  await page.goto(origin + '/?catModel=does-not-exist', { waitUntil: 'networkidle' });
  check.equal(await page.getByTestId('model-detail').count(), 0, 'unknown model ID in the URL is ignored');
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="cat-row"] .cat-open').first().click();
  check.equal(search().get('catModel') !== null, true, 'opening a row writes its ID to the URL');
  await page.getByTestId('cat-reset').click();

  // Benchmark library: anchors, links, deep link.
  const entries = page.locator('[data-testid="benchmark-entry"]');
  check.equal(await entries.count(), cat.benchmarks.length);
  for (const b of cat.benchmarks) {
    const entry = page.locator('[id="benchmark-' + b.id + '"]');
    check.equal(await entry.count(), 1, 'anchor for ' + b.id);
    const mention = await entry.locator('a.benchmark-mention').getAttribute('href');
    check.equal(mention, b.results[0]?.url ?? b.url, 'link for ' + b.id);
    check.equal(await entry.locator('details a').count(), b.results.length, 'result sources for ' + b.id);
  }
  check.equal(await page.locator('[data-testid="benchmark-library"] a[target="_blank"]').evaluateAll((n) => n.filter((x) => !x.href.startsWith('https://')).length), 0, 'all benchmark links are https');
  await page.getByTestId('library-domain').selectOption('coding');
  check.equal(await entries.count(), cat.benchmarks.filter((b) => b.domain === 'coding').length);
  check.equal(search().get('benDomain'), 'coding');
  await page.goto(origin + '/#benchmark-gpqa-diamond', { waitUntil: 'networkidle' });
  check.ok(await page.locator('[id="benchmark-gpqa-diamond"]').evaluate((n) => { const r = n.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; }), 'benchmark hash deep link scrolls to its entry');

  // Methodology.
  const method = page.getByTestId('methodology');
  await method.scrollIntoViewIfNeeded();
  const weights = await page.getByTestId('method-weights').locator('li').evaluateAll((n) => Object.fromEntries(n.map((x) => [x.querySelector('span').textContent, Number(x.querySelector('strong').textContent)])));
  check.deepEqual(weights, data.scoring.defaultWeights, 'weights on the page equal data/scoring.json');
  check.equal(await page.getByTestId('method-exclusions').locator('li').count(), data.authority.exclusions.length);
  check.equal(await page.getByTestId('method-sources').locator('tbody tr').count(), data.authority.sources.length);
  const text = await method.textContent();
  for (const phrase of ['src/scoring/index.mjs', 'axion-domain-v1', 'No confidence interval', 'no historical chart']) check.ok(text.includes(phrase), 'methodology states: ' + phrase);
  check.equal(await page.locator('[data-chart-kind="history"]').count(), 0, 'no history chart without archived history');
  check.doesNotMatch(await page.locator('#models, #methods').evaluateAll((n) => n.map((x) => x.textContent).join(' ')), /subscription|\bquota\b/i, 'no subscription or quota content rendered');
  await page.screenshot({ path: new URL('test-results/catalogue-methods.png', root).pathname, animations: 'disabled' });
  report.screenshots.push('test-results/catalogue-methods.png');

  // Responsive: no horizontal overflow; the wide table scrolls inside its own region.
  for (const width of [360, 768]) {
    const narrow = await newPage();
    await narrow.setViewportSize({ width, height: 900 });
    await narrow.goto(origin + '/?catRegion=cn', { waitUntil: 'networkidle' });
    await narrow.getByTestId('cat-table').waitFor();
    check.ok(await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no page overflow at ' + width);
    await narrow.locator('#models').scrollIntoViewIfNeeded();
    await narrow.screenshot({ path: new URL(`test-results/catalogue-${width}.png`, root).pathname, animations: 'disabled' });
    report.screenshots.push(`test-results/catalogue-${width}.png`);
    await narrow.close();
  }
  check.deepEqual(errors, [], 'no console or page errors');
  report.checks.push('catalogue interactions, exports, deep links and methodology passed');
});
await writeFile(new URL('test-results/catalogue-evidence.json', root), JSON.stringify(report, null, 2));
console.log('Catalogue gate passed: ' + rows.length + ' entries, ' + cat.benchmarks.length + ' benchmarks.');
