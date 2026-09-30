// npm run test:authority — positive original-source admission gate plus
// adversarial regressions. It inspects the real committed source projections and
// the real public projection mounted by the application; fixtures below only
// exercise adapter invariants and never enter site data.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replaceProjection } from './authority/common.mjs';
import { projectBfcl, refreshBfcl } from './authority/bfcl.mjs';
import { assertAuthorityFloor, composeAuthority, readInputs } from './authority/compose.mjs';
import { projectLongBench } from './authority/longbench-v2.mjs';
import { splitModelVersion } from './authority/epoch-hub.mjs';
import { headToHead, rankingRows } from '../src/authority/logic.ts';

const root = new URL('../', import.meta.url);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (label, command, args) => {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, { cwd: root.pathname, stdio: 'inherit' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${label} failed`);
};

// Earlier data gates stay in force.
run('data validation', 'npm', ['run', 'data:validate']);
run('registry', 'npm', ['run', 'test:registry']);
run('scoring fixtures and repaired counterexamples', 'npm', ['run', 'test:scoring']);
run('DeepSWE authority adapter', 'node', ['scripts/test-deepswe-authority.mjs']);
run('publisher percentage facts', 'python3', ['scripts/test-publisher-tables.py']);
run('public projection build', 'node', ['scripts/build-observatory-data.mjs']);

const registry = JSON.parse(await readFile(new URL('data/benchmark-registry.json', root), 'utf8'));
const inputs = await readInputs(root);
const block = composeAuthority(inputs, registry);
assertAuthorityFloor(block);
const clone = () => Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { ...v, json: structuredClone(v.json) }]));
const rejects = (mutate, pattern, message) => {
  const next = clone(); mutate(next);
  assert.throws(() => composeAuthority(next, registry), pattern, message);
};

// 1. Source completeness against the sources' own recorded counts.
const { deepswe, epoch, bfcl, longbench, publisher } = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.json]));
assert.equal(deepswe.configurationCount, 70); assert.equal(deepswe.modelCount, 28); assert.equal(deepswe.taskSetSize, 113);
assert.equal(block.observations.filter((o) => o.sourceId === 'deepswe-v1.1').length, 140, 'all 70 DeepSWE configurations enter with separate pass@1 and pass@4');
for (const b of epoch.benchmarks) assert.equal(block.observations.filter((o) => o.sourceId === 'epoch-hub' && o.suiteId === b.suiteId).length, b.rowCount, `every Epoch ${b.suiteId} run enters`);
assert.equal(epoch.benchmarks.reduce((n, b) => n + b.rowCount, 0), 1019, 'Epoch-run rows captured on 2026-09-30');
assert.equal(bfcl.rowCount, 109); assert.equal(longbench.rowCount, 38);
assert.equal(publisher.sources.reduce((n, s) => n + s.cells.length, 0), 110);
assert.equal(bfcl.evaluationCommit, 'f7cf735', 'BFCL V4 evaluation commit from the official page');
assert.ok(!block.observations.some((o) => o.sourceId === 'epoch-hub' && /_external/.test(o.id)), 'Epoch transcriptions of other leaderboards are not measurements');

// 2. Exact source facts (hand-checked against the original sources).
const find = (predicate, message) => { const row = block.observations.find(predicate); assert.ok(row, message); return row; };
const astra = find((o) => o.id === 'deepswe-v1.1:mini_swe_agent_gpt_6_astra_xhigh:pass@1', 'DeepSWE GPT-6 Astra xhigh');
assert.equal(astra.value, 335 / 452); assert.equal(astra.counts.tasksPassedAny, 91);
assert.ok(astra.interval && /run-to-run/.test(astra.interval.method), 'the authority interval method is preserved');
assert.equal(find((o) => o.id === 'deepswe-v1.1:mini_swe_agent_gpt_6_astra_xhigh:pass@4', 'pass@4 row').value, 91 / 113);
const gemini = find((o) => o.sourceId === 'google-gemini38' && o.suiteId === 'deep-swe' && o.modelKey === 'gemini-3-8-flash', 'Gemini own DeepSWE claim');
assert.equal(gemini.rawText, '73.7%'); assert.equal(gemini.provenance, 'publisher-own'); assert.equal(gemini.value, 0.737);
const sonnet = find((o) => o.sourceId === 'epoch-hub' && o.suiteId === 'gpqa-diamond' && o.modelLabel === 'claude-sonnet-5-5_max', 'Epoch Sonnet 5.5 GPQA');
assert.ok(Math.abs(sonnet.value - 0.9558080808080808) < 1e-15 && sonnet.stderr > 0 && sonnet.configuration.setting === 'max');
const bfclOpus = find((o) => o.id === 'bfcl-v4:claude-opus-4-5-20251101-fc', 'BFCL Claude Opus 4.5 FC');
assert.equal(bfclOpus.rawText, '77.47%'); assert.equal(bfclOpus.configuration.condition, 'BFCL FC');
const lb = find((o) => o.id === 'longbench-v2:gemini-2-5-pro:w-cot', 'LongBench Gemini 2.5 Pro w/ CoT');
assert.equal(lb.rawText, '63.3%');
assert.ok(!block.observations.some((o) => o.id === 'longbench-v2:gemini-2-5-pro:w-o-cot'), 'a “-” cell is missing, never zero');
assert.ok(block.exclusions.some((e) => e.label === 'Human') && block.exclusions.some((e) => e.label === 'Random'), 'baselines are not models');

// 3. Units, provenance labels, links.
for (const o of block.observations) {
  assert.ok(['fraction', 'percent'].includes(o.rawUnit) && o.unitEvidence, `${o.id}: documented unit required`);
  assert.ok(o.resultUrl.startsWith('https://') && !/refs(\/|%2F)pr/i.test(o.resultUrl), `${o.id}: genuine HTTPS result`);
  if (o.provenance === 'publisher-comparison-claim') assert.equal(o.admitted, false, 'competitor claims are not admitted measurements');
  if (o.sourceId.startsWith('google-') || o.sourceId.startsWith('anthropic-')) assert.equal(o.matchable, false, 'publisher tables never enter a strict match');
}
assert.ok(block.observations.filter((o) => o.provenance === 'publisher-comparison-claim').length > 50);

// 4. Floor: >=15 capability suites, >=8 domains, separate panels do not count.
assert.ok(block.floor.suites.length >= 15 && block.floor.domains.length >= 8, JSON.stringify(block.floor));
for (const domain of ['coding', 'reasoning', 'mathematics', 'factuality', 'tool-use', 'long-context', 'agents', 'vision-documents']) assert.ok(block.floor.domains.includes(domain), domain);
assert.deepEqual(block.floor.separatePanelSuites, ['harvey-legal-agent', 'vals-finance-agent-v2']);
assert.ok(!block.floor.suites.some((id) => block.floor.separatePanelSuites.includes(id)), 'professional panels cannot fill the floor');

// 5. Identities and sourced regions.
const model = (key) => block.models.find((m) => m.key === key);
for (const [key, region, lab] of [['gpt-6-astra', 'us', 'openai'], ['kimi-k3', 'cn', 'moonshot'], ['glm-5-3', 'cn', 'zhipu'], ['qwen3-8-max', 'cn', 'alibaba-qwen'],
  ['deepseek-v4-pro', 'cn', 'deepseek'], ['muse-spark-1-3', 'us', 'meta'], ['claude-opus-5-5', 'us', 'anthropic'], ['gemini-3-8-flash', 'us', 'google']]) {
  assert.equal(model(key)?.region, region, `${key} region`); assert.equal(model(key)?.labId, lab, `${key} lab`);
}
assert.equal(model('gpt-5-4').region, 'unknown', 'no sourced attribution for this exact key: not guessed from its name');
assert.ok(model('mistral-large-2')?.region === 'other', 'France-based labs stay outside the regional selectors');
assert.equal(splitModelVersion('gpt-5.4-2026-03-05_xhigh').base, 'gpt-5.4-2026-03-05');
assert.equal(splitModelVersion('Yi-6B').setting, null);

// 6. Useful frontier: 8–12 distinct models by default, complete configuration list.
const panel = `${block.frontierDefault.sourceId}|${block.frontierDefault.suiteId}|${block.frontierDefault.metric}`;
const reps = rankingRows(block, panel, 'representatives', block.frontierDefault.representatives);
assert.ok(reps.length >= 8 && reps.length <= 12 && new Set(reps.map((r) => r.modelKey)).size === reps.length, 'default frontier shows 8–12 distinct models');
assert.ok(new Set(reps.map((r) => model(r.modelKey).labId)).size >= 5, 'default frontier spans several labs');
assert.equal(rankingRows(block, panel, 'all', 0).length, 70, 'configuration selector offers all 70 DeepSWE configurations');

// 7. The real mounted projection carries exactly this composition, digest-bound.
const data = JSON.parse(await readFile(new URL('public/data.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('public/data-manifest.json', root), 'utf8'));
assert.deepEqual(data.authority, JSON.parse(JSON.stringify(block)), 'public/data.json authority block equals the validated composition');
for (const [key, value] of Object.entries(manifest.authorityInputs)) assert.equal(value.sha256, sha256(await readFile(new URL(value.path, root))), `${key} input digest`);
assert.equal(manifest.counts.authorityObservations, block.observations.length);
assert.equal(manifest.projection.sha256, sha256(await readFile(new URL('public/data.json', root))));
const experience = await readFile(new URL('src/observatory-experience.tsx', root), 'utf8');
assert.match(experience, /<AuthorityRanking authority=\{dataset\.authority\}\/>/, 'frontier mounts the authority ranking');
assert.match(experience, /<HeadToHead authority=\{dataset\.authority\}/, 'paired chapter mounts the head-to-head');

// 8. Adversarial regressions.
rejects((x) => { x.epoch.json.benchmarks[0].rows[0].value = 0.99; }, /altered after capture/, 'tampered Epoch value');
rejects((x) => { x.bfcl.json.rows[0].overallPercent = 99.9; }, /altered after capture/, 'tampered BFCL value');
rejects((x) => { x.deepswe.json.source.sha256 = 'not-a-digest'; }, /digest malformed/, 'tampered source digest');
rejects((x) => { const r = x.deepswe.json.rows[0]; r.passAt1 = r.passAt4; }, /pass@1 differs/, 'pass@1/pass@4 confusion');
rejects((x) => { x.deepswe.json.rows.pop(); }, /count changed/, 'truncated authority artifact');
rejects((x) => { x.mapping.json.publisherModels['anthropic-opus55']['Opus 5'] = 'claude-opus-5-5'; }, /version numbers differ/, 'wrong model version');
rejects((x) => { x.mapping.json.publisherModels['google-gemini38']['GPT-5.6 Sol'] = 'gpt-5-6-terra'; }, /is absent/, 'wrong model variant');
rejects((x) => { x.publisher.json.sources[1].resultUrl = 'https://huggingface.co/anthropic/claude/blob/refs%2Fpr%2F7/README.md'; }, /pull-request|publisher's own host/, 'PR masquerading as publisher');
rejects((x) => { x.publisher.json.sources[0].resultUrl = 'https://example.org/gemini-results'; }, /publisher's own host/, 'third-party page masquerading as publisher');
rejects((x) => { x.publisher.json.sources[0].cells[0].unitEvidence = 'numeric-range'; }, /unit was not declared/, 'inferred unit');
rejects((x) => { x.publisher.json.sources[0].cells[0].benchmarkLabel = 'Mystery benchmark'; }, /unreviewed publisher benchmark/, 'unreviewed benchmark mapping');
rejects((x) => { x.mapping.json.suites[0].domain = 'astrology'; }, /unregistered domain/, 'unregistered domain');
{ // separate-panel inflation: relabelling professional suites cannot silently raise the floor
  const next = clone();
  next.mapping.json.suites = next.mapping.json.suites.filter((s) => s.domain !== 'professional');
  assert.throws(() => composeAuthority(next, registry), /unmapped suite/, 'professional facts need their separate panel');
}
{ // unknown-condition comparison: two publisher-own facts never match each other
  const fake = structuredClone(block);
  const row = fake.observations.find((o) => o.sourceId === 'google-gemini38' && o.provenance === 'publisher-own' && o.suiteId === 'terminal-bench-2.1');
  fake.observations.push({ ...row, id: row.id + ':fixture', modelKey: 'kimi-k3' });
  const r = headToHead(fake, 'gemini-3-8-flash', 'kimi-k3', { domain: 'agents', sameSetting: false, sourceId: 'google-gemini38' });
  assert.equal(r.matched.length, 0);
  assert.ok(r.excluded.some((e) => /conditions are not stated/.test(e.reason)), 'unknown conditions are excluded with a reason');
}
// Adapter invariants on synthetic inputs (never site data).
const page = (date) => Buffer.from(`<h1>Berkeley Function Calling Leaderboard (BFCL) V4</h1> Last Updated: ${date} Models are evaluated using commit abc1234 . Overall Accuracy is the unweighted average of all the sub-categories.`);
const header = 'Rank,Overall Acc,Model,Model Link,Organization,License\n';
const csv = (n, cell = (i) => `${50 + i}.00%`) => Buffer.from(header + Array.from({ length: n }, (_, i) => `${i + 1},${cell(i)},Fixture-${i} (FC),https://example.org,Lab,MIT`).join('\n'));
assert.equal(projectBfcl(csv(25), page('2026-04-12'), 'now').rows[0].overallPercent, 50);
assert.throws(() => projectBfcl(csv(5), page('2026-04-12'), 'now'), /truncated/, 'truncated BFCL table');
assert.throws(() => projectBfcl(csv(25, () => '0.62'), page('2026-04-12'), 'now'), /literal percent/, 'BFCL unit must be declared');
assert.throws(() => projectLongBench(Buffer.from('<table><tr><th>#</th><th>Model</th><th>Score</th></tr></table> Last Update: 2025-05-06'), 'now'), /headers changed/, 'LongBench header change');
const dir = await mkdtemp(join(tmpdir(), 'axion-authority-stale-'));
try {
  const output = join(dir, 'bfcl.json');
  const serve = (date) => async (url) => new Response(url.endsWith('.csv') ? csv(25) : page(date), { status: 200 });
  await refreshBfcl({ output, auditDir: join(dir, 'audit'), fetcher: serve('2026-04-12') });
  const lastGood = await readFile(output);
  await assert.rejects(refreshBfcl({ output, auditDir: join(dir, 'audit'), fetcher: serve('2025-01-01') }), /stale refresh refused/, 'older source generation is refused');
  assert.deepEqual(await readFile(output), lastGood, 'stale refresh preserves last-good projection');
  await assert.rejects(refreshBfcl({ output, auditDir: join(dir, 'audit'), fetcher: async () => new Response('down', { status: 503 }) }), /HTTP 503/);
  assert.deepEqual(await readFile(output), lastGood, 'failed refresh preserves last-good projection');
  await writeFile(join(dir, 'x.json'), JSON.stringify({ source: { sha256: 'a', generatedAt: '2026-01-02' } }));
  await assert.rejects(replaceProjection(join(dir, 'x.json'), { source: { sha256: 'b', generatedAt: '2026-01-01' } }), /stale/);
} finally { await rm(dir, { recursive: true, force: true }); }

console.log(`\nAuthority gate passed: ${block.observations.length} observations (${block.observations.filter((o) => o.admitted).length} admitted) from ${block.sources.length} original sources; `
  + `${block.floor.suites.length} admitted capability suites across ${block.floor.domains.length} domains (${block.floor.domains.join(', ')}); `
  + `${block.models.length} model identities (${block.models.filter((m) => m.region === 'us').length} US, ${block.models.filter((m) => m.region === 'cn').length} China, `
  + `${block.models.filter((m) => !['us', 'cn'].includes(m.region)).length} outside the regional selectors); default frontier ${reps.length} distinct models.`);
