// Derives the open-weight explorer block from committed repository snapshots.
// Every snapshot read is checked against its recorded SHA-256; a mismatch fails the build.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  accessFacts, bandFor, extractActivated, licenceFacts, moeIdentity, quantizedFacts, totalFromSafetensors, variantFacts,
} from '../../src/open-weights/logic.ts';

const root = new URL('../../', import.meta.url);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function readSnapshot(source) {
  if (!source?.snapshotPath || !source.snapshotSha256) return null;
  const bytes = await readFile(new URL(source.snapshotPath, root));
  if (sha(bytes) !== source.snapshotSha256) throw new Error(`snapshot digest mismatch: ${source.id}`);
  return bytes.toString('utf8');
}

const ref = (source) => source ? { id: source.id, url: source.url ?? null, sha256: source.snapshotSha256 ?? null, retrievedAt: source.retrievedAt ?? null } : null;

export async function deriveOpenWeights(input) {
  const sourceById = new Map(input.sources.map((row) => [row.id, row]));
  const configsByModel = new Map();
  for (const config of input.configurations) configsByModel.set(config.modelId, [...(configsByModel.get(config.modelId) ?? []), config]);
  const observationCount = new Map();
  for (const row of input.observations) observationCount.set(row.modelId, (observationCount.get(row.modelId) ?? 0) + 1);
  const rows = [];
  for (const model of input.models.filter((row) => row.weightsAvailability && row.weightsAvailability !== 'unknown')) {
    const configs = configsByModel.get(model.id) ?? [];
    const evidenceIds = [model.parameterEvidenceId, model.sourceEvidence?.sourceId, ...(model.originalSourceEvidenceIds ?? []),
      ...configs.flatMap((config) => config.configurationEvidenceSourceIds ?? [])].filter(Boolean);
    const pick = (prefix) => evidenceIds.map((id) => sourceById.get(id)).find((source) => source?.id.startsWith(prefix) && source.snapshotPath) ?? null;
    const metadataSource = pick('hf-model-metadata-');
    const cardSource = pick('hf-model-card-');
    const metadata = metadataSource ? JSON.parse(await readSnapshot(metadataSource)) : null;
    const card = cardSource ? await readSnapshot(cardSource) : null;
    const repository = metadata?.id ?? configs.find((config) => config.revision?.repository)?.revision.repository ?? null;
    const total = totalFromSafetensors(metadata?.safetensors);
    if (total.status === 'tensor-total' && model.parameterCount != null && model.parameterCount !== total.value) {
      throw new Error(`parameter count disagrees with its captured metadata: ${model.id}`);
    }
    const activated = extractActivated(card, total.value, repository);
    const tags = Array.isArray(metadata?.tags) ? metadata.tags : [];
    const configQuantization = configs.map((config) => config.quantization).find(Boolean) ?? null;
    rows.push({
      modelId: model.id, name: model.name, lab: model.labName, labId: model.labId, repository,
      repositoryUrl: repository ? `https://huggingface.co/${repository}` : null,
      total, band: bandFor(total.value, total.status), activated,
      moe: moeIdentity(activated, metadata?.config?.architectures ?? []),
      access: accessFacts(metadata?.gated, !!metadata),
      licence: licenceFacts(metadata?.cardData, !!metadata),
      variant: variantFacts(repository, tags),
      quantized: quantizedFacts(repository, tags, configQuantization, total),
      observationCount: observationCount.get(model.id) ?? 0,
      sources: { metadata: ref(metadataSource), card: ref(cardSource) },
    });
  }
  rows.sort((a, b) => a.modelId.localeCompare(b.modelId));
  return {
    schemaVersion: 'axionbench-open-weights-v1',
    method: 'Groups use the captured safetensors total of plain-float tensors. Integer or packed tensors are quantized checkpoints whose tensor count is not a parameter count, so they stay undisclosed. Activated MoE parameters come only from one consistent statement in the model\'s own card and never set the group.',
    hostedPrice: 'Withheld: captured API rate sources do not permit redistribution, so hosted prices are not shown.',
    selfHostCost: 'Not estimated: no public hardware-cost source is captured, and hosted API prices are not a self-hosting cost.',
    rows,
  };
}
