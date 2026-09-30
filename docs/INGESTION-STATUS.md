# Model and results ingestion

Last captured: **2026-09-30 20:00:56 UTC**. The current dataset is `data/ingestion.json`; the generated suite/family/domain matrix is `data/coverage-report.json`. `data:validate` recomputes the joins and coverage rather than accepting this document as evidence.

## Captured coverage

| Measure | Captured | Required at launch |
| --- | ---: | ---: |
| Registry suite/version identities | 69 | 30 |
| Registry benchmark families | 56 | — |
| Registry capability domains (excluding separate panels) | 11 | 11 |
| Numeric observations with linked result evidence | 118 | — |
| Observed suite/version identities | 25 | 15 |
| Observed benchmark families | 22 | — |
| Observed capability domains (excluding separate panels) | 8 | 8 |
| Distinct models with observations | 32 | — |

The 25 observed suite versions are `aime-2026`, `apex-agents`, `deep-swe`, `evasionbench`, `gpqa-diamond`, `gsm8k`, `hle-original`, `hmmt-feb-2026`, `ifstruct`, `lexam-hard`, `mmlu-pro`, `mmmu-pro`, `olmocr-bench`, `open-asr`, `real5-omnidocbench`, `redlinebench`, `screenspot-pro`, `skillsbench`, `swebench-multilingual`, `swebench-pro`, `swebench-verified`, `terminal-bench-2.1`, `terminal-bench-4`, `toolathlon`, and `video-mme-v2`. Their family IDs group version variants before coverage is counted; for example, the three SWE-bench versions contribute one of the 22 observed families.

Observed rows by domain: agents 12; audio/video 22; coding 17; instruction following 2; knowledge 2; mathematics 7; professional 4; reasoning 14; safety 2; tool use 2; vision/documents 34. Audio/video, professional and safety are separate panels: the eleven total observed domains contain eight capability domains. The full family and per-suite count table is in `data/coverage-report.json`.

## Model catalogue and configurations

The captured OpenRouter catalogue contained 464 service IDs grouped into **378 exact canonical model/version IDs**. The supported-source union contains **508 model records** and **1,562 configurations**, including all 17 named labs: OpenAI 65, Anthropic 15, Google 28, xAI 7, Meta 13, DeepSeek 17, Alibaba/Qwen 53, Moonshot/Kimi 8, Z.ai/GLM 18, MiniMax 8, Mistral 19, Cohere 5, AI21 17, NVIDIA 6, AllenAI/OLMo 100, IBM/Granite 3, and Microsoft 2. The remaining 124 records are explicitly grouped as other public-source models.

Original card or release bytes are captured for all 17 named labs. Across the complete model set, 294 identities have an exact primary card/release claim backed by captured bytes, 297 have an original-source URL, and **211 provider rows have no original release/card URL located**. The provider catalogue still establishes those rows’ listed IDs and versions; it does not establish their original release metadata. Parameters are present only where captured public safetensors metadata supports them (235 models); activated parameter counts remain null. Unknown release dates, base/instruct class, thinking support, quantization, and weight availability remain null or explicitly unknown. OpenRouter service creation time is kept as listing time, not model release time.

Each configuration records the source-exposed provider endpoint, quantization, context limit, reasoning options, and endpoint identity where available. The full OpenRouter endpoint responses and original service catalogue bytes are retained. Source aliases are joined to those exact catalogue rows.

## Result evidence and limits

Adapters capture Hugging Face’s public benchmark catalogue and structured leaderboard fields, original model-card bytes, and original `.eval_results` YAML bytes. This capture includes 25 leaderboard projections, 45 raw model-card evaluation files, 25 evaluation-spec attempts, 286 model-card byte snapshots, and 9 original vendor release pages. The structured projection filters author-account/profile fields; source payloads are not replaced with a hand-written summary hash. Snapshots and SHA-256 manifests are under `data/source-snapshots/ingestion-20260930-1790798454397/`.

Every observation joins an exact model/configuration, suite version and family, source file and URL, numeric raw value, retrieval time, and evaluation time when the source supplies one. 68/118 rows carry an evaluation date; 95/118 carry a split and framework; the rest are explicitly unknown. Budget and grader are unreported for all 118 rows and remain null. 73 rows also join to a matching numeric leaderboard row and exact model identity. Units are explicitly inferred and normalized for 116 rows using the registry metric scale; the other 2 remain unknown and unnormalized. No unknown value is converted to zero.

These are **publicly reported results, not independent replications**: the 118 values have 0 Hugging Face verified flags and 0 independent replications. Nine conflict groups retain 55 observations rather than collapsing differing reported values or conditions. One external result-source link returned HTTP 401; it is preserved in the retrieval receipt and remains unavailable. Five evaluation-spec endpoints returned HTTP 401; their identifiers and statuses are recorded without credentials. The observation result URLs themselves returned successfully during the captured checks.

Registry references were checked with GET requests: 69 suite references covered 59 distinct URLs; all 59 resolved with 2xx/3xx responses in the current audit. The previously stale FollowBench and OmniBench links now point to the authors’ current repository/site. This establishes current page reachability only; it does not claim every landing page contains a result table. Observation-specific result links are checked separately and must join to captured numeric evidence.

## Public API prices

The catalogue contains 1,327 distinct provider endpoint configurations and 1,328 source price rows. 1,322 rows report an input or output price. All prices are **OpenRouter routed USD per token**, not direct origin-provider list prices. Cache read/write and reasoning prices are copied only when an endpoint response supplies them: null counts are input 6, cached-input read 305, cached-input write 1,014, output 6, and reasoning 1,233. One endpoint configuration has two conflicting source price rows; both values and source endpoint hashes are retained. Direct origin-provider prices remain unknown where not captured.

## Reproduction and validation

`npm run data:ingest` runs the public source adapters, saves raw or permitted structured source payloads, records failed/restricted retrieval receipts, and writes the coverage report. It reuses only captured source responses less than six days old and preserves the previous admitted dataset if a refresh loses previously observed suites. `npm run data:validate` checks source hashes, freshness, privacy, registry URL coverage, model aliases, exact provider and observation joins, raw numeric claims, metric units/normalization, price source fields, conflicts, and the 15-suite/8-domain gate. Pending registry identities never count as observations.

Current machine-readable status: `launch-coverage-reached-with-source-limitations`. This means the numeric coverage threshold is met; it does not mean evaluations were independently verified, all 508 releases have first-party pages, or unknown protocol fields have been recovered.

## Coordinator provenance recovery

The daemon initially rejected this candidate before verification because repeated ingestion attempts exceeded its unchanged 2,048-entry changed-file provenance bound. Five unused prior capture directories (4,935 files) were moved intact to the coordinator's private audit archive with original paths, sizes and SHA-256 hashes. The current candidate retains its 1,055 referenced source/manifest paths and its failure receipts. No referenced evidence, numeric threshold or original failed receipt was discarded. A fresh daemon verification is required after this repair; local command success alone is not workflow completion.

Captured values and inferred units remain raw evidence requiring the next stage's source-acceptance audit. In particular, a result retrieved from a proposed model-repository PR is an unverified submission until publisher or benchmark-authority confirmation is established; repository ownership alone does not establish that endorsement. These records must not silently populate default aggregate rankings.
