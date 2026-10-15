import type { AuthorityBlock } from '../authority/logic.ts';
import { authorityPanel, weightSensitivity } from '../scoring/authority.ts';
import type { WeightSettings } from '../scoring/index.mjs';

export type BridgeRating = {
  id: string; modelKey: string; modelLabel: string; publisher: string; modelLab: string;
  ratings: Record<string, number | null>; unit: string; provenance: string; version: string;
  resultUrl: string; originalSourceSha256: string; snapshotSha256: string;
  retrievedAt: string; verifiedAt: string; identityVerified: boolean;
  identityReason: string | null; scoringEligible: false; exclusion: string;
  missingReasons: { ratings: Record<string, string> };
};
export type BridgeDataset = {
  id: string; name: string; version: string; unit: string; guideUrl: string;
  methodology: string; scoringEligible: false; normalization: null;
  axes: { id: string; label: string }[]; records: BridgeRating[];
};

// Null remains null; rows with unqualified identities remain visible with why.
export function bridgeRatingRows(dataset: BridgeDataset, axis: string, cohort?: string[]) {
  if (!dataset.axes.some(a => a.id === axis)) throw new Error('Unknown BridgeBench axis');
  return dataset.records.filter(r => !cohort || cohort.includes(r.modelKey)).map(row => ({
    ...row, value: row.ratings[axis], missingReason: row.ratings[axis] === null ? row.missingReasons.ratings[axis] : null,
  })).sort((a, b) => a.value === null ? (b.value === null ? a.modelKey.localeCompare(b.modelKey) : 1)
    : b.value === null ? -1 : b.value - a.value || a.modelKey.localeCompare(b.modelKey));
}

// Route/page consumers use this policy-aware entry point. The lower-level
// authorityPanel remains available for the qualified historical math fixtures.
export function currentAuthorityPanel(block: AuthorityBlock, cohort: string[], weights: WeightSettings) {
  const filtered = { ...block, observations: block.observations.filter(row => row.currentPolicy?.scoringEligible === true) };
  return authorityPanel(filtered, cohort, weights);
}
export function currentWeightSensitivity(block: AuthorityBlock, cohort: string[], weights: WeightSettings) {
  return weightSensitivity({ ...block, observations: block.observations.filter(row => row.currentPolicy?.scoringEligible === true) }, cohort, weights);
}
