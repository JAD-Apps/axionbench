---
license: apache-2.0
library_name: transformers
tags:
  - bar
  - mixture-of-experts
  - olmo
---

# BAR

BAR (Branch-Adapt-Route) is a modular post-training approach that extends a fully post-trained language model with new domain capabilities via independently trained Mixture-of-Experts. Rather than retraining a single model across all domains, BAR trains independent domain experts — each through its own mid-training, supervised finetuning (SFT), and reinforcement learning pipeline — and composes them into a unified model via an MoE architecture with lightweight router training.

All BAR models are built on top of Olmo 2 7B.

## Models in the BAR suite

- **BAR-7B** — initial fully post-trained 7B dense model (the starting point)
- **BAR-2x7B-Base** — 2-expert MoE (anchor + base pre-trained model)
- **BAR-2x7B-Math-SFT** — math expert after mid-training and SFT
- **BAR-2x7B-Math** — math expert after mid-training + SFT + RLVR
- **BAR-2x7B-Code-SFT** — code expert after mid-training and SFT
- **BAR-2x7B-Code** — code expert after mid-training + SFT + RLVR
- **BAR-2x7B-Tool-Use** — tool use expert (SFT only)
- **BAR-2x7B-Safety** — safety expert (SFT only)
- **BAR-5x7B** — final 5-expert MoE combining all experts with a trained router

## Results

| Model | Overall | Knowledge | Reasoning | Chat | Math | Code | Tool Use | Safety |
|---|---|---|---|---|---|---|---|---|
| BAR-7B            | 31.3 | 28.5 | 29.8 | 48.9 | 23.6 | 11.8 | 25.3 | 51.3 |
| BAR-2x7B-Math-SFT | 36.8 | 28.8 | 31.2 | 40.9 | 41.9 | 20.5 | 21.6 | 72.7 |
| BAR-2x7B-Math     | 39.3 | 29.0 | 30.8 | 42.5 | 55.8 | 22.1 | 19.8 | 75.4 |
| BAR-2x7B-Code-SFT | 38.5 | 28.8 | 29.1 | 40.1 | 25.5 | 49.3 | 19.7 | 77.3 |
| BAR-2x7B-Code     | 38.8 | 28.5 | 29.2 | 41.0 | 26.9 | 50.4 | 19.8 | 75.3 |
| BAR-2x7B-Tool-Use | 37.2 | 28.5 | 28.7 | 39.3 | 21.8 | 16.9 | 46.4 | 79.1 |
| BAR-2x7B-Safety   | 35.6 | 28.7 | 28.8 | 38.1 | 22.4 | 15.7 | 21.1 | 94.6 |
| BAR-5x7B          | 49.1 | 28.4 | 30.8 | 38.7 | 56.2 | 49.9 | 45.6 | 94.0 |

Scores are unweighted averages across benchmarks within each category. See the paper for per-benchmark results and full evaluation details.

## License

This model is licensed under Apache 2.0. It is intended for research and educational use in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use).