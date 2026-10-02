# AxionBench scoring method

Method `axion-domain-v1` is a comparison aid, not a universal capability claim. Raw benchmark results, coverage and provenance remain primary. The checked-in definition and fixed initial domain weights are in `data/scoring.json`; executable rules are in `src/scoring/index.mjs`.

The [current/version policy](CURRENT-POLICY.md) adds stricter product eligibility without changing this mathematical foundation. Current mode requires first-party model identity, a maintained exact benchmark and pinned tested harness. Four BFCL configuration rows across two identities qualify; two rows belong to the 12 default models. The full default cohort has no common current capability panel, so its composite is null. Existing qualified historical coverage remains 23 suites across eight capability domains.

BridgeBench’s 270 published values are selectable comparative ratings, in their native units. Overall includes cost and speed. They stay outside the accuracy index, family coverage and independent measurement panels. Every rating has an exact model result link, content-hash snapshot version and a visible scoring exclusion. For example, an overall rating of 646 is displayed as “646 BridgeBench rating”, never “64.6% accuracy”. Unknown scores, dates and uncertainty are never zero-filled.

## Admission and comparability

An observation is excluded from a default aggregate unless its unit is documented, its metric can be normalized using the registry's declared lower and upper bounds and direction, and its result is confirmed by a publisher/benchmark authority or an independent replication. A result from a model repository's `refs/pr/*` revision is excluded as an unmerged community submission even when the target repository belongs to a known lab. The capture preserves the reported result for inspection and does not promote a model card or a parsed numeric value to an authoritative score. Unverified results and unknown/inferred units remain visible in raw evidence.

The compared cohort must share the exact suite/version, task, split, metric/direction and tested configuration. Unknown conditions do not establish compatibility. No compatible common panel means no overall score. Multiple suites in one family are averaged within that family before family means are averaged within each capability domain. Domains then use the declared weights. The same weight vector applies to every model; a missing positively weighted domain makes that model's overall score unavailable instead of redistributing weight. Safety, human preference, professional, audio/video, latency and cost are separate measures.

Normalization rejects values outside the metric's declared bounds, then linearly maps valid values to 0–1, reversing lower-is-better metrics. This does not make distinct benchmark protocols comparable; exact panel compatibility is still required. No missing value is zero-filled. Source disagreements remain separate observations and are not averaged into an invented consensus. Statistical intervals are not generated from ranks or user weights.

## Sensitivity

`rankSensitivity` accepts explicit alternate weight vectors and reports the resulting ranking and ties. `leaveOneSuiteOut` reruns the same eligibility and common-panel rules after omitting each suite. `independentOnly` restricts evidence to independently replicated observations. These are sensitivity views, not confidence intervals. The mounted domain-weight view edits all 11 weights, resets to the immutable equal default, and saves weights and model selections in the URL. A value-independent rule selects the highest reasoning setting shared by both models in each source/suite/metric/condition panel. ±20% weight scenarios, real leave-one-suite-out reruns and independent-evaluator-only reruns preserve eligibility and report incomplete coverage explicitly. Source independence is not labelled an item-level replication.

## Task prices

`taskCost` takes nonnegative **uncached** input, cached-read input, cached-write input, output and billable reasoning token counts and multiplies each by its explicit USD-per-token rate. Cached token counts are disjoint from uncached input, so callers must not pass total prompt length as `inputTokens`. A reported rate of zero is free and stays zero. A missing rate for a used token class makes the scenario unsupported. Prompt threshold overrides apply to prompt, completion and cache fields once total prompt length (uncached plus cached read/write) reaches `min_prompt_tokens`; a missing override field falls back to the base field. Reasoning is counted as a distinct billable class only when a separate rate is supplied; unknown reasoning billing with a positive reasoning count is unsupported. This is routed API pricing where sourced, not subscription value or self-hosted cost.

## Current evidence admission

The captured 118 observations include zero verified leaderboard rows and zero independent replications; 116 units are inferred and two unknown. Therefore none currently qualifies for the default score under this rule. This remains the audit of the community capture. A separate validated original-source authority projection now supplies 23 admitted capability suites across 8 domains. It does not promote any of the earlier community rows; strict aggregates remain limited to compatible common panels. See `docs/SOURCE-AUTHORITY-IMPLEMENTATION.md`.

The licensed original-provider task view is documented in [PRICING.md](PRICING.md). Routed source prices remain excluded; the separate Google text tariff projection has explicit CC BY 4.0 permission.

The [core view guide](CORE-VIEWS.md) explains native rating/accuracy units, current versus historical ranking panels, sparse normalized domain views, and how to reproduce their browser checks. Every selectable chart shares its qualified row projection with text, tooltips and exports. A partial domain chart never makes a missing default composite available.
