# Open-weight explorer (step 9)

Chapter `#open-weights` mounts `src/open-weights.tsx`. It gets its data from `openWeights` in `public/data.json`, which `scripts/build-observatory-data.mjs` builds through `scripts/open-weights/derive.mjs`. All the pure logic lives in `src/open-weights/logic.ts`: bands, extraction, classification, cohort, pagination and URL state. The build, the page and the test share that one module.

## What is included

Every ingested model whose `weightsAvailability` is not `unknown` is included. This snapshot has 289. Each fact is read from the committed Hugging Face repository metadata and the model-card snapshot. The build checks each snapshot against its recorded SHA-256 and fails if one does not match.

| Fact | Rule |
|---|---|
| Total parameters / group | The safetensors `total` counts only when every weight dtype is a plain float. `I64`/`BOOL` index buffers are allowed. Integer or packed dtypes (`I32`, `I8`, `U8`, …) mark a quantized checkpoint. Its tensor count is not a parameter count, so it goes into **Undisclosed**. Bands: `<10B`, `10–35B`, `35–100B`, `100–300B`, `300B+`. The lower bound is inclusive and the upper bound exclusive. A missing, zero or non-finite total also goes into Undisclosed. |
| Activated (MoE) | This value is taken only from the model's own card, as a one-subject table row, a `key: value` line or a prose statement. If statements disagree, the value is `ambiguous`. A value that is not below the total is `inconsistent`. In a family-card table whose header names other sizes, the row is not attributed to this model. The activated count **never** sets the group. |
| MoE identity | `stated-activated` means the card states an activated count. `architecture-class` means the architecture class name contains "MoE". Otherwise the value is `not-established`. The page never asserts that a model is dense. |
| Weights access | `public` means hub `gated=false`. `gated` means hub `gated=auto/manual`. `not-verified` means no metadata snapshot was captured. |
| Licence | This comes from the hub `license` field. The classes are OSI-approved, custom/non-OSI, not stated and not verified. Weights access and licence are separate facts. |
| Base / instruct | This comes from the repository name first, then the `base_model:finetune:` tag. Otherwise it is "not stated". |
| Quantized | This is set by a `base_model:quantized` tag, a configuration quantization other than bf16/fp16/fp32, a quantization token in the repository name, or integer tensor dtypes. |
| Hosted price vs self-host | Hosted API prices are withheld because the captured rate sources do not permit redistribution. Self-host cost is not estimated because no hardware-cost source is captured. Neither value is shown as zero. |

## Interaction

- **Band tabs:** there is one tab per band and one for all sizes. The tabs show counts under the current filters.
- **Small multiples:** there is one panel per band, and all panels share a log axis from 0.1B to 3T. The default cohort has at most `MAX_PANEL_SERIES` = 8 entries per panel. It shows one model per lab, with the required labs first (Meta, DeepSeek, Qwen, Mistral, Kimi, GLM, MiniMax, NVIDIA Nemotron, OLMo, Granite). The Undisclosed panel lists reasons and plots no position.
- **Filters:** the filters cover MoE, weights access, licence, base/instruct, quantized, lab and search. All rows are reachable in a paginated table (20 per page), and each row has a source-details disclosure. That disclosure shows the metadata and card links, the SHA-256, the retrieval time and the verbatim activated quote.
- **URL state:** it is kept in `owBand`, `owMoe`, `owLicence`, `owAccess`, `owVariant`, `owQuant`, `owLab`, `owQ` and `owPage`. Parameters from other chapters are preserved.
- **Export:** the JSON export contains every filtered row, not just the visible page. It is bound to the projection digest.

## Verification

`npm run test:open-weights` first runs `npm run test:head-to-head`, which itself runs the frontier gate and the production build. It then checks:

- Band boundaries, unknown totals and packed-tensor handling.
- Activated extraction, including family-card, ambiguous and inconsistent cases, and MoE identity.
- Licence, access and base/instruct classification, pagination, the representative cap, and the URL round trip.
- Every real row re-read against its snapshot SHA-256, with each activated quote found verbatim in its card.
- That all required labs are present.
- Browser checks: panel series ≤ 8 and marks equal to row values; every row reachable by pagination; keyboard band selection; the separate filters; reload persistence; export parity; source details; reduced motion; and no overflow at 360, 390 and 768 px.

Screenshots and `test-results/open-weights-evidence.json` are written to the ignored `test-results/` directory.

## Known limits

- For 70 entries the total stays undisclosed. The main causes are quantized-only checkpoints (for example Kimi K2.5–K3, DeepSeek V4 and gpt-oss) and repositories without safetensors metadata.
- Activated counts appear only where a card states one clearly (36 entries). The gpt-oss cards describe two models, so they stay ambiguous.
- Base/instruct is not stated for most repositories.
