import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDailyJob, validateEnablement, validateJob } from '../../scripts/project/native-schedule.mjs';

const dirs = { stateDir: '/var/lib/axionbench/state', auditDir: '/var/lib/axionbench/audit' };
const job = () => buildDailyJob(dirs);

test('the daily job is built disabled, pinned to Sol/high and names secrets only', () => {
  const value = job();
  assert.equal(value.enabled, false);
  assert.deepEqual(validateJob(value), value);
  assert.equal(JSON.stringify(value).includes('cfut_'), false);
});

test('each loosened contract field is rejected', () => {
  const cases = [
    ['enabled', (j) => { j.enabled = true; }, /disabled/],
    ['timezone', (j) => { delete j.schedule.timezone; }, /timezone/],
    ['cron', (j) => { j.schedule.cron = '*/5 * * * *'; }, /daily time/],
    ['model', (j) => { j.modelPin.effort = 'max'; }, /gpt-6\.1-sol\/high/],
    ['fallback', (j) => { j.fallback = 'claude'; }, /fallback/],
    ['fast', (j) => { j.fastMode = 'on'; }, /Fast/],
    ['command', (j) => { j.command = 'npm run publish:site'; }, /command/],
    ['secret', (j) => { j.secrets.push('GITHUB_TOKEN'); }, /secrets/],
    ['target', (j) => { j.publishTarget.project = 'jad-apps-site-git'; }, /target/],
    ['relative', (j) => { j.env.AXIONBENCH_STATE_DIR = '../state'; }, /absolute/],
    ['extra env', (j) => { j.env.CLOUDFLARE_API_TOKEN = 'x'; }, /unexpected environment/],
  ];
  for (const [name, mutate, message] of cases) {
    const value = job(); mutate(value);
    assert.throws(() => validateJob(value), message, name);
  }
});

test('enabling needs a qualified candidate and a read-back first deployment', () => {
  const good = { qualification: { passed: true }, firstDeployment: { status: 'published', readback: 'verified', hostname: 'axionbench.jadapps.app', snapshotSha256: 'a'.repeat(64) } };
  assert.deepEqual(validateEnablement({ ...job(), enabled: false }, good), { enable: true });
  assert.throws(() => validateEnablement(job(), { ...good, qualification: { passed: false } }), /qualified/);
  assert.throws(() => validateEnablement(job(), { ...good, firstDeployment: { ...good.firstDeployment, readback: 'skipped' } }), /read back/);
  assert.throws(() => validateEnablement(job(), { ...good, firstDeployment: { ...good.firstDeployment, hostname: 'example.com' } }), /another host/);
  assert.throws(() => validateEnablement(job(), { ...good, firstDeployment: { ...good.firstDeployment, snapshotSha256: 'abc' } }), /digest/);
});
