---
license: apache-2.0
base_model: allenai/Olmo-3-32B-Think-DPO
language:
- en
datasets:
- allenai/Dolci-Think-RL
library_name: transformers
new_version: allenai/Olmo-3.1-32B-Think
---

# Model Details
<img alt="Logo for Olmo 3 32B Think model" src="olmo-think.png" width="240px" style="margin-left:'auto' margin-right:'auto' display:'block'">


# Model Card for Olmo 3 32B Think

We introduce Olmo 3, a new family of 7B and 32B models both Instruct and Think variants. Long chain-of-thought thinking improves reasoning tasks like math and coding.

Olmo is a series of **O**pen **l**anguage **mo**dels designed to enable the science of language models. 
These models are pre-trained on the Dolma 3 dataset and post-trained on the Dolci datasets. We are releasing all code, checkpoints, logs (coming soon), and associated training details. 



The core models released in this batch include the following:

| **Stage**               | **Olmo 3 7B Think** | **Olmo 3 32B Think** | **Olmo 3 7B Instruct** |
|--------------------------|-----------------------|------------------------|---------------------------|
| **Base Model**           | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) | [Olmo-3-32B](https://huggingface.co/allenai/Olmo-3-1125-32B) | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) |
| **SFT**                  | [Olmo-3-7B-Think-SFT](https://huggingface.co/allenai/Olmo-3-7B-Think-SFT) | [Olmo-3-32B-Think-SFT](https://huggingface.co/allenai/Olmo-3-32B-Think-SFT) | [Olmo-3-7B-Instruct-SFT](https://huggingface.co/allenai/Olmo-3-7B-Instruct-SFT) |
| **DPO**                  | [Olmo-3-7B-Think-DPO](https://huggingface.co/allenai/Olmo-3-7B-Think-DPO) | [Olmo-3-32B-Think-DPO](https://huggingface.co/allenai/Olmo-3-32B-Think-DPO) | [Olmo-3-7B-Instruct-DPO](https://huggingface.co/allenai/Olmo-3-7B-Instruct-DPO) |
| **Final Models (RLVR)**  | [Olmo-3-7B-Think](https://huggingface.co/allenai/Olmo-3-7B-Think) | [Olmo-3-32B-Think](https://huggingface.co/allenai/Olmo-3-32B-Think) | [Olmo-3-7B-Instruct](https://huggingface.co/allenai/Olmo-3-7B-Instruct) |           
             

## Installation

Olmo 3 is supported in transformers 4.57.0 or higher:
```bash
pip install transformers>=4.57.0
```

## Inference

You can use OLMo with the standard HuggingFace transformers library:
```python
from transformers import AutoModelForCausalLM, AutoTokenizer
olmo = AutoModelForCausalLM.from_pretrained("allenai/Olmo-3-32B-Think")
tokenizer = AutoTokenizer.from_pretrained("allenai/Olmo-3-32B-Think")
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
AutoModelForCausalLM.from_pretrained("allenai/Olmo-3-32B-Think", 
    torch_dtype=torch.float16, 
    load_in_8bit=True)  # Requires bitsandbytes
```
The quantized model is more sensitive to data types and CUDA operations. To avoid potential issues, it's recommended to pass the inputs directly to CUDA using:
```python
inputs.input_ids.to('cuda')
```

We have released checkpoints for these models. For post-training, the naming convention is `step_XXX`. 


To load a specific model revision with HuggingFace, simply add the argument `revision`:
```bash
olmo = AutoModelForCausalLM.from_pretrained("allenai/Olmo-3-32B-Think", revision="step_300")
```

Or, you can access all the revisions for the models via the following code snippet:
```python
from huggingface_hub import list_repo_refs
out = list_repo_refs("allenai/Olmo-3-32B-Think")
branches = [b.name for b in out.branches]
```

## Chat template

## Default System Message
The default system prompt for this model is:
```
<|im_start|>system
You are a helpful AI assistant.<|im_end|>
```

## Chat Format

The chat template for this model is formatted as:
```
<|im_start|>system
You are a helpful AI assistant.<|im_end|>
<|im_start|>user
Who would win in a fight - a dinosaur or a cow named Moo Moo?<|im_end|>
<|im_start|>assistant
<think>Okay, so the question is who would win in a fight between a dinosaur and a cow named Moo Moo.
Hmm, first I need to break this down. Let me think about the different factors involved here..... </think>
Moo Moo the cow would certinaly win.<|im_end|>
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
- **Paper:** [TBD]
<!-- - **Technical blog post:** (URL)  -->
<!-- - **W&B Logs:** [SFT](()), [DPO](()), [RLVR](()) -->


## Evaluation

| Benchmark | Olmo 3 Think 32B SFT | Olmo 3 Think 32B DPO | Olmo 3 Think 32B | Qwen 3 32B | Qwen 3 VL 32B Thinking | Qwen 2.5 32B | Gemma 3 27B Instruct | Gemma 2 27B Instruct | Olmo 2 32B Instruct | DeepSeek-R1-Distill-Qwen-32B |
|-----------|-----------------------|-----------------------|-------------------|-------------|-------------------------|---------------|------------------------|------------------------|---------------------------|---------------------------------|
| **Math** | | | | | | | | | | |
| MATH | 95.6 | 95.9 | 96.1 | 95.4 | 96.7 | 80.2 | 87.4 | 51.5 | 49.2 | 92.6 |
| AIME 2024 | 73.5 | 76.0 | 76.8 | 80.8 | 86.3 | 15.7 | 28.9 | 4.7 | 4.6 | 70.3 |
| AIME 2025 | 66.2 | 70.7 | 72.5 | 70.9 | 78.8 | 13.4 | 22.9 | 0.9 | 0.9 | 56.3 |
| OMEGA | 43.1 | 45.2 | 50.8 | 47.7 | 50.8 | 19.2 | 24.0 | 9.1 | 9.8 | 38.9 |
| **Reasoning** | | | | | | | | | | |
| BigBenchHard | 88.8 | 89.1 | 89.8 | 90.6 | 91.1 | 80.9 | 82.4 | 66.0 | 65.6 | 89.7 |
| ZebraLogic | 70.5 | 74.5 | 76.0 | 88.3 | 96.1 | 24.1 | 24.8 | 17.2 | 13.3 | 69.4 |
| AGI Eval English | 85.9 | 87.8 | 88.2 | 90.0 | 92.2 | 78.9 | 76.9 | 70.9 | 68.4 | 88.1 |
| **Coding** | | | | | | | | | | |
| HumanEvalPlus | 90.0 | 91.6 | 91.4 | 91.2 | 90.6 | 82.6 | 79.2 | 67.5 | 44.4 | 92.3 |
| MBPP+ | 66.7 | 67.2 | 68.0 | 70.6 | 66.2 | 66.6 | 65.7 | 61.2 | 49.0 | 70.1 |
| LiveCodeBench v3 | 75.8 | 81.9 | 83.5 | 90.2 | 84.8 | 49.9 | 39.0 | 28.7 | 10.6 | 79.5 |
| **IF** | | | | | | | | | | |
| IFEval | 83.9 | 80.6 | 89.0 | 86.5 | 85.5 | 81.9 | 85.4 | 62.1 | 85.8 | 78.7 |
| IFBench | 37.0 | 34.4 | 47.6 | 37.3 | 55.1 | 36.7 | 31.3 | 27.8 | 36.4 | 23.8 |
| **Knowledge & QA** | | | | | | | | | | |
| MMLU | 85.3 | 85.2 | 85.4 | 88.8 | 90.1 | 84.6 | 74.6 | 76.1 | 77.1 | 88.0 |
| PopQA | 33.1 | 37.0 | 31.9 | 30.7 | 32.2 | 28.0 | 30.2 | 30.4 | 37.2 | 26.7 |
| GPQA | 55.7 | 57.6 | 58.1 | 67.3 | 67.4 | 44.6 | 45.0 | 39.9 | 36.4 | 61.8 |
| **Chat** | | | | | | | | | | |
| AlpacaEval 2 LC | 69.1 | 78.6 | 74.2 | 75.6 | 80.9 | 81.9 | 65.5 | 39.8 | 38.0 | 26.2 |
| **Safety** | 64.8 | 65.3 | 68.8 | 69.0 | 82.7 | 81.9 | 68.6 | 74.3 | 83.8 | 63.6 |

## Model Details

#### Stage 1: SFT
- supervised fine-tuning on the Dolci-Think-SFT-7B dataset. This dataset consits of math, code, chat, and general knowledge queries.
- Datasets: [Dolci-Think-SFT-7B](https://huggingface.co/datasets/allenai/dolci-thinking-sft), [Dolci-Instruct-SFT-7B](https://huggingface.co/datasets/allenai/dolci-instruct-sft)

#### Stage 2:DPO
- direct preference optimization on the Dolci-Think-DPO-7B dataset. This dataset consits of math, code, chat, and general knowledge queries.
- Datasets: [Dolci-Think-DPO-7B](https://huggingface.co/datasets/allenai/dolci-thinking-dpo), [Dolci-Instruct-DPO-7B](https://huggingface.co/datasets/allenai/dolci-3-instruct-dpo-with-metadata)

#### Stage 3: RLVR
- reinforcement learning from verifiable rewards on the Dolci-Think-RL-7B dataset. This dataset consits of math, code, instruction-following, and general chat queries.
- Datasets: [Dolci-Think-RL-7B](https://huggingface.co/datasets/allenai/Dolci-Think-RL-7B), [Dolci-Instruct-RL-7B](https://huggingface.co/datasets/allenai/Dolci-Instruct-RL-7B)

## Inference & Recommended Settings
We evaluated our models on the following settings. We also recommend using them for generation:
- **temperature:** `0.6`
- **top_p:** `0.95`
- **max_tokens:** `32768`

### transformers Example
```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "allenai/Olmo-3-32B-Think"
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

model_id = "allenai/Olmo-3-32B-Think"
llm = LLM(model=model_id)

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


## Citation

```
@misc{olmo2025olmo3,
title={Olmo 3},
author={Team Olmo and Allyson Ettinger and Amanda Bertsch and Bailey Kuehl and David Graham and David Heineman and Dirk Groeneveld and Faeze Brahman and Finbarr Timbers and Hamish Ivison and Jacob Morrison and Jake Poznanski and Kyle Lo and Luca Soldaini and Matt Jordan and Mayee Chen and Michael Noukhovitch and Nathan Lambert and Pete Walsh and Pradeep Dasigi and Robert Berry and Saumya Malik and Saurabh Shah and Scott Geng and Shane Arora and Shashank Gupta and Taira Anderson and Teng Xiao and Tyler Murray and Tyler Romero and Victoria Graf and Akari Asai and Akshita Bhagia and Alexander Wettig and Alisa Liu and Aman Rangapur and Chloe Anastasiades and Costa Huang and Dustin Schwenk and Harsh Trivedi and Ian Magnusson and Jaron Lochner and Jiacheng Liu and Lester James V. Miranda and Maarten Sap and Malia Morgan and Michael Schmitz and Michal Guerquin and Michael Wilson and Regan Huff and Ronan Le Bras and Rui Xin and Rulin Shao and Sam Skjonsberg and Shannon Zejiang Shen and Shuyue Stella Li and Tucker Wilde and Valentina Pyatkin and Will Merrill and Yapei Chang and Yuling Gu and Zhiyuan Zeng and Ashish Sabharwal and Luke Zettlemoyer and Pang Wei Koh and Ali Farhadi and Noah A. Smith and Hannaneh Hajishirzi},
year={2025},
eprint={2512.13961},
archivePrefix={arXiv},
primaryClass={cs.CL},
url={https://arxiv.org/abs/2512.13961},
}
```

## Model Card Contact
For errors in this model card, contact `olmo@allenai.org`.