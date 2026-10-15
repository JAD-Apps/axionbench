// Portable public-source boundary. No private ingestion, owner records or Git
// history is needed to validate or refresh the published product.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, join, dirname, sep } from 'node:path';

export const SOURCE_MANIFEST = 'PUBLIC-SOURCE-MANIFEST.json';
export const FORMAT = 'axionbench-public-source-v1';
export const RUNTIME_DIRS = new Set(['.git', 'node_modules', 'dist', 'test-results']);
export const FACT_FILES = ['data/authority-deepswe.json', 'data/publisher-percentage-facts.json',
  'data/authority/epoch-hub.json', 'data/authority/bfcl-v4.json', 'data/authority/longbench-v2.json', 'data/public-price-facts.json'];
export const REFRESH_FILES = [...FACT_FILES, 'public/data.json', 'public/data-details.json', 'public/data-manifest.json', SOURCE_MANIFEST];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const byteSort = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export const sourceDigest = files => sha256(Buffer.from(FORMAT + '\n' + [...files].sort((a, b) => byteSort(a.path, b.path))
  .map(file => `${file.sha256}  ${file.bytes}  ${file.path}\n`).join('')));
export const readJson = async (root, path) => JSON.parse(await readFile(join(root, path), 'utf8'));

export function permittedDeepSwe(data) {
  const out = structuredClone(data);
  for (const row of out.rows) { delete row.efficiency; delete row.costBasis; }
  return out;
}
export function assertSafePath(path) {
  assert.match(path, /^[A-Za-z0-9._/-]+$/, `noncanonical public path: ${path}`);
  assert(!path.startsWith('/') && !path.split('/').some(p => !p || p === '.' || p === '..'), `path traversal: ${path}`);
  assert(!/(^|\/)(?:evidence|demo|reference|references|source-snapshots|\.agents|\.codex|\.aws)(\/|$)/i.test(path), `private directory: ${path}`);
  assert(!/(^|\/)(?:ingestion\.json|owner-approval\.json|naming-research\.json|workflow\.json|OVERHAUL-PLAN\.md|\.env[^/]*|\.jadbot[^/]*)(\/|$)/i.test(path), `private file: ${path}`);
  assert(!/\.(?:mp4|webm|mov|pem|key)$/i.test(path), `private/reference media or credential: ${path}`);
}
export async function scanSource(root) {
  const files = [];
  async function visit(dir = '') {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      if (!dir && RUNTIME_DIRS.has(entry.name)) continue;
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      assertSafePath(path);
      assert(!entry.isSymbolicLink(), `public symlink: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else {
        assert(entry.isFile(), `nonregular public file: ${path}`);
        if (path === SOURCE_MANIFEST) continue;
        const bytes = await readFile(join(root, path));
        if (/\.(?:json|mjs|ts|tsx|md|yml|css|html|txt)$/.test(path)) {
          const text = bytes.toString('utf8');
          assert(!/\/(?:home\/johnd|mnt\/[a-z]\/Users)\//i.test(text), `owner filesystem path: ${path}`);
          assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text), `private key: ${path}`);
          assert(!/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{30,})\b/.test(text), `credential: ${path}`);
        }
        files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  await visit();
  return files.sort((a, b) => byteSort(a.path, b.path));
}
export async function sealSource(root) {
  const files = await scanSource(root);
  const manifest = { schemaVersion: FORMAT, digestFormat: FORMAT, sourceSha256: sourceDigest(files), fileCount: files.length, files };
  await writeFile(join(root, SOURCE_MANIFEST), jsonBytes(manifest));
  return manifest;
}
export async function validateSource(root) {
  const manifest = await readJson(root, SOURCE_MANIFEST);
  assert.equal(manifest.schemaVersion, FORMAT);
  assert.equal(manifest.digestFormat, FORMAT);
  const files = await scanSource(root);
  assert.deepEqual(manifest.files, files, 'public source manifest must describe every actual file byte');
  assert.equal(manifest.fileCount, files.length);
  assert.equal(manifest.sourceSha256, sourceDigest(files));
  return manifest;
}
// Check existing ancestors too: a symlink below the repo cannot disguise an
// in-repository audit directory. Raw captures are never written there.
export async function outsideRepository(root, auditDir) {
  let canonicalRoot = await realpath(root);
  for (let ancestor = canonicalRoot; ; ancestor = dirname(ancestor)) {
    try { await lstat(join(ancestor, '.git')); canonicalRoot = ancestor; break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(ancestor) === ancestor) break;
  }
  let path = resolve(auditDir), tail = [];
  while (true) {
    try { await lstat(path); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; tail.unshift(path.slice(path.lastIndexOf(sep) + 1)); path = resolve(path, '..'); }
  }
  const actual = resolve(await realpath(path), ...tail);
  const rel = relative(canonicalRoot, actual);
  assert(rel && (rel === '..' || rel.startsWith('..' + sep)), 'raw audit directory must be outside the repository');
  return actual;
}
