# Verified ingestion leads

These are coordinator source-location checks from 30 September 2026, not admitted benchmark observations or a completed catalogue. The ingestion stage must capture its own immutable source evidence, review reuse status, establish exact identities and units, and pass the unchanged coverage gate.

## Publisher result tables

- [Qwen3.5-397B-A17B model card](https://huggingface.co/Qwen/Qwen3.5-397B-A17B#benchmark-results): its public raw README returned HTTP 200 and contains language and vision comparison tables. It reports knowledge, instruction following, long-context, reasoning, mathematics, tools, coding and multilingual tests. Preserve all table footnotes and configurations. In particular, an unspecified `GPQA` row must not silently become GPQA Diamond, and publisher-refined SWE-bench Pro tasks must not join an unmodified public split.
- [Qwen3.6-35B-A3B model card](https://huggingface.co/Qwen/Qwen3.6-35B-A3B#benchmark-results): its public raw README returned HTTP 200, with numeric comparison tables and detailed harness notes. It distinguishes total and activated parameters. Its AIME 2026 row is not AIME 2025; tools, changed judges, subsets, averaging and unavailable cells need their actual identities.
- [Meta Llama 4 Maverick model card](https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct#benchmarks): the public rendered HTML returned HTTP 200 and contains the published benchmark tables at the verified `benchmarks` anchor. The raw README endpoint returned HTTP 401. Respect that boundary: use public model-card facts with their attribution and admitted reuse status, without downloading gated weights or pretending the raw request succeeded. Scout, Maverick, older comparison models, base and instruction-tuned results remain separate.

Publisher tables are publisher-reported evidence. A competitor value published in another lab's table is not automatically an independent measurement or an exact match for a different reasoning budget, provider, split or harness. Unknown settings remain explicit and can exclude a comparison.

## Broad API catalogue and pricing

[OpenRouter's public models API](https://openrouter.ai/api/v1/models) returned HTTP 200 without authentication and listed 464 entries at inspection. The [official API documentation](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) describes its catalogue and pricing fields. It covers OpenAI, Anthropic, Google, xAI, Meta, DeepSeek, Qwen, Kimi, GLM, MiniMax, Mistral, Cohere, NVIDIA and IBM among other publishers. AI21 and Allen AI still require their own original sources when absent from that snapshot.

Include every admitted source model in the catalogue, with pagination and honest missing results. API listings are not benchmark scores; API listing timestamps are not proven model release dates. Routing prices belong to the named provider and endpoint and must not be presented as the model developer's direct tariff. Preserve token units, request fees, cache semantics and unavailable fields; do not turn unknown prices into zero. Confirm any alias against original model cards or release documents before joining results.

All reads above were public and incurred no model-evaluation requests. No owner credentials, subscription options, private task economics or account metadata belong in the public dataset.
