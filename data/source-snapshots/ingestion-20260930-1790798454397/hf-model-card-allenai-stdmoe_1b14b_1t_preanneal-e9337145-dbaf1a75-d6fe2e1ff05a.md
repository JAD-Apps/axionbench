---
license: apache-2.0
language:
- en
library_name: transformers
pipeline_tag: text-generation
tags:
- moe
- mixture-of-experts
- baseline
- pre-annealing
datasets:
- allenai/OLMoE-mix-0924
---

# StdMoE_1b14b_1T_Preanneal

The pre-annealing checkpoint of the standard MoE baseline, released alongside [EMO: Pretraining Mixture of Experts for Emergent Modularity](https://arxiv.org/abs/2605.06663). It is the **starting point for the EMO-anneal experiment** in Appendix B.4 of the paper, in which a fully-pretrained standard MoE is annealed under the EMO objective to test whether modularity can be induced after pretraining.

1B-active / 14B-total parameter Mixture-of-Experts model (128 experts: 127 routed + 1 shared, k=8 active per token) pretrained on 1T tokens of the OLMoE pretraining mix with the standard MoE objective. No annealing applied.

## Usage

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "allenai/StdMoE_1b14b_1T_Preanneal"
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