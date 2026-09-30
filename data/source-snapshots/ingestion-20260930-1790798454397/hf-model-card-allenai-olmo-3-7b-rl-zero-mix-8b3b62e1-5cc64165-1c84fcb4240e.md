---
license: apache-2.0
datasets:
- allenai/Dolci-RLZero-Mix-7B
base_model:
- allenai/Olmo-3-1025-7B
language:
- en
library_name: transformers
---

## Model Details
<img alt="Logo for Olmo 3 7B Zero model" src="olmo-rl-zero.png" width="268px" style="margin-left:'auto' margin-right:'auto' display:'block'">


# Model Card for Olmo 3 7B RL-Zero Mix

We introduce Olmo 3, a new family of 7B and 32B models both Instruct and Think variants. Long chain-of-thought thinking improves reasoning tasks like math and coding.

Olmo is a series of **O**pen **l**anguage **mo**dels designed to enable the science of language models. 
These models are pre-trained on the Dolma 3 dataset and post-trained on the Dolci datasets. We are releasing all code, checkpoints, logs (coming soon), and associated training details. 

The RL-Zero family of models is an experimental set of model for the scientific exploration of RLVR training.

For the other Olmo 3 RL-Zero models see:

| **Domain**               | **Model**  | **RLVR Dataset**
|--------------------------|---------------|---------------|
| **Base Model**           | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) | 
| **Math**                 | [Olmo-3-7B-RLZero-Math](https://huggingface.co/allenai/Olmo-3-7B-RLZero-Math/) | [Dolci-RLZero-Math-7B](https://huggingface.co/datasets/allenai/Dolci-RLZero-Math-7B)
| **Code**                 | [Olmo-3-7B-RLZero-Code](https://huggingface.co/allenai/Olmo-3-7B-RLZero-Code/) | [Dolci-RLZero-Code-7B](https://huggingface.co/datasets/allenai/Dolci-RLZero-Code-7B)
| **IF**                   | [Olmo-3-7B-RLZero-IF](https://huggingface.co/allenai/Olmo-3-7B-RLZero-IF/) | [Dolci-RLZero-IF-7B](https://huggingface.co/datasets/allenai/Dolci-RLZero-IF-7B)
| **General**              | [Olmo-3-7B-RLZero-General](https://huggingface.co/allenai/Olmo-3-7B-RLZero-General/) | [Dolci-RLZero-General-7B](https://huggingface.co/datasets/allenai/Dolci-RLZero-General-7B)     
| **Mix**                  | [Olmo-3-7B-RLZero-Mix](https://huggingface.co/allenai/Olmo-3-7B-RL-Zero-Mix/) | [Dolci-RLZero-Mix-7B](https://huggingface.co/datasets/allenai/Dolci-RL-Zero-Mix-7B)         

For the core Olmo 3 models see:

| **Stage**               | **[Olmo 3 7B Think]** | **[Olmo 3 32B Think]** | **[Olmo 3 7B Instruct]** | **[Olmo 3 32B Instruct]** |
|--------------------------|---------------|---------------|---------------|---------------|
| **Base Model**           | [Olmo-3-7B](https://huggingface.co/allenai/Olmo-3-1025-7B) | [Olmo-3-32B](https://huggingface.co/allenai/Olmo-3-1125-32B) | | |
| **SFT**                  | [Olmo-3-7B-Think-SFT](https://huggingface.co/allenai/Olmo-3-7B-Think-SFT) | [Olmo-3-32B-Think-SFT](https://huggingface.co/allenai/Olmo-3-32B-Think-SFT) | [Olmo-3-7B-Instruct-SFT](https://huggingface.co/allenai/Olmo-3-7B-Instruct-SFT) | [Olmo-3-32B-Instruct-SFT](https://huggingface.co/allenai/Olmo-3-32B-Instruct-SFT) |
| **DPO**                  | [Olmo-3-7B-Think-DPO](https://huggingface.co/allenai/Olmo-3-7B-Think-DPO) | [Olmo-3-32B-Think-DPO](https://huggingface.co/allenai/Olmo-3-32B-Think-DPO) | [Olmo-3-7B-Instruct-DPO](https://huggingface.co/allenai/Olmo-3-7B-Instruct-DPO) | [Olmo-3-32B-Instruct-DPO](https://huggingface.co/allenai/Olmo-3-32B-Instruct-DPO) |
| **Final Models (RLVR)**  | [Olmo-3-7B-Think](https://huggingface.co/allenai/Olmo-3-7B-Think) | [Olmo-3-32B-Think](https://huggingface.co/allenai/Olmo-3-32B-Think) | [Olmo-3-7B-Instruct](https://huggingface.co/allenai/Olmo-3-7B-Instruct) | [Olmo-3-32B-Instruct](https://huggingface.co/allenai/Olmo-3-32B-Instruct) |               
             

## Installation

Olmo 3 is supported in transformers 4.57.0 or higher:
```bash
pip install transformers>=4.57.0
```

## Inference

You can use OLMo with the standard HuggingFace transformers library:
```python
from transformers import AutoModelForCausalLM, AutoTokenizer
olmo = AutoModelForCausalLM.from_pretrained("allenai/Olmo-3-RLZero-Mix-7B")
tokenizer = AutoTokenizer.from_pretrained("allenai/Olmo-3-RLZero-Mix-7B")
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
AutoModelForCausalLM.from_pretrained("allenai/Olmo-3-RLZero-Mix-7B", 
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
- reinforcement learning from verifiable rewards on the Dolci-RL-Zero-Mix-7B dataset which consists of a mix of math, code, and IF data.
- Datasets: [Dolci-RLZero-Mix-7B](https://huggingface.co/datasets/allenai/Dolci-RLZero-Mix-7B)


## Bias, Risks, and Limitations
Like any base language model or fine-tuned model without safety filtering, these models can easily be prompted by users to generate harmful and sensitive content. Such content may also be produced unintentionally, especially in cases involving bias, so we recommend that users consider the risks when applying this technology. Additionally, many statements from OLMo or any LLM are often inaccurate, so facts should be verified.


## Citation
A technical manuscript is forthcoming!

## Model Card Contact
For errors in this model card, contact `olmo@allenai.org`.