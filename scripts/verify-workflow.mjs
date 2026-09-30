import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

const exec = promisify(execFile);
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => assert.match(value, /^[a-f0-9]{64}$/);
const repoPath = path => {
  assert.equal(typeof path, 'string');
  const rel = relative(process.cwd(), resolve(path));
  assert.ok(rel && !rel.startsWith('..') && !rel.startsWith('/'), 'Evidence path must be inside the candidate worktree');
  return resolve(path);
};
const approval = async () => {
  const a = await json('docs/owner-approval.json');
  assert.equal(a.status, 'approved', 'Public name/repository/subdomain need the actual explicit owner selection');
  assert.ok(typeof a.ownerReply === 'string' && a.ownerReply.length >= 3);
  assert.ok(Number.isFinite(Date.parse(a.approvedAt)));
  const r = await json('docs/naming-research.json');
  const c = r.shortlist.find(c => c.name === a.name);
  assert.ok(c, 'Approved name must have saved research');
  assert.equal(a.repo, c.repo);
  assert.equal(a.hostname, c.hostname);
  assert.match(a.repo, /^JAD-Apps\/[a-z0-9-]+$/);
  assert.match(a.hostname, /^[a-z0-9-]+\.jadapps\.app$/);
  assert.equal(c.githubMatchingRepositories, 0);
  assert.ok(!r.conflicts.some(c => c.name.toLowerCase() === a.name.toLowerCase()));
  return a;
};
const fetchBytes = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  assert.equal(response.status, 200, `${url}: expected HTTP 200`);
  return Buffer.from(await response.arrayBuffer());
};
const deployment = async () => {
  const a = await approval();
  const d = await json('evidence/deployment.json');
  assert.equal(d.url, `https://${a.hostname}`);
  assert.equal(d.repo, a.repo);
  assert.ok(d.provider && d.projectId && d.deploymentId);
  assert.match(d.sourceCommit, /^[a-f0-9]{40}$/);
  digest(d.productSha256); digest(d.dataSha256);
  assert.ok(Number.isFinite(Date.parse(d.publishedAt)));
  const [remoteManifestBytes, remoteData, localManifest] = await Promise.all([
    fetchBytes(`${d.url}/release-manifest.json`), fetchBytes(`${d.url}/data.json`), json('dist/release-manifest.json')
  ]);
  const manifest = JSON.parse(remoteManifestBytes);
  assert.equal(manifest.productSha256, d.productSha256);
  assert.equal(manifest.dataSha256, d.dataSha256);
  assert.equal(manifest.sourceCommit, d.sourceCommit);
  assert.equal(localManifest.productSha256, d.productSha256, 'Hosted release must match the verified product build');
  assert.equal(sha(remoteData), d.dataSha256);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length >= 3);
  for (const f of manifest.files) {
    repoPath(`dist/${f.path}`); digest(f.sha256);
    const [hosted, local] = await Promise.all([fetchBytes(`${d.url}/${f.path}`), readFile(`dist/${f.path}`)]);
    assert.equal(sha(hosted), f.sha256, `Hosted artifact mismatch: ${f.path}`);
    assert.equal(sha(local), f.sha256, `Local artifact mismatch: ${f.path}`);
  }
  return d;
};

const stage = process.argv[2];
try {
  if (stage === 'plan') {
    const p = await json('docs/workflow.json');
    assert.equal(p.autoStart, false);
    assert.ok(p.steps.length >= 16);
    assert.match(p.steps[0].verifyCmd, /naming$/);
    assert.match(p.steps[1].verifyCmd, /repository$/);
    assert.match(p.steps.at(-1).verifyCmd, /browser$/);
    for (const [i, s] of p.steps.entries()) {
      assert.ok(s.title && s.brief && s.bot && s.verifyCmd);
      assert.ok(['analysis', 'code', 'ops', 'text'].includes(s.work));
      assert.ok(s.effects && ['known', 'unknown'].includes(s.effects.kind));
      assert.ok(s.dependsOn.every(n => Number.isInteger(n) && n >= 0 && n < i));
      if (i > 0) assert.ok(s.dependsOn.includes(i - 1), 'This plan deliberately sequences mutations and review');
      assert.ok(!/--require-(?:merged|landed|integrated)|\$\{\w+:\?/.test(s.verifyCmd));
      assert.ok(!s.verifyCmd.includes('/home/'), 'Verifiers must use candidate-relative paths');
    }
    const pkg = await json('package.json');
    assert.match(pkg.packageManager, /^npm@\d+\.\d+\.\d+$/);
    const lock = await json('package-lock.json');
    assert.ok(lock.lockfileVersion >= 3 && lock.packages['']);
    assert.ok((await readFile('docs/OVERHAUL-PLAN.md', 'utf8')).includes('at least 30 distinct suites'));
    console.log(`Plan structure verified: ${p.steps.length} stages. This does not verify implementation, execution, naming approval or deployment.`);
  } else if (stage === 'naming') {
    const a = await approval();
    console.log(`Explicit naming gate passed: ${a.name}, ${a.repo}, ${a.hostname}`);
  } else if (stage === 'repository') {
    const a = await approval();
    const { stdout } = await exec('gh', ['repo', 'view', a.repo, '--json', 'nameWithOwner,visibility,url,isEmpty'], { timeout: 30000 });
    const r = JSON.parse(stdout);
    assert.equal(r.nameWithOwner, a.repo); assert.equal(r.visibility, 'PUBLIC'); assert.equal(r.isEmpty, false);
    const remote = (await exec('git', ['remote', 'get-url', 'origin'])).stdout.trim();
    assert.ok([`https://github.com/${a.repo}.git`, `https://github.com/${a.repo}`, `git@github.com:${a.repo}.git`].includes(remote));
    const e = await json('evidence/repository.json');
    assert.equal(e.repo, a.repo); assert.equal(e.visibility, 'PUBLIC'); assert.equal(e.url, r.url);
    console.log(`Public repository and origin verified: ${r.url}`);
  } else if (stage === 'design') {
    const doc = await readFile('docs/DESIGN.md', 'utf8');
    assert.ok(doc.length >= 2500);
    for (const topic of ['Frontier', 'Head-to-head', 'Open weights', 'Models', 'Methods', 'visx', 'Motion', 'Awwwards', 'spacing', 'mobile']) {
      assert.ok(doc.toLowerCase().includes(topic.toLowerCase()), `Design must specify ${topic}`);
    }
    console.log('Blueprint content verified; actual rendered visual review remains a later required gate.');
  } else if (stage === 'deployment') {
    const d = await deployment();
    console.log(`Hosted manifest, data and all release artifact hashes verified: ${d.url}`);
  } else if (stage === 'browser') {
    const d = await deployment();
    const b = await json('evidence/browser.json');
    const tests = await json('evidence/production-tests.json');
    assert.equal(b.url, d.url); assert.equal(b.productSha256, d.productSha256);
    assert.ok(Number.isFinite(Date.parse(b.openedAt)) && Date.parse(b.openedAt) >= Date.parse(d.publishedAt));
    assert.ok(b.openingMethod && b.observation);
    assert.ok(['jadbot-browser-bridge', 'windows-targeted-observation'].includes(b.observation.source));
    assert.ok(b.observation.url === d.url || b.observation.url === `${d.url}/`);
    assert.ok(b.observation.title && b.observation.receiptPath);
    const receiptBytes = await readFile(repoPath(b.observation.receiptPath));
    assert.ok(receiptBytes.length > 50); assert.equal(sha(receiptBytes), b.observation.receiptSha256);
    const bytes = await readFile(repoPath(b.screenshot.path));
    assert.ok(bytes.length > 20000); assert.equal(sha(bytes), b.screenshot.sha256);
    assert.equal(tests.url, d.url); assert.equal(tests.productSha256, d.productSha256);
    assert.ok(Array.isArray(tests.assertions) && tests.assertions.length >= 12);
    assert.ok(tests.assertions.every(a => a.passed === true && a.name && a.observed !== undefined));
    assert.deepEqual(tests.consoleErrors, []);
    console.log(`Production interactions and owner-browser evidence verified: ${d.url}. Later JadBot evaluation/integration require separate receipts.`);
  } else {
    throw new Error(`Unknown stage ${stage}; implementation gates are concrete npm scripts created by their named stages.`);
  }
} catch (error) {
  console.error(`Workflow ${stage ?? '(missing stage)'} verification failed: ${error.message}`);
  process.exitCode = 1;
}
