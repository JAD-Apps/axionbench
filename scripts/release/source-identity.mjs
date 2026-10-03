// Source identity of a release build. The code source is the checked-out Git
// commit; a daily refresh may change only data projections on top of it. Those
// changed data files are listed and digested as a separate overlay, so a build is
// never labelled clean when tracked bytes differ and no commit is invented.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalDigest, pathProblem, sha256 } from './manifest.mjs';

export const OVERLAY_DIGEST_FORMAT = 'axionbench-data-overlay-v1';
// Only refresh outputs may form an overlay. Everything else that differs from
// the commit makes the code source dirty.
export const OVERLAY_PATTERNS = [
  /^data\/[^/]+\.json$/,
  /^data\/authority\/[^/]+\.json$/,
  /^data\/source-snapshots\/[A-Za-z0-9._@+~/-]+$/,
  /^public\/data(?:-details|-manifest)?\.json$/,
  /^PUBLIC-SOURCE-MANIFEST\.json$/,
  /^docs\/DATA-CHANGELOG\.md$/,
];
export const MAX_OVERLAY_FILES = 1500;
export const isOverlayPath = (path) => pathProblem(path) === null && OVERLAY_PATTERNS.some((pattern) => pattern.test(path));

// Parses `git status --porcelain=v1 -z --untracked-files=all`. Renames and
// copies count both paths; a path that cannot be parsed is treated as code.
export function changedPaths(porcelainZ) {
  const fields = porcelainZ.split('\0').filter(Boolean);
  const out = [];
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    const status = entry.slice(0, 2), path = entry.slice(3);
    out.push({ status, path });
    if (/[RC]/.test(status)) { i += 1; out.push({ status, path: fields[i] }); }
  }
  return out;
}

export function overlayDigest(files) {
  // Deleted overlay files are recorded with a null hash and -1 bytes.
  return canonicalDigest(files.map((file) => ({ path: file.path, sha256: file.sha256 ?? '0'.repeat(64), bytes: file.bytes ?? -1 })), OVERLAY_DIGEST_FORMAT);
}

export async function sourceIdentity(root, { git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) } = {}) {
  const sourceCommit = git('rev-parse', 'HEAD').trim();
  assert.match(sourceCommit, /^[a-f0-9]{40}$/, 'HEAD must resolve to a full commit');
  const changes = changedPaths(git('status', '--porcelain=v1', '-z', '--untracked-files=all'));
  const code = changes.filter((change) => !isOverlayPath(change.path));
  const overlay = changes.filter((change) => isOverlayPath(change.path));
  const identity = { sourceCommit, sourceDirty: changes.length > 0, codeDirty: code.length > 0 };
  if (overlay.length === 0) return identity;
  if (overlay.length > MAX_OVERLAY_FILES) return { ...identity, codeDirty: true, overlayRefused: `overlay lists ${overlay.length} files, over ${MAX_OVERLAY_FILES}` };
  const files = [];
  for (const { status, path } of [...new Map(overlay.map((change) => [change.path, change])).values()].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))) {
    if (status.includes('D')) { files.push({ path, sha256: null, bytes: null }); continue; }
    const bytes = await readFile(join(root, path));
    files.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  return { ...identity, dataOverlay: { format: OVERLAY_DIGEST_FORMAT, baseCommit: sourceCommit, fileCount: files.length, overlaySha256: overlayDigest(files), files } };
}

// Structural validation of a manifest's overlay claim.
export function validateOverlay(manifest) {
  if (!Object.hasOwn(manifest, 'dataOverlay')) return;
  const overlay = manifest.dataOverlay;
  assert.equal(typeof manifest.codeDirty, 'boolean', 'an overlay manifest must record codeDirty');
  assert.equal(manifest.sourceDirty, true, 'a data overlay is uncommitted: sourceDirty must stay true');
  assert.equal(overlay?.format, OVERLAY_DIGEST_FORMAT, 'unknown overlay format');
  assert.equal(overlay.baseCommit, manifest.sourceCommit, 'overlay must name the code commit it is applied to');
  assert.ok(Array.isArray(overlay.files) && overlay.files.length > 0 && overlay.files.length <= MAX_OVERLAY_FILES, 'overlay file list must be bounded and non-empty');
  assert.equal(overlay.fileCount, overlay.files.length, 'overlay fileCount disagrees with files');
  let previous = null;
  for (const file of overlay.files) {
    assert.ok(isOverlayPath(file.path), `overlay path is not a refresh output: ${file.path}`);
    if (previous !== null) assert.ok(Buffer.compare(Buffer.from(previous), Buffer.from(file.path)) < 0, 'overlay files must be sorted and unique');
    previous = file.path;
    if (file.sha256 !== null) { assert.match(file.sha256, /^[a-f0-9]{64}$/); assert.ok(Number.isInteger(file.bytes) && file.bytes >= 0); }
    else assert.equal(file.bytes, null, 'deleted overlay file has no size');
  }
  assert.equal(overlayDigest(overlay.files), overlay.overlaySha256, 'overlaySha256 does not match the listed overlay files');
}

// A release may be published from a clean commit, or from a clean code commit
// plus a validated data overlay. Changed code is never publishable.
export function publishableSource(manifest) {
  if (manifest.sourceDirty === false) return true;
  return manifest.codeDirty === false && Object.hasOwn(manifest, 'dataOverlay');
}
