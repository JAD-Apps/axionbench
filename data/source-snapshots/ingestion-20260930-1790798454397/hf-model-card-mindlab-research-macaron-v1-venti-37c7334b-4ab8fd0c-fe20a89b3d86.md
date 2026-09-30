---
language:
- en
- zh
license: mit
library_name: transformers
pipeline_tag: text-generation
tags:
- macaron
- macaron-v1
- glm-5.2
- mixture-of-lora
- personal-agent
- tool-use
- generative-ui
- ui4a
- a2ui
- coding-agent
- eval-results
- arxiv:2608.09819
model-index:
  - name: Macaron-V1-Venti
    results:
      - task:
          type: text-generation
          name: Chat
        dataset:
          type: ChatBench
          name: ChatBench
        metrics:
          - type: score
            value: 58.3
            name: Score
      - task:
          type: text-generation
          name: Chat
        dataset:
          type: LivingBench
          name: LivingBench
        metrics:
          - type: score
            value: 64.0
            name: Score
      - task:
          type: text-generation
          name: Personal Agent
        dataset:
          type: VitaBench
          name: VitaBench
        metrics:
          - type: score
            value: 60.0
            name: Score
      - task:
          type: text-generation
          name: Personal Agent
        dataset:
          type: VitaBench2
          name: VitaBench2
        metrics:
          - type: score
            value: 46.0
            name: Score
      - task:
          type: text-generation
          name: Personal Agent
        dataset:
          type: tau3-Bench
          name: "tau³-Bench"
        metrics:
          - type: score
            value: 69.3
            name: Score
      - task:
          type: text-generation
          name: Personal Agent
        dataset:
          type: PinchBench
          name: PinchBench
        metrics:
          - type: score
            value: 94.0
            name: Score
      - task:
          type: text-generation
          name: Personal Agent
        dataset:
          type: ClawGym
          name: ClawGym
        metrics:
          - type: score
            value: 77.7
            name: Score
      - task:
          type: text-generation
          name: Coding
        dataset:
          type: SWE-Verified
          name: SWE Verified
        metrics:
          - type: score
            value: 85.6
            name: Score
      - task:
          type: text-generation
          name: Coding
        dataset:
          type: TerminalBench-2.1
          name: TerminalBench 2.1
        metrics:
          - type: score
            value: 87.6
            name: Score
      - task:
          type: text-generation
          name: Coding
        dataset:
          type: DeepSWE
          name: DeepSWE
        metrics:
          - type: score
            value: 58.4
            name: Score
      - task:
          type: text-generation
          name: Coding
        dataset:
          type: SWE-Atlas-QnA
          name: SWE Atlas QnA
        metrics:
          - type: score
            value: 49.5
            name: Score
      - task:
          type: text-generation
          name: Generative UI
        dataset:
          type: UI4A-Bench
          name: UI4A-Bench
        metrics:
          - type: score
            value: 87.8
            name: Score
---


# Macaron-V1-Venti

<div align="center">
  <img src="assets/mindlab_logo.svg" width="32%" alt="MindLab logo"/>
</div>

<p align="center">
  📖 <b>Blog:</b> <a href="https://macaron.im/mindlab/research/introducing-macaron-v1" target="_blank">Introducing Macaron-V1</a>
  <br>
  🚀 <b>Hosted API:</b> <a href="https://mintcn.macaron.xin/" target="_blank">Macaron API Platform</a>
  <br>
  🧩 <b>Artifacts:</b> <a href="https://github.com/MindLab-Research/macaron-artifacts" target="_blank">Macaron Artifacts</a>
  <br>
  🛠️ <b>Self-hosted serving:</b> <a href="https://github.com/MindLab-Research/Mixture-of-LoRA-Harness" target="_blank">Mixture of LoRA (MoL) serving harness</a>
  <br>
  📄 <b>Technical report:</b> <a href="https://huggingface.co/papers/2608.09819" target="_blank">Macaron-V1: Towards Open Continual Learning with Self-Improvement and Mixture-of-LoRA</a> (arXiv:2608.09819)
  <br>
  ✉️ <b>Correspondence:</b> contact@mindlab.ltd
</p>

Macaron-V1-Venti is a 748B-parameter flagship model in the Macaron-V1 family, built for personal intelligence, tool use, coding workflows, and code-native Generative UI.

The model uses a Mixture of LoRA (MoL) architecture on top of GLM-5.2, consisting of a 744B-parameter base model and four 1B-parameter LoRA specialists. The specialists cover chat, personal-agent tasks, coding, and GenUI, with an L0 router selecting the most suitable specialist for each new user request.

Macaron-V1-Venti follows Macaron-V1-Preview and keeps the routed MoL design while moving to GLM-5.2. It is the first model to be post-trained on GLM-5.2, expanding personal-agent and Generative UI training while aligning model behavior with the production harness used for agentic workflows.

## Highlights

- A 748B-parameter flagship model, consisting of a 744B GLM-5.2 base model and four 1B-parameter LoRA specialists across Chat, Agent, Coding, and GenUI.
- The first model to be post-trained on GLM-5.2, moving Macaron's personal-intelligence stack beyond Macaron-V1-Preview.
- Model-and-harness co-design: post-trained with MinT and MindForge for production-aligned routing, tool use, UI4A Generative UI, and agent workflows.
- Long-context post-training infrastructure: the V1 training stack incorporates LongStraw for multi-million-token RL execution, with Venti supporting a 1M context length.
- Broad evaluation across personal intelligence, agentic tasks, coding, terminal use, and Generative UI; Macaron V1 leads the listed baselines on ChatBench, LivingBench, PinchBench, TerminalBench 2.1, and UI4ABench.

## Model Overview

| Field | Value |
|---|---|
| Model name | Macaron-V1-Venti |
| Organization | MindLab Research |
| Release family | Macaron-V1 |
| Base model | GLM-5.2 |
| Architecture | GLM-5.2 base + Mixture of LoRA (MoL) specialists |
| Parameter footprint | 748B release label: a 744B GLM-5.2 base plus four release-labeled 1B LoRA specialists |
| Specialists | L0 Chat, L1 Agent, L2 Coding, L3 GenUI (1B each) |
| Post-training system | MinT + MindForge |
| Primary domains | Personal intelligence, tool use, coding, Generative UI |
| Context length | 1M |
| Precision / serving format | BF16 base checkpoint with routed LoRA serving |
| License | MIT |

**On parameter counts.** 748B is the release-facing label. Summing tensor shapes in the released adapter headers gives 7,688,042,496 stored values per adapter, so the four specialists account for ~30.8B stored values and the full artifact is ~774.8B logical stored parameters. The sidebar figure on this page is an automatic safetensors tensor count and matches neither number exactly. Stored-tensor counts are not active-per-token counts or device-memory measurements. See Section 2.2 of the technical report.

## Mixture of LoRA (MoL) Architecture

| Adapter | Role | Description |
|---|---|---|
| `L0` | Chat | Conversational and instruction-following backbone; entry point for routing. |
| `L1` | Agent | Personal-life agent tasks, heavy tool use, long-horizon planning, and dynamic workflows. |
| `L2` | Coding | Code understanding, SWE tasks, terminal use, and repository workflows. |
| `L3` | GenUI | UI4A rendering and UI-driven action. |

At runtime, L0 routes each new user request to the most suitable specialist. Ongoing reasoning and tool interactions remain within the selected LoRA, while completed work can be shared across specialists through concise summaries.

### Routing Behavior and Cost

Each user turn runs a three-hop loop: L0 emits a canonical adapter label under a 24-token constrained-decoding budget, the selected specialist answers, and it then emits a ≤192-token summary that the Proxy retains server-side as cross-specialist context.

| Hop | Avg latency | Share of loop |
| --- | --- | --- |
| Route (L0 constrained decode, 24 tok) | 0.54 s | 12% |
| Answer (specialist generation) | 3.17 s | 68% |
| Summary (192-tok cap) | 0.97 s | 20% |
| Total | 4.68 s | 100% |

Measured over 48 multi-turn mixed-domain requests at temperature 0. Routing plus summary add ~32% on top of the specialist's own generation.

Routing accuracy is 6,391/6,448 = 99.12% with 100% canonical-label compliance and zero request or parse errors; per-class accuracy ranges from 97.1% (L1 Agent) to 100% (L2 Coding), with residual errors concentrated at the L0/L1 boundary. This trace is drawn from LoRA training data rather than an independent held-out split, so it is an implementation diagnostic and does not estimate routing generalization.

## Evaluation

![Macaron-V1 benchmark results](assets/v1_benchmark.png)

| Benchmark | Macaron V1 | GLM 5.2 | GPT 5.5 | Claude Opus 4.8 | Gemini 3.1 Pro | Qwen 3.7 Max | Minimax M3 |
|---|---:|---:|---:|---:|---:|---:|---:|
| ChatBench | 58.3 | 54.5 | 55.5 | 52.8 | 52.0 | 52.5 | 49.1 |
| LivingBench | 64.0 | 60.5 | 61.9 | 63.8 | 52.1 | 56.1 | 57.1 |
| VitaBench | 60.0 | 55.8 | 55.8 | 56.5 | 55.2 | 61.2 | 56.8 |
| VitaBench2 | 46.0 | 43.1 | 47.4 | 46.3 | 50.2 | 47.6 | 39.4 |
| tau^3-Bench | 69.3 | 69.1 | 61.1 | 67.7 | 67.1* | 63.0 | 61.2 |
| PinchBench | 94.0 | 88.1 | 89.0* | 91.8* | 82.9* | 93.4* | 86.1 |
| ClawGym | 77.7 | 74.6 | 82.5 | 80.5 | 77.5 | 75.7 | 76.2 |
| SWE Verified | 85.6 | 80.4 | 82.9* | 88.6* | 80.6* | 80.4* | 80.5* |
| TerminalBench 2.1 | 87.6 | 82.7* | 83.4* | 78.9* | 70.7* | 73.5* | 66.0* |
| DeepSWE | 58.4 | 54.9* | 70.0* | 58.0* | 10.0* | 18.0* | 20.0* |
| SWE Atlas QnA | 49.5 | 48.9* | 45.4* | 57.3* | 13.5* | 22.6 | 37.9 |
| UI4A-Bench | 87.8 | 67.1 | 72.1 | 75.9 | 60.3 | 62.5 | 63.0 |

Higher is better; all scores on a 0–100 scale. Within each row, unstarred values use the same task set and benchmark-specific protocol; `*` marks a value imported from a public leaderboard or model report and included as contextual reference. Metrics and protocols differ across rows, so this table does not define an aggregate model ranking.

### Evaluation Protocols

| Benchmark | Cases | Judge / simulator | Metric |
| --- | --- | --- | --- |
| Macaron ChatBench | 46 de-identified multi-turn cases | privately deployed GLM-5.2 judge, 1–5 criteria from six fixed axioms | mean of 3 samples per case |
| Macaron LivingBench | 40 scenarios (20 zh / 20 en), ≤10 turns | user simulator Kimi K2.6; world/noise/meter agents Gemini 3.1 Pro; judge Claude Opus 4.6 | 0.7 × need fulfillment + 0.3 × process quality, mean of 3 runs |
| VitaBench | Delivery / In-Store / OTA / Cross | GLM-5.1 as both judge and user model (reproduced; original judge unavailable) | macro-average task success |
| VitaBench2 | Chinese personalization set | Rewrite / Agentic Memory setting | Avg@1 (official leaderboard uses Avg@4) |
| tau^3-Bench | — | GPT-5.2 user simulator, `reasoning_effort=low` | pass@1 |
| PinchBench | — | Claude Haiku 4.5 judge, Perplexity search API | best observed run |
| ClawGym | — | GPT-5.4 judge | pass@1 |
| SWE-bench Verified | — | Claude Code harness; retry ≤3 only after an evaluation error (~0.8%) | reported successful evaluated attempt |
| TerminalBench 2.1 | — | Harbor framework, Claude Code Agent Harness, 4h timeout | pass@1 |
| DeepSWE | — | Claude Code harness, ≤3 attempts | best attempt |
| SWE Atlas QnA | — | Claude Code harness, Claude Opus 4.8 judge | pass@3 |
| UI4A-Bench | 161 cases, 8 domains | mobile 390×844 primary viewport, Gemini 3.5 Flash judge, versioned deterministic aggregator | Final Score |

Two scope notes carried over from the report. The coding and terminal rows use the Claude Code agent scaffold rather than the production MoL harness. Macaron ChatBench and Macaron LivingBench share source domains and failure taxonomies with our training loop, so they characterize fit to the targeted Personal Intelligence distribution rather than serving as an independent held-out test set. The ChatBench judge is from the same model family as this model's base, which may favor GLM-derived responses; no human-agreement or cross-family judge calibration is available. All values are point estimates without confidence intervals.

Hugging Face ingestible result files are included under [`.eval_results`](.eval_results/) for SWE-bench Verified. The full model-card table is also mirrored in [`evaluation/benchmark_summary.yaml`](evaluation/benchmark_summary.yaml) for reproducibility and downstream parsing.

### UI4A-Bench Layer Scores

The Final Score combines five Layer Scores with fixed weights: Engineering Viability (8%), Task Quality (18%), Visual Quality (38%), Interaction (20%), and Constraint Adherence (16%), followed by fixed, versioned affine normalization.

Against the strongest reported baseline per dimension, Macaron-V1-Venti leads by 12.0 points in Constraint Adherence (94.2 vs Opus 4.8's 82.2), 6.6 points in Visual Quality (90.0 vs GPT-5.5's 83.4), and 1.6 points in Interaction (95.0 vs Opus 4.8's 93.4). All models receive the same 161 cases under the same versioned UI4A runtime, viewports, interaction runner, judge, and scoring policy.

## Limitations

- **One snapshot, not a demonstrated learning curve.** This release is a single snapshot of the recursive self-improvement loop. It cannot by itself distinguish compounding improvement across generations from a single round of self-generated-data training; cross-generation lift is not measured.
- **No collective-intelligence evidence.** MoL is designed so that specialists trained by different teams or personalized for different users can compose on one shared base. This release evaluates only the four shipped specialists and does not test a cross-owner adapter population, nor establish robust switching under broad workloads.
- **Single intent per turn.** The routing loop assigns a whole user turn to one specialist. Messages that pack several intents are handled by routing to one specialist and letting the conversation segment over later turns; multi-intent decomposition is exploratory and not in production.
- **Stateful observe-before-commit APIs.** On BFCL v4 (200 tasks), our REPL substrate scores 49.5% versus 54.0% for discrete function calling. Dependent calls that must observe one result before committing the next are a known weak spot; the harness therefore permits falling back to discrete calls or shell.
- **Long-session character stability.** We observe qualitative degradation after multiple preference-drift events in very long sessions. This failure mode is documented but not quantitatively measured.
- **No component-level attribution.** Whether reported gains come from specialization, routing, the harness, or their interaction is not resolved by any controlled experiment in this release. The coding and terminal rows evaluate the released system end to end rather than isolating the L2 adapter.
- **Reproducibility boundary.** A reported run is reconstructable only when the adapter revision and compatible base are joined with the corresponding harness configuration, task-bank version, evaluator, and sampling settings. This card does not carry a complete per-specialist training specification.

## Safety

**Scope of evaluation.** This release does not include a standalone safety or red-team evaluation. Anti-sycophancy is enforced as an independent scored dimension in Macaron ChatBench, and human review is required for harness changes that touch tool exposure or safety-relevant boundaries, but neither substitutes for a dedicated safety assessment. We interpret the reported results as a systems characterization, not as evidence that this release is suitable for safety-critical use.

**Data governance.** Internal evaluations include de-identified product conversations and traffic. This release does not document the consent or opt-in basis for research use, the de-identification procedure and residual re-identification audit, retention and access controls, or an ethics-review determination.

**Deployment guidance.** Do not deploy this model as an unsupervised decision-maker in medical, legal, financial, or other high-stakes personal-assistance settings. The UI4A action contract includes a `NoAI` visibility boundary for fields the model must not see; use it for sensitive data rather than relying on prompt-level instructions. Inherited requirements from the GLM-5.2 base model and from serving-harness dependencies also apply.

**Reporting.** Please open a discussion on this repository or contact contact@mindlab.ltd for safety issues.

## Hardware Requirements

MoL keeps one base resident and exposes specialists as runtime adapters, so it stores ~774.8B logical parameters versus 2.976T for a replicated layout that merges each specialist into its own copy of the base — about 26.0% of the stored parameter values.

Validated operating points:

| Platform | Layout | Workload | Result |
| --- | --- | --- | --- |
| H20 | TP8 | 8 × 131K in, 256 out | 8/8 clean, 89.0% peak KV |
| H20 | TP4/PP2/DCP4 | 16 × 56K in, 128 out | 16/16 clean |
| H20 | TP4/PP2/DCP4 | 8 × 180K in, 128 out | 8/8 clean |
| H20 | TP4/PP2/DCP4 | 4 × 230K in, 128 out | 4/4 clean |

On eight B300 GPUs with DCP8 and EAGLE enabled: 8.6 ms mean TPOT and 110 tok/s at concurrency 1; 18.0 ms mean TPOT and 757 tok/s at concurrency 16. CP8 LayerSplit reduces cold 900K-token needle-test TTFT from 107.1 s to 49.2 s. Logical KV capacity on B300 TP8 is approximately 2.34M / 4.67M / 9.34M tokens for DCP2 / DCP4 / DCP8 with EAGLE; EAGLE reserves part of the pool for its draft model and cache.

Two deployment constraints from validation: use **replicated** DCP layouts (sharded DCP produced systematic corruption), and treat engine version, hardware, attention backend, and parallelism layout as one scoped operating point. FlashMLA sparse attention produced clean outputs for all 48 tested long-context configurations, whereas the default DSA decode path was clean in only 6 of 48 on GLM-5.1. Apply admission control to the full route–answer–summary path, not only to the answer worker.

## Training Details

| Field | Value |
| --- | --- |
| LoRA rank / alpha / dropout | r = 16, α = 32, dropout 0 |
| Target modules | `q_a_proj`, `q_b_proj`, `kv_a_proj_with_mqa`, `kv_b_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj` |
| Extra saved modules | none (`modules_to_save=null`) |
| Stored values per adapter | 7,688,042,496 (BF16) |
| Optimizer | AdamW, lr 5e-6, batch size 4, linear-warmup cosine schedule, warmup ratio 0.1 |
| Epochs | 4 (L0 Chat, L2 Coding); 1 (L1 Agent); 1 with batch size 2 (L3 GenUI) |
| RL algorithm | GRPO over selected trajectories; base weights frozen throughout |

Post-trained with MinT over a resident frozen base; long-context updates use LongStraw's response-only execution path. Rollout–learner mismatch on the sparse base is controlled by R3 rollout routing replay, DSA implementation alignment, and IcePop-style residual filtering. Neither embedding nor language-model-head modules are saved.

## Usage

### Hosted API

The hosted API is available at <https://mintcn.macaron.xin/>. Use the site for current model names, authentication, pricing, and rate-limit details.

For OpenAI-compatible deployments, requests follow the standard chat-completions shape:

```bash
curl https://mintcn.macaron.xin/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-key>" \
  -d '{
    "model": "Macaron-V1-Venti",
    "messages": [
      {"role": "user", "content": "Create a compact dashboard UI for tracking weekly fitness goals."}
    ],
    "temperature": 0.2,
    "max_tokens": 2048
  }'
```

### Mixture of LoRA (MoL) Serving

For self-hosted routed serving, use the [Mixture of LoRA (MoL) serving harness](https://github.com/MindLab-Research/Mixture-of-LoRA-Harness). The harness keeps the endpoint OpenAI-compatible while adding an L0 router, server-side LoRA metadata, and same-request switching into the selected specialist.

See the [MoL serving repository](https://github.com/MindLab-Research/Mixture-of-LoRA-Harness) for more details.

### Macaron Artifacts

[Macaron Artifacts](https://github.com/MindLab-Research/macaron-artifacts) is the companion local WebUI and plugin bundle for viewing Macaron sessions and GenUI output. It supports Claude Code, Codex, and Kimi Code, and can run against Macaron or another Anthropic-compatible endpoint.

Install it as a plugin in the agent runtime you use:

```text
# Claude Code
/plugin marketplace add https://github.com/MindLab-Research/macaron-artifacts
/plugin install macaron@macaron
```

```bash
# Codex
codex plugin marketplace add https://github.com/MindLab-Research/macaron-artifacts
codex plugin add macaron@macaron
```

```text
# Kimi Code
/plugins install https://github.com/MindLab-Research/macaron-artifacts
/reload
```

The WebUI can be configured from its settings page, or through environment variables:

```bash
MACARON_API_BASE=https://mintcn.macaron.xin/v1
MACARON_API_KEY=<api-key>
MACARON_MODEL=Macaron-V1-Venti
```

The plugin includes the `genui-builder` skill so supported agents can produce GenUI TSX and preview the rendered artifact in the browser. See the Artifacts repository for full install, update, and provider configuration details.

## License

This repository is released under the MIT License. Users should also respect any requirements inherited from the GLM-5.2 base model and from dependencies used by the serving harness.

## Citation

```bibtex
@article{mindlab2026macaronv1,
  title   = {Macaron-V1: Towards Open Continual Learning with Self-Improvement and Mixture-of-LoRA},
  author  = {{Mind Lab}},
  journal = {arXiv preprint arXiv:2608.09819},
  year    = {2026},
  url     = {https://arxiv.org/abs/2608.09819}
}
```
