---
license: other
license_name: jamba-open-model-license
license_link: https://huggingface.co/ai21labs/AI21-Jamba-Mini-1.7-FP8/blob/main/LICENSE.txt
---
## Model Information

Jamba Mini 1.7-FP8 offers new improvements to our Jamba open model family. This new version builds on the novel SSM-Transformer hybrid architecture, 256K context window, and efficiency gains of previous versions, while introducing improvements in grounding, instruction-following, and speed.  

## Key improvements:

* **Grounding**: Jamba Mini 1.7-FP8 provides more complete and accurate answers, grounded fully in the given context. 
* **Instruction following**: Jamba Mini 1.7-FP8 improves on steerability.
* **Speed**: Jamba Mini 1.7-FP8 is faster due to FP8 quantizations. 

## Use cases
Jamba’s long context efficiency, contextual faithfulness, and steerability make it ideal for a variety of business applications and industries, such as:


* **Finance**: Investment research, digital banking support chatbot, M&A due diligence.
* **Healthcare**: Procurement (RFP creation & response review), medical publication and reports generation.
* **Retail**: Brand-aligned product description generation, conversational AI. 
* **Education & Research**: Personalized chatbot tutor, grants applications. 

The models are released under the [Jamba Open Model License](https://www.ai21.com/jamba-open-model-license/), a permissive license allowing full research use and commercial use under the license terms.
If you need to license the model for your needs, [talk to us](https://www.ai21.com/contact-sales/).

## Model Details
Developed by: AI21
Model type: Joint Attention and Mamba (Jamba)
Model size: 12B active/52B parameters 
License: Jamba Open Model License
Context length: 256K
Knowledge cutoff date: August 22, 2024
Supported languages: English, Spanish, French, Portuguese, Italian, Dutch, German, Arabic and Hebrew

## Grounding and instruction-following improvements
  | Category    | Benchmark  | Jamba Mini 1.6  | Jamba Mini 1.7 |
|---------------|:----------:|:---------------:|:--------------:|
| Grounding    | FACTS       | 0.727           | 0.790          | 
| Steerability | IFEcal      | 0.68            | 0.76           |

## FP8 Quantization
Jamba Mini 1.7-FP8 weights are available in this pre-quantized FP8 format, which is optimal for NVIDIA Hopper architecture machines. As a result:

* The initial GPU memory footprint is lower on inference launch.
* FP8 model weights require almost 50% less disk space.
## Usage

Find step-by-step instructions on how to privately deploy Jamba:

<details>
<summary><strong>Run the model with vLLM</strong></summary>

The recommended way to perform efficient inference with Jamba Mini 1.7-FP8 is using [vLLM](https://docs.vllm.ai/en/latest/). First, make sure to install vLLM (version 0.6.5 or higher is required):

```bash
pip install vllm>=0.6.5
```

In the example below, number_gpus should match the number of GPUs you want to deploy Jamba Mini 1.7-FP8 on. A minimum of 2 80GB GPUs is required.

```python
from vllm import LLM, SamplingParams
from transformers import AutoTokenizer

model = "ai21labs/AI21-Jamba-1.7-Mini"
number_gpus = 2

llm = LLM(model=model,
          max_model_len=200*1024,
          tensor_parallel_size=number_gpus)

tokenizer = AutoTokenizer.from_pretrained(model)

messages = [
    {"role": "system", "content": "You are an ancient oracle who speaks in cryptic but wise phrases, always hinting at deeper meanings."},
    {"role": "user", "content": "Hello!"},
]

prompts = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)

sampling_params = SamplingParams(temperature=0.4, top_p=0.95, max_tokens=100)
outputs = llm.generate(prompts, sampling_params)

generated_text = outputs[0].outputs[0].text
print(generated_text)
```

**Output**:  
*Seek and you shall find. The path is winding, but the journey is enlightening. What wisdom do you seek from the ancient echoes?*

With the default BF16 precision on 2×80GB A100 GPUs and default vLLM configuration, you'll be able to perform inference on prompts up to 200K tokens long. On more than 2×80GB GPUs, you can easily fit the full 256K context.

> Note: vLLM's main branch has some memory utilization improvements specific to the Jamba architecture that allow using the full 256K context length on 2 80 GPUs. You can build [vLLM from source](https://docs.vllm.ai/en/latest/getting_started/installation/gpu.html#build-from-source) if you wish to make use of them.
You can also find all instructions in our [private AI (vLLM) deployment guide](https://docs.ai21.com/docs/vllm). 

</details>

<details>
<summary><strong>Run the model with Transformers</strong></summary>

The following example loads Jamba Mini 1.7-FP8, uses optimized [FlashAttention2](https://github.com/Dao-AILab/flash-attention) and Mamba kernels, and parallelizes the model across multiple GPUs using [`accelerate`](https://huggingface.co/docs/accelerate/index).

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


model = AutoModelForCausalLM.from_pretrained("ai21labs/AI21-Jamba-Mini-1.7-FP8",
                                             attn_implementation="flash_attention_2",
                                             device_map="auto")


tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-Mini-1.7-FP8")


messages = [
   {"role": "system", "content": "You are an ancient oracle who speaks in cryptic but wise phrases, always hinting at deeper meanings."},
   {"role": "user", "content": "Hello!"},
]


input_ids = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors='pt').to(model.device)


outputs = model.generate(input_ids, max_new_tokens=216)


# Decode the output
conversation = tokenizer.decode(outputs[0], skip_special_tokens=True)


# Split the conversation to get only the assistant's response
assistant_response = conversation.split(messages[-1]['content'])[1].strip()
print(assistant_response)
# Output: Seek and you shall find. The path is winding, but the journey is enlightening. What wisdom do you seek from the ancient echoes?
```

> **Note:** Versions `4.44.0` and `4.44.1` of `transformers` have a bug that restricts the ability to run the Jamba architecture. Make sure you're not using these versions.

> **Note:** If you're having trouble installing `mamba-ssm` and `causal-conv1d` for the optimized Mamba kernels, you can run Jamba Mini 1.7-FP8 without them, at the cost of extra latency. To do that, add the kwarg `use_mamba_kernels=False` when loading the model via AutoModelForCausalLM.from_pretained()

</details>

And to get started with our SDK:
[AI21 Python SDK guide](https://docs.ai21.com/docs/sdk)

## Further documentation
For more comprehensive guides and advanced usage:
* [Tokenization guide](https://docs.ai21.com/docs/tokenization) - Using ai21-tokenizer
* [Quantization guide](https://docs.ai21.com/docs/quantization) - ExpertsInt8, bitsandbytes
* [Fine-tuning guide](https://docs.ai21.com/docs/fine-tuning) - LoRA, qLoRA, and full fine-tuning
* [Function-calling guide](https://docs.ai21.com/docs/function-calling)  

For more resources to start building, [visit our official documentation](https://docs.ai21.com/home). 



