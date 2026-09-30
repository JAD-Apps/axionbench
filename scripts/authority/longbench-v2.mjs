// LongBench v2 official leaderboard adapter. Column headers declare percentages,
// and "w/o CoT" and "w/ CoT" are separate test conditions, never merged.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { archiveRaw, fetchBytes, replaceProjection, sha256, slug, stableRowsSha256 } from './common.mjs';

export const PAGE_URL = 'https://longbench2.github.io/';
const HEADERS = ['#', 'Model', 'Params', 'Context', 'Date', 'Overall (%)', 'Easy (%)', 'Hard (%)', 'Short (%)', 'Medium (%)', 'Long (%)'];
const entity = (text) => text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
const cellText = (html) => entity(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function tableRows(html) {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)];
  assert.equal(tables.length, 1, 'LongBench v2 page must contain exactly one leaderboard table');
  return [...tables[0][0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(([row]) =>
    [...row.matchAll(/<t([hd])([^>]*)>([\s\S]*?)<\/t\1>/gi)].map(([, , attrs, body]) => ({ attrs, html: body, text: cellText(body) })));
}
const score = (text, name) => {
  if (text === '-') return null;
  assert.match(text, /^\d+(?:\.\d+)?$/, `${name}: numeric percent cell required`);
  const value = Number(text);
  assert.ok(value >= 0 && value <= 100, `${name}: outside the declared percent scale`);
  return value;
};

export function projectLongBench(pageBytes, retrievedAt) {
  const html = pageBytes.toString('utf8');
  const updated = /Last Update:\s*(\d{4}-\d{2}-\d{2})/.exec(html);
  assert.ok(updated, 'leaderboard last-update statement missing');
  const [header, conditions, ...body] = tableRows(html);
  assert.deepEqual(header.map((cell) => cell.text), HEADERS, 'LongBench v2 headers changed; review units before ingesting');
  assert.deepEqual(conditions.map((cell) => cell.text), Array.from({ length: 6 }, () => ['', 'w/ CoT']).flat(), 'condition sub-headers changed');
  const seen = new Set();
  const rows = body.map((cells, index) => {
    assert.equal(cells.length, 17, `row ${index + 3}: unexpected cell count`);
    const modelCell = cells[1];
    // The model name is the first text node; the organization follows in its own element.
    const parts = modelCell.html.split(/<br\s*\/?>|<\/?(?:span|small|div|p)[^>]*>/i).map(cellText).filter(Boolean);
    const reasoning = modelCell.text.includes('🧠');
    const name = parts[0].replace('🧠', '').trim();
    const organization = parts.slice(1).map((part) => part.replace('🧠', '').trim()).filter(Boolean).join(' ') || null;
    const identity = `${name}|${cells[4].text}`;
    assert.ok(name && !seen.has(identity), `missing or duplicate LongBench model ${identity}`); seen.add(identity);
    return {
      model: name, modelKey: slug(name), organization, reasoningModel: reasoning,
      // The table includes human and random reference rows; they are baselines, not models.
      baseline: /^(human|random)$/i.test(name) && !organization,
      parameters: cells[2].text === '-' ? null : cells[2].text, context: cells[3].text, date: cells[4].text,
      overallWithoutCotPercent: score(cells[5].text, `${name} overall w/o CoT`),
      overallWithCotPercent: score(cells[6].text, `${name} overall w/ CoT`),
    };
  });
  assert.ok(rows.length >= 20, 'LongBench v2 leaderboard is truncated');
  // Repeated names are distinct dated snapshots; their identity keeps the date.
  const repeated = new Set(rows.map((row) => row.modelKey).filter((key, index, keys) => keys.indexOf(key) !== index));
  for (const row of rows) if (repeated.has(row.modelKey)) row.modelKey = slug(`${row.model}-${row.date}`);
  return {
    schemaVersion: 1, benchmark: 'LongBench v2', suiteId: 'longbench-v2', version: 'v2 (503 questions)', domain: 'long-context',
    familyId: 'longbench', publisher: 'LongBench team (THUDM)', provenance: 'original benchmark-authority leaderboard',
    metric: { name: 'overall accuracy', unit: 'percent', direction: 'higher', min: 0, max: 100, evidence: 'Column header “Overall (%)”.' },
    conditions: ['w/o CoT', 'w/ CoT'],
    source: { url: PAGE_URL, resultUrl: PAGE_URL, sha256: sha256(pageBytes), retrievedAt, generatedAt: updated[1],
      generatedAtBasis: 'leaderboard “Last Update” statement', httpStatus: 200 },
    rowCount: rows.length, rowsSha256: stableRowsSha256(rows), rows,
  };
}

export async function refreshLongBench({ output, auditDir, fetcher }) {
  const page = await fetchBytes(PAGE_URL, { fetcher });
  const projection = projectLongBench(page, new Date().toISOString());
  await archiveRaw(auditDir, page, 'html');
  return replaceProjection(output, projection);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [output, auditDir] = process.argv.slice(2);
  assert.ok(output && auditDir, 'usage: node scripts/authority/longbench-v2.mjs <output.json> <private-audit-dir>');
  const data = await refreshLongBench({ output, auditDir });
  console.log(JSON.stringify({ sha256: data.source.sha256, rows: data.rowCount, updated: data.source.generatedAt }));
}
