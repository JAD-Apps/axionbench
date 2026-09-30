import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const [label, args] of [
  ['strict TypeScript check', ['run', 'typecheck']],
  ['clean static production build', ['run', 'clean:build']],
  ['unit regression suite', ['run', 'test:unit']],
  ['focused built-chart browser smoke', ['run', 'test:chart-smoke']],
]) {
  console.log(`\n> ${label}`);
  const result = spawnSync(npm, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
