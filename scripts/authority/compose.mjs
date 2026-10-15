// Compose validated original-source projections into the public authority block.
// This is the admission gate: every source is re-validated from its committed
// factual projection, units must be documented by the source, provenance is kept
// per observation, and only single-country Epoch organization records assign regions.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha256, slug, stableRowsSha256 } from './common.mjs';

export const CAPABILITY_DOMAINS = ['coding', 'reasoning', 'mathematics', 'knowledge', 'instruction-following', 'long-context', 'tool-use', 'agents', 'vision-documents', 'factuality', 'multilingual'];
export const SEPARATE_PANELS = ['professional', 'safety', 'preference', 'audio-video'];
export const FLOOR = { suites: 15, domains: 8 };
export const ADMITTED_PROVENANCE = ['benchmark-authority', 'independent-evaluator', 'publisher-own'];
export const FRONTIER_DEFAULT = { suiteId: 'deep-swe', sourceId: 'deepswe-v1.1', metric: 'pass@1', representatives: 10 };
export const INPUTS = {
  deepswe: 'data/authority-deepswe.json',
  publisher: 'data/publisher-percentage-facts.json',
  epoch: 'data/authority/epoch-hub.json',
  bfcl: 'data/authority/bfcl-v4.json',
  longbench: 'data/authority/longbench-v2.json',
  mapping: 'data/authority/mapping.json',
};

const HEX = /^[a-f0-9]{64}$/;
const numbers = (text) => (text.match(/\d+/g) ?? []).join('.');
const httpsUrl = (value, name) => {
  assert.ok(typeof value === 'string', `${name}: URL required`);
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', `${name}: HTTPS required`);
  assert.ok(!/refs(\/|%2F)pr(\/|%2F)/i.test(value), `${name}: a pull-request revision is not an original result`);
  return url.href;
};

export async function readInputs(root = new URL('../../', import.meta.url)) {
  const entries = await Promise.all(Object.entries(INPUTS).map(async ([key, path]) => {
    const bytes = await readFile(new URL(path, root));
    return [key, { path, bytes, sha256: sha256(bytes), json: JSON.parse(bytes.toString('utf8')) }];
  }));
  return Object.fromEntries(entries);
}

// A reviewed label may only map to a key with the same version numbers and family words.
export function assertExactModelLabel(label, key) {
  assert.equal(numbers(label), numbers(key), `model label "${label}" cannot map to "${key}": version numbers differ`);
  const words = label.toLowerCase().replace(/[\d.]+/g, ' ').split(/[^a-z]+/).filter((word) => word.length > 1);
  for (const word of words) assert.ok(key.includes(word), `model label "${label}" cannot map to "${key}": "${word}" is absent`);
}

function validateDeepSwe(data) {
  assert.equal(data.benchmark, 'DeepSWE'); assert.equal(data.version, '1.1');
  assert.ok(HEX.test(data.source.sha256), 'DeepSWE source digest malformed');
  assert.equal(data.rows.length, data.configurationCount, 'DeepSWE configuration count changed');
  assert.equal(new Set(data.rows.map((row) => row.model)).size, data.modelCount, 'DeepSWE model count changed');
  assert.equal(new Set(data.rows.map((row) => row.configurationId)).size, data.rows.length, 'duplicate DeepSWE configuration');
  for (const row of data.rows) {
    assert.ok(Math.abs(row.passAt1 - row.counts.passed / row.counts.attempted) < 1e-12, `DeepSWE ${row.configurationId}: pass@1 differs from its counts`);
    assert.ok(Math.abs(row.passAt4 - row.counts.tasksPassedAny / row.counts.tasksAttempted) < 1e-12, `DeepSWE ${row.configurationId}: pass@4 differs from its counts`);
    assert.ok(row.counts.tasksAttempted <= data.taskSetSize, 'attempted tasks exceed task set');
  }
}
function validateRows(data, name, digest = data.source?.sha256) {
  assert.ok(HEX.test(digest ?? ''), `${name}: source digest malformed`);
  assert.equal(data.rows.length, data.rowCount, `${name}: row count differs from its recorded count`);
  assert.equal(stableRowsSha256(data.rows), data.rowsSha256, `${name}: projected rows were altered after capture`);
}

function resolveOrganization(label, mapping) {
  if (!label) return null;
  return mapping.organizationAliases[label] ?? label;
}

export function composeAuthority(inputs, registry) {
  const { deepswe, publisher, epoch, bfcl, longbench, mapping } = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.json]));
  validateDeepSwe(deepswe);
  for (const benchmark of epoch.benchmarks) validateRows(benchmark, `Epoch ${benchmark.suiteId}`, benchmark.sourceFileSha256);
  assert.ok(HEX.test(epoch.source.sha256), 'Epoch source digest malformed');
  validateRows(bfcl, 'BFCL');
  validateRows(longbench, 'LongBench v2');
  const registryDomains = new Set(registry.domains);
  const suites = new Map(mapping.suites.map((suite) => {
    assert.ok(registryDomains.has(suite.domain), `suite ${suite.id} uses unregistered domain ${suite.domain}`);
    if (suite.benchmarkUrl) httpsUrl(suite.benchmarkUrl, `suite ${suite.id}`);
    return [suite.id, suite];
  }));
  const organizationCountries = new Map(epoch.organizations.map((row) => [row.organization, row.countries.filter(Boolean)]));
  const attributions = new Map(epoch.modelAttributions.map((row) => [row.modelKey, row]));
  const labByOrganization = new Map(mapping.labs.flatMap((lab) => lab.organizations.map((organization) => [organization, lab])));

  const sources = [];
  const observations = [];
  const exclusions = [];
  const modelFacts = new Map();
  const noteModel = (key, fact) => {
    if (!modelFacts.has(key)) modelFacts.set(key, []);
    modelFacts.get(key).push(fact);
  };
  const add = (row) => {
    assert.ok(suites.has(row.suiteId), `observation uses unmapped suite ${row.suiteId}`);
    assert.ok(Number.isFinite(row.value) && row.value >= 0 && row.value <= 1, `${row.id}: normalized value outside 0–1`);
    assert.ok(['fraction', 'percent'].includes(row.rawUnit) && row.unitEvidence, `${row.id}: undocumented unit`);
    const expected = row.rawUnit === 'percent' ? row.rawValue / 100 : row.rawValue;
    assert.ok(Math.abs(expected - row.value) < 1e-12, `${row.id}: normalized value does not follow its documented unit`);
    row.resultUrl = httpsUrl(row.resultUrl, row.id);
    observations.push(row);
  };

  // DeepSWE v1.1: complete artifact, pass@1 and pass@4 kept as distinct metrics.
  sources.push({ id: 'deepswe-v1.1', name: 'DeepSWE v1.1 leaderboard artifact', publisher: 'Datacurve', provenance: 'benchmark-authority',
    url: deepswe.source.url, resultUrl: deepswe.source.resultUrl, sha256: deepswe.source.sha256, retrievedAt: deepswe.source.retrievedAt,
    generatedAt: deepswe.source.generatedAt, licence: 'factual results with attribution', rows: deepswe.rows.length,
    note: 'Complete 70-configuration artifact; pass@1 and pass@4 are separate metrics; source intervals are run-to-run.' });
  for (const row of deepswe.rows) {
    const configuration = { id: row.configurationId, harness: row.harness, setting: row.reasoningEffort, condition: row.harness, conditionsKnown: true };
    for (const [metric, value, primary] of [['pass@1', row.passAt1, true], ['pass@4', row.passAt4, false]]) {
      add({ id: `deepswe-v1.1:${row.configurationId}:${metric}`, sourceId: 'deepswe-v1.1', provenance: 'benchmark-authority', suiteId: 'deep-swe',
        metric, primary, modelKey: row.model, modelLabel: row.model, configuration, value, rawValue: value, rawText: value.toFixed(4),
        rawUnit: 'fraction', unitEvidence: 'artifact unit statement: pass@1 attempt pass rate; pass@4 tasks with any pass / tasks attempted',
        interval: metric === 'pass@1' ? row.interval : null, stderr: null,
        counts: row.counts, evaluatedAt: deepswe.source.generatedAt.slice(0, 10), evaluatedAtBasis: 'source artifact generation date',
        resultUrl: row.resultUrl });
    }
    noteModel(row.model, { label: row.model, organization: null, country: null, via: 'DeepSWE model identifier' });
  }

  // Epoch AI: independent runs; documented 0–1 scale from its benchmark metadata.
  sources.push({ id: 'epoch-hub', name: 'Epoch AI Benchmarking Hub export', publisher: 'Epoch AI', provenance: 'independent-evaluator',
    url: epoch.source.url, resultUrl: epoch.source.hubUrl, sha256: epoch.source.sha256, retrievedAt: epoch.source.retrievedAt,
    generatedAt: epoch.source.generatedAt, licence: `${epoch.licence.name} — ${epoch.licence.attribution}`,
    rows: epoch.benchmarks.reduce((n, b) => n + b.rows.length, 0),
    note: 'Only benchmarks Epoch runs itself; its transcribed external leaderboards are not treated as measurements.' });
  for (const benchmark of epoch.benchmarks) {
    for (const row of benchmark.rows) {
      add({ id: `epoch-hub:${benchmark.suiteId}:${row.runId}`, sourceId: 'epoch-hub', provenance: 'independent-evaluator', suiteId: benchmark.suiteId,
        metric: 'score', primary: true, modelKey: row.modelKey, modelLabel: row.modelVersion,
        configuration: { id: row.runId, harness: 'Epoch AI evaluation run', setting: row.setting, condition: 'Epoch AI run', conditionsKnown: true },
        value: row.value, rawValue: row.value, rawText: String(row.value), rawUnit: 'fraction', unitEvidence: benchmark.unit.evidence,
        interval: null, stderr: row.stderr, counts: null, evaluatedAt: row.startedAt?.slice(0, 10) ?? null, evaluatedAtBasis: 'Epoch run start time',
        resultUrl: row.logViewerUrl ?? benchmark.page });
      noteModel(row.modelKey, { label: row.displayName ?? row.modelVersion.replace(/_[^_]*$/, ''), organization: row.organization, country: row.country, via: 'Epoch AI run row' });
    }
  }

  // BFCL V4: literal percent cells; FC/Prompt mode is the test condition.
  sources.push({ id: 'bfcl-v4', name: 'BFCL V4 overall leaderboard', publisher: bfcl.publisher, provenance: 'benchmark-authority',
    url: bfcl.source.url, resultUrl: bfcl.source.resultUrl, sha256: bfcl.source.sha256, retrievedAt: bfcl.source.retrievedAt,
    generatedAt: bfcl.source.generatedAt, licence: 'factual results with attribution', rows: bfcl.rows.length,
    note: `Evaluation commit ${bfcl.evaluationCommit}; FC and Prompt modes are distinct conditions.` });
  for (const row of bfcl.rows) {
    add({ id: `bfcl-v4:${slug(row.model)}`, sourceId: 'bfcl-v4', provenance: 'benchmark-authority', suiteId: 'bfcl-v4', metric: 'overall accuracy', primary: true,
      modelKey: row.modelKey, modelLabel: row.model,
      configuration: { id: slug(row.model), harness: row.mode ? `BFCL ${row.mode}` : null, setting: null, condition: row.mode ? `BFCL ${row.mode}` : null, conditionsKnown: !!row.mode },
      value: row.overallPercent / 100, rawValue: row.overallPercent, rawText: `${row.overallPercent}%`, rawUnit: 'percent', unitEvidence: bfcl.metric.evidence,
      interval: null, stderr: null, counts: null, evaluatedAt: bfcl.source.generatedAt, evaluatedAtBasis: 'leaderboard last-updated date', resultUrl: bfcl.source.resultUrl });
    noteModel(row.modelKey, { label: row.model.replace(/\s*\([^)]*\)\s*$/, ''), organization: resolveOrganization(row.organization, mapping), country: null, via: 'BFCL organization column' });
  }

  // LongBench v2: header-declared percentages; w/o CoT and w/ CoT stay separate.
  sources.push({ id: 'longbench-v2', name: 'LongBench v2 leaderboard', publisher: longbench.publisher, provenance: 'benchmark-authority',
    url: longbench.source.url, resultUrl: longbench.source.resultUrl, sha256: longbench.source.sha256, retrievedAt: longbench.source.retrievedAt,
    generatedAt: longbench.source.generatedAt, licence: 'factual results with attribution', rows: longbench.rows.length,
    note: 'Human and random reference rows are baselines, not models.' });
  for (const row of longbench.rows) {
    if (row.baseline) { exclusions.push({ sourceId: 'longbench-v2', label: row.model, reason: 'reference baseline row, not a model' }); continue; }
    for (const [condition, value] of [['w/o CoT', row.overallWithoutCotPercent], ['w/ CoT', row.overallWithCotPercent]]) {
      if (value === null) continue;
      add({ id: `longbench-v2:${row.modelKey}:${slug(condition)}`, sourceId: 'longbench-v2', provenance: 'benchmark-authority', suiteId: 'longbench-v2',
        metric: 'overall accuracy', primary: true, modelKey: row.modelKey, modelLabel: row.model,
        configuration: { id: `${row.modelKey}:${slug(condition)}`, harness: `LongBench v2 ${condition}`, setting: null, condition, conditionsKnown: true },
        value: value / 100, rawValue: value, rawText: `${value}%`, rawUnit: 'percent', unitEvidence: longbench.metric.evidence,
        interval: null, stderr: null, counts: null, evaluatedAt: row.date || null, evaluatedAtBasis: 'leaderboard model date', resultUrl: longbench.source.resultUrl });
    }
    noteModel(row.modelKey, { label: row.model, organization: resolveOrganization(row.organization, mapping), country: null, via: 'LongBench organization label' });
  }

  // Publisher tables: literal percent cells; own-model facts versus comparison claims.
  for (const source of publisher.sources) {
    const host = mapping.publisherHosts[source.sourceId];
    assert.ok(host, `publisher source ${source.sourceId} has no reviewed host`);
    assert.equal(new URL(httpsUrl(source.resultUrl, source.sourceId)).hostname, host, `${source.sourceId}: result URL is not on the publisher's own host`);
    assert.ok(HEX.test(source.sourceSha256), `${source.sourceId}: source digest malformed`);
    sources.push({ id: source.sourceId, name: `${source.publisher} published results table`, publisher: source.publisher, provenance: 'publisher-reported',
      url: source.resultUrl, resultUrl: source.resultUrl, sha256: source.sourceSha256, retrievedAt: source.retrievedAt, generatedAt: null,
      licence: 'factual cells with attribution; page HTML not republished', rows: source.cells.length,
      note: 'Publisher-reported; evaluation conditions are not stated in a matchable form. Competitor columns are the publisher’s claims.' });
    for (const cell of source.cells) {
      assert.equal(cell.unit, 'percent', `${source.sourceId}: non-percent cell`);
      assert.equal(cell.unitEvidence, 'literal-percent-sign', `${source.sourceId}: unit was not declared in the cell`);
      const benchmark = mapping.publisherBenchmarks[source.sourceId]?.[cell.benchmarkLabel];
      if (!benchmark) {
        assert.ok(mapping.unmappedPublisherBenchmarks[cell.benchmarkLabel], `unreviewed publisher benchmark label ${cell.benchmarkLabel}`);
        exclusions.push({ sourceId: source.sourceId, label: `${cell.modelLabel} · ${cell.benchmarkLabel}`, reason: mapping.unmappedPublisherBenchmarks[cell.benchmarkLabel] });
        continue;
      }
      const modelKey = mapping.publisherModels[source.sourceId]?.[cell.modelLabel];
      assert.ok(modelKey, `unreviewed publisher model label ${cell.modelLabel}`);
      assertExactModelLabel(cell.modelLabel, modelKey);
      const own = cell.modelRelationship === 'publisher-model';
      add({ id: `${source.sourceId}:${benchmark.suiteId}:${modelKey}:${cell.rowIndex}-${cell.columnIndex}`, sourceId: source.sourceId,
        provenance: own ? 'publisher-own' : 'publisher-comparison-claim', suiteId: benchmark.suiteId, metric: benchmark.metric, primary: true,
        modelKey, modelLabel: cell.modelLabel,
        configuration: { id: `${source.sourceId}:${modelKey}`, harness: null, setting: null, condition: cell.notes || null, conditionsKnown: false },
        value: cell.value / 100, rawValue: cell.value, rawText: `${cell.value}%`, rawUnit: 'percent', unitEvidence: 'literal percent sign in the published cell',
        interval: null, stderr: null, counts: null, evaluatedAt: null, evaluatedAtBasis: 'not stated by publisher',
        resultUrl: source.resultUrl, tableCell: { table: cell.tableIndex, row: cell.rowIndex, column: cell.columnIndex } });
      noteModel(modelKey, { label: cell.modelLabel, organization: own ? resolveOrganization(source.publisher, mapping) : null, country: null, via: own ? 'publisher page' : 'publisher comparison label' });
    }
  }

  // Model identities, labs and regions.
  const models = [...modelFacts].map(([key, facts]) => {
    const attribution = attributions.get(key);
    const candidates = [];
    for (const fact of facts) {
      if (fact.organization && fact.country) candidates.push({ organization: fact.organization, countries: fact.country.split(',').map((c) => c.trim()), basis: fact.via });
      else if (fact.organization && organizationCountries.has(fact.organization)) candidates.push({ organization: fact.organization, countries: organizationCountries.get(fact.organization), basis: `${fact.via} → Epoch organization record` });
    }
    if (attribution && attribution.organizations.length === 1) candidates.push({ organization: attribution.organizations[0], countries: attribution.countries.flatMap((c) => c.split(',').map((x) => x.trim())).filter(Boolean), basis: 'Epoch model attribution (exact model key)' });
    const organizations = [...new Set(candidates.map((c) => c.organization))];
    const countries = [...new Set(candidates.flatMap((c) => c.countries).filter(Boolean))];
    const labs = [...new Set(organizations.map((org) => labByOrganization.get(org)?.id ?? slug(org)))];
    let region = 'unknown';
    let regionNote = 'No Epoch organization country record for this exact model key or its organization.';
    if (labs.length > 1) { region = 'unknown'; regionNote = `Conflicting organization attributions: ${organizations.join('; ')}.`; }
    else if (countries.length > 1) { region = 'global'; regionNote = `Organization recorded with several countries: ${countries.join(', ')}.`; }
    else if (countries.length === 1) {
      region = countries[0] === 'United States of America' ? 'us' : countries[0] === 'China' ? 'cn' : 'other';
      regionNote = `${countries[0]} — ${[...new Set(candidates.map((c) => c.basis))].join('; ')}.`;
    }
    const lab = labs.length === 1 ? (mapping.labs.find((row) => row.id === labs[0]) ?? { id: labs[0], name: organizations[0] }) : null;
    // Settings belong to configurations, not to the model identity's display name.
    const labels = facts.map((fact) => fact.label?.replace(/\s*\((none|minimal|low|medium|high|xhigh|max|promax|unknown thinking|\d+k thinking)\)\s*$/i, '')).filter(Boolean);
    return { key, name: labels.find((label) => !/^[a-z0-9-]+$/.test(label)) ?? labels[0] ?? key, labels: [...new Set(labels)].slice(0, 6),
      labId: lab?.id ?? null, lab: lab?.name ?? null, organizations, country: countries.length === 1 ? countries[0] : null, region, regionNote };
  }).sort((a, b) => a.key.localeCompare(b.key));

  // Admission and floor.
  const suiteList = [...suites.values()];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const originals = { 'deepswe-v1.1': deepswe.source, 'epoch-hub': epoch.source, 'bfcl-v4': bfcl.source, 'longbench-v2': longbench.source };
  for (const source of sources) source.verifiedAt = originals[source.id]?.verifiedAt ?? null;
  for (const row of observations) {
    const suite = suites.get(row.suiteId);
    row.domain = suite.domain;
    row.admitted = ADMITTED_PROVENANCE.includes(row.provenance);
    row.exclusion = row.admitted ? null : 'publisher comparison claim about another lab’s model; not an admitted measurement';
    row.matchable = row.admitted && row.configuration.conditionsKnown && row.primary;
    const original = sourceById.get(row.sourceId);
    row.benchmarkVersion = suite.version;
    row.originalSourceSha256 = original.sha256;
    row.retrievedAt = original.retrievedAt;
    row.verifiedAt = original.verifiedAt;
    // Hash each actual factual row, including its source tier and configuration.
    row.factualProjectionSha256 = sha256(JSON.stringify(row));
  }
  const floorRows = observations.filter((row) => row.admitted && CAPABILITY_DOMAINS.includes(row.domain));
  const floorSuites = [...new Set(floorRows.map((row) => row.suiteId))].sort();
  const floorDomains = [...new Set(floorRows.map((row) => row.domain))].sort();
  const separate = [...new Set(observations.filter((row) => SEPARATE_PANELS.includes(row.domain)).map((row) => row.suiteId))].sort();

  return {
    schemaVersion: 'axionbench-authority-v1',
    inputDigests: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, { path: value.path, sha256: value.sha256 }])),
    regionDefinition: mapping.regionDefinition,
    frontierDefault: FRONTIER_DEFAULT,
    sources, suites: suiteList, models, observations, exclusions,
    floor: { requiredSuites: FLOOR.suites, requiredDomains: FLOOR.domains, suites: floorSuites, domains: floorDomains,
      separatePanelSuites: separate, met: floorSuites.length >= FLOOR.suites && floorDomains.length >= FLOOR.domains },
  };
}

export function assertAuthorityFloor(block) {
  assert.ok(block.floor.suites.length >= FLOOR.suites, `authority floor: ${block.floor.suites.length} admitted capability suites < ${FLOOR.suites}`);
  assert.ok(block.floor.domains.length >= FLOOR.domains, `authority floor: ${block.floor.domains.length} admitted capability domains < ${FLOOR.domains}`);
  for (const id of block.floor.suites) assert.ok(!SEPARATE_PANELS.includes(block.suites.find((s) => s.id === id).domain), 'separate panels cannot fill the floor');
}
