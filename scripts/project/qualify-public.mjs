// node scripts/project/qualify-public.mjs --verify-only --bundle <file> --trust <file> --expect <file>
//     [--public-source <dir>] [--now <ISO>] [--max-age-hours <n>]
// Private interface. Verifies a signed candidate-qualification receipt for the
// sealed private and public candidates; --verify-only is mandatory because
// this tool never collects evidence, registers jobs, builds, publishes or
// launches reviewers. Evidence is produced by the daemon stages that own it.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, verifyMode } from './verify-receipts.mjs';

const ALLOWED = new Set(['--bundle', '--trust', '--expect', '--public-source', '--now', '--max-age-hours']);

export async function qualify(args) {
  assert.ok(args.includes('--verify-only'), 'only --verify-only is supported: this tool does not collect evidence, register, build or publish');
  const rest = args.filter((arg) => arg !== '--verify-only');
  assert.equal(args.length - rest.length, 1, 'duplicate --verify-only');
  for (let i = 0; i < rest.length; i += 2) assert.ok(ALLOWED.has(rest[i]), `unsupported option ${rest[i]}`);
  return verifyMode(parseArgs(['--mode', 'candidate-qualification', ...rest]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await qualify(process.argv.slice(2)), null, 2)); } catch (error) { console.error(`FAIL ${error.message}`); process.exitCode = 1; }
}
