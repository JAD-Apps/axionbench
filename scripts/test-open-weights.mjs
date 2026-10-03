// npm run test:open-weights — open-weight explorer by total parameters. Runs the earlier
// head-to-head gate first (which runs the frontier gate and the production build), then
// hand-written logic fixtures, real-snapshot checks and browser interactions on the build.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { withBuiltBrowser } from './test-harness.mjs';
import {
  DEFAULT_FILTERS, MAX_PANEL_SERIES, PAGE_SIZE, PARAMETER_BANDS, PRIORITY_LABS, bandCounts, bandFor, decodeFilters, encodeFilters,
  extractActivated, filterRows, licenceFacts, moeIdentity, paginate, representatives, totalFromSafetensors, variantFacts,
} from '../src/open-weights/logic.ts';

const root = new URL('../', import.meta.url);
const earlier = spawnSync('npm', ['run', 'test:head-to-head'], { cwd: root.pathname, stdio: 'inherit' });
if (earlier.error) throw earlier.error;
assert.equal(earlier.status, 0, 'earlier head-to-head gate (with frontier gate and production build) passes first');

// ---- Exact band boundaries (lower bound inclusive, upper exclusive) ----
const boundaries = [[1, 'under-10'], [9_999_999_999, 'under-10'], [10e9, '10-35'], [34_999_999_999, '10-35'], [35e9, '35-100'],
  [99_999_999_999, '35-100'], [100e9, '100-300'], [299_999_999_999, '100-300'], [300e9, '300-plus'], [2.4e12, '300-plus']];
for (const [value, band] of boundaries) assert.equal(bandFor(value), band, `band boundary ${value}`);
for (const value of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(bandFor(value), 'undisclosed', `unknown total ${value}`);
assert.equal(bandFor(72e9, 'quantized-tensor-count'), 'undisclosed', 'a quantized tensor count is never a parameter count');
assert.equal(bandFor(72e9, 'not-captured'), 'undisclosed');
assert.deepEqual(PARAMETER_BANDS.map((band) => band.label), ['<10B', '10–35B', '35–100B', '100–300B', '300B+', 'Undisclosed']);

// ---- Tensor totals ----
assert.equal(totalFromSafetensors({ parameters: { BF16: 7e9 }, total: 7e9 }).status, 'tensor-total');
assert.equal(totalFromSafetensors({ parameters: { BF16: 7e9, I64: 4096 }, total: 7e9 + 4096 }).status, 'tensor-total', 'index buffers are not packed weights');
assert.equal(totalFromSafetensors({ parameters: { BF16: 1e9, I32: 5e9 }, total: 6e9 }).status, 'quantized-tensor-count', 'int4-packed weights');
assert.equal(totalFromSafetensors({ parameters: { U8: 6e9 }, total: 6e9 }).status, 'quantized-tensor-count');
assert.equal(totalFromSafetensors({ parameters: { I64: 10 }, total: 10 }).status, 'quantized-tensor-count', 'no float weights at all');
assert.equal(totalFromSafetensors(null).status, 'not-captured');

// ---- Activated MoE parameters: separate identity, never the band ----
const card = (...lines) => lines.join('\n');
const table = extractActivated(card('| | |', '|:-:|:-:|', '| **Total Parameters** | 1T |', '| **Activated Parameters** | 32B |'), 1.03e12, 'org/Kimi-K2');
assert.deepEqual([table.status, table.value], ['card-stated', 32e9]);
assert.match(table.quote, /Activated Parameters\*\* \| 32B/);
assert.equal(bandFor(1.03e12), '300-plus', 'the 1T total — not the 32B activated count — sets the group');
assert.equal(extractActivated(card('| Model | A | B |', '| # Activated Params | 21B | 37B |'), null, 'org/x').status, 'not-stated', 'multi-model rows are ignored');
assert.equal(extractActivated(card('| Property | 26B A4B MoE |', '| :- | :- |', '| **Active Parameters** | 3.8B |'), 31e9, 'google/gemma-4-31b-it').status,
  'not-stated', 'a family card table about a sibling is not attributed to this model');
assert.equal(extractActivated(card('| Property | 26B A4B MoE |', '| :- | :- |', '| **Active Parameters** | 3.8B |'), 25.8e9, 'google/gemma-4-26b-a4b-it').value, 3.8e9);
const prose = extractActivated('A mixture-of-experts model featuring 32 billion activated parameters and a total of 1 trillion parameters.', 1.02e12, 'org/m');
assert.deepEqual([prose.status, prose.value, prose.approximate], ['card-stated', 32e9, false]);
assert.equal(extractActivated('It has ~428B parameters and ~23B activated parameters.', 4.27e11).approximate, true);
assert.equal(extractActivated('- Activated Parameters per Token: 45.9B', 4.5e11).value, 45.9e9);
const conflict = extractActivated(card('The 120b model has 5.1B active parameters.', 'The 20b model has 3.6B active parameters.'), null);
assert.deepEqual([conflict.status, conflict.value, conflict.candidates], ['ambiguous', null, [3.6e9, 5.1e9]], 'conflicting statements stay unknown');
assert.equal(extractActivated('With 40B active parameters.', 30e9).status, 'inconsistent', 'activated ≥ total is rejected');
assert.equal(extractActivated(null, 1e9).status, 'no-card');
assert.equal(extractActivated('The "A" in 26B A4B stands for "active parameters".', 25e9).status, 'not-stated', 'name suffixes are not statements');
assert.equal(moeIdentity(table, []).status, 'stated-activated');
assert.equal(moeIdentity(extractActivated('', 1e9), ['Qwen3MoeForCausalLM']).status, 'architecture-class');
assert.equal(moeIdentity(extractActivated('', 1e9), ['LlamaForCausalLM']).status, 'not-established', 'dense is never asserted, only "not established"');

// ---- Licence, access and base/instruct are distinct facts ----
assert.equal(licenceFacts({ license: 'apache-2.0' }, true).class, 'osi-approved');
assert.equal(licenceFacts({ license: 'llama3', license_link: 'https://example.org/l' }, true).class, 'named-non-osi');
assert.equal(licenceFacts({}, true).class, 'not-stated');
assert.equal(licenceFacts(null, false).class, 'not-verified');
assert.equal(variantFacts('meta-llama/Llama-3.1-8B', []).kind, 'not-stated');
assert.equal(variantFacts('org/Model-Base', []).kind, 'base');
assert.equal(variantFacts('org/Model-7B-Instruct', ['base_model:finetune:org/Model-7B']).kind, 'instruct');
assert.equal(variantFacts('org/Tuned', ['base_model:finetune:org/Model-7B']).baseModel, 'org/Model-7B');

// ---- Pagination ----
assert.deepEqual(paginate([], 0), { page: 0, pages: 1, rows: [], start: 0, end: 0 });
const forty1 = Array.from({ length: 41 }, (_, i) => i);
assert.deepEqual(paginate(forty1, 2, 20).rows, [40]);
assert.equal(paginate(forty1, 99, 20).page, 2, 'out-of-range pages clamp to the last page');
assert.equal(paginate(forty1, -3, 20).page, 0);
assert.equal(paginate(forty1, Number.NaN, 20).page, 0);
assert.deepEqual([paginate(forty1, 1, 20).start, paginate(forty1, 1, 20).end], [21, 40]);

// ---- Representatives (bounded, one per lab, priority labs first) ----
const fx = (id, labId, total, observationCount = 0) => ({ modelId: id, name: id, lab: labId, labId, repository: null, repositoryUrl: null,
  total: { value: total, status: total ? 'tensor-total' : 'not-captured', tensorCount: total, dtypes: [] }, band: bandFor(total),
  activated: { value: null, approximate: false, status: 'not-stated', quote: null, candidates: [] }, moe: { status: 'not-established', basis: '' },
  access: { status: 'public', basis: '' }, licence: { id: null, name: null, link: null, class: 'not-stated' },
  variant: { kind: 'not-stated', basis: '', baseModel: null }, quantized: { value: false, basis: '' }, observationCount, sources: { metadata: null, card: null } });
const many = Array.from({ length: 30 }, (_, i) => fx(`m${i}`, `lab${i % 12}`, 20e9 + i));
many.push(fx('meta-a', 'meta', 12e9), fx('meta-b', 'meta', 13e9, 5), fx('big', 'meta', 400e9));
const reps = representatives(many, '10-35');
assert.equal(reps.length, MAX_PANEL_SERIES, 'panel is capped');
assert.equal(new Set(reps.map((row) => row.labId)).size, reps.length, 'one representative per lab');
assert.equal(reps[0].modelId, 'meta-b', 'priority lab first; its most-evidenced entry represents it');
assert.ok(reps.every((row) => row.band === '10-35'));
assert.deepEqual(representatives(many, '10-35').map((row) => row.modelId), reps.map((row) => row.modelId), 'deterministic');
assert.deepEqual(filterRows(many, { ...DEFAULT_FILTERS, lab: 'meta' }).map((row) => row.modelId), ['big', 'meta-b', 'meta-a'], 'largest established total first');

// ---- URL state ----
const encoded = encodeFilters({ ...DEFAULT_FILTERS, band: '35-100', moe: 'stated-activated', query: 'qwen', page: 2 }, new URL('https://x.test/?cohort=a'));
assert.equal(encoded.search, '?cohort=a&owBand=35-100&owMoe=stated-activated&owQ=qwen&owPage=3', 'other chapters\' parameters are preserved');
assert.deepEqual(decodeFilters(encoded.searchParams, []), { ...DEFAULT_FILTERS, band: '35-100', moe: 'stated-activated', query: 'qwen', page: 2 });
assert.deepEqual(decodeFilters(new URLSearchParams('owBand=giant&owLab=nobody&owPage=x'), ['meta']), DEFAULT_FILTERS, 'invalid URL values are ignored');

// ---- Real data: projection block re-checked against the committed snapshots ----
const data = JSON.parse(await readFile(new URL('public/data.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('public/data-manifest.json', root), 'utf8'));
const ingestion = JSON.parse(await readFile(new URL('data/ingestion.json', root), 'utf8'));
const block = data.openWeights;
const rows = block.rows;
assert.equal(rows.length, manifest.counts.openWeightRows);
assert.equal(rows.length, ingestion.models.filter((row) => row.weightsAvailability !== 'unknown').length, 'every repository-referenced model is included');
const counts = bandCounts(rows);
assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), rows.length, 'bands partition all rows');
const sourcePath = new Map(ingestion.sources.map((row) => [row.id, row.snapshotPath]));
const snapshot = async (ref) => {
  const bytes = await readFile(new URL(sourcePath.get(ref.id), root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), ref.sha256, `snapshot digest ${ref.id}`);
  return bytes.toString('utf8');
};
for (const row of rows) {
  assert.equal(row.band, bandFor(row.total.value, row.total.status), `band derivation ${row.modelId}`);
  if (row.sources.metadata) {
    const meta = JSON.parse(await snapshot(row.sources.metadata));
    assert.equal(row.total.tensorCount, meta.safetensors?.total ?? null, `tensor count matches its metadata ${row.modelId}`);
    assert.ok(row.sources.metadata.url?.startsWith('https://huggingface.co/api/models/'), `metadata source link ${row.modelId}`);
  } else assert.equal(row.access.status, 'not-verified');
  if (row.activated.status === 'card-stated') {
    assert.ok((await snapshot(row.sources.card)).includes(row.activated.quote), `activated quote is verbatim in the card ${row.modelId}`);
    assert.equal(row.moe.status, 'stated-activated');
    assert.ok(row.total.value === null || row.activated.value < row.total.value);
  }
  assert.ok(!('price' in row) && !('input' in row) && !('output' in row), 'no price values are published per row');
}
const labIds = new Set(rows.map((row) => row.labId));
for (const lab of PRIORITY_LABS) assert.ok(labIds.has(lab), `required lab is present: ${lab}`);
assert.ok(rows.some((row) => /nemotron/i.test(row.name)) && rows.some((row) => /olmo/i.test(row.repository ?? '')) && rows.some((row) => /granite/i.test(row.name)));
const byName = (pattern) => rows.find((row) => pattern.test(row.name));
const kimi = byName(/Kimi K2\.5$/);
assert.deepEqual([kimi.band, kimi.total.status, kimi.activated.value, kimi.moe.status], ['undisclosed', 'quantized-tensor-count', 32e9, 'stated-activated'],
  'a packed checkpoint keeps its activated count but not a fabricated total');
assert.equal(byName(/Gemma 4 31B/).activated.value, null, 'family-card regression: the dense 31B is not given its sibling\'s 3.8B');
assert.equal(byName(/gpt-oss-120b/).activated.status, 'ambiguous', 'a card covering two models stays ambiguous');
assert.match(block.hostedPrice, /^Withheld/); assert.match(block.selfHostCost, /^Not estimated/);
assert.equal(data.sourceLimitations.apiPricesPublished, true, 'separately licensed endpoint quotes are published');
assert.equal(data.sourceLimitations.apiPriceRowsPublished, 11, 'permitted pricing coverage stays explicit');
assert.equal(data.sourceLimitations.restrictedRoutedPricesPublished, false, 'restricted routed prices remain withheld');
assert.equal(data.pricing.records.length, 11);
assert.equal(data.pricing.source.licence, 'CC BY 4.0');

// ---- Browser: rendered, wired into the real page and shared URL state ----
const defaultScoped = filterRows(rows, DEFAULT_FILTERS);
const report = { rows: rows.length, bands: counts, defaultSeries: 0, screenshots: [], checks: [] };
await mkdir(new URL('test-results/', root), { recursive: true });
await withBuiltBrowser(async ({ page, origin, assert: check }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/open-weights', { waitUntil: 'networkidle' });
  const ow = page.locator('#open-weights [data-testid="ow"]');
  await ow.waitFor();
  const url = () => new URL(page.url()).searchParams;
  const tableIds = () => page.locator('[data-testid="ow-table"] tbody tr').evaluateAll((n) => n.map((x) => x.getAttribute('data-row-id')));

  // Bounded representative cohort first: one panel per band, each ≤ MAX_PANEL_SERIES.
  check.equal(await page.getByTestId('ow-panel').count(), PARAMETER_BANDS.length);
  let series = 0;
  for (const band of PARAMETER_BANDS) {
    const expected = representatives(defaultScoped, band.id);
    const panel = page.locator(`[data-testid="ow-panel"][data-band="${band.id}"]`);
    const ids = await panel.getByTestId('ow-series').evaluateAll((n) => n.map((x) => x.getAttribute('data-model-id')));
    check.deepEqual(ids, expected.map((row) => row.modelId), `panel ${band.id} shows its representatives`);
    check.ok(ids.length <= MAX_PANEL_SERIES, `panel ${band.id} series ≤ ${MAX_PANEL_SERIES}`);
    const canvas = panel.locator('canvas');
    if (band.id === 'undisclosed') {
      check.equal(await canvas.count(), 0, 'undisclosed has no numerical position');
      check.ok(await panel.locator('.ow-undisclosed').count() === expected.length);
    } else if (expected.length) {
      await page.waitForFunction(el => !!el.dataset.chartGeometry, await canvas.elementHandle());
      const geometry = JSON.parse(await canvas.getAttribute('data-chart-geometry'));
      for (const [index, key] of ['total', 'activated'].entries()) {
        const plotted = expected.filter(row => row[key].value !== null);
        check.deepEqual(geometry.datasets[index].data.map(point => point.x), plotted.map(row => row[key].value), `${band.id}: Chart.js ${key} values`);
      }
    }
    series += ids.length;
  }
  check.ok(series <= PARAMETER_BANDS.length * MAX_PANEL_SERIES && series < 60, 'default view never renders hundreds of series');
  report.defaultSeries = series;
  check.ok(await page.locator('#open-weights canvas').count() > 0, 'parameter Chart.js panels are drawn; total/activated dataset parity checked above');

  // All rows through pagination.
  check.equal(await page.getByTestId('ow-total').innerText(), String(rows.length));
  check.equal(await page.getByTestId('ow-page').innerText(), `Page 1 of ${Math.ceil(rows.length / PAGE_SIZE)}`);
  check.deepEqual(await tableIds(), defaultScoped.slice(0, PAGE_SIZE).map((row) => row.modelId), 'first page');
  await page.getByTestId('ow-next').click();
  check.deepEqual(await tableIds(), defaultScoped.slice(PAGE_SIZE, PAGE_SIZE * 2).map((row) => row.modelId), 'second page');
  check.equal(url().get('owPage'), '2');
  await page.getByTestId('ow-prev').click();
  check.equal(url().get('owPage'), null);
  const seen = new Set();
  for (let p = 0; p < Math.ceil(rows.length / PAGE_SIZE); p += 1) {
    for (const id of await tableIds()) seen.add(id);
    if (p + 1 < Math.ceil(rows.length / PAGE_SIZE)) await page.getByTestId('ow-next').click();
  }
  check.equal(seen.size, rows.length, 'every row is reachable through pagination');
  check.equal(await page.getByTestId('ow-next').isDisabled(), true);

  // Band selection by keyboard; activated counts do not move a model's band.
  await page.locator('#open-weights [data-band="300-plus"]').first().focus();
  await page.keyboard.press('Enter');
  const plus = filterRows(rows, { ...DEFAULT_FILTERS, band: '300-plus' });
  check.equal(url().get('owBand'), '300-plus'); check.equal(url().get('owPage'), null, 'filter changes reset the page');
  check.equal(await page.getByTestId('ow-total').innerText(), String(plus.length));
  check.deepEqual(await tableIds(), plus.slice(0, PAGE_SIZE).map((row) => row.modelId));
  check.equal(await page.locator('[data-testid="ow-panel"]').getAttribute('data-band'), '300-plus');

  // MoE, licence and quantized filters are separate.
  await page.getByRole('button', { name: /^All sizes/ }).click();
  await page.getByTestId('ow-moe').selectOption('stated-activated');
  const moe = filterRows(rows, { ...DEFAULT_FILTERS, moe: 'stated-activated' });
  check.equal(await page.getByTestId('ow-total').innerText(), String(moe.length));
  for (const text of await page.locator('[data-testid="ow-table"] td[data-cell="activated"]').allInnerTexts()) check.doesNotMatch(text, /^Not stated/);
  await page.getByTestId('ow-licence').selectOption('osi-approved');
  await page.getByTestId('ow-quantized').selectOption('no');
  const combined = filterRows(rows, { ...DEFAULT_FILTERS, moe: 'stated-activated', licence: 'osi-approved', quantized: 'no' });
  check.equal(await page.getByTestId('ow-total').innerText(), String(combined.length));

  // Reload restores the shared URL state; other chapters' state is untouched.
  await page.reload({ waitUntil: 'networkidle' });
  await ow.waitFor();
  check.equal(await page.getByTestId('ow-moe').inputValue(), 'stated-activated');
  check.equal(await page.getByTestId('ow-total').innerText(), String(combined.length), 'reload restores filters');
  check.equal(url().get('cohort'), null, 'explorer URLs contain their own route state');

  // Export equals every filtered row, not only the visible page.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('ow-export').click();
  const exported = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
  check.deepEqual(exported.rows.map((row) => row.modelId), combined.map((row) => row.modelId));
  check.equal(exported.dataDigest, manifest.projection.sha256);
  check.equal(exported.filters.licence, 'osi-approved');

  // Search plus source details (links, SHA-256, verbatim quote).
  for (const name of ['ow-moe', 'ow-licence', 'ow-quantized']) await page.getByTestId(name).selectOption('all');
  await page.getByTestId('ow-query').fill('Kimi K2.5');
  const kimiRow = page.locator(`[data-testid="ow-table"] tr[data-row-id="${kimi.modelId}"]`);
  check.equal(await kimiRow.locator('td[data-cell="total"]').innerText().then((t) => t.startsWith('not established')), true);
  check.match(await kimiRow.locator('td[data-cell="activated"]').innerText(), /^32B/);
  await kimiRow.getByTestId('ow-source').locator('summary').click();
  check.equal(await kimiRow.locator(`a[data-source-link="${kimi.sources.card.id}"]`).getAttribute('href'), kimi.sources.card.url);
  check.equal(await kimiRow.locator(`a[data-source-link="${kimi.sources.metadata.id}"]`).getAttribute('href'), kimi.sources.metadata.url);
  check.match(await kimiRow.getByTestId('ow-source').innerText(), new RegExp(kimi.sources.metadata.sha256));
  check.equal(await kimiRow.getByTestId('ow-quote').innerText(), kimi.activated.quote);
  check.match(await kimiRow.getByTestId('ow-source').innerText(), /Hosted API price[\s\S]*Withheld[\s\S]*Self-host cost[\s\S]*Not estimated/i);
  await page.getByTestId('ow-query').fill('');
  await page.getByTestId('ow-lab').selectOption('meta');
  check.equal(await page.getByTestId('ow-total').innerText(), String(rows.filter((row) => row.labId === 'meta').length), 'Meta is explorable');
  await page.getByTestId('ow-lab').selectOption('all');

  // Reduced motion stops real Chart.js animation.
  const mark = page.locator('#open-weights canvas').first();
  await page.waitForFunction(el => !!el.dataset.chartGeometry, await mark.elementHandle());
  check.equal(JSON.parse(await mark.getAttribute('data-chart-geometry')).animation, false);

  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const bounds = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    check.ok(bounds.page <= bounds.viewport, `no horizontal overflow at ${width}px: ${JSON.stringify(bounds)}`);
    const box = await page.locator('#open-weights canvas').first().boundingBox();
    check.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `Chart.js fits at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await ow.screenshot({ path: new URL('test-results/open-weights-mobile.png', root).pathname, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#open-weights').screenshot({ path: new URL('test-results/open-weights-desktop.png', root).pathname, animations: 'disabled' });
  report.screenshots.push('test-results/open-weights-desktop.png', 'test-results/open-weights-mobile.png');
  check.deepEqual(errors, [], 'no browser errors');
  report.checks = ['bounded representative panels', 'marks = row values', 'undisclosed not plotted', 'pagination reaches every row',
    'keyboard band selection', 'separate MoE/licence/quantized filters', 'URL persistence and reload', 'export parity',
    'source links, SHA-256 and verbatim quote', 'price vs self-host distinction', 'Meta lab filter', 'reduced motion', 'mobile 360/390/768'];
}, { reducedMotion: 'reduce' });
await writeFile(new URL('test-results/open-weights-evidence.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(`Open-weight checks passed: ${rows.length} entries (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}); ${report.defaultSeries} default series across ${PARAMETER_BANDS.length} panels.`);
