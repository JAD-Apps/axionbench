export type UnknownValue = null;

export interface SourceRecord {
  id: string;
  url: string;
  publisher: string;
  sourceClass: string;
  rights: string;
  snapshotPath: string | null;
  snapshotSha256: string | null;
  retrievedAt: string;
  httpStatus: number | null;
  projectionOf?: string | null;
  permittedFields?: string[] | null;
  unavailableReason?: string;
  finalUrl?: string | null;
}

export interface ModelAlias {
  name: string;
  sourceId: string;
  aliasType: string;
}

export interface ModelConfiguration {
  id: string;
  modelId: string;
  revision: Record<string, string | null>;
  variant: string;
  baseOrInstruct: string | null;
  reasoningMode: Record<string, unknown> | null;
  providerEndpoint: Record<string, unknown> | null;
  quantization: string | null;
  modalities: Record<string, unknown> | unknown[];
  harness: string | null;
  testedHarness: string | null;
  tools: boolean | null;
  toolSupport: boolean | null;
  reasoningBudgetTokens: number | null;
  contextWindowTokens: number | null;
  testCondition: string | null;
  configurationEvidenceSourceIds: string[];
  sourceClass: string;
}

export interface Observation {
  id: string;
  modelId: string;
  configurationId: string;
  suiteId: string;
  benchmarkFamilyId: string;
  benchmarkVersion: string;
  taskId: string | null;
  resultDatasetId: string;
  resultTaskId: string | null;
  resultModelRepository: string;
  metric: string;
  metricDirection: 'higher' | 'lower';
  rawValue: number;
  rawValueText: string;
  unit: { status: 'documented' | 'inferred' | 'unknown'; label: string | null; statement: string; sourceIds: string[] };
  normalization: { status: 'normalized' | 'unavailable'; formula: string | null; targetUnit: string | null; normalizedValue: number | null };
  split: string | null;
  evaluationFramework: string | null;
  budget: Record<string, unknown> | null;
  grader: string | null;
  resultUrl: string;
  resultSourceId: string;
  leaderboardUrl: string | null;
  leaderboardSourceId: string | null;
  leaderboardValue: number | null;
  leaderboardModelId: string | null;
  leaderboardFilename: string | null;
  leaderboardVerified: boolean | null;
  evaluatedAt: string | null;
  retrievedAt: string;
  sourceClass: string;
  sourceVerification: { huggingFaceVerified: boolean; independentReplication: boolean; status: string };
  resultUrlCheck: Record<string, unknown> | null;
  externalSourceUrlCheck: Record<string, unknown> | null;
}

export interface PriceRecord {
  id: string;
  modelId: string;
  configurationId: string;
  provider: string | null;
  currency: string;
  unit: string;
  sourceUnit: string;
  input: number | null;
  cachedInputRead: number | null;
  cachedInputWrite: number | null;
  output: number | null;
  reasoning: number | null;
  reasoningBilling: string;
  cache: Record<string, unknown>;
  tiers: unknown[];
  sourceEndpointSha256: string | null;
  sourceConflictId: string | null;
  sourceId: string;
  sourceUrl: string;
  retrievedAt: string;
  effectiveAt: string | null;
  sourceClass: string;
}

export interface IngestionDataset {
  schemaVersion: 2;
  retrievedAt: string;
  status: string;
  models: Array<Record<string, unknown> & { id: string; labId: string; name: string; releaseDate: string | null; aliases: ModelAlias[] }>;
  configurations: ModelConfiguration[];
  sources: SourceRecord[];
  observations: Observation[];
  sourceConflicts: Array<Record<string, unknown>>;
  pricing: PriceRecord[];
}
