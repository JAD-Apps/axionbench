// Read-only verification of every release byte and its current source identity.
import assert from 'node:assert/strict';
import { access, lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateSource } from './boundary.mjs';
import { compareWithBuild, MANIFEST_NAME, scanDist, validateManifest } from '../release/manifest.mjs';
const root = new URL('../../', import.meta.url);
const dir = new URL('../../dist/', import.meta.url);
await access(new URL('index.html', dir));
await access(new URL('data.json', dir));
const source = await validateSource(fileURLToPath(root));
const manifest = JSON.parse(await readFile(new URL(MANIFEST_NAME, dir), 'utf8'));
if (Object.hasOwn(manifest, 'sourceArchiveSha256')) {
  await assert.rejects(lstat(new URL('.git', root)), error => error.code === 'ENOENT', 'checkout must use its Git identity');
  validateManifest(manifest, { sourceArchiveSha256: source.sourceSha256 });
} else {
  await lstat(new URL('.git', root));
  validateManifest(manifest);
}
compareWithBuild(manifest, await scanDist(fileURLToPath(dir)));
console.log(`release:check passed: ${manifest.fileCount} files; product ${manifest.productSha256}; data ${manifest.dataSha256}.`);
