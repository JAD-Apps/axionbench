// Clean release build: remove dist, build from the committed source, then write
// dist/release-manifest.json binding the product tree, data and source commit.
import { execFileSync, spawnSync } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { buildManifest, MANIFEST_NAME, validateManifest } from './manifest.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
await rm('dist', { recursive: true, force: true });
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) { console.error('Release build failed; no manifest written.'); process.exit(build.status ?? 1); }
const manifest = await buildManifest('dist', { sourceCommit: git('rev-parse', 'HEAD'), sourceDirty: git('status', '--porcelain').length > 0 });
validateManifest(manifest);
await writeFile(`dist/${MANIFEST_NAME}`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Release manifest: ${manifest.fileCount} served files + ${manifest.controlFiles.length} control files; product ${manifest.productSha256}; data ${manifest.dataSha256}; commit ${manifest.sourceCommit}${manifest.sourceDirty ? ' (dirty tree)' : ''}.`);
