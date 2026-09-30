---
license: apache-2.0
base_model: allenai/Olmo-3-1025-7B
language:
- en
library_name: transformers
datasets:
- allenai/bolmo_mix
---


# Bolmo 7B

We introduce **Bolmo**, the first family of competitive fully open byte-level language models (LMs) at the 1B and 7B parameter scales.

These models are *byteified* using a short additional training procedure which starts from pretrained models in the Olmo series.

We are releasing all code, checkpoints, and associated training details.

See our technical report for details: https://allenai.org/papers/bolmo.


| **Name**               | **Model**                         | **Starting Point**                |
|------------------------|-----------------------------------|-----------------------------------|
| **Bolmo 1B**            | [Bolmo-1B](https://huggingface.co/allenai/Bolmo-1B) | [OLMo-2-1B](https://huggingface.co/allenai/OLMo-2-0425-1B) |
| **Bolmo 7B** (you are here)          | [Bolmo-7B](https://huggingface.co/allenai/Bolmo-7B) | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) |


## Installation

Bolmo was tested with transformers 4.57.3 and Python 3.11:
```bash
pip install transformers>=4.57.3
```

Bolmo additionally requires the [xlstm package](https://github.com/NX-AI/xlstm) (which needs Python>=3.11):

```bash
pip install xlstm==2.0.4
```

## Inference

You can use Bolmo with the standard HuggingFace transformers library:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

device = "cuda"
bolmo = AutoModelForCausalLM.from_pretrained("allenai/Bolmo-7B", trust_remote_code=True).to(device)
tokenizer = AutoTokenizer.from_pretrained("allenai/Bolmo-7B", trust_remote_code=True)

message = ["Language modeling is "]
input_ids = tokenizer(message, return_tensors="pt")["input_ids"].to(device)

# `max_new_tokens` is the amount of bytes to generate
response = bolmo.generate(input_ids, max_new_tokens=256, do_sample=True, temperature=0.1)
print(tokenizer.decode(response[0], skip_special_tokens=True))
```

### Model Description

- **Developed by:** Allen Institute for AI (Ai2)
- **Model type:** a byte-level autoregressive language model.
- **Language(s) (NLP):** English
- **License:** This model is licensed under Apache 2.0. It is intended for research and educational use in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use).
- **Contact:** Press: `press@allenai.org`
- **Date cutoff:** Dec. 2024.

### Model Sources

- **Data:** https://huggingface.co/datasets/allenai/bolmo_mix
- **Code:** https://github.com/allenai/bolmo-core
- **Paper:** https://allenai.org/papers/bolmo


## Bias, Risks, and Limitations
Like any base language model or fine-tuned model without safety filtering, these models can easily be prompted by users to generate harmful and sensitive content. Such content may also be produced unintentionally, especially in cases involving bias, so we recommend that users consider the risks when applying this technology. Additionally, many statements from Bolmo or any LLM are often inaccurate, so facts should be verified.


## Citation

```bibtex
@misc{bolmo,
      title={Bolmo: Byteifying the Next Generation of Language Models}, 
      author={Benjamin Minixhofer and Tyler Murray and Tomasz Limisiewicz and Anna Korhonen and Luke Zettlemoyer and Noah A. Smith and Edoardo M. Ponti and Luca Soldaini and Valentin Hofmann},
      year={2025},
      eprint={2512.15586},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2512.15586}, 
}
```