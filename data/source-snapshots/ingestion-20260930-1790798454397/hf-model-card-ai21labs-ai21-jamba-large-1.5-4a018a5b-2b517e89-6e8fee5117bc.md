---
license: other
license_name: jamba-open-model-license
license_link: https://huggingface.co/ai21labs/AI21-Jamba-Large-1.5/blob/main/LICENSE.txt
new_version: ai21labs/AI21-Jamba-Large-1.7
language:
- en
- fr
- de
- nl
- es
- pt
- it
- ar
- he
pipeline_tag: text-generation
tags:
- mamba
- jamba
- moe
---
# Model Information

Please note that this version will be deprecated on **May 6, 2024**.
We encourage you to transition to the new version, which can be found [here](https://huggingface.co/ai21labs/AI21-Jamba-Large-1.6).

The AI21 Jamba 1.5 family of models is state-of-the-art, hybrid SSM-Transformer instruction following foundation models. The Jamba models are the most powerful & efficient long-context models on the market, which deliver up to 2.5X faster inference than leading models of comparable sizes.

The models demonstrate superior long context handling, speed, and quality. They mark the first time a non-Transformer model has been successfully scaled to the quality and strength of the market’s leading models. 

[Jamba 1.5 Mini](https://huggingface.co/ai21labs/AI21-Jamba-1.5-Mini) (12B active/52B total) and [Jamba 1.5 Large](https://huggingface.co/ai21labs/AI21-Jamba-1.5-Large) (94B active/398B total) are also optimized for business use cases and capabilities such as function calling, structured output (JSON), and grounded generation.

The models are released under the [Jamba Open Model License](https://www.ai21.com/licenses/jamba-open-model-license), a permissive license allowing full research use and commercial use under the license terms. If you need to license the model for your needs, [talk to us](https://www.ai21.com/talk-to-us). 

For more details of this model, see the white paper and the release [blog post](https://www.ai21.com/blog/announcing-jamba-model-family).

## Model Details

- **Developed by:** [AI21](https://www.ai21.com)
- **Model type:** Joint Attention and Mamba (Jamba)
- **License:** [Jamba Open Model License](https://www.ai21.com/licenses/jamba-open-model-license)
- **Context length:** 256K
- **Knowledge cutoff date:** March 5, 2024
- **Supported languages:** English, Spanish, French, Portuguese, Italian, Dutch, German, Arabic and Hebrew


## Results on common benchmarks
| Benchmark    | Jamba 1.5 Mini | Jamba 1.5 Large |
|--------------|:-----:|:-----:|
| Arena Hard    | 46.1 | 65.4 |
| Wild Bench  | 42.4 | 48.5 |
| MMLU (CoT)       | 69.7 | 81.2 |
| MMLU Pro (CoT)  | 42.5 | 53.5 |
| GPQA      | 32.3 | 36.9 |
| ARC Challenge     | 85.7 | 93 |
| BFCL            | 80.6 | 85.5 |
| GSM-8K            | 75.8 | 87 |
| RealToxicity (lower is better)       | 8.1 | 6.7 |
| TruthfulQA     | 54.1 | 58.3 |

### RULER Benchmark - Effective context length

|Models|Claimed Length|Effective Length|4K|8K|16K|32K|64K|128K|256K|
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
Jamba 1.5 Large (94B/398B)|256K|256K|<ins>96.7</ins>|<ins>96.6</ins>|<ins>96.4</ins>|<ins>96.0</ins>|<ins>95.4</ins>|<ins>95.1</ins>|<ins>93.9</ins>|
Jamba 1.5 Mini (12B/52B)|256K|256K|<ins>95.7</ins>|<ins>95.2</ins>|<ins>94.7</ins>|<ins>93.8</ins>|<ins>92.7</ins>|<ins>89.8</ins>|<ins>86.1</ins> |
Gemini 1.5 Pro|1M|>128K|<ins>96.7</ins>|<ins>95.8</ins>|<ins>96.0</ins>|<ins>95.9</ins>|<ins>95.9</ins>|<ins>94.4</ins>| -- |
GPT-4 1106-preview |128K|64K|<ins>96.6</ins>|<ins>96.3</ins>|<ins>95.2</ins>|<ins>93.2</ins>|<ins>87.0</ins>|81.2| -- |
Llama 3.1 70B|128K|64K|<ins>96.5</ins>|<ins>95.8</ins>|<ins>95.4</ins>|<ins>94.8</ins>|<ins>88.4</ins>|66.6| -- |
Command R-plus (104B)|128K|32K|<ins>95.6</ins>|<ins>95.2</ins>|<ins>94.2</ins>|<ins>92.0</ins>|84.3|63.1| -- |
Llama 3.1 8B|128K|32K|<ins>95.5</ins>|<ins>93.8</ins>|<ins>91.6</ins>|<ins>87.4</ins>|84.7|77.0| -- |
Mistral Large 2 (123B)|128K|32K|<ins>96.2</ins>|<ins>96.1</ins>|<ins>95.1</ins>|<ins>93.0</ins>|78.8|23.7| -- |
Mixtral 8x22B (39B/141B)|64K|32K|<ins>95.6</ins>|<ins>94.9</ins>|<ins>93.4</ins>|<ins>90.9</ins>|84.7|31.7| -- |
Mixtral 8x7B (12.9B/46.7B)|32K|32K|<ins>94.9</ins>|<ins>92.1</ins>|<ins>92.5</ins>|<ins>85.9</ins>|72.4|44.5| -- |

### Multilingual MMLU

| Language    | Jamba 1.5 Large | Jamba 1.5 Mini |
|:-------------:|:-----------------:|:----------------|
| **French**  | 75.8            | 65.9           |
| **Spanish** | 75.5            | 66.3           |
| **Portuguese** | 75.5         | 66.7           |
| **Italian** | 75.2            | 65.1           |
| **Dutch**   | 74.6            | 65.0           |
| **German**  | 73.9            | 63.8           |
| **Arabic**  | 67.1            | 57.3           |


## Usage
### Prerequisites

In order to run optimized Mamba implementations, you first need to install `mamba-ssm` and `causal-conv1d`:
```bash
pip install mamba-ssm causal-conv1d>=1.2.0
```
You also have to have the model on a CUDA device.


### Run the model with vLLM

The recommended way to perform efficient inference with Jamba 1.5 Large is using [vLLM](https://docs.vllm.ai/en/latest/). First, make sure to install vLLM (version 0.5.5 or higher is required)
```bash
pip install vllm>=0.5.5
```

Jamba 1.5 Large is too large to be loaded in full (FP32) or half (FP16/BF16) precision on a single node of 8 80GB GPUs. Therefore, quantization is required. We've developed an innovative and efficient quantization technique, [ExpertsInt8](https://www.ai21.com/blog/announcing-jamba-model-family#:~:text=Like%20all%20models%20in%20its%20size%20class%2C%20Jamba%201.5%20Large%20can%E2%80%99t%20be%20loaded%20in%20full%20(FP32)%20or%20half%20(FP16/BF16)%20precision%20on%20a%20single%20node%20of%208%20GPUs.%20Dissatisfied%20with%20currently%20available%20quantization%20techniques%2C%20we%20developed%20ExpertsInt8%2C%20a%20novel%20quantization%20technique%20tailored%20for%20MoE%20models.), designed for MoE models deployed in vLLM, including Jamba models. Using it, you'll be able to deploy Jamba 1.5 Large on a single node of 8 80GB GPUs. 

With ExpertsInt8 quantization and the default vLLM configuration, you'll be able to perform inference on prompts up to 220K tokens long on 8 80GB GPUs:
```python
from vllm import LLM, SamplingParams
from transformers import AutoTokenizer

model = "ai21labs/AI21-Jamba-1.5-Large"

llm = LLM(model=model,
          tensor_parallel_size=8,
          max_model_len=220*1024,
          quantization="experts_int8",
         )

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

The following configuration will allow you to fit the entire 256K context length, at the cost of added latency at high loads:
```python
import os
os.environ['VLLM_FUSED_MOE_CHUNK_SIZE']='32768'

from vllm import LLM

llm = LLM(model="ai21labs/AI21-Jamba-1.5-Large",
          tensor_parallel_size=8,
          gpu_memory_utilization=1,
          num_gpu_blocks_override=17384,
          quantization="experts_int8",
          max_num_seqs=128)
```


### Run the model with `transformers`
To load Jamba 1.5 Large in `transformers` on a single node of 8 80GB GPUs, we recommend to quantize it to 8-bit using [bitsandbytes](https://huggingface.co/docs/bitsandbytes/index) (excluding the mamba blocks to avoid quality degradation), and to parallelize it using [accelerate](https://huggingface.co/docs/accelerate/index):

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from transformers import AutoModelForCausalLM, BitsAndBytesConfig
quantization_config = BitsAndBytesConfig(load_in_8bit=True,
                                         llm_int8_skip_modules=["mamba"])

# a device map to distribute the model evenly across 8 GPUs
device_map = {'model.embed_tokens': 0, 'model.layers.0': 0, 'model.layers.1': 0, 'model.layers.2': 0, 'model.layers.3': 0, 'model.layers.4': 0, 'model.layers.5': 0, 'model.layers.6': 0, 'model.layers.7': 0, 'model.layers.8': 0, 'model.layers.9': 1, 'model.layers.10': 1, 'model.layers.11': 1, 'model.layers.12': 1, 'model.layers.13': 1, 'model.layers.14': 1, 'model.layers.15': 1, 'model.layers.16': 1, 'model.layers.17': 1, 'model.layers.18': 2, 'model.layers.19': 2, 'model.layers.20': 2, 'model.layers.21': 2, 'model.layers.22': 2, 'model.layers.23': 2, 'model.layers.24': 2, 'model.layers.25': 2, 'model.layers.26': 2, 'model.layers.27': 3, 'model.layers.28': 3, 'model.layers.29': 3, 'model.layers.30': 3, 'model.layers.31': 3, 'model.layers.32': 3, 'model.layers.33': 3, 'model.layers.34': 3, 'model.layers.35': 3, 'model.layers.36': 4, 'model.layers.37': 4, 'model.layers.38': 4, 'model.layers.39': 4, 'model.layers.40': 4, 'model.layers.41': 4, 'model.layers.42': 4, 'model.layers.43': 4, 'model.layers.44': 4, 'model.layers.45': 5, 'model.layers.46': 5, 'model.layers.47': 5, 'model.layers.48': 5, 'model.layers.49': 5, 'model.layers.50': 5, 'model.layers.51': 5, 'model.layers.52': 5, 'model.layers.53': 5, 'model.layers.54': 6, 'model.layers.55': 6, 'model.layers.56': 6, 'model.layers.57': 6, 'model.layers.58': 6, 'model.layers.59': 6, 'model.layers.60': 6, 'model.layers.61': 6, 'model.layers.62': 6, 'model.layers.63': 7, 'model.layers.64': 7, 'model.layers.65': 7, 'model.layers.66': 7, 'model.layers.67': 7, 'model.layers.68': 7, 'model.layers.69': 7, 'model.layers.70': 7, 'model.layers.71': 7, 'model.final_layernorm': 7, 'lm_head': 7}
model = AutoModelForCausalLM.from_pretrained("ai21labs/AI21-Jamba-1.5-Large",
                                             torch_dtype=torch.bfloat16,
                                             attn_implementation="flash_attention_2",
                                             quantization_config=quantization_config,
                                             device_map=device_map)

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Large")

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

<u>Note:</u> Versions 4.44.0 and 4.44.1 of `transformers` have a bug that restricts the ability to run the Jamba architecture. Make sure you're not using these versions.

<u>Note:</u> If you're having trouble installing `mamba-ssm` and `causal-conv1d` for the optimized Mamba kernels, you can run Jamba 1.5 Large without them, at the cost of extra latency. In order to do that, add the kwarg `use_mamba_kernels=False` when loading the model via `AutoModelForCausalLM.from_pretained()`.


<details><summary><strong>Load the model on CPU</strong></summary>

If you don't have access to a GPU, you can also load and run Jamba 1.5 Large on a CPU. Note this will result in poor inference performance.

```python
from transformers import AutoModelForCausalLM
model = AutoModelForCausalLM.from_pretrained("ai21labs/AI21-Jamba-1.5-Large",
                                             use_mamba_kernels=False)
```

</details>

# Model features

## Tool use with Jamba
Jamba 1.5 supports tool use capabilities in accordance with Huggingface's tool use API. The tools defined by the user are inserted into a dedicated section in the chat template which the model was trained to recognize. 

Given a conversation that contains tools, the model can output content, tool invocations or both. Tool invocations are formatted within the assistant message as a list of json-formatted dictionaries, wrapped in dedicated special token as can be seen in the example below.

<details><summary><strong>Tool usage example</strong></summary>

  
```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Large")

messages = [
    {
        "role": "user", 
        "content": "What's the weather like right now in Jerusalem and in London?"
    }
]

tools = [
    {
        'type': 'function', 
        'function': {
            'name': 'get_current_weather', 
            'description': 'Get the current weather', 
            'parameters': {
                'type': 'object', 
                'properties': {
                    'location': {'type': 'string', 'description': 'The city and state, e.g. San Francisco, CA'}, 
                    'format': {'type': 'string', 'enum': ['celsius', 'fahrenheit'], 'description': 'The temperature unit to use. Infer this from the users location.'}
                }, 
                'required': ['location', 'format']
            }
        }
    }
]

prompt = tokenizer.apply_chat_template(
    messages,
    tools=tools,
    tokenize=False,
)
```
Output:
```
<tool_calls>[
    {"name": "get_current_weather", "arguments": {"location": "Jerusalem", "format": "celsius"}},
    {"name": "get_current_weather", "arguments": {"location": "celsius", "format": "celsius"}}
]</tool_calls>
```

</details>


<details><summary><strong>Feeding back tool responses into the model</strong></summary>

Now that the model has called the tools, we need to feed the tool responses back to the model. In the next call, send the assistant message with the `tool_messages` field, as shown below, along with additional `tool` messages (in the corresponding order) that contain the tool outputs.

The `arguments` field for each tool call can be either a dict or a JSON string.

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Large")

# Note that you must send the tool responses in the same order as the model called the tools:
messages = [
    {
        "role": "user",
        "content": "What's the weather like right now in Jerusalem and in London?"
    },
    {
        "role": "assistant",
        "content": null,
        "tool_calls": [
            {
                "name": "get_current_weather",
                "arguments": "{\"location\": \"Jerusalem\", \"format\": \"celsius\"}"
            },
            {
                "name": "get_current_weather",
                "arguments": "{\"location\": \"London\", \"format\": \"celsius\"}"
            }
        ]
    },
    {
        "role": "tool",
        "content": "The weather in Jerusalem is 18 degrees celsius."
    },
    {
        "role": "tool",
        "content": "The weather in London is 8 degrees celsius."
    }
]

tool_use_prompt = tokenizer.apply_chat_template(
    messages,
    tools=tools,
    tokenize=False,
)
```
example output:
```
The weather in Jerusalem is currently 18 degrees Celsius. In London, it is 8 degrees Celsius.
```

</details>

## Grounded Generation with Jamba:

A common use-case for LLMs is grounded generation and RAG, where the model is required to answer a question or follow an instruction based on a given set of documents or document snippets. To standardize this process, Jamba was trained with a specific "documents" section in its chat template. The model was trained to attend to this section, and grounded generation tasks show improved performance when the task is formatted in this way.

Similar to tools, which are given as an external argument to the model in addition to the conversation, documents are provided in a similar way. To support document-level metadata, a document is defined as a dictionary with key-values of your choosing. These are formatted within the chat template. Two keys that get special treatment are "title", which is formatted at the top of the document if present, and "text" which is a required field and defines the actual text of the document.

<details><summary><strong>Ataching documents to Jamba 1.5 prompt</strong></summary>

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Large")

messages = [
        {
            "role": "user",
            "content": "Who wrote Harry Potter?"
        }
]

documents = [
        {
            "text": "Harry Potter is a series of seven fantasy novels written by British author J. K. Rowling.",
            "title": "Harry Potter"
        },
        {
            "text": "The Great Gatsby is a novel by American writer F. Scott Fitzgerald.",
            "title": "The Great Gatsby",
            "country": "United States",
            "genre": "Novel"

        }
]

prompt = tokenizer.apply_chat_template(
    messages,
    documents=documents,
    tokenize=False,
)

# Output: J. K. Rowling

```

</details>

## JSON mode
Jamba 1.5 was trained with specific “knobs”, which help steer the model towards commonly requested behaviors. Each behavior is enabled by including specific pre-defined text in the system message. For ease of use, we've included them as flags in Jamba 1.5's chat template, so they can be toggled by passing appropriate arguments to the chat template.

Jamba 1.5 was trained to produce valid JSONs when requested to. It does so naturally, but when the JSON mode knob is activated the likelihood of a valid json increases considerably. In JSON mode, Jamba 1.5 will attempt to output a valid JSON regardless of the user request. However, it is highly recommended to specify information about the expected json schema in the user request or system message to get the best results, as shown in the example below.

<details><summary><strong>Usage of JSON knob in Jamba 1.5</strong></summary>

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Large")
messages = [
    {'role':'user', 
     'content':'Describe the first American president. Include year of birth (number) and name (string).'}
    ]
prompt = tokenizer.apply_chat_template(messages,
                                       tokenize=False,
                                       add_generation_prompt=False,
                                       knobs={"response_format": "json_object", "is_set": True})

#Output: "{ "year of birth": 1732, "name": "George Washington." }"
```

</details>

### Fine-tuning with qLoRA+FSDP on a single node
This section will focus on fine-tuning Jamba 1.5 Large with a single 8xA100/H100 (80GB GPUs) node using HF framework + [axolotl](https://github.com/axolotl-ai-cloud/axolotl) and [FSDP](https://huggingface.co/docs/accelerate/en/usage_guides/fsdp).

We’ll use a modified version of `transformers` because the latest version overuses CPU RAM memory when running with FSDP. Specifically, the model is entirely loaded in to CPU for each rank instead of just for rank0. This leads to a massive amount of CPU RAM usage - over 1.6TB instead of the required 200GB for Jamba 1.5 Large. Special thanks to [Wing Lian](https://huggingface.co/winglian) and the `axolotl` team for their contribution!

Make sure to install latest version of `axolotl` (≥ Aug 21 2024) or use the [docker image](https://hub.docker.com/r/winglian/axolotl/tags) supplied by them:

```bash
git clone https://github.com/axolotl-ai-cloud/axolotl
cd axolotl
pip3 install packaging ninja
pip3 install -e '.[flash-attn,deepspeed]'

pip install bitsandbytes~=0.43.3
pip install trl
pip install peft~=0.12.0
pip install accelerate~=0.33.0
pip install mamba-ssm causal-conv1d>=1.2.0
pip install git+https://github.com/xgal/transformers@897f80665c37c531b7803f92655dbc9b3a593fe7
```

Due to its size, in order to run the training on a single 8 GPU node, Jamba 1.5 Large has to be quantized. This can happen either at the start of the training job, or in a pre-process step. If you want to pre-quantize the model, you can do that easily using bitsandbytes (make sure to use `bnb_4bit_quant_storage=torch.bfloat16` so you can use FSDP):

```python
from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
import torch
model_name = "ai21labs/AI21-Jamba-1.5-Large"
quantization_config = BitsAndBytesConfig(load_in_4bit=True,
                                         bnb_4bit_compute_dtype=torch.bfloat16,
                                         bnb_4bit_use_double_quant=True,
                                         bnb_4bit_quant_type= "nf4",
                                         bnb_4bit_quant_storage=torch.bfloat16,
                                         )

quantized_model = AutoModelForCausalLM.from_pretrained(
	model_name, device_map="auto", torch_dtype=torch.bfloat16, quantization_config=quantization_config)
	
tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.save_pretrained('AI21-Jamba-1.5-Large-BNB-nf4-bf16')
quantized_model.save_pretrained('AI21-Jamba-1.5-Large-BNB-nf4-bf16')
```

Now for training Jamba 1.5 Large 🎊

Run the training process by using the [example](https://github.com/axolotl-ai-cloud/axolotl/blob/main/examples/jamba/qlora_fsdp_large.yaml) (change the `base_model` to the pre-quantized model or to `ai21labs/AI21-Jamba-1.5-Large`)

```bash
accelerate launch -m axolotl.cli.train examples/jamba/qlora_fsdp.yaml
```

Enjoy 🙃


# About AI21

AI21 builds reliable, practical, and scalable AI solutions for the enterprise. The Jamba models are available in the [AI21 Studio](https://www.ai21.com/studio) and in leading cloud partners.
To learn more about how Jamba 1.5 Mini and Jamba 1.5 Large can bring real world value to your organization, let’s talk.