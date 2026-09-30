---
license: apache-2.0
datasets:
- allenai/Dolci-Instruct-SFT-Tool-Use-SA
- allenai/Dolci-Instruct-SFT
language:
- en
base_model:
- allenai/Olmo-Hybrid-7B
library_name: transformers
---
## Model Details


# Model Card for Olmo Hybrid Instruct SFT

We expand on our Olmo model series by introducing Olmo Hybrid, a new 7B hybrid RNN model in the Olmo family. Olmo Hybrid dramatically outperforms Olmo 3 in final performance, consistently showing roughly 2x data
efficiency on core evals over the course of our pretraining run. We also show gains in performance on long-context benchmarks, as well as improved inference efficiency
(throughput and memory) on long-context lengths by a factor of 75%.

The core models released in this batch include the following:

| **Stage**               | **Olmo 3 7B Think** | **Olmo 3 32B Think** | **Olmo 3 7B Instruct** | **Olmo Hybrid Think 7B** | **Olmo Hybrid Instruct 7B** |
|--------------------------|-----------------------|------------------------|---------------------------|-------------------------------|----------------------------------|
| **Base Model**           | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) | [Olmo-3-32B](https://huggingface.co/allenai/Olmo-3-1125-32B) | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) | [Olmo-Hybrid-7B](https://huggingface.co/allenai/Olmo-Hybrid-7B) | [Olmo-Hybrid-7B](https://huggingface.co/allenai/Olmo-Hybrid-7B) |
| **SFT**                  | [Olmo-3-7B-Think-SFT](https://huggingface.co/allenai/Olmo-3-7B-Think-SFT) | [Olmo-3-32B-Think-SFT](https://huggingface.co/allenai/Olmo-3-32B-Think-SFT) | [Olmo-3-7B-Instruct-SFT](https://huggingface.co/allenai/Olmo-3-7B-Instruct-SFT) | [Olmo-Hybrid-Think-SFT-7B](https://huggingface.co/allenai/Olmo-Hybrid-Think-SFT-7B) | [Olmo-Hybrid-Instruct-SFT-7B](https://huggingface.co/allenai/Olmo-Hybrid-Instruct-SFT-7B) |
| **DPO**                  | [Olmo-3-7B-Think-DPO](https://huggingface.co/allenai/Olmo-3-7B-Think-DPO) | [Olmo-3-32B-Think-DPO](https://huggingface.co/allenai/Olmo-3-32B-Think-DPO) | [Olmo-3-7B-Instruct-DPO](https://huggingface.co/allenai/Olmo-3-7B-Instruct-DPO) | -- | [Olmo-Hybrid-Instruct-DPO-7B](https://huggingface.co/allenai/Olmo-Hybrid-Instruct-DPO-7B) |
| **Final Models (RLVR)**  | [Olmo-3-7B-Think](https://huggingface.co/allenai/Olmo-3-7B-Think) | [Olmo-3-32B-Think](https://huggingface.co/allenai/Olmo-3-32B-Think) | [Olmo-3-7B-Instruct](https://huggingface.co/allenai/Olmo-3-7B-Instruct) | -- | -- |


Olmo is a series of **O**pen **l**anguage **mo**dels designed to enable the science of language models. 
These models are pre-trained on the Dolma 3 dataset and post-trained on the Dolci datasets. We are releasing all code, checkpoints, logs (coming soon), and associated training details. 
            

## Installation

Olmo Hybrid is supported in transformers 5.3.0 or higher:
```bash
pip install transformers>=5.3.0
```

## Inference

You can use OLMo with the standard HuggingFace transformers library:
```python
from transformers import AutoModelForCausalLM, AutoTokenizer
olmo = AutoModelForCausalLM.from_pretrained("allenai/Olmo-Hybrid-Instruct-SFT-7B")
tokenizer = AutoTokenizer.from_pretrained("allenai/Olmo-Hybrid-Instruct-SFT-7B")
message = ["Who would win in a fight - a dinosaur or a cow named Moo Moo?"]
inputs = tokenizer(message, return_tensors='pt', return_token_type_ids=False)
# optional verifying cuda
# inputs = {k: v.to('cuda') for k,v in inputs.items()}
# olmo = olmo.to('cuda')
response = olmo.generate(**inputs, max_new_tokens=100, do_sample=True, top_k=50, top_p=0.95)
print(tokenizer.batch_decode(response, skip_special_tokens=True)[0])
>> '<think>Okay, so the question is who would win in a fight...'
```

For faster performance, you can quantize the model using the following method:
```python
AutoModelForCausalLM.from_pretrained("allenai/Olmo-Hybrid-Instruct-SFT-7B", 
    torch_dtype=torch.float16, 
    load_in_8bit=True)  # Requires bitsandbytes
```
The quantized model is more sensitive to data types and CUDA operations. To avoid potential issues, it's recommended to pass the inputs directly to CUDA using:
```python
inputs.input_ids.to('cuda')
```

We have released checkpoints for these models. For post-training, the naming convention is `step_XXXX`. 


To load a specific model revision with HuggingFace, simply add the argument `revision`:
```bash
olmo = AutoModelForCausalLM.from_pretrained("allenai/Olmo-Hybrid-Instruct-SFT-7B", revision="step3000")
```

Or, you can access all the revisions for the models via the following code snippet:
```python
from huggingface_hub import list_repo_refs
out = list_repo_refs("allenai/Olmo-Hybrid-Instruct-SFT-7B")
branches = [b.name for b in out.branches]
```

### Chat template

## Default System Message
The default system prompt for this model is:
```
<|im_start|>system
You are a helpful function-calling AI assistant. 
You do not currently have access to any functions. <functions></functions><|im_end|>
```

## Chat Format

The chat template for this model is formatted as:
```
<|im_start|>system
You are a helpful function-calling AI assistant. 
You do not currently have access to any functions. <functions></functions><|im_end|>
<|im_start|>user
Who would win in a fight - a dinosaur or a cow named Moo Moo?<|im_end|>
<|im_start|>assistant
This is a fun and imaginative question! Let’s break it down...
Moo Moo the cow would certinaly win.
<|endoftext|>
```

### Model Description

- **Developed by:** Allen Institute for AI (Ai2)
- **Model type:** a Transformer style autoregressive language model.
- **Language(s) (NLP):** English
- **License:** This model is licensed under Apache 2.0. It is intended for research and educational use in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use).
- **Contact:** Technical inquiries: `olmo@allenai.org`. Press: `press@allenai.org`
- **Date cutoff:** Dec. 2024.


### Model Sources

- **Project Page:** https://allenai.org/olmo
- **Repositories:**
    - Open-Instruct for DPO and RLVR: https://github.com/allenai/open-instruct
    - OLMo-Core for pre-training and SFT: https://github.com/allenai/OLMo-core
    - OLMo-Eval for evaluation: https://github.com/allenai/OLMo-Eval
- **Olmo 3 Paper:** https://allenai.org/papers/olmo3
- **Olmo Hybrid Paper:** https://allenai.org/papers/olmo-hybrid

## Evaluation

| Skill | Benchmark | **Olmo Hybrid Instruct SFT 7B** | **Olmo Hybrid Instruct DPO 7B** | Olmo 3 Instruct 7B SFT | Olmo 3 Instruct 7B DPO | Olmo3 Instruct 7B | Qwen 3 8B (no reasoning) | Qwen 3 VL 8B Instruct | Qwen 2.5 7B | Olmo 2 7B Instruct | Apertus 8B Instruct | Granite 3.3 8B Instruct |
|-------|-----------|--------------------------------|--------------------------------|------------------------|------------------------|-------------------|--------------------------|------------------------|-------------|-------------------|---------------------|------------------------|
| Math | MATH | 66.7 | 72.9 | 65.1 | 79.6 | 87.3 | 82.3 | 91.6 | 71.0 | 30.1 | 21.9 | 67.3 |
|  | AIME 2024 | 6.7 | 10.1 | 6.7 | 23.5 | 44.3 | 26.2 | 55.1 | 11.3 | 1.3 | 0.5 | 7.3 |
|  | AIME 2025 | 8.8 | 10.2 | 7.2 | 20.4 | 32.5 | 21.7 | 43.3 | 6.3 | 0.4 | 0.2 | 6.3 |
|  | OMEGA | 16.0 | 19.5 | 14.4 | 22.8 | 28.9 | 20.5 | 32.3 | 13.7 | 5.2 | 5.0 | 10.7 |
| Reasoning | BigBenchHard | 47.3 | 57.3 | 51.0 | 69.3 | 71.2 | 73.7 | 85.6 | 68.8 | 43.8 | 42.2 | 61.2 |
|  | ZebraLogic | 17.0 | 29.1 | 18.0 | 28.4 | 32.9 | 25.4 | 64.3 | 10.7 | 5.3 | 5.3 | 17.6 |
|  | AGI Eval English | | | 59.2 | 64.0 | 64.4 | 76.0 | 84.5 | 69.8 | 56.1 | 50.8 | 64.0 |
| Coding | HumanEvalPlus | 69.2 | 75.1 | 69.8 | 72.9 | 77.2 | 79.8 | 82.9 | 74.9 | 25.8 | 34.4 | 64.0 |
|  | MBPP+ | 55.3 | 56.9 | 56.5 | 55.9 | 60.2 | 64.4 | 66.3 | 62.6 | 40.7 | 42.1 | 54.0 |
|  | LiveCodeBench v3 | 21.3 | 22.0 | 20.0 | 18.8 | 29.5 | 53.2 | 55.9 | 34.5 | 7.2 | 7.8 | 11.5 |
| IF | IFEval | 81.5 | 80.5 | 81.7 | 82.0 | 85.6 | 86.3 | 87.8 | 73.4 | 72.2 | 71.4 | 77.5 |
|  | IFBench | 29.0 | 33.3 | 27.4 | 29.3 | 32.3 | 29.3 | 34.0 | 28.4 | 26.7 | 22.1 | 22.3 |
| Knowledge | MMLU | 71.9 | 73.6 | 67.1 | 69.1 | 69.1 | 80.4 | 83.6 | 77.2 | 61.6 | 62.7 | 63.5 |
| QA | PopQA | 16.8 | 21.0 | 16.5 | 20.7 | 14.1 | 20.4 | 26.5 | 21.5 | 25.5 | 25.5 | 28.9 |
|  | GPQA | 36.8 | 38.0 | 30.0 | 37.9 | 40.4 | 44.6 | 51.1 | 35.6 | 31.3 | 28.8 | 33.0 |
| Chat | AlpacaEval 2 LC | 25.6 | 56.3 | 21.8 | 43.3 | 40.9 | 49.8 | 73.5 | 23.0 | 18.3 | 8.1 | 28.6 |
| Tool Use | SimpleQA | | | 74.2 | 79.8 | 79.3 | 79.0 | 90.3 | 78.0 | – | – | – |
|  | LitQA2 | | | 38.0 | 43.3 | 38.2 | 39.6 | 30.7 | 29.8 | – | – | – |
|  | BFCL | | | 48.9 | 49.6 | 49.8 | 60.2 | 66.2 | 55.8 | – | – | – |
| Safety | Safety | | | 89.2 | 90.2 | 87.3 | 78.0 | 80.2 | 73.4 | 93.1 | 72.2 | 73.7 |

## Model Details

#### Stage 1: SFT
- supervised fine-tuning on the Dolci-Instruct-SFT-7B dataset. This dataset consits of math, code, chat, and general knowledge queries.
- Datasets: [Dolci-Instruct-SFT-7B](https://huggingface.co/datasets/allenai/dolci-instruct-sft)

#### Stage 2:DPO
- direct preference optimization on the Dolci-Instruct-DPO-7B dataset. This dataset consits of math, code, chat, and general knowledge queries.
- Datasets: [Dolci-Instruct-DPO-7B](https://huggingface.co/datasets/allenai/dolci-3-instruct-dpo-with-metadata)

## Inference & Recommended Settings
We evaluated our models on the following settings. We also recommend using them for generation:
- **temperature:** `0.6`
- **top_p:** `0.95`
- **max_tokens:** `32768`

### transformers Example
```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "allenai/Olmo-Hybrid-Instruct-SFT-7B"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    device_map="auto",
)

prompt = "Who would win in a fight - a dinosaur or a cow named MooMoo?"
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

outputs = model.generate(
    **inputs,
    temperature=0.6,
    top_p=0.95,
    max_new_tokens=32768,
)

print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

### vllm Example
```python
from vllm import LLM, SamplingParams

model_id = "allenai/Olmo-Hybrid-Instruct-SFT-7B"
llm = LLM(
    model=model_id,
    mamba_ssm_cache_dtype="float32",
)

sampling_params = SamplingParams(
    temperature=0.6,
    top_p=0.95,
    max_tokens=32768,
)

prompt = "Who would win in a fight - a dinosaur or a cow named MooMoo?"
outputs = llm.generate(prompt, sampling_params)
print(outputs[0].outputs[0].text)
```

## Bias, Risks, and Limitations
Like any base language model or fine-tuned model without safety filtering, these models can easily be prompted by users to generate harmful and sensitive content. Such content may also be produced unintentionally, especially in cases involving bias, so we recommend that users consider the risks when applying this technology. Additionally, many statements from OLMo or any LLM are often inaccurate, so facts should be verified.

## License
This model is licensed under Apache 2.0. It is intended for research and educational use in accordance with [Ai2's Responsible Use Guidelines](https://allenai.org/responsible-use).



## Citation
Coming Soon!

## Model Card Contact
For errors in this model card, contact `olmo@allenai.org`.