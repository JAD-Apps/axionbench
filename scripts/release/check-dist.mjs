// Read-only health check for the static release candidate: dist/ must be
// exactly the served tree its release manifest describes (files, bytes and
// digests), with the public data file present.
import { access, readFile } from 'node:fs/promises';
import { compareWithBuild, MANIFEST_NAME, scanDist, validateManifest } from './manifest.mjs';

const dir = process.argv[2] ?? 'dist';
await access(`${dir}/index.html`);
await access(`${dir}/data.json`);
const manifest = validateManifest(JSON.parse(await readFile(`${dir}/${MANIFEST_NAME}`, 'utf8')));
compareWithBuild(manifest, await scanDist(dir));
console.log(`release:check passed: ${manifest.fileCount} files; product ${manifest.productSha256}; data ${manifest.dataSha256}; commit ${manifest.sourceCommit}${manifest.sourceDirty ? ' (dirty tree)' : ''}.`);
