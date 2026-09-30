# Benchmark registry

`data/benchmark-registry.json` is the suite/version registry; `src/benchmark-registry.ts` defines its typed contract. The registry contains **69 suite/version identities**, grouped into **56 benchmark families** across **15 capability domains**. The registry coverage and actual result coverage are reported separately in `data/coverage-report.json`.

## Availability and family identity

`pending` means a suite identity is recorded but has no admitted observation. `unsupported` means its currently cited information does not establish a sufficiently exact result/version identity. `available` is used for the 25 suite versions with captured numeric observations linked to original result evidence. Registry rows do not contribute to the launch threshold unless an observation actually joins to them.

Each version has a `benchmarkFamilyId`. Versions such as original/Verified/Pro/Multilingual SWE-bench, HLE variants, Terminal-Bench versions, and MMMU variants remain separate suite identities while family coverage counts the family once. The current data contains 25 observed suite versions across 22 families; the exact suite-to-family counts and observation counts are in the coverage report.

## Source links and observations

The ingestion audit GETs every registry reference and records redirect URL, status, retrieval time, response size, and body SHA-256. The 2026-09-30 capture audited all 69 suite references across 59 distinct URLs; all resolved with 2xx/3xx status. It corrected two stale references: FollowBench now points to `https://github.com/YJiangcm/FollowBench`, and OmniBench to `https://m-a-p.ai/OmniBench`. A reachable landing page alone is not represented as a benchmark result. Each admitted observation separately links to its actual model-card result file and, where present, exact leaderboard row and numeric value.

`npm run test:registry` checks registry structure, family distinctions, metric bounds, unknown states, and adversarial mutations. It also rechecks the five primary discovery URLs in `data/source-snapshots/manifest.json`. `npm run data:validate` checks the full current registry URL audit, all observation/result joins, evidence hashes, freshness, aliases, units, privacy, provider pricing, and genuine observed coverage. Thus the five-page registry test is not being presented as the full URL audit.

## Version identity notes

HLE original, rolling, and Diamond; SWE-bench variants; Terminal-Bench 2.x and 4; BFCL V3/V4; and original τ-bench/τ²-bench retain distinct version identities. Family IDs group versions only for coverage and later compatibility rules. Protocol fields such as split, frame budget, task setup, grader, and evaluation framework remain observation-level fields; where source material does not report them, the data records unknown/null rather than assuming the benchmark default.
