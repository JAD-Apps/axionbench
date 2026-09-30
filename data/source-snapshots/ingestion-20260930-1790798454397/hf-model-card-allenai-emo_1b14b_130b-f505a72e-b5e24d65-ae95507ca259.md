---
license: apache-2.0
language:
- en
library_name: transformers
pipeline_tag: text-generation
tags:
- moe
- mixture-of-experts
- modularity
- ablation
datasets:
- allenai/OLMoE-mix-0924
---

# Emo_1b14b_130B

A smaller-scale ablation checkpoint of **EMO** from [EMO: Pretraining Mixture of Experts for Emergent Modularity](https://arxiv.org/abs/2605.06663) — referred to as **EMO** at the 130B-token scale in the paper (Table 1 / Figure 11). Not midtrained.

1B-active / 14B-total parameter Mixture-of-Experts model (128 experts: 127 routed + 1 shared, k=8 active per token) pretrained on 130B tokens of the OLMoE pretraining mix with the EMO document-level expert pool constraint. Used in the paper's memory-matched ablation suite.

## Usage

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "allenai/Emo_1b14b_130B"
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


## License

This model is licensed under Apache 2.0. It is intended for research and educational use in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use)


## Links

- Paper: https://arxiv.org/abs/2605.06663
- Code: https://github.com/allenai/EMO