---
license: other
language:
- en
library_name: transformers
pipeline_tag: text-generation
tags:
- moe
- mixture-of-experts
- modularity
- index
datasets:
- allenai/OLMoE-mix-0924
---

# EMO: Pretraining Mixture of Experts for Emergent Modularity

This page is an **index** for the model checkpoints released alongside [EMO: Pretraining Mixture of Experts for Emergent Modularity](https://arxiv.org/abs/2605.06663). The repository at `allenai/EMO` does not host model weights — pick the checkpoint you want from the table below.

## Released models

### Main release

| Model | Description |
|---|---|
| [`allenai/Emo_1b14b_1T`](https://huggingface.co/allenai/Emo_1b14b_1T) | **EMO** — 1B-active / 14B-total MoE pretrained on 1T tokens + 50B-token midtraining anneal. The main model from the paper. |

### Ablation: EMO at smaller scale

| Model | Description |
|---|---|
| [`allenai/Emo_1b14b_130B`](https://huggingface.co/allenai/Emo_1b14b_130B) | EMO trained on 130B tokens (Table 1 / Figure 11 ablation). Not midtrained. |

### Architecture-matched standard MoE baselines

These share architecture and data with the EMO models above; only the training objective differs (no document-level expert pool constraint).

| Model | Description |
|---|---|
| [`allenai/StdMoE_1b14b_1T`](https://huggingface.co/allenai/StdMoE_1b14b_1T) | Standard MoE — *Reg. MoE* at 1T tokens in the paper. Same setup as `Emo_1b14b_1T`. |
| [`allenai/StdMoE_1b14b_130B`](https://huggingface.co/allenai/StdMoE_1b14b_130B) | Standard MoE — *Reg. MoE* at 130B tokens. Same setup as `Emo_1b14b_130B`. |

### Memory-matched baselines (Figure 1)

Smaller models trained from scratch at fixed memory budgets, used as comparison points for EMO expert subsets.

| Model | Description |
|---|---|
| [`allenai/Dense_1b_130B`](https://huggingface.co/allenai/Dense_1b_130B) | **Dense @ 8** — 1B dense decoder-only Transformer trained on 130B tokens. Active-parameter-matched with 8-expert subsets of the larger EMO/StdMoE models. |
| [`allenai/StdMoE_1b4b_130B`](https://huggingface.co/allenai/StdMoE_1b4b_130B) | **Reg. MoE @ 32** — 1B-active / 4B-total standard MoE (32 routed experts) trained from scratch on 130B tokens. Memory-matched with 32-expert subsets. |

### EMO-anneal ablation (Appendix B.4)

Tests whether modularity can be induced *after* pretraining by annealing a standard MoE under the EMO objective.

| Model | Description |
|---|---|
| [`allenai/StdMoE_1b14b_1T_Preanneal`](https://huggingface.co/allenai/StdMoE_1b14b_1T_Preanneal) | Standard MoE pretrained on 1T tokens, no annealing. The starting point for the EMO-anneal experiment. |
| [`allenai/StdMoE_1b14b_1T_EmoAnnealed`](https://huggingface.co/allenai/StdMoE_1b14b_1T_EmoAnnealed) | **EMO-anneal** — `StdMoE_1b14b_1T_Preanneal` annealed for 50B tokens under the EMO document-level expert pool objective. |

## Quick start

All checkpoints require `trust_remote_code=True` since they use custom modeling code from the [ryanyxw/transformers](https://github.com/ryanyxw/transformers/tree/flexmoe_v4_57_1) fork. Replace `model_id` with the checkpoint you want from the table above.

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "allenai/Emo_1b14b_1T"  # main EMO release
model = AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True)
tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)

inputs = tokenizer(["Language modeling is "], return_tensors="pt", return_token_type_ids=False)
out = model.generate(**inputs, max_new_tokens=100, do_sample=True, temperature=1.0, top_p=0.7)
print(tokenizer.batch_decode(out, skip_special_tokens=True)[0])
```

## Citation

```bibtex
@article{wang2026emo,
  title  = {EMO: Pretraining Mixture of Experts for Emergent Modularity},
  author = {Wang, Ryan and Bhagia, Akshita and Min, Sewon},
  year   = {2026},
  url    = {https://arxiv.org/abs/2605.06663}
}
```

## Links

- Paper: https://arxiv.org/abs/2605.06663
- Code: https://github.com/allenai/EMO
- Visualization: https://emovisualization.netlify.app
