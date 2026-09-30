import registry from '../data/benchmark-registry.json';

export type CapabilityDomain = (typeof registry.domains)[number];
export type RegistryState = 'pending' | 'unsupported' | 'available';
export type MetricDirection = 'higher' | 'lower';

export interface BenchmarkMetric {
  name: string;
  direction: MetricDirection;
  min: number;
  max: number;
}

export interface BenchmarkSuite {
  id: string;
  name: string;
  version: string;
  domain: CapabilityDomain;
  metric: BenchmarkMetric;
  url: string;
  source: string;
  rights: string;
  state: RegistryState;
  reason?: string;
}

export interface BenchmarkSource {
  id: string;
  name: string;
  canonicalUrl: string;
  publisher: string;
  rightsPosture: 'link-only' | 'redistribution-permitted' | 'restricted' | 'unknown';
  retrievedAt: string;
  snapshotPath?: string;
  snapshotSha256?: string;
}

export interface TestedConfiguration {
  modelId: string;
  revision?: string;
  variant?: string;
  provider?: string;
  modality?: readonly string[];
  harness?: string;
  tools?: readonly string[];
  reasoningBudgetTokens?: number;
  totalParameters?: number;
  activatedParameters?: number;
}

export interface BenchmarkObservation {
  id: string;
  suiteId: string;
  configuration: TestedConfiguration;
  metric: BenchmarkMetric;
  value?: number;
  unavailableReason?: string;
  resultUrl: string;
  sourceId: string;
  evaluatedAt?: string;
  retrievedAt: string;
  snapshotSha256: string;
}

export interface BenchmarkRegistry {
  schemaVersion: number;
  registryVersion: string;
  policy: string;
  domains: readonly CapabilityDomain[];
  suites: readonly BenchmarkSuite[];
}

export const benchmarkRegistry = registry as BenchmarkRegistry;
