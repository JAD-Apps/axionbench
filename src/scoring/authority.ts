import { panelId, settingRank, type AuthorityBlock, type AuthorityObservation } from '../authority/logic.ts';
import { comparePanel, DEFAULT_WEIGHTS, type PanelResult, type WeightSettings } from './index.mjs';

export const rankResult = (result: PanelResult) => Object.entries(result.models ?? {})
  .filter((entry): entry is [string, { model: string; score: number; domainScores: Record<string, number>; eligible: boolean }] => entry[1].score !== null)
  .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]));

export function authorityPanel(block: AuthorityBlock, cohort: string[], weights: WeightSettings,
  { independentOnly = false, omitSuite = null }: { independentOnly?: boolean; omitSuite?: string | null } = {}) {
  const groups = new Map<string, AuthorityObservation[]>();
  for (const row of block.observations) {
    if (!row.admitted || !row.primary || !row.configuration.conditionsKnown || !cohort.includes(row.modelKey)
      || !Object.hasOwn(DEFAULT_WEIGHTS, row.domain) || row.suiteId === omitSuite
      || (independentOnly && row.provenance !== 'independent-evaluator')
      || !['benchmark-authority', 'independent-evaluator'].includes(row.provenance)) continue;
    const key = panelId(row) + '|' + row.configuration.condition;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const selected: AuthorityObservation[] = [];
  for (const list of groups.values()) {
    // Use the highest named effort shared by the entire cohort, independent of scores.
    const settings = [...new Set(list.map((row) => row.configuration.setting))]
      .filter((setting) => cohort.every((key) => list.some((row) => row.modelKey === key && row.configuration.setting === setting)))
      .sort((a, b) => settingRank(a) - settingRank(b));
    if (!settings.length) continue;
    selected.push(...list.filter((row) => row.configuration.setting === settings[0]));
  }
  const suites = new Map(block.suites.map((suite) => [suite.id, { ...suite, benchmarkFamilyId: suite.familyId,
    metric: { min: 0, max: 1, direction: 'higher' } }]));
  const rows = selected.map((row) => ({ id: row.id, modelId: row.modelKey, configurationId: row.configuration.id,
    suiteId: row.suiteId, benchmarkVersion: suites.get(row.suiteId)?.version, taskId: row.suiteId,
    split: row.sourceId, metric: row.metric, metricDirection: 'higher', rawValue: row.value,
    configurationSignature: JSON.stringify([row.sourceId, row.configuration.condition, row.configuration.setting]),
    unit: { status: 'documented' }, normalization: { status: 'normalized', targetUnit: 'fraction', normalizedValue: row.value },
    publisherConfirmed: true, sourceVerification: { independentReplication: false } }));
  const options = { cohort, weights, suites, models: new Map(block.models.map((model) => [model.key, model])),
    // Independence is a source-class filter above, never relabelled as replication.
    configurations: new Map(), independentOnly: false };
  const result = comparePanel(rows, options);
  return { result, rows: selected.filter((row) => (weights[row.domain] ?? 0) > 0),
    coveredDomains: [...new Set(Object.values(result.models ?? {}).flatMap((model) => Object.keys(model.domainScores)))].sort(),
    options };
}

export function weightSensitivity(block: AuthorityBlock, cohort: string[], weights: WeightSettings) {
  const base = authorityPanel(block, cohort, weights);
  const variants = [{ label: 'Selected weights', weights }, { label: 'Equal default (11 domains)', weights: { ...DEFAULT_WEIGHTS } }];
  for (const domain of Object.keys(weights).filter((key) => weights[key] > 0)) {
    for (const multiplier of [0.8, 1.2]) variants.push({ label: domain + (multiplier < 1 ? ' −20%' : ' +20%'), weights: { ...weights, [domain]: weights[domain] * multiplier } });
  }
  const weightRuns = variants.map((variant) => ({ ...variant, result: authorityPanel(block, cohort, variant.weights).result }));
  const suites = [...new Set(base.rows.map((row) => row.suiteId))];
  const omissions = suites.map((suiteId) => ({ suiteId, result: authorityPanel(block, cohort, weights, { omitSuite: suiteId }).result }));
  const independent = authorityPanel(block, cohort, weights, { independentOnly: true }).result;
  return { base, weightRuns, omissions, independent };
}
