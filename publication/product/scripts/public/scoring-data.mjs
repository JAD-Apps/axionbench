// Test-only view of the published frozen community claims in the legacy scoring
// engine's field names. No raw payload is loaded and no authoritative status is
// invented: the projection's verified flag and submission record are preserved.
import frozen from '../../data/frozen-catalogue.json' with { type: 'json' };
import details from '../../data/frozen-source-details.json' with { type: 'json' };
const sources = new Map(details.sources.map(row => [row.id, row]));
export default {
  configurations: Object.values(frozen.configurations),
  observations: frozen.observations.map(row => ({
    ...row, rawValue: row.value, benchmarkFamilyId: row.familyId, benchmarkVersion: row.version,
    metricDirection: row.direction, leaderboardVerified: row.verified, leaderboardSubmission: row.submission,
    leaderboardSourceId: row.sourceIds.find(id => sources.get(id)?.sourceClass === 'public_leaderboard_structured_projection') ?? null,
    sourceVerification: { huggingFaceVerified: row.verified, independentReplication: false },
  })),
};
