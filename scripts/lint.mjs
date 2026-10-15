// Dependency-free lint: every script parses, every tracked JSON file parses, and
// no source carries merge-conflict markers or tab-indented workflow lines.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const deleted = new Set(execFileSync('git', ['ls-files', '-z', '--deleted'], { encoding: 'utf8' }).split('\0').filter(Boolean));
const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(path => path && !deleted.has(path));
const problems = [];
for (const path of tracked) {
  if (path.startsWith('data/source-snapshots/')) continue;
  if (/\.mjs$/.test(path)) {
    try { execFileSync('node', ['--check', path], { stdio: 'pipe' }); } catch (error) { problems.push(`${path}: ${String(error.stderr).split('\n')[0]}`); }
  }
  if (/\.json$/.test(path) && !path.startsWith('public/data')) {
    try { JSON.parse(readFileSync(path, 'utf8')); } catch (error) { problems.push(`${path}: invalid JSON (${error.message})`); }
  }
  if (/\.(mjs|ts|tsx|css|yml|md)$/.test(path)) {
    const text = readFileSync(path, 'utf8');
    if (/^(<{7}|>{7}) /m.test(text)) problems.push(`${path}: merge-conflict marker`);
    if (path.endsWith('.yml') && /^\t/m.test(text)) problems.push(`${path}: tab indentation in YAML`);
  }
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`Lint passed: ${tracked.length} project files checked.`);
