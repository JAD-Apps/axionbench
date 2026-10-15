import assert from 'node:assert/strict';
import test from 'node:test';
import { BASELINES, PIN } from '../../scripts/project/policy.mjs';
import { acceptProduction, qualify, requiredGates, validateCandidate, validateProductionTarget } from '../../scripts/project/qualification.mjs';

const h = (c) => c.repeat(40);
const candidate = (kind, commit) => ({
  kind, commit, treeSha256: 'b'.repeat(64), ancestors: [BASELINES[kind]], dirty: false, forcePush: false, authorSessionId: 'author',
  gates: requiredGates().map((script) => ({ script, exitCode: 0 })), privateFiles: [],
  review: { verdict: 'approved', commit, sessionId: 'reviewer', choice: { ...PIN } },
});
const target = { project: 'axionbench', branch: 'main', hostname: 'axionbench.jadapps.app', repo: 'JAD-Apps/axionbench', domainAttached: true };

test('the gate list comes from the portable runner and is not empty', () => {
  assert.ok(requiredGates().length >= 20);
});

test('two sealed, reviewed candidates qualify', () => {
  assert.deepEqual(qualify({ privateCandidate: candidate('private', h('1')), publicCandidate: candidate('public', h('2')) }), { passed: true, private: h('1'), public: h('2') });
});

test('every broken candidate rule is rejected', () => {
  const cases = [
    ['kind', (c) => { c.kind = 'private'; }, /kind mismatch/],
    ['commit', (c) => { c.commit = 'abc'; }, /full commit/],
    ['ancestry', (c) => { c.ancestors = []; }, /descend/],
    ['dirty', (c) => { c.dirty = true; }, /sealed/],
    ['force push', (c) => { c.forcePush = true; }, /rewritten/],
    ['failed gate', (c) => { c.gates[3].exitCode = 1; }, /did not exit 0/],
    ['missing gate', (c) => { c.gates.pop(); }, /did not exit 0/],
    ['private file', (c) => { c.privateFiles = ['docs/project/x.md']; }, /private files/],
    ['no review', (c) => { delete c.review; }, /no independent review/],
    ['rejected', (c) => { c.review.verdict = 'changes-requested'; }, /verdict/],
    ['other commit', (c) => { c.review.commit = h('9'); }, /another commit/],
    ['self review', (c) => { c.review.sessionId = 'author'; }, /differ from the author/],
    ['reviewer model', (c) => { c.review.choice = { ...PIN, effort: 'low' }; }, /gpt-6\.1-sol\/high/],
  ];
  for (const [name, mutate, message] of cases) {
    const value = candidate('public', h('2')); mutate(value);
    assert.throws(() => validateCandidate(value, 'public'), message, name);
  }
  const wrongBase = candidate('public', h('2')); wrongBase.ancestors = [BASELINES.private];
  assert.throws(() => validateCandidate(wrongBase, 'public'), /descend/);
});

test('credential-shaped text in public evidence is rejected', () => {
  const value = candidate('public', h('2')); value.note = `cfut_${'S'.repeat(40)}`;
  assert.throws(() => validateCandidate(value, 'public'), /credential/);
});

test('production target and hosted readback must match exactly', () => {
  assert.equal(validateProductionTarget(target), true);
  for (const [key, bad] of [['project', 'jad-apps-site-git'], ['branch', 'preview'], ['hostname', 'example.com'], ['repo', 'other/repo'], ['domainAttached', false]]) {
    assert.throws(() => validateProductionTarget({ ...target, [key]: bad }), key);
  }
  const release = { productSha256: 'c'.repeat(64), dataSha256: 'd'.repeat(64) };
  const hosted = { url: 'https://axionbench.jadapps.app', ...release, routesOk: true, unknownPath: 404 };
  const lastGood = { snapshotSha256: 'e'.repeat(64) };
  assert.equal(acceptProduction({ target, hosted, release, lastGood }), true);
  assert.throws(() => acceptProduction({ target, hosted: { ...hosted, url: 'https://axionbench.pages.dev' }, release, lastGood }), /approved HTTPS/);
  assert.throws(() => acceptProduction({ target, hosted: { ...hosted, dataSha256: 'f'.repeat(64) }, release, lastGood }), /data digest/);
  assert.throws(() => acceptProduction({ target, hosted: { ...hosted, unknownPath: 200 }, release, lastGood }), /404/);
  assert.throws(() => acceptProduction({ target, hosted, release, lastGood: null }), /last-good/);
});
