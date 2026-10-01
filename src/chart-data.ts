export type Capability = { score: number; coverage: number; sources: string[] } | null;
export type Model = {
  model: string;
  name: string;
  developer: string;
  apiUsdPerMTok: number | null;
  capabilities: Record<string, Capability>;
};
export function rankingRows(models: Model[], capability: string) {
  return models.flatMap(model => {
    const value = model.capabilities[capability];
    return value ? [{ model, value }] : [];
  }).sort((a, b) => b.value.score - a.value.score || a.model.name.localeCompare(b.model.name));
}

export function scatterRows(models: Model[], capability: string) {
  return rankingRows(models, capability).flatMap(row => {
    const price = row.model.apiUsdPerMTok;
    return typeof price === 'number' && Number.isFinite(price) && price > 0 ? [{ ...row, price }] : [];
  });
}
