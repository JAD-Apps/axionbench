// Focused browser acceptance for the restored dataset. Route/chart acceptance is separate.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { withBuiltBrowser } from '../test-harness.mjs';
import { sha256 } from '../authority/common.mjs';
const bytes = await readFile('public/data.json');
const data = JSON.parse(bytes);
const results = [];
await withBuiltBrowser(async ({ page, newPage, origin, assert }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  assert.equal(sha256(await (await page.request.get(origin + '/data.json')).body()), sha256(bytes), 'built browser serves the exact qualified data bytes');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(origin + '/benchmarks?bridgeAxis=reasoning', { waitUntil: 'networkidle' });
    const root = page.getByTestId('bridgebench');
    await root.waitFor();
    assert.equal(await root.locator('tbody tr').count(), 27);
    assert.equal(await root.getByLabel('Rating axis').inputValue(), 'reasoning');
    assert.equal(await root.locator('tbody tr').filter({ hasText: 'Unverified:' }).count(), 8);
    assert.match(await root.innerText(), /native BridgeBench rating units/);
    const libraryPage = await newPage();
    await libraryPage.goto(origin + '/benchmark-archive', { waitUntil: 'networkidle' });
    const library = libraryPage.locator('#benchmark-bridgebench-published-ratings');
    assert.match(await library.innerText(), /270 reported, not admitted · 27 models/);
    assert.equal(await library.locator('details a').count(), 27);
    await libraryPage.close();
    for (const axis of data.bridgeBench.axes) {
      await root.getByLabel('Rating axis').selectOption(axis.id);
      assert.equal(new URL(page.url()).searchParams.get('bridgeAxis'), axis.id);
      const sol = root.locator('tbody tr').filter({ has: page.getByRole('link', { name: 'GPT-6.1 Sol', exact: true }) });
      assert.equal((await sol.locator('td').first().innerText()).trim(), String(data.bridgeBench.records.find(r => r.modelKey === 'gpt-6-1-sol').ratings[axis.id]));
    }
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByTestId('bridgebench').getByLabel('Rating axis').inputValue(), 'cost');
    const selector = page.getByTestId('bridgebench').getByLabel('Rating axis');
    await selector.focus(); assert(await selector.evaluate(el => el === document.activeElement));
    await selector.press('ArrowUp'); await selector.press('Enter');
    assert.equal(await selector.inputValue(), 'speed');
    const links = await page.getByTestId('bridgebench').locator('tbody a').evaluateAll(els => els.map(el => el.getAttribute('href')));
    assert.deepEqual(links.sort(), data.bridgeBench.records.map(r => r.resultUrl).sort());
    results.push({ width, rows: 27, axes: 10, unverifiedVisible: 8, reload: true, keyboard: true, exactResultLinks: true });
  }
  assert.deepEqual(errors, []);
});
await mkdir('test-results', { recursive: true });
await writeFile('test-results/current-bridgebench-view.json', JSON.stringify({ at: new Date().toISOString(), reducedMotion: true,
  dataSha256: sha256(bytes), bridgeSnapshot: data.bridgeBench.version, results }, null, 2) + '\n');
console.log('BridgeBench browser checks: mobile/tablet/desktop, 10 source-matched axes, keyboard selection, hard reload, 27 exact result links and visible unverified identities.');
