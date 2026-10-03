// Cloudflare Pages direct-upload client. Endpoints (checked 2026-10-03):
//   GET  /accounts/{account}/pages/projects/{project}                       project, domains
//   GET  /accounts/{account}/pages/projects/{project}/upload-token          asset upload JWT
//   POST /pages/assets/check-missing   {hashes}                (Bearer JWT)  keys not yet stored
//   POST /pages/assets/upload          [{key,value,metadata,base64}]         asset bytes
//   POST /pages/assets/upsert-hashes   {hashes}                              keep keys alive
//   POST /accounts/{account}/pages/projects/{project}/deployments           multipart: manifest,
//        branch, commit_hash, commit_message, commit_dirty, _headers, _redirects, _routes.json
//   GET  /accounts/{account}/pages/projects/{project}/deployments[/{id}]    readback, listing
//   POST /accounts/{account}/pages/projects/{project}/deployments/{id}/rollback
// The asset endpoints are the ones Wrangler's `pages deploy` uses; Cloudflare's
// public API reference documents the deployment, listing and rollback calls.
//
// Only idempotent calls are retried. Creating a deployment or rolling back is
// never repeated here: a timeout or network failure raises AmbiguousError and
// the transaction reconciles against the deployment listing. Credentials are
// read by variable name, sent only in the Authorization header and never
// included in errors, logs or receipts.
import assert from 'node:assert/strict';

export const API_BASE = 'https://api.cloudflare.com/client/v4';
export const CREDENTIAL_NAMES = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];

export class AmbiguousError extends Error {
  constructor(message) { super(message); this.name = 'AmbiguousError'; this.ambiguous = true; }
}
export class ApiError extends Error {
  constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status; }
}

export function loadCredentials(env = process.env) {
  const missing = CREDENTIAL_NAMES.filter((name) => !env[name]);
  assert.equal(missing.length, 0, `missing credential variables: ${missing.join(', ')} (provide them through local secret storage or runner injection; never on the command line)`);
  assert.match(env.CLOUDFLARE_ACCOUNT_ID, /^[a-f0-9]{32}$/, 'CLOUDFLARE_ACCOUNT_ID must be a 32-character hex account id');
  assert.ok(!/\s/.test(env.CLOUDFLARE_API_TOKEN), 'CLOUDFLARE_API_TOKEN contains whitespace');
  return { token: env.CLOUDFLARE_API_TOKEN, accountId: env.CLOUDFLARE_ACCOUNT_ID };
}

const retryable = (status) => status === 429 || status >= 500;
const realSleep = (ms) => new Promise((done) => setTimeout(done, ms));

// Cloudflare error envelopes carry codes and messages; only those are kept.
async function describe(response) {
  try {
    const body = await response.json();
    const errors = (body.errors ?? []).slice(0, 3).map((e) => `${e.code ?? '?'} ${String(e.message ?? '').slice(0, 160)}`);
    return errors.length ? errors.join('; ') : 'no error detail';
  } catch { return 'non-JSON response'; }
}

export function createPagesClient({ token, accountId, projectName, fetcher = fetch, timeoutMs = 30_000, attempts = 4, backoffMs = 1_000, sleep = realSleep }) {
  assert.match(projectName, /^[a-z0-9][a-z0-9-]{0,57}$/, 'Pages project name');
  assert.ok(token && accountId, 'credentials required');
  const project = `${API_BASE}/accounts/${accountId}/pages/projects/${projectName}`;

  async function call(label, url, { method = 'GET', body, auth = token, json = true, idempotent = method === 'GET' } = {}) {
    const headers = { Authorization: `Bearer ${auth}` };
    if (json && body !== undefined) headers['Content-Type'] = 'application/json';
    const payload = body === undefined ? undefined : json ? JSON.stringify(body) : body;
    for (let attempt = 1; ; attempt += 1) {
      let response;
      try {
        response = await fetcher(url, { method, headers, body: payload, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
      } catch (error) {
        const kind = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timed out' : 'network failure';
        if (!idempotent) throw new AmbiguousError(`${label}: ${kind}; the outcome is unknown`);
        if (attempt >= attempts) throw new ApiError(`${label}: ${kind} after ${attempt} attempts`, null);
        await sleep(backoffMs * 2 ** (attempt - 1));
        continue;
      }
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (!data || data.success === false) throw new ApiError(`${label}: unsuccessful response envelope`, response.status);
        return data.result;
      }
      const detail = await describe(response);
      if (retryable(response.status) && !idempotent) throw new AmbiguousError(`${label}: HTTP ${response.status} (${detail}); the outcome is unknown`);
      if (!retryable(response.status) || attempt >= attempts) throw new ApiError(`${label}: HTTP ${response.status} (${detail})`, response.status);
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }

  return {
    projectName,
    getProject: () => call('project lookup', project),
    getUploadToken: async () => {
      const result = await call('upload token', `${project}/upload-token`);
      assert.ok(typeof result?.jwt === 'string' && result.jwt.length > 20, 'upload token missing from response');
      return result.jwt;
    },
    checkMissing: (jwt, hashes) => call('asset check', `${API_BASE}/pages/assets/check-missing`, { method: 'POST', auth: jwt, body: { hashes }, idempotent: true }),
    upload: (jwt, items) => call('asset upload', `${API_BASE}/pages/assets/upload`, { method: 'POST', auth: jwt, body: items, idempotent: true }),
    upsertHashes: (jwt, hashes) => call('asset upsert', `${API_BASE}/pages/assets/upsert-hashes`, { method: 'POST', auth: jwt, body: { hashes }, idempotent: true }),
    createDeployment: ({ manifest, branch, commitHash, commitMessage, commitDirty, controlFiles }) => {
      const form = new FormData();
      form.set('manifest', JSON.stringify(manifest));
      form.set('branch', branch);
      if (commitHash) form.set('commit_hash', commitHash);
      form.set('commit_message', commitMessage);
      form.set('commit_dirty', commitDirty ? 'true' : 'false');
      for (const [name, bytes] of Object.entries(controlFiles)) form.set(name, new Blob([bytes]), name);
      return call('deployment create', `${project}/deployments`, { method: 'POST', body: form, json: false, idempotent: false });
    },
    getDeployment: (id) => call('deployment lookup', `${project}/deployments/${encodeURIComponent(id)}`),
    listDeployments: ({ env = 'production', perPage = 10 } = {}) => call('deployment listing', `${project}/deployments?env=${env}&per_page=${perPage}`),
    rollback: (id) => call('deployment rollback', `${project}/deployments/${encodeURIComponent(id)}/rollback`, { method: 'POST', idempotent: false }),
  };
}
