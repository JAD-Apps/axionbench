# AxionBench scoring method

Method `axion-domain-v1` is a comparison aid, not a universal capability claim. Raw benchmark results, coverage and provenance remain primary. The checked-in definition and fixed initial domain weights are in `data/scoring.json`; executable rules are in `src/scoring/index.mjs`.

## Admission and comparability

An observation is excluded from a default aggregate unless its unit is documented, its metric can be normalized using the registry's declared lower and upper bounds and direction, and its result is confirmed by a publisher/benchmark authority or an independent replication. A result from a model repository's `refs/pr/*` revision is excluded as an unmerged community submission even when the target repository belongs to a known lab. The capture preserves the reported result for inspection and does not promote a model card or a parsed numeric value to an authoritative score. Unverified results and unknown/inferred units remain visible in raw evidence.

The compared cohort must share the exact suite/version, task, split, metric/direction and tested configuration. Unknown conditions match only other unknown conditions; they do not prove stronger equivalence. No compatible common panel means no overall score. Multiple suites in one family are averaged within that family before family means are averaged within each capability domain. Domains then use the declared weights. The same weight vector applies to every model; a missing positively weighted domain makes that model's overall score unavailable instead of redistributing weight. Safety, human preference, professional, audio/video, latency and cost are separate measures.

Normalization clamps to the metric's declared bounds, then linearly maps to 0–1, reversing lower-is-better metrics. This does not make distinct benchmark protocols comparable; exact panel compatibility is still required. No missing value is zero-filled. Source disagreements remain separate observations and are not averaged into an invented consensus. Statistical intervals are not generated from ranks or user weights.

## Sensitivity

`rankSensitivity` accepts explicit alternate weight vectors and reports the resulting ranking and ties. `leaveOneSuiteOut` reruns the same eligibility and common-panel rules after omitting each suite. `independentOnly` restricts evidence to independently replicated observations. These are sensitivity views, not confidence intervals. User-selected weights should be resettable and serializable by the consuming UI; the default is the immutable vector in `data/scoring.json`.

## Task prices

`taskCost` takes nonnegative **uncached** input, cached-read input, cached-write input, output and billable reasoning token counts and multiplies each by its explicit USD-per-token rate. Cached token counts are disjoint from uncached input, so callers must not pass total prompt length as `inputTokens`. A reported rate of zero is free and stays zero. A missing rate for a used token class makes the scenario unsupported. Prompt threshold overrides apply to prompt, completion and cache fields once total prompt length (uncached plus cached read/write) reaches `min_prompt_tokens`; a missing override field falls back to the base field. Reasoning is counted as a distinct billable class only when a separate rate is supplied; unknown reasoning billing with a positive reasoning count is unsupported. This is routed API pricing where sourced, not subscription value or self-hosted cost.

## Current evidence admission

The captured 118 observations include zero verified leaderboard rows and zero independent replications; 116 units are inferred and two unknown. Therefore none currently qualifies for the default score under this rule. This is a real coverage and usefulness gap despite the raw capture meeting suite/domain breadth counts. It must be repaired by later source work with publisher/authority-confirmed, documented-unit observations; changing the admission rule or relabelling inferred units is not a repair.
