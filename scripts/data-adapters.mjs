import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function endpointIdentitySha256(endpoint) {
  const identity = {
    name: endpoint.name ?? null,
    model_id: endpoint.model_id ?? null,
    model_name: endpoint.model_name ?? null,
    provider_name: endpoint.provider_name ?? null,
    tag: endpoint.tag ?? null,
    quantization: endpoint.quantization ?? null,
    context_length: endpoint.context_length ?? null,
    max_completion_tokens: endpoint.max_completion_tokens ?? null,
    max_prompt_tokens: endpoint.max_prompt_tokens ?? null,
    supported_parameters: [...(endpoint.supported_parameters ?? [])].sort(),
    supports_tool_choice: endpoint.supports_tool_choice ?? null,
    supports_implicit_caching: endpoint.supports_implicit_caching ?? null,
    native_tools: endpoint.native_tools ?? null,
    supports_voice_cloning: endpoint.supports_voice_cloning ?? null,
    supports_multiple_audio_references: endpoint.supports_multiple_audio_references ?? null,
    supports_image_reference: endpoint.supports_image_reference ?? null,
  };
  return sha256(Buffer.from(stableJson(identity)));
}

export function endpointPriceSha256(endpoint) {
  return sha256(Buffer.from(stableJson({ identity: endpointIdentitySha256(endpoint), pricing: endpoint.pricing ?? null })));
}

export async function saveSnapshot(relativePath, bytes) {
  await mkdir(dirname(relativePath), { recursive: true });
  await writeFile(relativePath, bytes);
  return { path: relativePath, sha256: sha256(bytes), bytes: bytes.length };
}

export async function fetchSnapshot(url, { timeout = 20000, headers = {} } = {}) {
  const response = await fetch(url, { redirect: 'follow', headers, signal: AbortSignal.timeout(timeout) });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    url,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get('content-type'),
    retrievedAt: new Date().toISOString(),
    etag: response.headers.get('etag'),
    retryAfter: response.headers.get('retry-after'),
    repoCommit: response.headers.get('x-repo-commit'),
    bytes,
    sha256: sha256(bytes),
  };
}

export function projectLeaderboardRows(payload, datasetId) {
  if (!Array.isArray(payload)) throw new Error(`leaderboard payload is not an array: ${datasetId}`);
  const permittedKeys = ['rank', 'filename', 'value', 'verified', 'source', 'modelId', 'pullRequest', 'notes', 'lower_is_better', 'num_parameters'];
  return payload.map((row) => Object.fromEntries(permittedKeys
    .filter((key) => Object.hasOwn(row, key))
    .map((key) => [key, row[key]])));
}

// Parse only the public Hugging Face eval_results block shape. Unknown YAML
// constructs are retained in the original snapshot and never guessed here.
export function parseEvalResults(text) {
  const chunks = text.split(/^\s*-\s+(?=[\w"'])/m).map((x) => x.trim()).filter(Boolean);
  const parsed = [];
  for (const block of chunks) {
    const datasetId = block.match(/(?:^|\n)\s*id:\s*["']?([^\r\n"']+)/)?.[1]?.trim();
    const taskId = block.match(/(?:^|\n)\s*task_id:\s*["']?([^\r\n"']+)/)?.[1]?.trim() ?? null;
    const valueRaw = block.match(/(?:^|\n)\s*value:\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/)?.[1];
    if (!datasetId || valueRaw === undefined) continue;
    const date = block.match(/(?:^|\n)\s*date:\s*["']?(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    const notes = block.match(/(?:^|\n)\s*notes:\s*["']?([^\r\n]*)/)?.[1]?.replace(/["']\s*$/, '').trim() ?? null;
    const value = Number(valueRaw);
    if (Number.isFinite(value)) parsed.push({ datasetId, taskId, value, valueRaw, date, notes, sourceBlock: block });
  }
  return parsed;
}

export function normalizeScore(value, unit, metric) {
  const percentUnits = new Set(['percent', '%', 'percentage points']);
  if (percentUnits.has(unit)) return { normalizedValue: value / 100, formula: 'x / 100', targetUnit: 'fraction' };
  if (unit === 'fraction' || unit === 'score (0-1)') return { normalizedValue: value, formula: 'identity', targetUnit: 'fraction' };
  if (unit === 'rating points' && metric.min === 0 && metric.max === 2000) {
    return { normalizedValue: value, formula: 'identity', targetUnit: 'rating points' };
  }
  return { normalizedValue: null, formula: null, targetUnit: null };
}

export function parseNonnegativeRate(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function labForModelId(modelId) {
  const owner = modelId.split('/')[0].toLowerCase();
  const aliases = {
    openai: 'openai', OpenAI: 'openai', anthropic: 'anthropic', google: 'google', 'x-ai': 'xai', meta: 'meta', 'meta-llama': 'meta',
    deepseek: 'deepseek', 'deepseek-ai': 'deepseek', '~deepseek': 'deepseek', qwen: 'alibaba-qwen', moonshotai: 'moonshot-kimi',
    '~moonshotai': 'moonshot-kimi', 'z-ai': 'zai-glm', 'zai-org': 'zai-glm', '~z-ai': 'zai-glm', minimax: 'minimax', 'minimaxai': 'minimax', mistralai: 'mistral',
    cohere: 'cohere', 'cohereforai': 'cohere', ai21labs: 'ai21', nvidia: 'nvidia', microsoft: 'microsoft', allenai: 'allenai-olmo',
    'ibm-granite': 'ibm-granite',
  };
  return aliases[owner] ?? 'other';
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
