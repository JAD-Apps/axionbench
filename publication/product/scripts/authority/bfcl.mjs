// Berkeley Function Calling Leaderboard V4 adapter. The official overall CSV
// labels every accuracy cell with a literal percent sign; the leaderboard page
// states the version, evaluation commit and last update.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { archiveRaw, fetchBytes, parseCsv, replaceProjection, sha256, slug, stableRowsSha256 } from './common.mjs';

export const CSV_URL = 'https://gorilla.cs.berkeley.edu/data_overall.csv';
export const PAGE_URL = 'https://gorilla.cs.berkeley.edu/leaderboard.html';
const percent = (text, name) => {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(text);
  assert.ok(match, `${name}: literal percent required, got ${JSON.stringify(text)}`);
  const value = Number(match[1]);
  assert.ok(value >= 0 && value <= 100, `${name}: percent outside 0–100`);
  return value;
};

export function pageFacts(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Berkeley Function Calling Leaderboard \(BFCL\) V4/, 'leaderboard page no longer declares BFCL V4');
  const updated = /Last Updated:\s*(\d{4}-\d{2}-\d{2})/.exec(text);
  const commit = /evaluated using commit\s+([0-9a-f]{7,40})/.exec(text);
  assert.ok(updated && commit, 'leaderboard page must state its update date and evaluation commit');
  assert.match(text, /Overall Accuracy\s+is the\s+unweighted\s+average of all the sub-categories/i, 'overall metric definition changed');
  return { lastUpdated: updated[1], commit: commit[1] };
}

export function projectBfcl(csvBytes, pageBytes, retrievedAt) {
  const facts = pageFacts(pageBytes.toString('utf8'));
  const rows = parseCsv(csvBytes.toString('utf8'));
  assert.ok(rows.length >= 20, 'BFCL overall table is truncated');
  const seen = new Set();
  const projected = rows.map((row, index) => {
    assert.ok(row.Model, `row ${index + 2}: missing model`);
    assert.ok(!seen.has(row.Model), `duplicate BFCL model row ${row.Model}`); seen.add(row.Model);
    const mode = /\((FC(?: thinking)?|Prompt(?: \+ Thinking)?)\)\s*$/.exec(row.Model)?.[1] ?? null;
    const base = row.Model.replace(/\s*\([^)]*\)\s*$/, '');
    return {
      rank: Number(row.Rank), model: row.Model, modelKey: slug(base), mode,
      overallPercent: percent(row['Overall Acc'], `${row.Model} overall`),
      organization: row.Organization || null, licence: row.License || null,
      modelLink: /^https:\/\//.test(row['Model Link']) ? row['Model Link'] : null,
    };
  });
  return {
    schemaVersion: 1, benchmark: 'Berkeley Function Calling Leaderboard', suiteId: 'bfcl-v4', version: 'V4', domain: 'tool-use',
    familyId: 'bfcl', publisher: 'Gorilla LLM team, UC Berkeley', provenance: 'original benchmark-authority measurement',
    metric: { name: 'overall accuracy (unweighted mean of sub-categories)', unit: 'percent', direction: 'higher', min: 0, max: 100,
      evidence: 'Every Overall Acc cell carries a literal % sign in the official CSV; the page defines Overall Accuracy.' },
    evaluationCommit: facts.commit,
    source: { url: CSV_URL, resultUrl: PAGE_URL, sha256: sha256(csvBytes), pageSha256: sha256(pageBytes), retrievedAt,
      generatedAt: facts.lastUpdated, generatedAtBasis: 'leaderboard page “Last Updated” date', httpStatus: 200 },
    rowCount: projected.length, rowsSha256: stableRowsSha256(projected), rows: projected,
  };
}

export async function refreshBfcl({ output, auditDir, fetcher }) {
  const [csv, page] = [await fetchBytes(CSV_URL, { fetcher }), await fetchBytes(PAGE_URL, { fetcher })];
  const projection = projectBfcl(csv, page, new Date().toISOString());
  await archiveRaw(auditDir, csv, 'csv');
  await archiveRaw(auditDir, page, 'html');
  return replaceProjection(output, projection);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [output, auditDir] = process.argv.slice(2);
  assert.ok(output && auditDir, 'usage: node scripts/authority/bfcl.mjs <output.json> <private-audit-dir>');
  const data = await refreshBfcl({ output, auditDir });
  console.log(JSON.stringify({ sha256: data.source.sha256, rows: data.rowCount, updated: data.source.generatedAt }));
}
