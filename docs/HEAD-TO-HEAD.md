# Original-source admission and the matched US–China head-to-head

Step 8 closes the "0 admitted results" blocker recorded in `SOURCE-AUTHORITY-IMPLEMENTATION.md`, then builds the paired comparison on that evidence. Verify with `npm run test:authority && npm run test:head-to-head`.

## Admitted sources (captured 30 September 2026)

| Source | Provenance | Projection | Units documented by |
| --- | --- | --- | --- |
| [DeepSWE v1.1 artifact](https://deepswe.datacurve.ai/) | benchmark authority | `data/authority-deepswe.json`: all 70 configurations / 28 models; pass@1 and pass@4 kept as separate metrics | artifact unit statement |
| [Epoch AI Benchmarking Hub](https://epoch.ai/benchmarks) (CC BY 4.0) | independent evaluator | `data/authority/epoch-hub.json`: 1,019 Epoch-run rows across GPQA Diamond, FrontierMath Tiers 1–3 v2 and Tier 4 v2, OTIS Mock AIME, MATH Level 5, SimpleQA Verified and SWE-bench Verified | `benchmark_metadata.csv` score column and scale 1.0 |
| [BFCL V4](https://gorilla.cs.berkeley.edu/leaderboard.html) | benchmark authority | `data/authority/bfcl-v4.json`: 109 rows, commit f7cf735, last updated 2026-04-12 | literal `%` in every cell |
| [LongBench v2](https://longbench2.github.io/) | benchmark authority | `data/authority/longbench-v2.json`: 38 rows (human/random baselines excluded); w/o CoT and w/ CoT kept separate | header `Overall (%)` |
| Google / Anthropic result tables | publisher-reported | `data/publisher-percentage-facts.json` (unchanged): own-model facts are admitted, but competitor columns are labelled claims and are not admitted | literal `%` |

Epoch's `*_external.csv` files transcribe other leaderboards. They are used only for organization/country attribution, never as measurements. Every projection records the source SHA-256 and a `rowsSha256` over its projected rows. Raw bytes go only to a private audit directory.

Kimi K3, GLM 5.3, Qwen 3.5/3.6, Muse Spark/Glimmer and MiniMax M3 publisher tables were re-fetched and inspected. None declares a unit in its headers or cells, and the Meta, MiniMax and xAI pages render their tables client-side. Under the "never infer percentages from numeric range" rule, their values are **not** ingested. Chinese labs are still represented through DeepSWE, Epoch, BFCL and LongBench measurements.

## Admission gate (`scripts/authority/compose.mjs`)

It runs on every `npm run build` (prebuild), and the output is published as `authority` in `public/data.json` with input digests in `public/data-manifest.json`. Current result: 1,433 observations (1,351 admitted) from 7 sources. That is **23 admitted capability suites across 8 capability domains**: agents, coding, factuality, long-context, mathematics, reasoning, tool-use and vision-documents. Professional panels (Vals Finance, Harvey) are separate and do not count. LABBench2 is retained as an unmapped fact because no domain is registered for it.

The gate rejects:
- tampered rows (row digest)
- malformed digests
- pass@1/pass@4 ratio confusion
- truncated artifacts
- a publisher label mapped to a different version or variant
- pull-request or third-party URLs presented as publisher results
- undeclared units
- unreviewed benchmark labels
- unregistered domains

`npm run data:authority -- <private-audit-dir>` refreshes every source. It keeps the last-good projection on HTTP failure, on a malformed response, or when the source generation is older than the last-good one (stale).

## Regions

Region is the developer organization's country as recorded by Epoch AI. It comes from the row itself, an exact model-key attribution, or the organization record reached through `organizationAliases` in `data/authority/mapping.json`. It is never inferred from language, endpoint or licence. Results: 167 US models and 82 China models. Another 57 models are shown outside the selectors: global/multinational, other countries (for example Mistral, France), or unknown. `gpt-5-4` (DeepSWE) has no exact attribution and stays unknown.

## Matching rule (`src/authority/logic.ts`, `matched-intersection-v1`)

- A row matches only for the same source, suite version, metric and test condition, with known conditions. Publisher tables never match.
- One configuration per model is chosen by a value-independent rule: the highest listed setting, or the identical setting when that filter is on. Two rows at the chosen setting count as duplicates and are excluded.
- Unequal coverage, incompatible conditions and non-admitted rows are listed with reasons.
- Domain dumbbells average matched suites within a benchmark family first. The difference is China minus US, in percentage points.
- No overall or country winner is declared.
- URL parameters `us`, `cn`, `h2hDomain`, `h2hSetting`, `h2hSource` and `h2hMethod` persist the state. The JSON export carries the same selection, filters, panel definition, data digest and rows.

The frontier now opens with benchmark-specific authority rankings. The default is DeepSWE v1.1 pass@1, showing the top 10 distinct models at their best listed configuration. A cohort switch shows all configurations (70 for DeepSWE), and a configuration selector highlights one. Other panels cover every Epoch, BFCL and LongBench suite.

## Scoring repairs (`src/scoring/index.mjs`)

- Raw percents are normalized once via their documented normalization.
- Out-of-bounds values are invalid rather than clamped.
- Duplicate rows drop the panel.
- Unknown conditions are excluded.
- Weights must be declared capability domains, and eligibility depends only on positive-weight domains.

Adversarial fixtures for each are in `tests/scoring/test-scoring.mjs`.

## Remaining limits

- The authority sources differ in freshness: LongBench's last update is 2025-05-06 and BFCL's is 2026-04-12, so many of their rows are older models.
- Epoch "Best score (across scorers)" is Epoch's published column. Its source standard error is shown but is not presented as a confidence interval.
- The initial JavaScript is 127.68 KiB gzip. This matches the baseline before this step; the 68 KiB figure in `FRONTIER-EXPERIENCE.md` is stale.
