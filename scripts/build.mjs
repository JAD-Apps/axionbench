import { mkdir, copyFile, cp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const data = JSON.parse(await readFile(join(root, 'data.json'), 'utf8'));
const embedded = (await readFile(join(root, 'assets/data.js'), 'utf8')).trim();
if (embedded !== 'window.METABENCH_DATA = ' + JSON.stringify(data) + ';') {
  throw new Error('data.json and assets/data.js differ. Re-import the source snapshot before building.');
}
const destination = join(root, 'dist');
await mkdir(destination, { recursive: true });
await copyFile(join(root, 'index.html'), join(destination, 'index.html'));
await copyFile(join(root, 'data.json'), join(destination, 'data.json'));
await cp(join(root, 'assets'), join(destination, 'assets'), { recursive: true });
console.log('Built dist/ — static HTML, bundled ECharts, local fonts, and the public data snapshot.');
