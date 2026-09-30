# Verified ingestion leads

These are coordinator source-location checks from 30 September 2026, not admitted benchmark observations or a completed catalogue. The ingestion stage must capture its own immutable source evidence, review reuse status, establish exact identities and units, and pass the unchanged coverage gate.

## Publisher result tables

- [Qwen3.5-397B-A17B model card](https://huggingface.co/Qwen/Qwen3.5-397B-A17B#benchmark-results): its public raw README returned HTTP 200 and contains language and vision comparison tables. It reports knowledge, instruction following, long-context, reasoning, mathematics, tools, coding and multilingual tests. Preserve all table footnotes and configurations. In particular, an unspecified `GPQA` row must not silently become GPQA Diamond, and publisher-refined SWE-bench Pro tasks must not join an unmodified public split.
- [Qwen3.6-35B-A3B model card](https://huggingface.co/Qwen/Qwen3.6-35B-A3B#benchmark-results): its public raw README returned HTTP 200, with numeric comparison tables and detailed harness notes. It distinguishes total and activated parameters. Its AIME 2026 row is not AIME 2025; tools, changed judges, subsets, averaging and unavailable cells need their actual identities.
- [Meta Llama 4 Maverick model card](https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct#benchmarks): the public rendered HTML returned HTTP 200 and contains the published benchmark tables at the verified `benchmarks` anchor. The raw README endpoint returned HTTP 401. Respect that boundary: use public model-card facts with their attribution and admitted reuse status, without downloading gated weights or pretending the raw request succeeded. Scout, Maverick, older comparison models, base and instruction-tuned results remain separate.

Publisher tables are publisher-reported evidence. A competitor value published in another lab's table is not automatically an independent measurement or an exact match for a different reasoning budget, provider, split or harness. Unknown settings remain explicit and can exclude a comparison.

## Current frontier publisher pages

Fresh coordinator GETs on 30 September 2026 at 19:41 UTC verified accessible original result pages below. These leads supplement the older checkpoint cards above; those older checkpoints must not become the default current frontier merely because they are easier to parse. Capture fresh source bytes and exact table identities before admission.

| Publisher page | Retrieval | Important comparison boundary |
| --- | --- | --- |
| [Claude Sonnet 5.5](https://www.anthropic.com/claude-sonnet-5-5) | HTTP 200, 430,222 bytes | Tables and footnotes distinguish effort settings and benchmark versions. Do not mix Terminal-Bench 4.0 with 2.1. |
| [Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5) | HTTP 200, 664,452 bytes | Original results include tools-enabled HLE and distinct professional/agent evaluations. Peer columns retain the reporting publisher and each configuration. |
| [Gemini 3.8 Flash model card](https://deepmind.google/models/model-cards/gemini-3-8-flash/) | HTTP 200, 154,251 bytes | Numeric HTML table explicitly distinguishes percent scores, Elo and all-pass rates, tools and agentic video conditions; link the associated evaluation methodology. |
| [Grok 4.7 release](https://x.ai/news/grok-4-7) | HTTP 200, 292,675 bytes | The DeepSWE effort differs from the principal xHigh configuration. Professional measures and safety results belong in their own panels. |
| [Kimi K2.6 original card](https://huggingface.co/moonshotai/Kimi-K2.6) | Raw main README HTTP 200, 29,325 bytes | Preserve year-specific mathematics, thinking/tool conditions and exact model identities. |
| [NVIDIA Nemotron 3 Ultra technical report](https://research.nvidia.com/labs/nemotron/files/NVIDIA-Nemotron-3-Ultra-Technical-Report.pdf) | HTTP 200, 3,876,804 bytes | Base versus instructed configurations, shot counts and context lengths remain distinct; the report contains multilingual and long-context measurements. |

The OpenAI launch URLs [GPT-6.1 Sol](https://openai.com/index/introducing-gpt-6-1-sol/) and [GPT-6 Astra](https://openai.com/index/gpt-6-astra/) returned HTTP 403 to the coordinator's direct GET. This is a restricted fetch, not a verified result payload. Use accessible official system-card/model documentation or benchmark-authority results where available; do not represent the blocked response as successful retrieval. Public provider metadata can still list the exact versions with unavailable measurements.

## Broad API catalogue and pricing

[OpenRouter's public models API](https://openrouter.ai/api/v1/models) returned HTTP 200 without authentication and listed 464 entries at inspection. The [official API documentation](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) describes its catalogue and pricing fields. It covers OpenAI, Anthropic, Google, xAI, Meta, DeepSeek, Qwen, Kimi, GLM, MiniMax, Mistral, Cohere, NVIDIA and IBM among other publishers. AI21 and Allen AI still require their own original sources when absent from that snapshot.

Include every admitted source model in the catalogue, with pagination and honest missing results. API listings are not benchmark scores; API listing timestamps are not proven model release dates. Routing prices belong to the named provider and endpoint and must not be presented as the model developer's direct tariff. Preserve token units, request fees, cache semantics and unavailable fields; do not turn unknown prices into zero. Confirm any alias against original model cards or release documents before joining results.

All reads above were public and incurred no model-evaluation requests. No owner credentials, subscription options, private task economics or account metadata belong in the public dataset.
