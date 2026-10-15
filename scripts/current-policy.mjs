import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { currentAdmission, exactReleaseMatch, fresh, POLICY_VERSION, validateNativeRatings } from '../src/data/current-policy.mjs';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
const textContent = (bytes) => bytes.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

// Replays original captures, preserving their original retrieval timestamps.
// verificationAt records this local hash/claim replay, not another HTTP request.
export async function qualifyIdentities(input, specifications, { verificationAt, root = new URL('../', import.meta.url) }) {
  assert(Number.isFinite(Date.parse(verificationAt)), 'identity verification timestamp required');
  const sources = new Map(input.sources.map((source) => [source.id, source]));
  const captured = new Map();
  const rows = [];
  for (const spec of specifications.models) {
    const model = input.models.find((candidate) => candidate.id === spec.catalogueId);
    assert(model && exactReleaseMatch(model.name, spec.name), `${spec.key}: catalogue variant/version mismatch`);
    let evidence = null;
    let reason = 'Exact primary confirmation is absent from the supplied captures; catalogue listing alone is insufficient.';
    const source = sources.get(spec.sourceId);
    if (source?.snapshotPath && spec.claim) {
      assert(exactReleaseMatch(spec.name, spec.claim.replace(/^released\s+/i, '')), `${spec.key}: primary claim cannot confirm another variant/version`);
      assert(['original_official_model_release_page', 'original_model_card_bytes'].includes(source.sourceClass), `${spec.key}: primary identity cannot use a provider/evaluator listing`);
      if (source.sourceClass === 'original_model_card_bytes') assert.equal(source.id, model.sourceEvidence?.sourceId, `${spec.key}: another model card cannot confirm this identity`);
      else {
        const primaryHosts = { openai: 'developers.openai.com', anthropic: 'www.anthropic.com', google: 'ai.google.dev', xai: 'docs.x.ai', meta: 'ai.meta.com' };
        assert.equal(new URL(source.url).hostname, primaryHosts[model.labId], `${spec.key}: identity requires this lab's original source`);
      }
      if (!captured.has(source.id)) {
        const bytes = await readFile(new URL(source.snapshotPath, root));
        assert.equal(hash(bytes), source.snapshotSha256, `${source.id}: original capture hash mismatch`);
        captured.set(source.id, textContent(bytes));
      }
      const text = captured.get(source.id);
      const start = text.toLowerCase().indexOf(spec.claim.toLowerCase());
      assert(start >= 0, `${spec.key}: primary capture does not contain the exact claim`);
      evidence = { sourceId: source.id, url: source.url, originalSourceSha256: source.snapshotSha256,
        claim: spec.claim, retrievedAt: source.retrievedAt, verifiedAt: verificationAt,
        verificationBasis: 'local replay of original source hash and explicit identity claim; no new HTTP retrieval',
        scope: 'publisher product/version identity; provider catalogue revision date is not a verified release date' };
      reason = null;
    } else if (spec.publisherSourceId) {
      const publisher = JSON.parse(await readFile(new URL('data/publisher-percentage-facts.json', root), 'utf8'));
      const original = publisher.sources.find((candidate) => candidate.sourceId === spec.publisherSourceId);
      assert.equal(original?.publisher.toLowerCase(), model.labId, `${spec.key}: competing publisher cannot confirm an identity`);
      assert(exactReleaseMatch(spec.name.replace(/^Claude\s+/i, ''), spec.claim), `${spec.key}: publisher claim cannot confirm another variant/version`);
      assert(original?.cells.some((cell) => cell.modelRelationship === 'publisher-model' && cell.modelLabel === spec.claim), `${spec.key}: publisher own-model confirmation missing`);
      evidence = { sourceId: original.sourceId, url: original.resultUrl, originalSourceSha256: original.sourceSha256,
        claim: spec.claim, retrievedAt: original.retrievedAt, verifiedAt: verificationAt,
        verificationBasis: 'replay of qualified publisher-own factual projection; original restricted bytes remain private',
        scope: 'publisher product/version identity; provider catalogue revision date is not a verified release date' };
      reason = null;
    }
    const fact = { key: spec.key, name: spec.name, catalogueId: spec.catalogueId, role: spec.role,
      verified: evidence !== null, reason, evidence, releaseDate: null,
      releaseDateReason: 'No release date was extracted and verified from the original source for this identity.' };
    rows.push({ ...fact, factualProjectionSha256: hash(JSON.stringify(fact)) });
  }
  return { policyVersion: POLICY_VERSION, verificationAt, models: rows, rowsSha256: hash(JSON.stringify(rows)) };
}

export function composeCurrentPolicy(identities, authority, registry, bridgebench, now = Date.now()) {
  assert.equal(identities.rowsSha256, hash(JSON.stringify(identities.models)), 'identity factual projection hash mismatch');
  for (const row of identities.models) {
    const { factualProjectionSha256, ...fact } = row;
    assert.equal(factualProjectionSha256, hash(JSON.stringify(fact)), `${row.key}: identity row hash mismatch`);
    assert.equal(row.verified, row.evidence !== null, `${row.key}: verification/evidence mismatch`);
    assert(row.verified || row.reason, `${row.key}: unknown identity needs a reason`);
  }
  const byKey = new Map(identities.models.map((model) => [model.key, model]));
  const suites = new Map(registry.suites.map((suite) => [suite.id, suite]));
  const sources = new Map(authority.sources.map((source) => [source.id, source]));
  const rows = authority.observations.map((row) => {
    const benchmarkVersion = authority.suites.find((suite) => suite.id === row.suiteId)?.version ?? null;
    const admission = currentAdmission({ ...row, benchmarkVersion }, suites.get(row.suiteId), byKey.get(row.modelKey), sources.get(row.sourceId), now);
    return { id: row.id, modelKey: row.modelKey, suiteId: row.suiteId, provenance: row.provenance, benchmarkVersion,
      configurationId: row.configuration.id, harnessRevision: row.configuration.harnessRevision ?? null,
      eligible: admission.eligible, reason: admission.reason };
  });
  if (bridgebench.status === 'available') {
    assert.equal(hash(JSON.stringify(bridgebench.rows)), bridgebench.rowsSha256, 'BridgeBench factual projection hash mismatch');
    validateNativeRatings(bridgebench, byKey, now);
  }
  const defaults = identities.models.filter((model) => model.role === 'default' && model.verified && fresh(model.evidence.retrievedAt, now)).map((model) => model.key);
  const eligibleIds = new Set(rows.filter((row) => row.eligible).map((row) => row.id));
  const currentRows = authority.observations.filter((row) => eligibleIds.has(row.id));
  return { policyVersion: POLICY_VERSION, identities, defaultModels: defaults, rows, bridgebench,
    coverage: { verifiedDefaults: defaults.length, requestedIdentities: identities.models.length,
      verifiedIdentities: identities.models.filter((row) => row.verified).length,
      unverifiedIdentities: identities.models.filter((row) => !row.verified).length,
      historicalObservations: authority.observations.length, historicalAdmitted: authority.observations.filter((row) => row.admitted).length,
      currentObservations: currentRows.length, currentSuites: new Set(currentRows.map((row) => row.suiteId)).size,
      currentDomains: [...new Set(currentRows.map((row) => row.domain))].sort(),
      bridgebenchRows: bridgebench.rows.length },
    limitation: 'Historical admission stays intact. Only rows passing current model, benchmark, harness, freshness, unit and source-tier checks can contribute to current default capability comparisons.' };
}
