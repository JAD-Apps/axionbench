// npm run verify:automation — re-runnable and read-only for external systems.
// Validates workflows, the refresh/manifest/deployment regression checks, a clean
// local release build with its manifest hashes, and credential-free output.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { DEFAULT_MAX_CHANGES } from './refresh.mjs';
import { findSecrets } from './secrets.mjs';
import { compareWithBuild, scanDist, validateManifest, sha256 } from '../release/manifest.mjs';

const text = (path) => readFile(path, 'utf8');
const json = async (path) => JSON.parse(await text(path));
const captured = [];
const checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log(`ok  ${name}`); };
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  captured.push(result.stdout ?? '', result.stderr ?? '');
  if (result.status !== 0) { process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? ''); }
  assert.equal(result.status, 0, `${command} ${args.join(' ')} exited ${result.status}`);
};

const config = await json('deploy.config.json');
const pkg = await json('package.json');
const workflowNames = ['ci', 'deploy', 'refresh-data'];

await check('workflow files are structurally valid, pinned and least-privilege', async () => {
  for (const name of workflowNames) {
    const source = await text(`.github/workflows/${name}.yml`);
    assert.ok(!/\t/.test(source), `${name}: tab indentation`);
    assert.match(source, /^name: .+$/m, `${name}: name`);
    assert.match(source, /^on:\s*$/m, `${name}: triggers`);
    assert.match(source, /^permissions:\s*\n\s+contents: (read|write)/m, `${name}: top-level permissions`);
    assert.match(source, /^jobs:\s*$/m);
    assert.ok(!/pull_request_target/.test(source), `${name}: pull_request_target is not allowed`);
    assert.match(source, /^\s+timeout-minutes: \d+$/m, `${name}: job timeout`);
    const uses = [...source.matchAll(/^\s*- uses: (\S+)$/gm)].map((m) => m[1]);
    assert.ok(uses.length >= 2, `${name}: uses actions`);
    for (const reference of uses) assert.match(reference, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/, `${name}: action ${reference} must be pinned to a full commit`);
    assert.match(source, /npm ci\b/, `${name}: frozen install`);
    assert.ok(!/npm install(?! --global)/.test(source), `${name}: unfrozen install`);
    for (const [, secret] of source.matchAll(/secrets\.([A-Z0-9_]+)/g)) assert.ok(config.secretNames.includes(secret), `${name}: secret ${secret} is not in deploy.config.json secretNames`);
    assert.deepEqual(findSecrets(source), [], `${name}: credential-shaped text`);
    for (const forbidden of config.forbiddenProjects) assert.ok(!source.includes(forbidden), `${name}: must not reference Pages project ${forbidden}`);
    for (const [, script] of source.matchAll(/npm run (?:--silent )?([\w:-]+)/g)) assert.ok(pkg.scripts[script], `${name}: npm script ${script} does not exist`);
  }
  const ci = await text('.github/workflows/ci.yml');
  for (const step of ['npm run lint', 'npm run typecheck', 'npm run test:unit', 'npm run test:data', 'npm run test:browser', 'npm run build:release', 'npm run verify:automation']) assert.ok(ci.includes(step), `ci.yml must run ${step}`);
  assert.match(ci, /pull_request:/);
  const deploy = await text('.github/workflows/deploy.yml');
  assert.match(deploy, /workflow_dispatch:/);
  assert.ok(!/^\s+(push|pull_request|schedule):/m.test(deploy), 'deployment is manual only');
  assert.match(deploy, /environment: production/);
  assert.match(deploy, /if: github\.ref == 'refs\/heads\/main'/);
  assert.ok(deploy.includes(`--project-name ${config.projectName}`), 'deploy must target the independent project');
  assert.ok(deploy.includes(`wrangler@${config.wranglerVersion}`), 'wrangler version is pinned');
  assert.match(deploy, /--commit-dirty=false/);
  assert.match(deploy, /deploy:readback/);
  assert.ok(deploy.indexOf('build:release') < deploy.indexOf('pages deploy'), 'deploy must build before publishing');
  const refresh = await text('.github/workflows/refresh-data.yml');
  assert.match(refresh, /schedule:/); assert.match(refresh, /npm run data:refresh/);
  assert.match(refresh, /gh pr create --base main/, 'refresh promotes through a reviewed pull request');
  assert.ok(!/git push[^\n]*\bmain\b/.test(refresh), 'refresh must never push to main');
});

await check('deployment configuration matches the immutable owner approval', async () => {
  const approval = await json('docs/owner-approval.json');
  assert.equal(approval.status, 'approved');
  assert.equal(config.hostname, approval.hostname);
  assert.equal(config.provider, 'cloudflare-pages');
  assert.ok(!config.forbiddenProjects.includes(config.projectName));
  assert.equal(config.projectName, 'axionbench');
  assert.equal(config.outputDirectory, 'dist');
  assert.match(pkg.packageManager, /^npm@\d+\.\d+\.\d+$/);
  assert.ok((await json('package-lock.json')).lockfileVersion >= 3);
  const inspection = await json('evidence/cloudflare-inspection.json');
  assert.equal(inspection.findings.plannedIndependentProject, config.projectName);
  assert.ok(inspection.observedProjects.some((p) => p.name === 'jad-apps-site-git' && /untouched/.test(p.note)));
});

await check('refresh, manifest, deployment-gate and credential fixtures pass', async () => { run('node', ['scripts/automation/test-automation.mjs']); });

await check('credential scanner flags credential shapes and ignores name-only references', async () => {
  assert.equal(findSecrets('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}').length, 0);
  assert.equal(findSecrets('needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID').length, 0);
  assert.equal(findSecrets(`token=${'ghp_'}${'a'.repeat(30)}`)[0].kind, 'GitHub token');
  assert.equal(findSecrets(`CLOUDFLARE_API_TOKEN=${'x'.repeat(40)}`)[0].kind, 'Cloudflare token assignment');
  assert.equal(findSecrets('-----BEGIN PRIVATE KEY-----')[0].kind, 'private key block');
});

await check('change volume stays inside the provenance bound', async () => {
  const changed = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(changed.length <= DEFAULT_MAX_CHANGES, `${changed.length} changed files exceeds ${DEFAULT_MAX_CHANGES}`);
});

await check('clean release build produces a complete, hash-exact manifest', async () => {
  run('npm', ['run', 'build:release']);
  const manifest = validateManifest(await json('dist/release-manifest.json'));
  compareWithBuild(manifest, await scanDist('dist'));
  assert.equal(manifest.dataSha256, sha256(await readFile('dist/data.json')));
  assert.equal(manifest.dataSha256, sha256(await readFile('public/data.json')), 'dist data differs from the committed public projection');
  const paths = manifest.files.map((file) => file.path);
  for (const required of ['index.html', 'data.json', 'data-manifest.json', 'assets/surface.js']) assert.ok(paths.includes(required), `build is missing ${required}`);
  assert.deepEqual(manifest.controlFiles.map((file) => file.path), ['_headers'], 'Cloudflare _headers must be deployed as a control file');
  assert.ok(!paths.some((path) => /\.(mp4|mov|env)$|^demo\/|(^|\/)node_modules\/|^evidence\/|owner-approval/.test(path)), 'private or local artefacts must not be in the build');
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(manifest.sourceCommit, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
});

await check('build output, tracked configuration and command output are credential-free', async () => {
  const manifest = await json('dist/release-manifest.json');
  for (const file of manifest.files) {
    if (/\.(png|jpe?g|webp|ttf|woff2?)$/.test(file.path)) continue;
    assert.deepEqual(findSecrets(await text(`dist/${file.path}`)), [], `dist/${file.path}`);
  }
  for (const path of ['deploy.config.json', 'package.json', 'evidence/cloudflare-inspection.json', 'docs/DEPLOYMENT.md', 'docs/AUTOMATION.md']) assert.deepEqual(findSecrets(await text(path)), [], path);
  assert.deepEqual(findSecrets(captured.join('\n')), [], 'captured command output');
});

console.log(`verify:automation passed ${checks.length} checks. No network, deployment, DNS or browser operation was performed.`);
