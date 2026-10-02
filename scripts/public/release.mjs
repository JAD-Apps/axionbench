// A checkout records its own Git commit; an archive records its verified source
// digest. Neither mode consults a repository above the public source root.
import { execFileSync, spawnSync } from 'node:child_process';
import { lstat, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateSource } from './boundary.mjs';
import { buildManifest, MANIFEST_NAME, validateManifest } from '../release/manifest.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = await validateSource(root);
let checkout = false;
try { await lstat(new URL('../../.git', import.meta.url)); checkout = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const identity = checkout
  ? { sourceCommit: git('rev-parse', 'HEAD'), sourceDirty: git('status', '--porcelain').length > 0 }
  : { sourceCommit: null, sourceDirty: true };
await rm(new URL('../../dist', import.meta.url), { recursive: true, force: true });
const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const manifest = await buildManifest(fileURLToPath(new URL('../../dist', import.meta.url)), identity);
if (!checkout) manifest.sourceArchiveSha256 = source.sourceSha256;
validateManifest(manifest, checkout ? undefined : { sourceArchiveSha256: source.sourceSha256 });
await writeFile(new URL(`../../dist/${MANIFEST_NAME}`, import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Public release: product ${manifest.productSha256}; data ${manifest.dataSha256}; source ${checkout ? manifest.sourceCommit : manifest.sourceArchiveSha256}.`);
