// Release product manifest: canonical digest format, clean-build scan and pure
// validation. Nothing here touches the network; the deployment verifier calls
// these functions before it fetches anything.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SCHEMA_VERSION = 'axionbench-release-manifest-v1';
export const PRODUCT_DIGEST_FORMAT = 'axionbench-product-v1';
export const CONTROL_DIGEST_FORMAT = 'axionbench-control-v1';
export const MANIFEST_NAME = 'release-manifest.json';
// Cloudflare Pages deployment control files configure the host; they are not
// HTTP-served assets, so they are listed and digested separately.
export const CONTROL_FILES = ['_headers', '_redirects', '_routes.json'];

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const HEX64 = /^[a-f0-9]{64}$/;
const SEGMENT = /^[A-Za-z0-9._@+~-]+$/;

// Canonical release paths are relative, POSIX, unescaped and made only of safe
// segments: no leading slash, backslash, query, fragment, dot segment, empty
// segment, percent-escape or drive letter.
export function pathProblem(path) {
  if (typeof path !== 'string' || path === '') return 'path must be a non-empty string';
  if (path.startsWith('/')) return 'absolute path';
  if (/^[A-Za-z]:/.test(path)) return 'drive-letter path';
  if (path.includes('\\')) return 'backslash in path';
  if (path.includes('?')) return 'query in path';
  if (path.includes('#')) return 'fragment in path';
  if (path.includes('%')) return 'percent-escape in path';
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment === '') return 'empty path segment';
    if (segment === '.' || segment === '..') return 'dot or traversal segment';
    if (!SEGMENT.test(segment)) return `non-canonical segment ${JSON.stringify(segment)}`;
  }
  return null;
}

export const compareBytewise = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

// Digest = SHA-256 of "<format>\n" followed by one line per file, sorted
// bytewise by path: "<sha256>  <bytes>  <path>\n".
export function canonicalDigest(files, format = PRODUCT_DIGEST_FORMAT) {
  const lines = [...files].sort((a, b) => compareBytewise(a.path, b.path)).map((file) => `${file.sha256}  ${file.bytes}  ${file.path}\n`);
  return sha256(Buffer.from(`${format}\n${lines.join('')}`));
}

async function walk(root, relative = '') {
  const out = [];
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await walk(root, path));
    else if (entry.isFile()) out.push(path);
    else throw new Error(`release directory contains a non-regular entry: ${path}`);
  }
  return out;
}

// Hash the complete build directory. Served assets and control files are split;
// the manifest itself is neither (it cannot contain its own hash).
export async function scanDist(distDir) {
  const served = [], control = [];
  for (const path of (await walk(distDir)).sort(compareBytewise)) {
    if (path === MANIFEST_NAME) continue;
    const problem = pathProblem(path);
    assert.equal(problem, null, `build file ${path}: ${problem}`);
    const bytes = await readFile(join(distDir, path));
    const entry = { path, sha256: sha256(bytes), bytes: bytes.length };
    (CONTROL_FILES.includes(path) ? control : served).push(entry);
  }
  return { files: served, controlFiles: control };
}

export async function buildManifest(distDir, { sourceCommit, sourceDirty, builtAt = new Date().toISOString() }) {
  const { files, controlFiles } = await scanDist(distDir);
  const data = files.find((file) => file.path === 'data.json');
  assert.ok(data, 'build has no data.json');
  return {
    schemaVersion: SCHEMA_VERSION,
    digestFormat: { product: PRODUCT_DIGEST_FORMAT, control: CONTROL_DIGEST_FORMAT },
    sourceCommit, sourceDirty, builtAt,
    productSha256: canonicalDigest(files),
    controlSha256: canonicalDigest(controlFiles, CONTROL_DIGEST_FORMAT),
    dataSha256: data.sha256,
    fileCount: files.length,
    files, controlFiles,
  };
}

// Pure structural validation: run before any fetch. Recomputes both digests from
// the listed per-file hashes so a claimed digest cannot disagree with its files.
export function validateManifest(manifest, { sourceArchiveSha256 } = {}) {
  assert.equal(manifest?.schemaVersion, SCHEMA_VERSION, 'unknown manifest schema');
  assert.deepEqual(manifest.digestFormat, { product: PRODUCT_DIGEST_FORMAT, control: CONTROL_DIGEST_FORMAT }, 'unknown digest format');
  if (sourceArchiveSha256 === undefined) {
    assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/, 'sourceCommit must be a full commit id');
    assert(!Object.hasOwn(manifest, 'sourceArchiveSha256'), 'checkout manifest cannot claim archive provenance');
  } else {
    assert.match(sourceArchiveSha256, HEX64, 'expected archive source digest required');
    assert.equal(manifest.sourceCommit, null, 'archive cannot claim a Git commit');
    assert.equal(manifest.sourceDirty, true, 'uncommitted archive must remain explicit');
    assert.equal(manifest.sourceArchiveSha256, sourceArchiveSha256, 'archive source identity mismatch');
  }
  assert.equal(typeof manifest.sourceDirty, 'boolean', 'sourceDirty must be recorded');
  assert.ok(Number.isFinite(Date.parse(manifest.builtAt)), 'builtAt must be a timestamp');
  for (const [name, list] of [['files', manifest.files], ['controlFiles', manifest.controlFiles]]) {
    assert.ok(Array.isArray(list), `${name} must be an array`);
    const seen = new Set();
    let previous = null;
    for (const entry of list) {
      const problem = pathProblem(entry?.path);
      assert.equal(problem, null, `${name} path ${JSON.stringify(entry?.path)}: ${problem}`);
      assert.ok(!seen.has(entry.path), `${name} lists ${entry.path} twice`);
      seen.add(entry.path);
      assert.match(entry.sha256, HEX64, `${name} ${entry.path}: sha256`);
      assert.ok(Number.isInteger(entry.bytes) && entry.bytes >= 0, `${name} ${entry.path}: bytes`);
      if (previous !== null) assert.ok(compareBytewise(previous, entry.path) < 0, `${name} must be sorted bytewise by path (${entry.path})`);
      previous = entry.path;
    }
  }
  assert.ok(manifest.files.length >= 3, 'manifest lists too few served files');
  assert.equal(manifest.fileCount, manifest.files.length, 'fileCount disagrees with files');
  assert.ok(!manifest.files.some((entry) => entry.path === MANIFEST_NAME), 'the manifest cannot list itself');
  assert.ok(!manifest.files.some((entry) => CONTROL_FILES.includes(entry.path)), 'control files must not be listed as served assets');
  assert.ok(manifest.controlFiles.every((entry) => CONTROL_FILES.includes(entry.path)), 'controlFiles may only list Cloudflare control files');
  assert.match(manifest.productSha256, HEX64);
  assert.match(manifest.controlSha256, HEX64);
  assert.equal(canonicalDigest(manifest.files), manifest.productSha256, 'productSha256 does not match the listed file hashes');
  assert.equal(canonicalDigest(manifest.controlFiles, CONTROL_DIGEST_FORMAT), manifest.controlSha256, 'controlSha256 does not match the listed control hashes');
  const data = manifest.files.find((entry) => entry.path === 'data.json');
  assert.ok(data, 'manifest must list data.json');
  assert.equal(manifest.dataSha256, data.sha256, 'dataSha256 does not match data.json');
  return manifest;
}

// The manifest must describe exactly the clean local build: nothing omitted,
// nothing extra, every hash and size actual.
export function compareWithBuild(manifest, scanned) {
  for (const [name, listed, actual] of [['served', manifest.files, scanned.files], ['control', manifest.controlFiles, scanned.controlFiles]]) {
    const byPath = new Map(actual.map((entry) => [entry.path, entry]));
    const listedPaths = new Set(listed.map((entry) => entry.path));
    for (const entry of actual) assert.ok(listedPaths.has(entry.path), `manifest omits ${name} build file ${entry.path}`);
    for (const entry of listed) {
      const local = byPath.get(entry.path);
      assert.ok(local, `manifest lists ${name} file absent from the build: ${entry.path}`);
      assert.equal(local.sha256, entry.sha256, `${name} file ${entry.path} differs from the manifest hash`);
      assert.equal(local.bytes, entry.bytes, `${name} file ${entry.path} differs from the manifest size`);
    }
  }
}

// Minimal Cloudflare _headers parser: an unindented URL pattern followed by
// indented "Name: value" lines. "*" is a splat, as Pages documents.
export function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) { current = { pattern: raw.trim(), headers: [] }; rules.push(current); continue; }
    assert.ok(current, '_headers value before any URL pattern');
    const at = raw.indexOf(':');
    assert.ok(at > 0, `_headers line is not "Name: value": ${raw.trim()}`);
    current.headers.push([raw.slice(0, at).trim().toLowerCase(), raw.slice(at + 1).trim()]);
  }
  return rules;
}
const patternMatches = (pattern, urlPath) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(urlPath);
export function expectedHeaders(rules, urlPath) {
  const expected = new Map();
  for (const rule of rules) if (patternMatches(rule.pattern, urlPath)) for (const [name, value] of rule.headers) expected.set(name, value);
  return expected;
}
