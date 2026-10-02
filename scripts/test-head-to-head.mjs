// npm run test:head-to-head — matched US–China comparison. Runs the earlier
// frontier browser gate (which also builds), then hand-calculated logic fixtures
// and real browser interactions against the built application.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { withBuiltBrowser } from './test-harness.mjs';
import { comparisonExport, decodeH2H, defaultPair, domainSummaries, headToHead, pct, points, regionalModels, settingRank } from '../src/authority/logic.ts';

const root = new URL('../', import.meta.url);
const frontier = spawnSync('npm', ['run', 'test:frontier'], { cwd: root.pathname, stdio: 'inherit' });
if (frontier.error) throw frontier.error;
assert.equal(frontier.status, 0, 'earlier frontier gate (with production build) passes first');

// ---- Hand-calculated fixtures (synthetic; never site data) ----
const cfg = (id, condition, setting = 'high', known = true) => ({ id, harness: condition, setting, condition, conditionsKnown: known });
const o = (id, modelKey, suiteId, value, extra = {}) => ({
  id, sourceId: 'src', provenance: 'benchmark-authority', suiteId, domain: 'coding', metric: 'score', primary: true, modelKey, modelLabel: modelKey,
  configuration: cfg(id, 'h'), value, rawValue: value, rawText: String(value), rawUnit: 'fraction', unitEvidence: 'fixture',
  interval: null, stderr: null, counts: null, evaluatedAt: '2026-09-01', evaluatedAtBasis: 'fixture', resultUrl: `https://example.org/${id}`,
  admitted: true, exclusion: null, matchable: true, ...extra });
const fixture = {
  schemaVersion: 'fixture', regionDefinition: 'fixture', inputDigests: {}, frontierDefault: { suiteId: 's1', sourceId: 'src', metric: 'score', representatives: 10 },
  sources: [{ id: 'src' }, { id: 'other' }], exclusions: [], floor: {},
  suites: ['s1', 's2', 's3', 's4', 's5', 's6', 'f1', 'f2'].map((id) => ({ id, name: id, version: '1', domain: id.startsWith('f') ? 'mathematics' : 'coding', familyId: id === 'f2' ? 'fam' : id === 'f1' ? 'fam' : id, benchmarkUrl: null }))
    .concat([{ id: 'g1', name: 'g1', version: '1', domain: 'mathematics', familyId: 'solo', benchmarkUrl: null }]),
  models: [{ key: 'us1', name: 'US One', region: 'us' }, { key: 'cn1', name: 'CN One', region: 'cn' }, { key: 'cn2', name: 'CN Two', region: 'cn' }, { key: 'eu1', name: 'EU', region: 'other' }],
  observations: [
    o('a1', 'us1', 's1', 0.5), o('b1', 'cn1', 's1', 0.6),                                     // matched, +10.0 pp for China
    o('a2', 'us1', 's2', 0.9),                                                                 // unequal coverage (US only)
    o('a3', 'us1', 's3', 0.4, { configuration: cfg('a3', 'harness-A') }), o('b3', 'cn1', 's3', 0.8, { configuration: cfg('b3', 'harness-B') }), // incompatible
    o('a4', 'us1', 's4', 0.7), o('b4', 'cn1', 's4', 0.7),                                     // tie
    o('a5', 'us1', 's5', 0.3), o('a5b', 'us1', 's5', 0.35), o('b5', 'cn1', 's5', 0.2),         // duplicate at same setting
    o('a6h', 'us1', 's6', 0.4), o('a6l', 'us1', 's6', 0.9, { configuration: cfg('a6l', 'h', 'low') }), o('b6', 'cn1', 's6', 0.5, { configuration: cfg('b6', 'h', 'low') }), // setting rule
    o('af1', 'us1', 'f1', 0.2, { domain: 'mathematics' }), o('bf1', 'cn1', 'f1', 0.6, { domain: 'mathematics' }),
    o('af2', 'us1', 'f2', 0.4, { domain: 'mathematics' }), o('bf2', 'cn1', 'f2', 0.8, { domain: 'mathematics' }),
    o('ag1', 'us1', 'g1', 1.0, { domain: 'mathematics' }), o('bg1', 'cn1', 'g1', 0.5, { domain: 'mathematics' }),
    o('pub', 'cn1', 's2', 0.99, { configuration: cfg('pub', null, null, false), provenance: 'publisher-own', matchable: false }), // unknown conditions
    o('claim', 'cn1', 's2', 0.98, { provenance: 'publisher-comparison-claim', admitted: false, exclusion: 'claim', matchable: false }),
    o('z1', 'cn2', 's9', 0.1),
  ],
};
fixture.suites.push({ id: 's9', name: 's9', version: '1', domain: 'coding', familyId: 's9', benchmarkUrl: null });
const r = headToHead(fixture, 'us1', 'cn1');
const byId = new Map(r.matched.map((row) => [row.suiteId, row]));
assert.deepEqual([...byId.keys()].sort(), ['f1', 'f2', 'g1', 's1', 's4', 's6'], 'matched intersection');
assert.ok(Math.abs(byId.get('s1').deltaPoints - 10) < 1e-9 && byId.get('s1').leader === 'b', 'accurate delta: 0.6 − 0.5 = +10.0 pp');
assert.equal(points(byId.get('s1').deltaPoints), '+10.0 pp');
assert.equal(byId.get('s4').leader, 'tie'); assert.equal(r.counts.ties, 1);
assert.equal(byId.get('s6').a.id, 'a6h', 'declared setting rule picks the highest setting, not the best score');
assert.equal(r.onlyA.map((x) => x.id).join(), 'a2', 'unequal coverage is reported, not compared');
assert.ok(r.excluded.some((x) => x.observation.id === 'a3' && /incompatible test conditions/.test(x.reason)), 'incompatible harnesses excluded');
assert.ok(r.excluded.some((x) => x.observation.id === 'a5' && /duplicate/.test(x.reason)) && !byId.has('s5'), 'duplicates are never chosen by order');
assert.ok(r.excluded.some((x) => x.observation.id === 'pub' && /not stated/.test(x.reason)), 'unknown conditions excluded');
assert.ok(r.excluded.some((x) => x.observation.id === 'claim' && x.reason === 'claim'), 'non-admitted claims excluded with their reason');
const math = r.domains.find((d) => d.domain === 'mathematics');
// family cap: fam = mean(0.2,0.4)=0.3 and solo = 1.0 → US 0.65; China mean(0.6,0.8)=0.7 and 0.5 → 0.6
assert.ok(Math.abs(math.a - 0.65) < 1e-12 && Math.abs(math.b - 0.6) < 1e-12 && math.families === 2 && math.suites === 3, 'family-capped domain mean');
assert.ok(Math.abs(math.deltaPoints - -5) < 1e-9 && math.leader === 'a');
const same = headToHead(fixture, 'us1', 'cn1', { domain: 'all', sameSetting: true, sourceId: 'any' });
assert.equal(same.matched.find((row) => row.suiteId === 's6').a.id, 'a6l', 'identical-setting filter pairs low with low');
const none = headToHead(fixture, 'us1', 'cn2');
assert.equal(none.matched.length, 0); assert.deepEqual(none.domains, []); assert.equal(none.counts.onlyB, 1, 'all-null pair: no marks, coverage retained');
assert.equal(headToHead(fixture, 'us1', 'cn1', { domain: 'all', sameSetting: false, sourceId: 'other' }).matched.length, 0, 'evaluator filter');
assert.deepEqual(domainSummaries([]), []);
assert.ok(settingRank('max') < settingRank('high') && settingRank('high') < settingRank('32K') && settingRank('32K') < settingRank(null));
const regions = regionalModels(fixture);
assert.deepEqual(regions.us.map((m) => m.key), ['us1']); assert.deepEqual(regions.outside.map((m) => m.key), ['eu1'], 'other-country labs stay outside the selectors');
const exported = comparisonExport(fixture, r, 'digest');
assert.equal(exported.matched.length, r.matched.length); assert.equal(exported.filters.sameSetting, false); assert.equal(exported.method, 'matched-intersection-v1');

// ---- Real data ----
const data = JSON.parse(await readFile(new URL('public/data.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('public/data-manifest.json', root), 'utf8'));
const block = data.authority;
const real = regionalModels(block);
assert.ok(real.us.length >= 20 && real.cn.length >= 20, 'both regional selectors are populated from sourced records');
assert.ok(real.us.every((m) => m.region === 'us') && real.cn.every((m) => m.region === 'cn'));
const pair = defaultPair(block);
const expected = headToHead(block, pair.a, pair.b);
assert.ok(expected.matched.length >= 4, 'default pair has a useful matched panel');
const alt = { a: 'gpt-6-astra', b: 'kimi-k3' };
const altExpected = headToHead(block, alt.a, alt.b);
const altSame = headToHead(block, alt.a, alt.b, { domain: 'all', sameSetting: true, sourceId: 'any' });
const altMath = headToHead(block, alt.a, alt.b, { domain: 'mathematics', sameSetting: false, sourceId: 'any' });
assert.ok(altExpected.matched.length >= 4 && altMath.matched.every((row) => row.domain === 'mathematics'));
assert.equal(headToHead(block, alt.a, alt.b, { domain: 'all', sameSetting: false, sourceId: 'bfcl-v4' }).matched.length, 0, 'real all-null filter state exists');
assert.equal(decodeH2H(block, new URLSearchParams('us=kimi-k3&cn=gpt-6-astra')).a, pair.a, 'a China model cannot occupy the US selector');

const report = { defaultPair: pair, matched: expected.counts, screenshots: [], checks: [] };
await mkdir(new URL('test-results/', root), { recursive: true });
await withBuiltBrowser(async ({ page, origin, assert: check }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/us-china', { waitUntil: 'networkidle' });
  const h2h = page.getByTestId('h2h');
  await h2h.waitFor();
  const url = () => new URL(page.url()).searchParams;
  check.equal(await page.getByTestId('h2h-us').inputValue(), pair.a, 'default US selection');
  check.equal(await page.getByTestId('h2h-cn').inputValue(), pair.b, 'default China selection');
  const usOptions = await page.getByTestId('h2h-us').locator('option').evaluateAll((n) => n.map((x) => x.value));
  const cnOptions = await page.getByTestId('h2h-cn').locator('option').evaluateAll((n) => n.map((x) => x.value));
  check.deepEqual(usOptions, real.us.map((m) => m.key), 'US selector lists exactly the sourced US models');
  check.deepEqual(cnOptions, real.cn.map((m) => m.key), 'China selector lists exactly the sourced China models');
  check.match(await page.getByTestId('h2h-outside').locator('summary').innerText(), new RegExp(`\\(${real.outside.length} models\\)`), 'global/other/unknown labs retained outside selectors');
  check.match(await page.getByTestId('h2h-no-winner').innerText(), /No overall or country winner is declared/);

  // Marks, accessible values and table agree with the computed matched panel.
  const verify = async (result, label) => {
    check.equal(await page.getByTestId('h2h-matched-count').innerText(), String(result.matched.length), `${label}: matched count`);
    check.equal(await page.getByTestId('h2h-suite-row').count(), result.matched.length, `${label}: one raw dumbbell per matched row`);
    check.equal(await page.getByTestId('h2h-domain-row').count(), result.domains.length, `${label}: one domain dumbbell per domain`);
    const rows = page.locator('[data-testid="h2h-table"] tbody tr[data-row-id]');
    check.equal(await rows.count(), result.matched.length, `${label}: table mirrors matched rows`);
    for (const row of result.matched) {
      const mark = page.locator(`[data-testid="h2h-suite-row"][data-row-id="${row.id}"] svg[role="img"]`);
      check.equal(Number(await mark.getAttribute('data-a-value')), row.a.value, `${label}: US mark value ${row.id}`);
      check.equal(Number(await mark.getAttribute('data-b-value')), row.b.value, `${label}: China mark value ${row.id}`);
      check.match(await mark.getAttribute('aria-label'), new RegExp(`${pct(row.a.value).replace('.', '\\.')}.*${pct(row.b.value).replace('.', '\\.')}`), `${label}: accessible label states both values`);
      const tr = page.locator(`[data-testid="h2h-table"] tr[data-row-id="${row.id}"]`);
      check.match(await tr.locator('[data-cell="us"]').innerText(), new RegExp('^' + pct(row.a.value).replace('.', '\\.')));
      check.match(await tr.locator('[data-cell="cn"]').innerText(), new RegExp('^' + pct(row.b.value).replace('.', '\\.')));
      check.equal(await tr.locator('[data-cell="delta"]').innerText(), row.leader === 'tie' ? 'tie (±0.0 pp)' : points(row.deltaPoints), `${label}: delta ${row.id}`);
      const hrefs = await tr.locator('a[data-result-side]').evaluateAll((n) => n.map((x) => x.getAttribute('href')));
      check.deepEqual(hrefs, [row.a.resultUrl, row.b.resultUrl], `${label}: genuine result links for ${row.id}`);
    }
    for (const domain of result.domains) {
      const svg = page.locator(`[data-testid="h2h-domain-row"][data-domain="${domain.domain}"] svg[role="img"]`);
      check.ok(Math.abs(Number(await svg.getAttribute('data-a-value')) - domain.a) < 1e-12 && Math.abs(Number(await svg.getAttribute('data-b-value')) - domain.b) < 1e-12, `${label}: domain mark ${domain.domain}`);
    }
    check.match(await page.getByTestId('h2h-excluded').locator('summary').innerText(), new RegExp(`\\(${result.excluded.length}\\)`), `${label}: exclusions listed`);
    check.match(await page.getByTestId('h2h-unmatched').locator('summary').innerText(), new RegExp(`\\(${result.onlyA.length + result.onlyB.length}\\)`), `${label}: unequal coverage listed`);
  };
  await verify(expected, 'default');
  const firstMark = page.locator('[data-testid="h2h-suite-row"] circle').first();
  const cx = await firstMark.getAttribute('cx');
  await page.waitForTimeout(120);
  check.equal(await firstMark.getAttribute('cx'), cx, 'reduced motion keeps marks stable');

  // Keyboard selection of a different pair; URL persistence and reload.
  await page.getByTestId('h2h-us').focus();
  await page.getByTestId('h2h-us').selectOption(alt.a);
  await page.getByTestId('h2h-cn').selectOption(alt.b);
  await verify(altExpected, 'GPT-6 Astra vs Kimi K3');
  check.equal(url().get('us'), alt.a); check.equal(url().get('cn'), alt.b); check.equal(url().get('h2hMethod'), 'matched-intersection-v1');
  await page.getByTestId('h2h-same-setting').check();
  await verify(altSame, 'identical setting');
  check.equal(url().get('h2hSetting'), 'same', 'setting rule persisted');
  await page.reload({ waitUntil: 'networkidle' });
  await h2h.waitFor();
  check.equal(await page.getByTestId('h2h-us').inputValue(), alt.a, 'reload restores US model');
  check.equal(await page.getByTestId('h2h-same-setting').isChecked(), true, 'reload restores setting rule');
  await verify(altSame, 'reloaded');

  // Export agrees with visible rows and carries the scoring panel.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('h2h-export').click();
  const download = await downloadPromise;
  const exportedReal = JSON.parse(await readFile(await download.path(), 'utf8'));
  const visibleIds = await page.locator('[data-testid="h2h-table"] tbody tr[data-row-id]').evaluateAll((n) => n.map((x) => x.getAttribute('data-row-id')));
  check.deepEqual(exportedReal.matched.map((row) => row.id), visibleIds, 'export rows equal visible rows');
  check.deepEqual(exportedReal.filters, altSame.filters, 'export keeps filters');
  check.equal(exportedReal.method, 'matched-intersection-v1'); check.equal(exportedReal.dataDigest, manifest.projection.sha256, 'export binds the data digest');
  check.equal(exportedReal.selection.us.key, alt.a); check.equal(exportedReal.selection.cn.region, 'cn');
  for (const row of exportedReal.matched) check.equal(row.deltaPoints, (row.cn.value - row.us.value) * 100);

  // Domain panel and all-null state.
  await page.getByTestId('h2h-same-setting').uncheck();
  await page.getByTestId('h2h-domain').selectOption('mathematics');
  await verify(altMath, 'mathematics panel');
  await page.getByTestId('h2h-domain').selectOption('all');
  await page.getByTestId('h2h-source').selectOption('bfcl-v4');
  check.equal(await page.getByTestId('h2h-empty').count(), 1, 'all-null state is explicit');
  check.equal(await page.getByTestId('h2h-dumbbells').count(), 0, 'no marks without matched tests');
  check.equal(await page.getByTestId('h2h-matched-count').innerText(), '0');
  await page.getByTestId('h2h-source').selectOption('any');

  // Frontier authority ranking (mounted projection).
  const ranking = page.getByTestId('authority-rows').locator('li');
  check.equal(await ranking.count(), 10, 'frontier authority ranking shows 10 distinct models');
  await page.getByTestId('authority-cohort').selectOption('all');
  check.equal(await ranking.count(), 70, 'all 70 DeepSWE configurations are selectable');
  await page.getByTestId('authority-config').selectOption('mini_swe_agent_kimi_k3_max');
  check.equal(url().get('authorityConfig'), 'mini_swe_agent_kimi_k3_max', 'configuration selection persists');
  check.equal(await page.locator('.authority-row.selected').count(), 1);

  // Mobile layouts.
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    // Wait for the debounced parent-size measurement to settle (bounded), then assert.
    await page.waitForFunction((w) => {
      const svg = document.querySelector('[data-testid="h2h-suite-row"] svg[role="img"]');
      const r = svg?.getBoundingClientRect();
      return !!r && r.right <= w + 1 && (w > 700 || r.width > w * 0.6);
    }, width, { timeout: 5000 }).catch(() => {});
    const bounds = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    check.ok(bounds.page <= bounds.viewport, `no horizontal overflow at ${width}px: ${JSON.stringify(bounds)}`);
    const box = await page.locator('[data-testid="h2h-suite-row"] svg[role="img"]').first().boundingBox();
    check.ok(box && (width > 700 || box.width > width * 0.6) && box.x >= 0 && box.x + box.width <= width + 1, `dumbbell uses the mobile width at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await page.getByTestId('h2h').screenshot({ path: new URL('test-results/head-to-head-mobile.png', root).pathname, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(150);
  await page.getByTestId('h2h').screenshot({ path: new URL('test-results/head-to-head-desktop.png', root).pathname, animations: 'disabled' });
  report.screenshots.push('test-results/head-to-head-desktop.png', 'test-results/head-to-head-mobile.png');
  check.deepEqual(errors, [], 'no browser errors');
  report.checks = ['sourced regional selectors', 'marks = accessible labels = table values', 'accurate deltas', 'genuine result links',
    'keyboard selection', 'URL persistence and reload', 'identical-setting filter', 'domain panel', 'all-null state', 'export parity',
    'reduced motion', 'authority ranking cohort/configuration', 'mobile 360/390/768'];
}, { reducedMotion: 'reduce' });
await writeFile(new URL('test-results/head-to-head-evidence.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(`Head-to-head checks passed: default ${pair.a} vs ${pair.b} (${expected.matched.length} matched tests); ${real.us.length} US / ${real.cn.length} China selectable models; ${real.outside.length} kept outside the selectors.`);
