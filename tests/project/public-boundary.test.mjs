import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { preparePublicSnapshot } from '../../scripts/public-snapshot.mjs';
import { extractPublicArchive, preparationEnvironment, INSTALL } from '../../scripts/project/verify-public-boundary.mjs';
import { verifyArtifact, readReceiptArtifact, verifyCommandEvidence, verifyEvidenceBinding } from '../../scripts/project/receipts.mjs';
import { boundaryTestDirectory } from '../../scripts/public/temp-directory.mjs';
import { sha256, validateSource, scanSource, outsideRepository, assertPublicFields } from '../../scripts/public/boundary.mjs';
import { buildManifest, validateManifest } from '../../scripts/release/manifest.mjs';
import { restorePrivatePrice } from '../../scripts/project/restore-private-price.mjs';

async function owned(fn) {
  await mkdir('test-results/public-regressions', { recursive: true });
  const root = await mkdtemp(resolve('test-results/public-regressions/fixture-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test('scratch stays in project test area with /tmp unavailable and audit boundaries remain strict', () => owned(async root => {
  const base = await boundaryTestDirectory({ temporaryRoot: root });
  assert(base.startsWith(join(root, 'axionbench-public-tests-')));
  const fixture = join(base, 'source'); await mkdir(join(fixture, '.git'), { recursive: true });
  assert.equal(await outsideRepository(fixture, join(base, 'audit')), join(base, 'audit'));
  await assert.rejects(outsideRepository(fixture, join(fixture, 'audit')), /outside the repository/);
  await symlink(fixture, join(base, 'alias'));
  await assert.rejects(outsideRepository(fixture, join(base, 'alias', 'audit')), /outside the repository/);
  const error = Object.assign(new Error('fixture read-only area'), { code: 'EROFS' });
  await assert.rejects(boundaryTestDirectory({ temporaryRoot: root, create: async () => { throw error; } }), cause => cause === error);
}));
test('archive extractor rejects private files, traversal, links, duplicates and corrupt permitted bytes', () => owned(async root => {
  const bytes = Buffer.from('fixture'); const row = { path: 'allowed.txt', bytes: bytes.length, sha256: sha256(bytes) };
  const archive = join(root, 'fixture.tar');
  for (const mode of ['extra', 'traversal', 'symlink', 'duplicate', 'corrupt']) {
    const result = spawnSync('python3', ['-c', `import tarfile,io,sys
with tarfile.open(sys.argv[1],'w') as t:
 mode=sys.argv[2]; p=tarfile.TarInfo('../allowed.txt' if mode=='traversal' else 'allowed.txt'); b=b'corrupt' if mode=='corrupt' else b'fixture'; p.size=len(b)
 if mode=='symlink': p.type=tarfile.SYMTYPE; p.linkname='private.txt'; p.size=0
 t.addfile(p,io.BytesIO(b) if p.isfile() else None)
 if mode=='duplicate': t.addfile(p,io.BytesIO(b))
 if mode=='extra': q=tarfile.TarInfo('docs/owner-approval.json'); q.size=2; t.addfile(q,io.BytesIO(b'{}'))
`, archive, mode]);
    assert.equal(result.status, 0);
    assert.throws(() => extractPublicArchive(archive, join(root, mode), { [row.path]: row }), /Command failed/);
    await assert.rejects(readFile(join(root, mode, 'allowed.txt')), error => error.code === 'ENOENT');
  }
}));
test('allowlisted snapshot needs no private audit files and refuses nonempty output', () => owned(async root => {
  const candidate = join(root, 'public');
  const source = await preparePublicSnapshot(candidate);
  assert(source.files.every(row => !row.path.includes('source-snapshots') && !row.path.startsWith('evidence/') && !row.path.includes('/project/')));
  assert.deepEqual(await validateSource(candidate), source);
  // Browser receipts must hash files in the public archive itself. A private
  // preparation path can parse successfully yet fail only at runtime.
  const publicPaths = new Set(source.files.map(row => row.path));
  for (const name of ['test-routes.mjs', 'test-core-views.mjs', 'test-cost-version-views.mjs']) {
    const text = await readFile(join(candidate, 'scripts', name), 'utf8');
    const references = text.match(/const sourcePaths = \[([^\]]+)\]/)?.[1];
    assert(references, name + ': source identity evidence must be declared');
    for (const [, path] of references.matchAll(/'([^']+)'/g)) assert(publicPaths.has(path), name + ': private or missing runtime evidence path ' + path);
  }
  const pkg = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['test:cost-version-views'], 'node scripts/test-cost-version-views.mjs');

  await assert.rejects(preparePublicSnapshot(candidate), /must be empty/);
  await writeFile(join(candidate, 'extra.json'), '{}');
  await assert.rejects(scanSource(candidate), /unallowlisted file/);
}));
test('preparation uses pinned frozen install and drops module/Git/private-audit injection', () => {
  assert.deepEqual(INSTALL, ['ci','--include=dev','--no-audit','--no-fund']);
  const env = preparationEnvironment('/owned/scratch');
  for (const key of ['NODE_PATH','NODE_OPTIONS','GIT_DIR','GIT_WORK_TREE','AXIONBENCH_PRICE_AUDIT_DIR','CLOUDFLARE_API_TOKEN','npm_config_allow_scripts']) assert(!Object.hasOwn(env, key));
  assert.equal(env.TMPDIR, '/owned/scratch');
});
test('nested private fields are rejected while factual raw scores and public source hashes remain permitted', () => {
  for (const key of ['subscription','snapshotPath','responseBody','access_token','workflowReceipt']) {
    assert.throws(() => assertPublicFields({ model: [{ [key]: 'fixture' }] }), /private field/);
  }
  assert.doesNotThrow(() => assertPublicFields({ rawValue: 0, snapshotSha256: 'a'.repeat(64), reasoningBudgetTokens: null }));
});
test('receipt checks reject changed bytes, symlinks, missing commands, failed exits and stale source identity', () => owned(async root => {
  const bytes = Buffer.from('actual fixture command log'); const log = { path: 'gate.log', bytes: bytes.length, sha256: sha256(bytes) };
  await writeFile(join(root, log.path), bytes);
  const source = sha256(Buffer.from('candidate source'));
  const receipt = { passed: true, publicSourceSha256: source, results: [{ command: 'node fixture', exitCode: 0, milliseconds: 1, log: log.path, logBytes: log.bytes, logSha256: log.sha256 }] };
  const options = { sourceSha256: source, commands: ['node fixture'] };
  await verifyCommandEvidence(root, receipt, options);
  await assert.rejects(verifyCommandEvidence(root, receipt, { ...options, sourceSha256: '0'.repeat(64) }), /binding mismatch/);
  await assert.rejects(verifyCommandEvidence(root, receipt, { ...options, commands: ['node missing'] }), /command evidence/);
  await assert.rejects(verifyCommandEvidence(root, { ...receipt, results: [{ ...receipt.results[0], exitCode: 1 }] }, options), /command failed/);
  await assert.rejects(verifyArtifact(root, { ...log, path: '../gate.log' }), /unsafe artifact/);
  await symlink(join(root, log.path), join(root, 'alias.log'));
  await assert.rejects(verifyArtifact(root, { ...log, path: 'alias.log' }), /symlink/);
  await writeFile(join(root, log.path), Buffer.alloc(bytes.length));
  await assert.rejects(verifyArtifact(root, log), /hash mismatch/);
  const encoded = Buffer.from(JSON.stringify(receipt)); await writeFile(join(root, 'receipt.json'), encoded);
  assert.deepEqual(await readReceiptArtifact(root, { path: 'receipt.json', bytes: encoded.length, sha256: sha256(encoded) }), receipt);
  assert.throws(() => verifyEvidenceBinding(receipt, {}), /trusted expected/);
  assert.throws(() => verifyEvidenceBinding({ ...receipt, revision: 'old' }, { revision: 'new' }), /binding mismatch/);
}));
test('archive release identity is explicit and cannot bypass private checkout provenance', () => owned(async root => {
  for (const file of ['index.html','data.json','app.js']) await writeFile(join(root, file), '{}');
  const archive = sha256(Buffer.from('source archive'));
  const manifest = await buildManifest(root, { sourceCommit: null, sourceDirty: true });
  manifest.sourceArchiveSha256 = archive;
  assert.throws(() => validateManifest(manifest), /sourceCommit/);
  validateManifest(manifest, { sourceArchiveSha256: archive });
  assert.throws(() => validateManifest(manifest, { sourceArchiveSha256: '0'.repeat(64) }), /identity mismatch/);
  assert.throws(() => validateManifest({ ...manifest, sourceCommit: 'a'.repeat(40) }, { sourceArchiveSha256: archive }), /cannot claim/);
  assert.throws(() => validateManifest({ ...manifest, sourceDirty: false }, { sourceArchiveSha256: archive }), /explicit/);
  assert.throws(() => validateManifest({ ...manifest, productSha256: '0'.repeat(64) }, { sourceArchiveSha256: archive }), /productSha256/);
}));
test('private tariff restoration requires exact original bytes and never substitutes missing evidence', () => owned(async root => {
  const facts = JSON.parse(await readFile('data/public-price-facts.json', 'utf8'));
  const preserved = join(root, 'preserved.html'), target = join(root, 'private', 'original.html');
  await writeFile(preserved, Buffer.alloc(facts.source.bytes));
  await assert.rejects(restorePrivatePrice({ facts, preserved, target }), /preserved original tariff hash/);
  await assert.rejects(readFile(target), error => error.code === 'ENOENT');
  await assert.rejects(restorePrivatePrice({ facts, preserved: join(root, 'missing'), target: join(root, 'absent') }), error => error.code === 'ENOENT');
  await assert.rejects(restorePrivatePrice({ facts: { source: { ...facts.source, sha256: '0'.repeat(64) } }, preserved, target }), /qualified private input/);
  await mkdir(join(root, 'private')); await writeFile(target, Buffer.alloc(facts.source.bytes));
  await assert.rejects(restorePrivatePrice({ facts, preserved, target }), /original tariff hash/);
}));
test('qualification contracts stay private; public docs make no untested live-daily claim; the public harness keeps the production target strict', () => owned(async root => {
  const candidate = join(root, 'public');
  const source = await preparePublicSnapshot(candidate);
  const paths = new Set(source.files.map(row => row.path));
  for (const privatePath of ['scripts/project/authority.mjs', 'scripts/project/qualification.mjs', 'scripts/project/qualify-public.mjs', 'scripts/project/verify-receipts.mjs',
    'scripts/automation/jadbot-daily.mjs', 'scripts/release/readback.mjs', 'tests/project/qualification.test.mjs', 'tests/project/native-schedule.test.mjs', 'tests/project/evidence-fixtures.mjs', 'docs/project/QUALIFICATION.md']) {
    assert(!paths.has(privatePath), 'private qualification file leaked: ' + privatePath);
  }
  assert(paths.has('scripts/test-target.mjs') && paths.has('scripts/test-harness.mjs'), 'public browser suites carry their target selector');
  for (const doc of ['README.md', 'docs/AUTOMATION.md']) {
    const text = await readFile(join(candidate, doc), 'utf8');
    assert(!/live site is updated daily|updates? (?:the site )?every day|runs daily/i.test(text), doc + ': untested live-daily claim');
  }
  assert(/not claimed here until/.test(await readFile(join(candidate, 'README.md'), 'utf8')));
  const publicText = (await Promise.all(source.files.filter(row => /\.(?:mjs|json|md|ya?ml)$/.test(row.path)).map(row => readFile(join(candidate, row.path), 'utf8')))).join('\n');
  assert(!/axionbench-stage-receipt-v1|axionbench-trust-v1|fixture-reviewer|run_ec6c62962fc6/.test(publicText), 'private evidence contracts or run identities in public source');
  const harness = await import(join(resolve(candidate), 'scripts/test-target.mjs'));
  assert.deepEqual(harness.parseTarget([]), { production: false, url: null, expect: {} });
  assert.equal(harness.parseTarget(['--url', 'https://axionbench.jadapps.app']).production, true);
  for (const bad of [['--url', 'https://axionbench.pages.dev'], ['--url', 'http://axionbench.jadapps.app'], ['--url', 'https://axionbench.jadapps.app/x'], ['--url'], ['--data-sha256', 'a'.repeat(64)], ['--rebuild', 'x']]) {
    assert.throws(() => harness.parseTarget(bad), /./, bad.join(' '));
  }
  // Changed candidate: the sealed public source no longer matches after any byte changes.
  const sealed = (await validateSource(candidate)).sourceSha256;
  await writeFile(join(candidate, 'README.md'), (await readFile(join(candidate, 'README.md'), 'utf8')) + '\nchanged\n');
  await assert.rejects(validateSource(candidate), /public source manifest must describe every actual file byte/);
  assert.match(sealed, /^[a-f0-9]{64}$/);
}));
