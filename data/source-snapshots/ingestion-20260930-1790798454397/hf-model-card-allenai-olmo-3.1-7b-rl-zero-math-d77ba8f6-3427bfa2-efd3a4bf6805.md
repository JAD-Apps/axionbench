---
license: apache-2.0
base_model:
- allenai/Olmo-3-1025-7B
language:
- en
datasets:
- allenai/Dolci-RL-Zero-Math-7B
library_name: transformers
---

## Model Details
<img alt="Logo for Olmo 3 7B Zero model" src="olmo-rl-zero.png" width="268px" style="margin-left:'auto' margin-right:'auto' display:'block'">


# Model Card for Olmo 3.1 7B RL-Zero Math

We introduce Olmo 3, a new family of 7B and 32B models both Instruct and Think variants. Long chain-of-thought thinking improves reasoning tasks like math and coding.

Olmo is a series of **O**pen **l**anguage **mo**dels designed to enable the science of language models. 
These models are pre-trained on the Dolma 3 dataset and post-trained on the Dolci datasets. We are releasing all code, checkpoints, logs (coming soon), and associated training details. 

The RL-Zero family of models is an experimental set of model for the scientific exploration of RLVR training.

For the other Olmo 3 RL-Zero models see:

| **Domain**               | **Model**  | **RLVR Dataset**
|--------------------------|---------------|---------------|
| **Base Model**           | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) | 
| **Math**                 | [Olmo-3-7B-RL-Zero-Math](https://huggingface.co/allenai/Olmo-3-7B-RL-Zero-Math/), [Olmo-3.1-7B-RL-Zero-Math](https://huggingface.co/allenai/Olmo-3-7B-RL-Zero-Math/) | [Dolci-RL-Zero-Math-7B](https://huggingface.co/datasets/allenai/Dolci-RL-Zero-Math-7B)
| **Code**                 | [Olmo-3-7B-RL-Zero-Code](https://huggingface.co/allenai/Olmo-3-7B-RL-Zero-Code/), [Olmo-3.1-7B-RL-Zero-Code](https://huggingface.co/allenai/Olmo-3-7B-RL-Zero-Code/) | [Dolci-RL-Zero-Code-7B](https://huggingface.co/datasets/allenai/Dolci-RL-Zero-Code-7B)
| **IF**                   | [Olmo-3-7B-RL-Zero-IF](https://huggingface.co/allenai/Olmo-3-7B-RL-Zero-IF/) | [Dolci-RL-Zero-IF-7B](https://huggingface.co/datasets/allenai/Dolci-RL-Zero-IF-7B)
| **General**              | [Olmo-3-7B-RL-Zero-General](https://huggingface.co/allenai/Olmo-3-7B-RL-Zero-General/) | [Dolci-RL-Zero-General-7B](https://huggingface.co/datasets/allenai/Dolci-RL-Zero-General-7B)     
| **Mix**                  | [Olmo-3-7B-RL-Zero-Mix](https://huggingface.co/allenai/Olmo-3-7B-RL-Zero-Mix/) | [Dolci-RL-Zero-Mix-7B](https://huggingface.co/datasets/allenai/Dolci-RL-Zero-Mix-7B)      

For the core Olmo 3 models see:

| **Stage**               | **Olmo 3 7B Think** | **Olmo (3/3.1) 32B Think** | **Olmo 3 7B Instruct** | **Olmo 3.1 32B Instruct** |
|--------------------------|-----------------------|------------------------|---------------------------|----------------------------|
| **Base Model**           | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) | [Olmo-3-32B](https://huggingface.co/allenai/Olmo-3-1125-32B) | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) | [Olmo-3-32B](https://huggingface.co/allenai/Olmo-3-1125-32B) |
| **SFT**                  | [Olmo-3-7B-Think-SFT](https://huggingface.co/allenai/Olmo-3-7B-Think-SFT) | [Olmo-3-32B-Think-SFT](https://huggingface.co/allenai/Olmo-3-32B-Think-SFT) | [Olmo-3-7B-Instruct-SFT](https://huggingface.co/allenai/Olmo-3-7B-Instruct-SFT) | [Olmo-3.1-32B-Instruct-SFT](https://huggingface.co/allenai/Olmo-3.1-32B-Instruct-SFT) |
| **DPO**                  | [Olmo-3-7B-Think-DPO](https://huggingface.co/allenai/Olmo-3-7B-Think-DPO) | [Olmo-3-32B-Think-DPO](https://huggingface.co/allenai/Olmo-3-32B-Think-DPO) | [Olmo-3-7B-Instruct-DPO](https://huggingface.co/allenai/Olmo-3-7B-Instruct-DPO) | [Olmo-3.1-32B-Instruct-DPO](https://huggingface.co/allenai/Olmo-3.1-32B-Instruct-DPO) |
| **Final Models (RLVR)**  | [Olmo-3-7B-Think](https://huggingface.co/allenai/Olmo-3-7B-Think) | [Olmo-3-32B-Think](https://huggingface.co/allenai/Olmo-3-32B-Think)<br>[Olmo-3.1-32B-Think](https://huggingface.co/allenai/Olmo-3.1-32B-Think) | [Olmo-3-7B-Instruct](https://huggingface.co/allenai/Olmo-3-7B-Instruct) | [Olmo-3.1-32B-Instruct](https://huggingface.co/allenai/Olmo-3.1-32B-Instruct) |
             

## Installation

Olmo 3 is supported in transformers 4.57.0 or higher:
```bash
pip install transformers>=4.57.0
```

## Inference

You can use OLMo with the standard HuggingFace transformers library:
```python
from transformers import AutoModelForCausalLM, AutoTokenizer
olmo = AutoModelForCausalLM.from_pretrained("allenai/Olmo-3.1-7B-RL-Zero-Math")
tokenizer = AutoTokenizer.from_pretrained("allenai/Olmo-3.1-7B-RL-Zero-Math")
message = ["Language modeling is "]
inputs = tokenizer(message, return_tensors='pt', return_token_type_ids=False)
# optional verifying cuda
# inputs = {k: v.to('cuda') for k,v in inputs.items()}
# olmo = olmo.to('cuda')
response = olmo.generate(**inputs, max_new_tokens=100, do_sample=True, top_k=50, top_p=0.95)
print(tokenizer.batch_decode(response, skip_special_tokens=True)[0])
>> 'Language modeling is  a key component of any text-based application, but its effectiveness...'
```

For faster performance, you can quantize the model using the following method:
```python
AutoModelForCausalLM.from_pretrained("allenai/Olmo-3.1-7B-RL-Zero-Math", 
    torch_dtype=torch.float16, 
    load_in_8bit=True)  # Requires bitsandbytes
```
The quantized model is more sensitive to data types and CUDA operations. To avoid potential issues, it's recommended to pass the inputs directly to CUDA using:
```python
inputs.input_ids.to('cuda')
```

### Fine-tuning
Model fine-tuning can be done from the final checkpoint (the `main` revision of this model) or the base model. 

We recommend fine-tuning with the open-instruct repository:
```bash
bash ./scripts/train/olmo3/rlvr_script.sh
```
You can override most configuration options from the command-line. For example, to override the learning rate you could launch the script like this:

```bash
bash ./scripts/train/olmo3/rlvr_script.sh --learning_rate=1e-3
```
For more documentation, see the [GitHub readme](https://github.com/allenai/open-instruct).

### Model Description

- **Developed by:** Allen Institute for AI (Ai2)
- **Model type:** a Transformer style autoregressive language model.
- **Language(s) (NLP):** English
- **License:** This model is licensed under Apache 2.0. It is intended for research and educational use in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use).
- **Contact:** Technical inquiries: `olmo@allenai.org`. Press: `press@allenai.org`
- **Date cutoff:** Dec. 2023.


### Model Sources

- **Project Page:** https://allenai.org/olmo
- **Repositories:**
    - Open-Instruct for DPO and RLVR: https://github.com/allenai/open-instruct
    - OLMo-Core for pre-training and SFT: https://github.com/allenai/OLMo-core
    - OLMo-Eval for evaluation: https://github.com/allenai/OLMo-Eval
- **Paper:** [TBD]
<!-- - **Technical blog post:** (URL)  -->
<!-- - **W&B Logs:** [SFT](()), [DPO](()), [RLVR](()) -->

## Model Details

#### RLVR
- reinforcement learning from verifiable rewards on the Dolci-RL-Zero-Code-7B dataset which consists of coding queries.
- Datasets: [Dolci-RL-Zero-Code-7B](https://huggingface.co/datasets/allenai/Dolci-RL-Zero-Code-7B)


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