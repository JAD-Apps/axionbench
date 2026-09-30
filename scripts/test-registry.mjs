import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const registry = JSON.parse(await readFile('data/benchmark-registry.json', 'utf8'));
const manifest = JSON.parse(await readFile('data/source-snapshots/manifest.json', 'utf8'));
const snapshotBytes = await readFile(manifest.path);
const hash = createHash('sha256').update(snapshotBytes).digest('hex');
assert.equal(hash, manifest.sha256, 'source snapshot SHA-256 must match its manifest');

const fail = (message) => { throw new Error(message); };
function validate(input) {
  if (!Array.isArray(input.suites) || input.suites.length < 30) fail('registry must contain >=30 suites');
  if (!Array.isArray(input.domains) || input.domains.length < 11) fail('registry must contain >=11 domains');
  const ids = new Set();
  const domainSet = new Set(input.domains);
  const observedDomains = new Set();
  const states = new Set(['pending', 'unsupported', 'available']);
  for (const suite of input.suites) {
    if (!suite.id || ids.has(suite.id)) fail(`duplicate or missing suite identity: ${suite.id}`);
    ids.add(suite.id);
    if (!domainSet.has(suite.domain)) fail(`unknown domain: ${suite.domain}`);
    observedDomains.add(suite.domain);
    let url;
    try { url = new URL(suite.url); } catch { fail(`invalid source URL: ${suite.id}`); }
    if (url.protocol !== 'https:' || !url.hostname.includes('.')) fail(`non-public HTTPS source URL: ${suite.id}`);
    if (!suite.source?.trim() || !suite.rights?.trim()) fail(`missing source/rights metadata: ${suite.id}`);
    if (!states.has(suite.state)) fail(`unknown availability state: ${suite.id}`);
    if (suite.state !== 'available' && !suite.reason?.trim()) fail(`unavailable suite requires a reason: ${suite.id}`);
    if (!suite.version?.trim() || !suite.metric?.name?.trim()) fail(`missing version or metric identity: ${suite.id}`);
    const { min, max, direction } = suite.metric;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) fail(`invalid metric bounds: ${suite.id}`);
    if (!['higher', 'lower'].includes(direction)) fail(`invalid metric direction: ${suite.id}`);
  }
  if (observedDomains.size < 11) fail('fewer than 11 domains represented by suites');
  return true;
}
assert.equal(validate(registry), true);
const ids = new Set(registry.suites.map((suite) => suite.id));
const observedDomains = new Set(registry.suites.map((suite) => suite.domain));

// Adversarial fixtures ensure identity, metric and unknown-state checks are real.
for (const mutate of [
  (x) => { x.suites[1].id = x.suites[0].id; },
  (x) => { x.suites[0].metric.min = x.suites[0].metric.max; },
  (x) => { x.suites[0].metric.direction = 'neutral'; },
  (x) => { x.suites[0].state = 'probably'; },
  (x) => { x.suites[0].url = 'javascript:alert(1)'; },
  (x) => { x.suites[0].rights = ''; },
]) {
  const fixture = structuredClone(registry);
  mutate(fixture);
  assert.throws(() => validate(fixture));
}
assert(['hle-original','hle-rolling','hle-diamond'].every((id) => ids.has(id)), 'HLE variants must stay distinct');
assert(['swebench-full','swebench-verified','swebench-lite','swebench-pro'].every((id) => ids.has(id)), 'SWE variants must stay distinct');
assert(['terminal-bench-4','terminal-bench-2'].every((id) => ids.has(id)), 'Terminal-Bench versions must stay distinct');
assert(['bfcl-v4','bfcl-v3','tau-bench','tau2'].every((id) => ids.has(id)), 'BFCL/tau variants must stay distinct');
for (const panel of ['safety','preference','professional','audio-video']) assert(observedDomains.has(panel), `missing separate panel ${panel}`);

// Live validation is deliberately limited to URLs in the captured source snapshot.
// Other registry URLs are syntax-checked above and listed as not live-checked.
const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
const checked = [];
for (const item of snapshot.observations) {
  const response = await fetch(item.checkedUrl, { redirect: 'follow', signal: AbortSignal.timeout(12000) });
  assert(response.ok || [401, 403, 405].includes(response.status), `live source unavailable (${response.status}): ${item.checkedUrl}`);
  checked.push(`${item.checkedUrl} (${response.status})`);
}
console.log(`Registry valid: ${registry.suites.length} suites, ${registry.domains.length} domains; snapshot ${hash}`);
console.log(`Live checked ${checked.length} captured primary source URLs; all other registry links are syntax-checked only.`);
