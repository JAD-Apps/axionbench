import assert from 'node:assert/strict';
import { endpointIdentitySha256, labForModelId, normalizeScore, parseEvalResults, parseNonnegativeRate, projectLeaderboardRows } from './data-adapters.mjs';

const yaml = `- dataset:\n    id: cais/hle\n    task_id: hle\n  value: 36.8\n  date: "2026-09-10"\n  source:\n    url: https://huggingface.co/example/model\n- dataset:\n    id: cais/hle\n    task_id: hle\n  value: 63.9\n  date: "2026-09-10"\n  notes: "With tools; harness not specified."\n`;
const parsed = parseEvalResults(yaml);
assert.deepEqual(parsed.map(({ datasetId, taskId, value, date }) => ({ datasetId, taskId, value, date })), [
  { datasetId: 'cais/hle', taskId: 'hle', value: 36.8, date: '2026-09-10' },
  { datasetId: 'cais/hle', taskId: 'hle', value: 63.9, date: '2026-09-10' },
]);
assert.match(parsed[1].notes, /harness not specified/i);

const projected = projectLeaderboardRows([{
  rank: 1, filename: '.eval_results/a.yaml', value: 77.2, verified: false,
  modelId: 'lab/model', source: { url: 'https://example.org/result', isExternal: true },
  author: { name: 'sample', avatarUrl: 'must-not-be-retained', plan: 'must-not-be-retained' },
}], 'example/dataset');
assert.equal(projected[0].value, 77.2);
assert.equal(Object.hasOwn(projected[0], 'author'), false);
assert.equal(Object.hasOwn(projected[0], 'plan'), false);

assert.deepEqual(normalizeScore(78.16, 'percentage points', { min: 0, max: 1 }), { normalizedValue: 0.7816, formula: 'x / 100', targetUnit: 'fraction' });
assert.deepEqual(normalizeScore(0.812, 'fraction', { min: 0, max: 1 }), { normalizedValue: 0.812, formula: 'identity', targetUnit: 'fraction' });
assert.deepEqual(normalizeScore(90, null, { min: 0, max: 1 }), { normalizedValue: null, formula: null, targetUnit: null });
assert.equal(labForModelId('deepseek-ai/DeepSeek-V4.1-Flash'), 'deepseek');
assert.equal(labForModelId('allenai/Olmo-3.1-32B-Instruct'), 'allenai-olmo');
const route = { provider_name: 'BaseTen', model_id: 'lab/model', tag: 'fp8', quantization: 'fp8', supported_parameters: ['tools','reasoning'], uptime_last_1d: 99 };
const routeWithDifferentCapability = { ...route, supported_parameters: ['tools'] };
const routeWithDifferentTelemetry = { ...route, uptime_last_1d: 98 };
assert.notEqual(endpointIdentitySha256(route), endpointIdentitySha256(routeWithDifferentCapability));
assert.equal(endpointIdentitySha256(route), endpointIdentitySha256(routeWithDifferentTelemetry));
assert.equal(parseNonnegativeRate('0.000002'), 0.000002);
assert.equal(parseNonnegativeRate(-1), null);
assert.equal(parseNonnegativeRate(null), null);

console.log('Data adapter regression checks passed: original result parsing, privacy projection, explicit units, unknown rates, lab aliases and exact provider routes.');
