// Visual and interaction acceptance for the built site in real Chromium.
// Captures viewport screenshots of every chapter at 320/390/768/1440/1920 and
// asserts layout, readable marks, contrast, keyboard/touch operation, combined
// deep links, motion and reduced motion, data failure states, exports, result
// links, performance and console cleanliness. Screenshots and the JSON report
// are written to test-results/acceptance/ (ignored); nothing external changes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { withBuiltBrowser } from './test-harness.mjs';

const root = new URL('../', import.meta.url);
const out = new URL('test-results/acceptance/', root);
const build = spawnSync('npm', ['run', 'build'], { cwd: root.pathname, stdio: 'inherit' });
if (build.error) throw build.error;
assert.equal(build.status, 0, 'production build succeeds before acceptance checks');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const data = JSON.parse(await readFile(new URL('public/data.json', root), 'utf8'));
const knownResultUrls = new Set([
  ...data.observations.map((row) => row.resultUrl),
  ...(data.authority?.observations ?? []).map((row) => row.resultUrl),
].filter(Boolean));

const WIDTHS = [320, 390, 768, 1440, 1920];
const CHAPTERS = [['hero', '.hero', '/'], ['benchmarks', '#frontier', '/benchmarks'], ['paired', '#paired', '/us-china'], ['open-weights', '#open-weights', '/open-weights'],
  ['models', '#models', '/models'], ['methods', '#methods', '/methods'], ['frontier', '[data-testid=authority-ranking]', '/rankings']];
const report = { widths: WIDTHS, screenshots: [], checks: [], timings: {}, failures: [] };
const pass = (name, detail = '') => { report.checks.push({ name, detail }); console.log(`ok  ${name}${detail ? ` — ${detail}` : ''}`); };

// Soft collection keeps every width's evidence, then fails with all problems.
function expect(condition, message) { if (!condition) report.failures.push(message); return condition; }

function watch(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', (request) => {
    if (!request.url().startsWith('blob:')) errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`);
  });
  return errors;
}

async function ready(page) {
  const route = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
  const testId = { '/': 'home-comparison', '/rankings': 'authority-ranking', '/benchmarks': 'bridgebench', '/us-china': 'h2h', '/open-weights': 'ow', '/models': 'catalogue', '/methods': 'methodology' }[route];
  assert(testId, 'acceptance must identify its route');
  await page.getByTestId(testId).waitFor();
  if (route === '/rankings') await page.waitForSelector('[data-testid=authority-rows] rect[data-mark=value]');
  await page.evaluate(() => document.fonts.ready);
}

// Every rendered, non-decorative element stays inside the viewport unless an
// ancestor deliberately scrolls or clips it (tables, the matrix).
const overflowProbe = () => {
  const limit = document.documentElement.clientWidth + 1;
  const clipped = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) return true;
    }
    return false;
  };
  const offenders = [];
  for (const element of document.querySelectorAll('main *')) {
    if (element.closest('[aria-hidden=true], .sr-only, svg')) continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    if ((rect.right > limit || rect.left < -1) && !clipped(element)) {
      offenders.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} "${(element.textContent ?? '').trim().slice(0, 40)}" ${Math.round(rect.left)}–${Math.round(rect.right)}`);
      if (offenders.length > 8) break;
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, width: document.documentElement.clientWidth, offenders };
};

// WCAG relative-luminance contrast for text with its own text node, against the
// first opaque ancestor background. Transparent/absent backgrounds use body.
const contrastProbe = (selector) => {
  const parse = (value) => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean); return [Number(r), Number(g), Number(b), Number(a)]; };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const background = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color && color[3] >= 0.95) return color;
    }
    return parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1];
  };
  const blend = (fg, bg) => fg[3] >= 1 ? fg : [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const failures = [];
  let checked = 0;
  for (const element of document.querySelectorAll(selector)) {
    if (element.closest('[aria-hidden=true], svg, option, .sr-only, [hidden]')) continue;
    const own = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
    if (!own) continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || Number(style.opacity) < 0.1) continue;
    const disabled = element.closest('button:disabled, [aria-disabled=true]');
    if (disabled) continue;
    const bg = background(element);
    const fg = blend(parse(style.color), bg);
    const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    checked++;
    if (ratio < (large ? 3 : 4.5)) failures.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} "${element.textContent.trim().slice(0, 36)}" ${ratio.toFixed(2)}:1 (${style.color} on rgb(${bg.slice(0, 3).join(',')}))`);
  }
  return { checked, failures: [...new Set(failures)], pairs: [...new Set(failures.map((item) => item.match(/[\d.]+:1 \(.*\)$/)[0]))] };
};

await withBuiltBrowser(async ({ page, newPage, origin }) => {
  // ---- 1. Responsive capture, overflow, marks, targets and contrast per width ----
  for (const width of WIDTHS) {
    const errors = watch(page);
    await page.setViewportSize({ width, height: width >= 1000 ? 1000 : width >= 700 ? 1024 : 844 });
    const started = Date.now();
    await page.goto(origin + '/', { waitUntil: 'load' });
    await ready(page);
    report.timings[`chaptersReady@${width}`] = Date.now() - started;
    await page.waitForTimeout(400);

    const layout = await page.evaluate(overflowProbe);
    expect(layout.scrollWidth <= layout.width, `${width}px: page scrolls horizontally (${layout.scrollWidth} > ${layout.width})`);
    expect(layout.offenders.length === 0, `${width}px: elements escape the viewport: ${layout.offenders.join('; ')}`);

    // Every page remains reachable when keyboard focus scrolls the compact rail.
    for (const link of await page.locator('.topbar nav a').all()) {
      await link.focus();
      expect(await link.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }), `${width}px: focused navigation link is clipped`);
    }
    // A wrapped (taller) top bar must not cover the start of a chapter reached by an anchor link.
    const anchor = await page.evaluate(() => ({ bar: document.querySelector('.topbar').getBoundingClientRect().height, padding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) }));
    expect(anchor.padding >= anchor.bar, `${width}px: scroll-padding-top ${anchor.padding}px is smaller than the ${anchor.bar}px sticky top bar, so anchor targets are covered`);

    // Dense tables scroll inside their container instead of crushing columns until words break mid-word.
    const crushed = await page.evaluate(() => {
      const probe = document.createElement('canvas').getContext('2d');
      const out = [];
      for (const cell of document.querySelectorAll('.table-scroll tbody :is(td,th)')) {
        if (!cell.getClientRects().length) continue;
        const style = getComputedStyle(cell);
        const inner = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        for (const node of cell.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE && !(node instanceof HTMLElement && node.matches('small') && !node.children.length)) continue;
          const font = getComputedStyle(node.nodeType === Node.TEXT_NODE ? cell : node);
          probe.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
          for (const word of node.textContent.split(/[\s/·-]+/)) {
            if (word.length >= 6 && word.length <= 14 && probe.measureText(word).width > inner + 1) out.push(`"${word}" in ${cell.closest('table').dataset.testid ?? 'table'} (${Math.round(inner)}px column)`);
          }
        }
      }
      return [...new Set(out)].slice(0, 6);
    });
    expect(crushed.length === 0, `${width}px: table columns too narrow for a single word: ${crushed.join('; ')}`);

    for (const [name, selector, routePath] of CHAPTERS) {
      await page.goto(origin + routePath, { waitUntil: 'networkidle' }); await ready(page);
      const routeLayout = await page.evaluate(overflowProbe);
      expect(routeLayout.scrollWidth <= routeLayout.width && routeLayout.offenders.length === 0, `${width}px ${routePath}: route overflow ${JSON.stringify(routeLayout)}`);
      if (width === 390 || width === 1440) { const routeContrast = await page.evaluate(contrastProbe, 'header *, main *, footer *'); expect(routeContrast.failures.length === 0, `${width}px ${routePath}: contrast failures ${routeContrast.failures.slice(0,8).join('; ')}`); }
      // Park each chapter just below the sticky top bar, as a visitor sees it (the hero then sits at scroll 0).
      await page.$eval(selector, (element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - document.querySelector('.topbar').getBoundingClientRect().height));
      await page.waitForTimeout(250);
      const path = `${width}-${name}.jpg`;
      await page.screenshot({ path: new URL(path, out).pathname, type: 'jpeg', quality: 78 });
      report.screenshots.push(path);
    }

    // Ranking marks: bar length encodes the value from zero and value labels
    // never sit on the interval whisker or leave the plot.
    const marks = await page.$$eval('[data-testid=authority-rows] svg', (svgs) => svgs.map((svg) => {
      const rect = svg.querySelector('rect[data-mark=value]'); const text = svg.querySelector('.bar-value'); const whisker = svg.querySelector('.interval-whisker');
      const plot = Number(svg.getAttribute('width')) - 56;
      const box = text.getBBox();
      return { value: Number(svg.dataset.value), width: rect.getBBox().width, plot, label: { x: box.x, width: box.width }, whiskerEnd: whisker ? Number(whisker.getAttribute('x2')) : null, svgWidth: Number(svg.getAttribute('width')) };
    }));
    expect(marks.length >= 8 && marks.length <= 12, `${width}px: frontier ranking shows ${marks.length} rows, expected 8–12`);
    for (const mark of marks) {
      expect(Math.abs(mark.width - mark.value * mark.plot) < 1, `${width}px: bar ${mark.width.toFixed(1)}px does not encode ${mark.value} on a ${mark.plot}px zero-based scale`);
      if (mark.whiskerEnd !== null) expect(mark.label.x >= mark.whiskerEnd, `${width}px: value label overlaps its interval whisker`);
      expect(mark.label.x + mark.label.width <= mark.svgWidth + 1, `${width}px: value label clipped at the plot edge`);
    }

    // Touch-sized controls on narrow screens (WCAG 2.2 target size, 24 px).
    if (width <= 390) {
      const small = await page.$$eval('main button, main select, main input, main summary', (items) => items.filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !item.closest('[hidden], details:not([open]) > :not(summary)') && (rect.height < 24 || rect.width < 24);
      }).map((item) => `${item.tagName.toLowerCase()} "${(item.textContent || item.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(item.getBoundingClientRect().width)}×${Math.round(item.getBoundingClientRect().height)}`));
      expect(small.length === 0, `${width}px: controls below 24 px: ${[...new Set(small)].slice(0, 8).join('; ')}`);
    }

    if (width === 390 || width === 1440) {
      const contrast = await page.evaluate(contrastProbe, 'header *, main *, footer *');
      expect(contrast.failures.length === 0, `${width}px: ${contrast.failures.length} text contrast failures across ${contrast.pairs.length} colour pairs: ${contrast.pairs.join('; ')}; e.g. ${contrast.failures.slice(0, 4).join('; ')}`);
      report.checks.push({ name: `contrast@${width}`, detail: `${contrast.checked} text elements checked` });
    }
    expect(errors.length === 0, `${width}px: runtime errors: ${errors.join(' | ')}`);
    page.removeAllListeners('console'); page.removeAllListeners('pageerror'); page.removeAllListeners('requestfailed');
    pass(`responsive ${width}px`, `${report.timings[`chaptersReady@${width}`]} ms to chapters; ${marks.length} ranking marks`);
  }

  // ---- 2. Keyboard: skip link, visible focus, select operation ----
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/rankings', { waitUntil: 'load' });
  await ready(page);
  await page.bringToFront();
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.activeElement?.classList.contains('skip-link') && document.activeElement.getBoundingClientRect().top >= 0, null, { timeout: 3000 }).catch(() => {});
  const skip = await page.evaluate(() => ({ text: document.activeElement?.textContent, href: document.activeElement?.getAttribute('href'), outline: getComputedStyle(document.activeElement).outlineWidth, top: document.activeElement.getBoundingClientRect().top }));
  expect(skip.href === '#main-content' && /skip/i.test(skip.text ?? ''), `first Tab stop is not the skip link (${skip.text})`);
  expect(skip.top >= 0 && parseFloat(skip.outline) >= 2, `skip link is not visibly focused on screen (top ${skip.top}, outline ${skip.outline})`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#main-content');
  const panel = page.getByTestId('authority-panel');
  await panel.focus();
  const focusRing = await panel.evaluate((element) => getComputedStyle(element).outlineWidth);
  expect(parseFloat(focusRing) >= 2, 'keyboard focus on the benchmark panel has no visible outline');
  const before = await page.$$eval('[data-testid=authority-rows] li', (rows) => rows.map((row) => row.dataset.modelKey).join());
  const panelBefore = await panel.inputValue();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction((previous) => new URL(location.href).searchParams.get('authority') !== previous, panelBefore);
  const after = await page.$$eval('[data-testid=authority-rows] li', (rows) => rows.map((row) => row.dataset.modelKey).join());
  expect(before !== after || (await panel.inputValue()) !== panelBefore, 'keyboard change of the benchmark panel did not update the ranking');
  pass('keyboard', 'skip link, visible focus, arrow-key panel change updates rows and URL');

  // ---- 3. Each page owns a separate share link; roundtrip every control set. ----
  await page.getByTestId('authority-cohort').selectOption('all');
  const sharedPages = [{ path: '/rankings', url: page.url(), testId: 'authority-cohort', value: 'all', keys: ['authority', 'authorityCohort'] }];
  await page.goto(origin + '/us-china', { waitUntil: 'networkidle' }); await ready(page);
  const cnOptions = await page.getByTestId('h2h-cn').locator('option').evaluateAll(items => items.map(item => item.value));
  const cnPick = cnOptions.at(-1); await page.getByTestId('h2h-cn').selectOption(cnPick);
  await page.waitForFunction(value => new URL(location.href).searchParams.get('cn') === value, cnPick);
  sharedPages.push({ path: '/us-china', url: page.url(), testId: 'h2h-cn', value: cnPick, keys: ['us','cn'] });
  await page.goto(origin + '/open-weights', { waitUntil: 'networkidle' }); await ready(page);
  await page.locator('.band-tabs button[data-band]').nth(1).click();
  const band = await page.locator('.band-tabs button[aria-pressed=true]').getAttribute('data-band');
  await page.waitForFunction(value => new URL(location.href).searchParams.get('owBand') === value, band);
  const owTotal = await page.getByTestId('ow-total').textContent();
  sharedPages.push({ path: '/open-weights', url: page.url(), band, keys: ['owBand'] });
  await page.goto(origin + '/models', { waitUntil: 'networkidle' }); await ready(page);
  await page.getByTestId('cat-query').fill('llama'); await page.waitForFunction(() => new URL(location.href).searchParams.get('catQ') === 'llama');
  const catTotal = await page.getByTestId('cat-total').textContent();
  sharedPages.push({ path: '/models', url: page.url(), testId: 'cat-query', value: 'llama', keys: ['catQ'] });
  for (const saved of sharedPages) {
    for (const key of saved.keys) expect(new URL(saved.url).searchParams.has(key), `${saved.path} lost share key ${key}`);
    const reopened = await newPage(); const reopenErrors = watch(reopened); await reopened.goto(saved.url, { waitUntil: 'networkidle' }); await ready(reopened);
    if (saved.testId) expect(await reopened.getByTestId(saved.testId).inputValue() === saved.value, `${saved.path} share roundtrip differs`);
    else expect(await reopened.locator('.band-tabs button[aria-pressed=true]').getAttribute('data-band') === saved.band, 'open-weight share roundtrip differs');
    expect(reopenErrors.length === 0, `${saved.path} roundtrip runtime errors: ${reopenErrors.join(' | ')}`); await reopened.close();
  }
  const original = { owTotal, catTotal };
  pass('deep-link roundtrip', 'separate ranking, US–China, open-weight and catalogue URLs restore their controls');

  // ---- 4. Exports agree with visible counts ----
  const download = async (testId) => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
    return JSON.parse(await readFile(await file.path(), 'utf8'));
  };
  await page.goto(sharedPages.find(row => row.path === '/open-weights').url, { waitUntil: 'networkidle' }); await ready(page);
  const owExport = await download('ow-export');
  const owRows = owExport.rows ?? owExport.entries ?? owExport.models;
  expect(Array.isArray(owRows) && owRows.length === Number(original.owTotal), `open-weight export has ${owRows?.length} rows, page shows ${original.owTotal}`);
  await page.goto(sharedPages.find(row => row.path === '/models').url, { waitUntil: 'networkidle' }); await ready(page);
  const catExport = await download('cat-export-json');
  const catRows = catExport.rows ?? catExport.models;
  expect(Array.isArray(catRows) && catRows.length === Number(original.catTotal.replace(/\D/g, '')), `catalogue export has ${catRows?.length} rows, page shows ${original.catTotal}`);
  await page.goto(sharedPages.find(row => row.path === '/us-china').url, { waitUntil: 'networkidle' }); await ready(page);
  const h2hExport = await download('h2h-export');
  expect(JSON.stringify(h2hExport).includes(cnPick), 'head-to-head export does not name the selected China lab model');
  pass('exports', `open weights ${owRows?.length}, catalogue ${catRows?.length}, head-to-head bound to ${cnPick}`);

  await page.goto(origin + '/rankings', { waitUntil: 'networkidle' }); await ready(page);
  // ---- 5. Result links are genuine captured HTTPS results ----
  const links = await page.$$eval('[data-testid=authority-rows] a, [data-testid=authority-table] a', (items) => items.map((item) => item.href));
  expect(links.length > 0, 'no ranking result links rendered');
  for (const href of links) expect(href.startsWith('https://') && knownResultUrls.has(href), `result link is not a captured original result: ${href}`);
  const external = await page.$$eval('main a[target=_blank]', (items) => items.filter((item) => !/noreferrer|noopener/.test(item.rel)).map((item) => item.href));
  expect(external.length === 0, `external links without rel=noreferrer: ${external.slice(0, 5).join(', ')}`);
  pass('result links', `${links.length} ranking links match captured result URLs`);

  // ---- 6. Invalid, missing and conflicting data fail closed with a message ----
  for (const [label, handler] of [
    ['invalid JSON', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":' })],
    ['missing data', (route) => route.fulfill({ status: 404, body: 'not found' })],
    ['conflicting digest', async (route) => { const response = await route.fetch(); const body = await response.text(); route.fulfill({ response, body: body.replace(/"sourceDigest":"[a-f0-9]{8}/, '"sourceDigest":"00000000') }); }],
  ]) {
    const broken = await newPage();
    const brokenErrors = [];
    broken.on('pageerror', (error) => brokenErrors.push(error.message));
    await broken.route('**/data.json*', handler);
    await broken.goto(origin + '/', { waitUntil: 'load' });
    const alert = broken.getByRole('alert').filter({ hasText: 'Evidence snapshot unavailable' });
    await alert.waitFor({ timeout: 15000 });
    expect(await broken.locator('#intelligence-surface').count() === 1, `${label}: preserved hero disappeared`);
    expect(await broken.locator('[data-testid=authority-rows]').count() === 0, `${label}: charts rendered from unverified data`);
    expect(brokenErrors.length === 0, `${label}: uncaught page errors ${brokenErrors.join(' | ')}`);
    await broken.close();
  }
  pass('data failure states', 'invalid JSON, HTTP 404 and digest conflict each fail closed with an alert and keep the hero');
}, { reducedMotion: 'reduce' });

// ---- 7. Motion: ranking transitions animate; reduced motion renders final marks ----
await withBuiltBrowser(async ({ page, origin }) => {
  const errors = watch(page);
  await page.goto(origin + '/rankings', { waitUntil: 'load' });
  await ready(page);
  await page.getByTestId('authority-rows').scrollIntoViewIfNeeded();
  const current = await page.getByTestId('authority-panel').inputValue();
  const options = (await page.getByTestId('authority-panel').locator('option').evaluateAll((items) => items.map((item) => item.value))).filter((value) => value !== current);
  const samples = await page.evaluate(async (next) => {
    const select = document.querySelector('[data-testid=authority-panel]');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, next); select.dispatchEvent(new Event('change', { bubbles: true }));
    const seen = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) {
      await new Promise(requestAnimationFrame);
      const g = document.querySelector('[data-testid=authority-rows] rect[data-mark=value]')?.parentElement;
      if (g) seen.push([Math.round(performance.now() - t0), new DOMMatrix(getComputedStyle(g).transform).a, getComputedStyle(g).transformOrigin]);
    }
    return seen;
  }, options[0]);
  const partial = samples.filter(([, scale]) => scale > 0.01 && scale < 0.99);
  expect(partial.length > 0, 'ranking bars did not animate when the panel changed');
  // Bars grow from the zero baseline, never from their centre.
  expect(partial.every(([, , origin]) => origin.startsWith('0px')), `ranking bars do not grow from the zero baseline (origin ${partial[0]?.[2]})`);
  const settled = samples.at(-1)?.[1];
  expect(Math.abs(settled - 1) < 0.001, `ranking animation did not settle at full length (${settled})`);
  const lastPartial = partial.at(-1)?.[0] ?? 0;
  expect(lastPartial <= 800, `ranking animation still moving after ${lastPartial} ms (explanatory motion should stay near 250–500 ms plus stagger)`);
  report.timings.rankingAnimationMs = lastPartial;
  expect(errors.length === 0, `motion run errors: ${errors.join(' | ')}`);
  pass('motion', `bars animate for ~${lastPartial} ms and settle at full length`);
}, { reducedMotion: 'no-preference' });

await withBuiltBrowser(async ({ page, origin }) => {
  await page.goto(origin + '/rankings', { waitUntil: 'load' });
  await ready(page);
  const scales = await page.evaluate(async () => {
    const select = document.querySelector('[data-testid=authority-panel]');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, [...select.options].find((option) => option.value !== select.value).value); select.dispatchEvent(new Event('change', { bubbles: true }));
    const seen = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(requestAnimationFrame);
      for (const rect of document.querySelectorAll('[data-testid=authority-rows] rect[data-mark=value]')) seen.push(new DOMMatrix(getComputedStyle(rect.parentElement).transform).a);
    }
    return seen;
  });
  expect(scales.length > 0 && scales.every((scale) => Math.abs(scale - 1) < 0.001), 'reduced motion still shows partially drawn bars');
  pass('reduced motion', `${scales.length} sampled marks all drawn at final length`);
}, { reducedMotion: 'reduce' });

// ---- 8. Touch: taps operate band tabs, head-to-head and catalogue paging ----
await withBuiltBrowser(async ({ page, origin }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = watch(page);
  await page.goto(origin + '/open-weights', { waitUntil: 'load' });
  await ready(page);
  const tab = page.locator('.band-tabs button[data-band]').nth(2);
  await tab.scrollIntoViewIfNeeded();
  await tab.tap();
  expect(await tab.getAttribute('aria-pressed') === 'true', 'tapping a parameter band did not select it');
  await page.goto(origin + '/models', { waitUntil: 'networkidle' }); await ready(page);
  const next = page.getByTestId('cat-next');
  await next.scrollIntoViewIfNeeded();
  const pageBefore = await page.getByTestId('cat-page').textContent();
  await next.tap();
  expect((await page.getByTestId('cat-page').textContent()) !== pageBefore, 'tapping catalogue Next did not page');
  const row = page.getByTestId('cat-row').first();
  const opener = row.locator('button, a').first();
  await opener.scrollIntoViewIfNeeded();
  await opener.tap();
  await page.getByTestId('model-detail').waitFor({ timeout: 5000 });
  expect(errors.length === 0, `touch run errors: ${errors.join(' | ')}`);
  pass('touch', 'band tab, catalogue paging and model detail operate by tap');
}, { reducedMotion: 'reduce', hasTouch: true });

report.passed = report.failures.length === 0;
await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
if (report.failures.length) {
  console.error(`\nAcceptance failed with ${report.failures.length} problem(s):`);
  for (const failure of report.failures) console.error(` - ${failure}`);
  console.error(`Screenshots and report: test-results/acceptance/`);
  process.exit(1);
}
console.log(`Acceptance passed: ${report.checks.length} checks, ${report.screenshots.length} screenshots in test-results/acceptance/.`);
