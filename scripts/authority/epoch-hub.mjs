// Epoch AI Benchmarking Hub adapter (CC BY 4.0). Only benchmarks that Epoch runs
// itself are projected here; its "_external" files transcribe other leaderboards and
// are not treated as independent measurements.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { archiveRaw, fetchBytes, parseCsv, readZip, replaceProjection, sha256, slug, stableRowsSha256 } from './common.mjs';

export const ARCHIVE_URL = 'https://epoch.ai/data/benchmark_data.zip';
export const HUB_URL = 'https://epoch.ai/benchmarks';
export const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';
export const SCORE_COLUMN = 'Best score (across scorers)';
export const SETTING = /^(none|minimal|low|medium|high|xhigh|max|promax|\d+K)$/;

export const BENCHMARKS = [
  { benchmark: 'GPQA diamond', file: 'gpqa_diamond.csv', suiteId: 'gpqa-diamond', name: 'GPQA Diamond', version: 'Diamond', domain: 'reasoning', familyId: 'gpqa-diamond', page: 'https://epoch.ai/benchmarks/gpqa-diamond' },
  { benchmark: 'FrontierMath-Tiers-1-3-v2-Private', file: 'frontiermath_tiers_1_3_v2.csv', suiteId: 'frontiermath-tiers-1-3-v2', name: 'FrontierMath Tiers 1–3', version: 'v2 private set', domain: 'mathematics', familyId: 'frontiermath', page: 'https://epoch.ai/benchmarks/frontiermath-tiers-1-3-v2' },
  { benchmark: 'FrontierMath-Tier-4-v2-Private', file: 'frontiermath_tier_4_v2.csv', suiteId: 'frontiermath-tier-4-v2', name: 'FrontierMath Tier 4', version: 'v2 private set', domain: 'mathematics', familyId: 'frontiermath', page: 'https://epoch.ai/benchmarks/frontiermath-tier-4-v2' },
  { benchmark: 'OTIS Mock AIME 2024-2025', file: 'otis_mock_aime_2024_2025.csv', suiteId: 'otis-mock-aime-2024-2025', name: 'OTIS Mock AIME', version: '2024–2025', domain: 'mathematics', familyId: 'otis-mock-aime', page: 'https://epoch.ai/benchmarks/otis-mock-aime-2024-2025' },
  { benchmark: 'MATH level 5', file: 'math_level_5.csv', suiteId: 'math-level-5', name: 'MATH Level 5', version: 'Level 5 subset', domain: 'mathematics', familyId: 'math', page: 'https://epoch.ai/benchmarks/math-level-5' },
  { benchmark: 'SimpleQA Verified', file: 'simpleqa_verified.csv', suiteId: 'simpleqa-verified', name: 'SimpleQA Verified', version: 'Google verified set', domain: 'factuality', familyId: 'simpleqa', page: 'https://epoch.ai/benchmarks/simple-qa-verified' },
  { benchmark: 'SWE-Bench verified', file: 'swe_bench_verified.csv', suiteId: 'swebench-verified', name: 'SWE-bench Verified', version: 'Verified (Epoch AI run)', domain: 'coding', familyId: 'swe-bench', page: 'https://epoch.ai/benchmarks/swe-bench-verified' },
];

const finite = (text, name) => {
  const value = Number(text);
  assert.ok(text !== '' && Number.isFinite(value), `${name}: finite number required, got ${JSON.stringify(text)}`);
  return value;
};
const httpsOrNull = (value, host) => {
  if (!value) return null;
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', 'log viewer URL must be HTTPS');
  assert.equal(url.hostname, host, `unexpected log host ${url.hostname}`);
  return url.href;
};

export function splitModelVersion(version) {
  const index = version.lastIndexOf('_');
  const suffix = index > 0 ? version.slice(index + 1) : null;
  if (suffix && SETTING.test(suffix)) return { base: version.slice(0, index), setting: suffix };
  return { base: version, setting: null };
}

export function projectEpoch(zipBytes, retrievedAt) {
  const files = readZip(zipBytes);
  const text = (name) => { assert.ok(files.has(name), `Epoch export lacks ${name}`); return files.get(name).toString('utf8'); };
  assert.match(text('README.md'), /Creative Commons Attribution license/, 'Epoch export must retain its CC BY licence statement');
  const metadata = new Map(parseCsv(text('benchmark_metadata.csv')).map((row) => [row.benchmark, row]));
  const models = parseCsv(text('model_metadata.csv')).filter((row) => row.model_version);
  const displayNames = new Map(models.map((row) => [row.model_version, row.display_name || null]));
  const benchmarks = BENCHMARKS.map((spec) => {
    const meta = metadata.get(spec.benchmark);
    assert.ok(meta, `benchmark metadata missing for ${spec.benchmark}`);
    assert.equal(meta.source_file, spec.file, `${spec.benchmark}: metadata names another source file`);
    assert.equal(meta.score_column, SCORE_COLUMN, `${spec.benchmark}: reviewed score column changed`);
    assert.equal(Number(meta.scale), 1, `${spec.benchmark}: documented scale is no longer a 0–1 fraction`);
    const ceiling = finite(meta.score_ceiling, 'score ceiling');
    const rows = parseCsv(text(spec.file));
    assert.ok(rows.length > 0, `${spec.benchmark}: no rows`);
    const ids = new Set();
    const projected = rows.map((row) => {
      assert.ok(row.id && !ids.has(row.id), `${spec.benchmark}: missing or duplicate run id ${row.id}`); ids.add(row.id);
      assert.ok(row['Model version'], `${spec.benchmark}: missing model version`);
      const value = finite(row[SCORE_COLUMN], `${spec.benchmark} ${row.id} score`);
      assert.ok(value >= 0 && value <= Math.max(1, ceiling), `${spec.benchmark} ${row.id}: score outside documented 0–1 scale`);
      const stderr = row.stderr === '' ? null : finite(row.stderr, 'stderr');
      assert.ok(stderr === null || stderr >= 0, 'stderr must be nonnegative');
      const { base, setting } = splitModelVersion(row['Model version']);
      return {
        runId: row.id, modelVersion: row['Model version'], modelKey: slug(base), setting,
        displayName: displayNames.get(row['Model version']) ?? displayNames.get(base) ?? null,
        value, meanScore: row.mean_score === '' ? null : finite(row.mean_score, 'mean score'), stderr,
        releaseDate: row['Release date'] || null, organization: row.Organization || null, country: row.Country || null,
        startedAt: row['Started at'] || null, logViewerUrl: httpsOrNull(row['Log viewer'], 'logs.epoch.ai'),
      };
    });
    return {
      ...spec, sourceFile: spec.file, sourceFileSha256: sha256(files.get(spec.file)), rowCount: projected.length,
      scale: 1, scoreColumn: SCORE_COLUMN, scoreCeiling: ceiling, randomBaseline: finite(meta.random_baseline, 'random baseline'),
      unit: { status: 'documented', label: 'fraction', evidence: `Epoch benchmark_metadata.csv: score_column "${SCORE_COLUMN}", scale 1.0` },
      rowsSha256: stableRowsSha256(projected), rows: projected,
    };
  });
  const organizations = new Map();
  for (const row of models) {
    if (!row.organization) continue;
    if (!organizations.has(row.organization)) organizations.set(row.organization, new Set());
    organizations.get(row.organization).add(row.country || '');
  }
  // Organization/country attribution by exact model key from every Epoch file,
  // including transcribed leaderboards. Used only for lab attribution, never scores.
  const attributions = new Map();
  const attribute = (version, organization, country, file) => {
    if (!version || !organization) return;
    const key = slug(splitModelVersion(version).base);
    const entry = attributions.get(key) ?? { modelKey: key, organizations: new Set(), countries: new Set(), files: new Set() };
    entry.organizations.add(organization); entry.countries.add(country || ''); entry.files.add(file);
    attributions.set(key, entry);
  };
  for (const row of models) attribute(row.model_version, row.organization, row.country, 'model_metadata.csv');
  for (const [name, bytes] of files) {
    if (!name.endsWith('.csv') || name.includes('/') || name === 'model_metadata.csv' || name === 'benchmark_metadata.csv') continue;
    for (const row of parseCsv(bytes.toString('utf8'))) attribute(row['Model version'], row.Organization, row.Country, name);
  }
  // The export has no generation stamp; its latest projected evaluation start orders refreshes.
  const latestRun = benchmarks.flatMap((b) => b.rows.map((row) => row.startedAt)).filter(Boolean).sort().at(-1) ?? null;
  return {
    schemaVersion: 1, publisher: 'Epoch AI', provenance: 'independent evaluator measurement',
    licence: { name: 'CC BY 4.0', url: LICENCE_URL, attribution: 'Epoch AI, ‘Capabilities & benchmarking’, epoch.ai/benchmarks' },
    source: { url: ARCHIVE_URL, hubUrl: HUB_URL, sha256: sha256(zipBytes), bytes: zipBytes.length, retrievedAt, generatedAt: latestRun, generatedAtBasis: 'latest projected evaluation start time', httpStatus: 200 },
    countryDefinition: 'Country of the developer organization as recorded in Epoch AI model and benchmark metadata.',
    organizations: [...organizations].map(([organization, countries]) => ({ organization, countries: [...countries].sort() }))
      .sort((a, b) => a.organization.localeCompare(b.organization)),
    modelAttributions: [...attributions.values()].map((entry) => ({
      modelKey: entry.modelKey, organizations: [...entry.organizations].sort(), countries: [...entry.countries].sort(), files: [...entry.files].sort(),
    })).sort((a, b) => a.modelKey.localeCompare(b.modelKey)),
    benchmarks,
  };
}

export async function refreshEpoch({ output, auditDir, fetcher }) {
  const bytes = await fetchBytes(ARCHIVE_URL, { fetcher });
  const projection = projectEpoch(bytes, new Date().toISOString());
  await archiveRaw(auditDir, bytes, 'zip');
  return replaceProjection(output, projection);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [output, auditDir] = process.argv.slice(2);
  assert.ok(output && auditDir, 'usage: node scripts/authority/epoch-hub.mjs <output.json> <private-audit-dir>');
  const data = await refreshEpoch({ output, auditDir });
  console.log(JSON.stringify({ sha256: data.source.sha256, benchmarks: data.benchmarks.map((b) => [b.suiteId, b.rowCount]) }));
}
