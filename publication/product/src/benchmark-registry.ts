import registry from '../data/benchmark-registry.json';
import type { ModelConfiguration, Observation, SourceRecord } from './data/ingestion';

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
  benchmarkFamilyId: string;
  domain: CapabilityDomain;
  metric: BenchmarkMetric;
  url: string;
  source: string;
  rights: string;
  state: RegistryState;
  reason?: string;
}

export type BenchmarkSource = SourceRecord;
export type TestedConfiguration = ModelConfiguration;
export type BenchmarkObservation = Observation;

export interface BenchmarkRegistry {
  schemaVersion: number;
  registryVersion: string;
  policy: string;
  domains: readonly CapabilityDomain[];
  suites: readonly BenchmarkSuite[];
}

export const benchmarkRegistry = registry as BenchmarkRegistry;
