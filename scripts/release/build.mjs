// Clean release build: remove dist, build from the committed source, then write
// dist/release-manifest.json binding the product tree, data, source commit and
// any separately identified data overlay.
import { spawnSync } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { buildManifest, MANIFEST_NAME, validateManifest } from './manifest.mjs';
import { sourceIdentity } from './source-identity.mjs';

await rm('dist', { recursive: true, force: true });
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) { console.error('Release build failed; no manifest written.'); process.exit(build.status ?? 1); }
// Identity is taken after the build so prebuild projection writes are included.
const { overlayRefused, ...identity } = await sourceIdentity(process.cwd());
if (overlayRefused) console.error(`Data overlay refused (${overlayRefused}); the source is recorded as changed code.`);
const manifest = await buildManifest('dist', identity);
validateManifest(manifest);
await writeFile(`dist/${MANIFEST_NAME}`, `${JSON.stringify(manifest, null, 2)}\n`);
const state = !manifest.sourceDirty ? '' : manifest.codeDirty ? ' (changed code)' : ` (clean code + data overlay ${manifest.dataOverlay.overlaySha256}, ${manifest.dataOverlay.fileCount} files)`;
console.log(`Release manifest: ${manifest.fileCount} served files + ${manifest.controlFiles.length} control files; product ${manifest.productSha256}; data ${manifest.dataSha256}; commit ${manifest.sourceCommit}${state}.`);
