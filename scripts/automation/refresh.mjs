// npm run data:refresh -- [--audit-dir <private dir outside the repo>] [--max-changes N]
//                         [--publish --state-dir <dir outside the repo> [--key YYYY-MM-DD.rN]]
// Bounded refresh transaction: snapshot every committed data projection, run the
// real adapters, schema/admission validation and regression guards, then either
// keep the new data with a changelog entry or restore the last-good bytes.
// Source blobs are immutable and content-addressed, so a failed run never alters
// last-good records or the bytes they reference.
// With --publish a validated refresh continues into the publication transaction
// (scripts/release/publication.mjs): clean release build, immutable snapshot,
// authenticated Cloudflare Pages deployment and HTTPS readback. If publication
// fails, production keeps or regains its verified last-good deployment and the
// local projections return to their pre-refresh bytes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../release/manifest.mjs';

export const DEFAULT_MAX_CHANGES = 1500; // stays below JadBot's 2048 changed-file provenance bound
const PROTECTED_DIRS = [['data', /\.json$/], ['data/authority', /\.json$/], ['public', /^data.*\.json$/]];

async function listFiles(root, directory, pattern) {
  try {
    return (await readdir(join(root, directory), { withFileTypes: true })).filter((e) => e.isFile() && pattern.test(e.name)).map((e) => `${directory}/${e.name}`);
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function walkCount(root, directory) {
  const out = new Set();
  const visit = async (relative) => {
    let entries;
    try { entries = await readdir(join(root, relative), { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(path); else out.add(path);
    }
  };
  await visit(directory);
  return out;
}
export async function snapshotProtected(root) {
  const files = new Map();
  for (const [directory, pattern] of PROTECTED_DIRS) for (const path of await listFiles(root, directory, pattern)) files.set(path, await readFile(join(root, path)));
  return files;
}
async function writeAtomic(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.restore`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}
export async function restoreProtected(root, files) {
  for (const [path, bytes] of files) await writeAtomic(join(root, path), bytes);
  const now = await snapshotProtected(root);
  // Files the failed run created among protected projections are last-good-absent; report, never delete silently.
  return [...now.keys()].filter((path) => !files.has(path));
}

export function summarise(bytes) {
  if (!bytes) return null;
  const data = JSON.parse(bytes);
  const c = data.coverage ?? {};
  return { retrievedAt: data.retrievedAt, models: c.catalogueModels, observations: c.observations, suites: c.observedSuites, domains: c.observedDomains, sources: data.sources?.length };
}

// Shape and regression guards on the promoted ingestion projection.
export function assertAcceptable(before, afterBytes) {
  const after = JSON.parse(afterBytes);
  assert.equal(after.schemaVersion, 2, 'ingestion schemaVersion changed');
  for (const key of ['models', 'configurations', 'sources', 'observations']) assert.ok(Array.isArray(after[key]) && after[key].length > 0, `ingestion.${key} must be a non-empty array`);
  assert.ok(Number.isFinite(Date.parse(after.retrievedAt)), 'ingestion.retrievedAt missing');
  if (!before) return;
  assert.ok(Date.parse(after.retrievedAt) >= Date.parse(before.retrievedAt), `refresh is older than last-good (${after.retrievedAt} < ${before.retrievedAt})`);
  const next = summarise(afterBytes);
  assert.ok(next.suites >= before.suites, `observed suites fell from ${before.suites} to ${next.suites}`);
  assert.ok(next.domains >= before.domains, `observed domains fell from ${before.domains} to ${next.domains}`);
  assert.ok(next.observations >= before.observations * 0.9, `observations fell from ${before.observations} to ${next.observations} (more than 10%)`);
  assert.ok(next.models >= before.models * 0.9, `catalogue models fell from ${before.models} to ${next.models} (more than 10%)`);
}

export async function runRefresh({ root, commands, auditDir = null, maxChanges = DEFAULT_MAX_CHANGES, changelogPath = 'docs/DATA-CHANGELOG.md', now = () => new Date(), run = defaultRun }) {
  const before = await snapshotProtected(root);
  const blobsBefore = await walkCount(root, 'data/source-snapshots');
  const beforeSummary = summarise(before.get('data/ingestion.json'));
  const failure = async (stage, message) => {
    const extra = await restoreProtected(root, before);
    const receipt = { status: 'failed-last-good-restored', stage, message, at: now().toISOString(), restoredFiles: before.size, unexpectedNewProtectedFiles: extra,
      newSourceObjects: (await walkCount(root, 'data/source-snapshots')).size - blobsBefore.size };
    if (auditDir) {
      await mkdir(auditDir, { recursive: true });
      const text = `${JSON.stringify(receipt, null, 2)}\n`;
      // Content-addressed name: failure receipts are never overwritten.
      await writeFile(join(auditDir, `refresh-failure-${receipt.at.replace(/[:.]/g, '-')}-${sha256(Buffer.from(text)).slice(0, 12)}.json`), text, { mode: 0o600, flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    }
    return receipt;
  };
  for (const command of commands) {
    const result = run(command, root);
    if (result.status !== 0) return { ok: false, receipt: await failure(command.join(' '), `exit ${result.status}`) };
  }
  try {
    const afterIngestion = await readFile(join(root, 'data/ingestion.json'));
    assertAcceptable(beforeSummary, afterIngestion);
    const after = await snapshotProtected(root);
    const changed = [...after].filter(([path, bytes]) => !before.has(path) || !before.get(path).equals(bytes)).map(([path, bytes]) => ({ path, sha256: sha256(bytes), bytes: bytes.length }));
    const added = [...(await walkCount(root, 'data/source-snapshots'))].filter((path) => !blobsBefore.has(path));
    assert.ok(changed.length + added.length <= maxChanges, `refresh would change ${changed.length + added.length} files, over the ${maxChanges}-file bound`);
    const summary = summarise(afterIngestion);
    if (changed.length === 0 && added.length === 0) return { ok: true, changed: false, receipt: { status: 'no-change', at: now().toISOString() } };
    const entry = [
      `## ${now().toISOString()}`, '',
      `- Sources retrieved: ${summary.retrievedAt}`,
      `- Models ${beforeSummary?.models ?? 'n/a'} → ${summary.models}; observations ${beforeSummary?.observations ?? 'n/a'} → ${summary.observations}; suites ${beforeSummary?.suites ?? 'n/a'} → ${summary.suites}; domains ${beforeSummary?.domains ?? 'n/a'} → ${summary.domains}.`,
      `- New immutable source objects: ${added.length}.`, '- Changed projections:',
      ...changed.map((file) => `  - \`${file.path}\` sha256 \`${file.sha256}\``), '',
    ].join('\n');
    let existing = '# Data changelog\n\nEach validated refresh appends an entry. Failed refreshes restore the last-good data and append nothing.\n\n';
    try { existing = await readFile(join(root, changelogPath), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeAtomic(join(root, changelogPath), `${existing.trimEnd()}\n\n${entry}`);
    return { ok: true, changed: true, receipt: { status: 'promoted', changed: changed.length, newSourceObjects: added.length, at: now().toISOString() } };
  } catch (error) {
    return { ok: false, receipt: await failure('promotion guard', error.message) };
  }
}

function defaultRun(command, root) { return spawnSync(command[0], command.slice(1), { cwd: root, stdio: 'inherit' }); }

export function defaultCommands(auditDir) {
  return [
    ['npm', 'run', 'data:ingest'],
    ...(auditDir ? [['npm', 'run', 'data:authority', '--', auditDir]] : []),
    ...(auditDir ? [['python3', 'scripts/pricing/capture-google.py', '--audit-dir', auditDir + '/pricing']] : []),
    ['node', 'scripts/build-observatory-data.mjs'],
    ['npm', 'run', 'data:validate'],
    ['npm', 'run', 'test:data'],
    ['npm', 'run', 'test:pricing'],
  ];
}

// Refresh, then publish. Publication failures restore the pre-refresh bytes.
export async function refreshAndPublish({ root, refresh, publish, auditDir }) {
  const before = await snapshotProtected(root);
  const refreshed = await refresh();
  if (!refreshed.ok) return { ok: false, stage: 'refresh', refresh: refreshed.receipt };
  let publication;
  try { publication = await publish(); } catch (error) { publication = { ok: false, status: 'failed-before-start', message: error.message }; }
  if (publication.ok) return { ok: true, stage: 'published', refresh: refreshed.receipt, publication };
  const unexpected = await restoreProtected(root, before);
  if (auditDir && refreshed.changed) await writeFile(join(auditDir, `publish-failure-${Date.now()}.json`), `${JSON.stringify({ publication, restoredFiles: before.size, unexpected }, null, 2)}\n`, { mode: 0o600, flag: 'wx' }).catch(() => {});
  return { ok: false, stage: 'publication', refresh: refreshed.receipt, publication, localDataRestored: { files: before.size, unexpectedNewProtectedFiles: unexpected } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
  const auditDir = option('--audit-dir');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const refresh = () => runRefresh({ root, commands: defaultCommands(auditDir), auditDir, maxChanges: Number(option('--max-changes') ?? DEFAULT_MAX_CHANGES) });
  if (args.includes('--publish')) {
    assert.ok(option('--state-dir'), '--publish needs --state-dir <directory outside the repository>');
    const { outsideRepository } = await import('../public/boundary.mjs');
    const { publishBuilt } = await import('../release/publish.mjs');
    const { defaultKey } = await import('../release/publication.mjs');
    const stateDir = await outsideRepository(root, option('--state-dir'));
    const result = await refreshAndPublish({ root, auditDir, refresh, publish: () => publishBuilt({ root, stateDir, key: option('--key') ?? defaultKey() }) });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else {
    const result = await refresh();
    console.log(JSON.stringify(result.receipt));
    if (!result.ok) { console.error(`Refresh failed at "${result.receipt.stage}": ${result.receipt.message}. Last-good data restored.`); process.exitCode = 1; }
  }
}
