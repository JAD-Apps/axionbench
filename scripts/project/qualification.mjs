// Strict qualification of a sealed candidate (private or public) and
// acceptance of the production target. Pure validation over supplied evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PIN, BASELINES } from './policy.mjs';
import { findSecrets } from '../automation/secrets.mjs';

const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
export const PRODUCTION = Object.freeze({ project: 'axionbench', branch: 'main', hostname: 'axionbench.jadapps.app', repo: 'JAD-Apps/axionbench' });

export function requiredGates() {
  const runner = readFileSync(new URL('../public/verify.mjs', import.meta.url), 'utf8');
  return Function(`return ${runner.match(/const gates = (\[[^;]+\]);/)[1]}`)();
}

// kind: 'private' | 'public'. Public candidates must descend from the public base.
export function validateCandidate(candidate, kind) {
  assert.ok(kind === 'private' || kind === 'public', 'candidate kind');
  assert.equal(candidate?.kind, kind, 'candidate kind mismatch');
  assert.match(candidate.commit ?? '', SHA, 'candidate needs a full commit');
  assert.match(candidate.treeSha256 ?? '', SHA256, 'candidate needs a tree digest');
  assert.ok(candidate.ancestors?.includes(BASELINES[kind]), `${kind} candidate must descend from ${BASELINES[kind]}`);
  assert.equal(candidate.dirty, false, 'candidate must be sealed (clean)');
  assert.equal(candidate.forcePush, false, 'history may not be rewritten');
  const passed = new Map((candidate.gates ?? []).map((gate) => [gate.script, gate.exitCode]));
  for (const gate of requiredGates()) assert.equal(passed.get(gate), 0, `required gate ${gate} (npm script) did not exit 0`);
  if (kind === 'public') {
    assert.equal(candidate.privateFiles?.length ?? 0, 0, 'public candidate contains private files');
    assert.deepEqual(findSecrets(JSON.stringify(candidate)), [], 'candidate evidence contains credential-shaped text');
  }
  const review = candidate.review;
  assert.ok(review, `${kind} candidate has no independent review`);
  assert.equal(review.verdict, 'approved', 'review verdict');
  assert.equal(review.commit, candidate.commit, 'review is of another commit');
  assert.notEqual(review.sessionId, candidate.authorSessionId, 'reviewer must differ from the author');
  assert.deepEqual(review.choice, PIN, 'reviewer must be codex/gpt-6.1-sol/high');
  return true;
}

// Both candidates must qualify before anything is published.
export function qualify({ privateCandidate, publicCandidate }) {
  validateCandidate(privateCandidate, 'private');
  validateCandidate(publicCandidate, 'public');
  return { passed: true, private: privateCandidate.commit, public: publicCandidate.commit };
}

export function validateProductionTarget(target) {
  for (const [key, value] of Object.entries(PRODUCTION)) {
    if (key === 'repo') continue;
    assert.equal(target?.[key], value, `production ${key} must be ${value}`);
  }
  assert.equal(target.repo, PRODUCTION.repo, 'wrong public repository');
  assert.equal(target.domainAttached, true, 'the custom domain is not attached to the project');
  return true;
}

// Acceptance of a deployed release: exact host, matching digests, last-good kept.
export function acceptProduction({ target, hosted, release, lastGood }) {
  validateProductionTarget(target);
  assert.equal(hosted?.url, `https://${PRODUCTION.hostname}`, 'readback must use the approved HTTPS host');
  assert.equal(hosted.productSha256, release?.productSha256, 'hosted product digest differs from the release');
  assert.equal(hosted.dataSha256, release.dataSha256, 'hosted data digest differs from the release');
  assert.equal(hosted.routesOk, true, 'not every route answered');
  assert.equal(hosted.unknownPath, 404, 'unknown paths must answer 404');
  assert.match(lastGood?.snapshotSha256 ?? '', SHA256, 'last-good snapshot must be retained');
  return true;
}
