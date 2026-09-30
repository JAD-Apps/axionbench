---
license: other
license_name: jamba-open-model-license
license_link: https://huggingface.co/ai21labs/AI21-Jamba-Mini-1.5/blob/main/LICENSE.txt
new_version: ai21labs/AI21-Jamba-Mini-1.7
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
library_name: transformers
---
# Model Information

Please note that this version will be deprecated on **May 6, 2024**.
We encourage you to transition to the new version, which can be found [here](https://huggingface.co/ai21labs/AI21-Jamba-Mini-1.6).

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



# Usage
## Prerequisites

In order to run optimized Mamba implementations, you first need to install `mamba-ssm` and `causal-conv1d`:
```bash
pip install mamba-ssm causal-conv1d>=1.2.0
```
You also have to have the model on a CUDA device.


## Run the model with vLLM

The recommended way to perform efficient inference with Jamba 1.5 Mini is using [vLLM](https://docs.vllm.ai/en/latest/). First, make sure to install vLLM (version 0.5.4 or higher is required)
```bash
pip install vllm>=0.5.4
```

In the example below, `number_gpus` should match the number of GPUs you want to deploy Jamba 1.5 Mini on. A minimum of 2 80GB GPUs is required.

```python
from vllm import LLM, SamplingParams
from transformers import AutoTokenizer

model = "ai21labs/AI21-Jamba-1.5-Mini"
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
#Output: Seek and you shall find. The path is winding, but the journey is enlightening. What wisdom do you seek from the ancient echoes?
```

With the default BF16 precision on 2 80GB A100 GPUs and default vLLM configuration, you'll be able to perform inference on prompts up to 200K tokens long. On more than 2 80GB GPUs, you can easily fit the full 256K context.

<u>Note:</u> vLLM's `main` branch has some memory utilization improvements specific to the Jamba architecture that allow using the full 256K context length on 2 80 GPUs. You can [build vLLM from source](https://docs.vllm.ai/en/latest/getting_started/installation.html#build-from-source) if you wish to make use of them.

### ExpertsInt8 quantization
We've developed an innovative and efficient quantization technique, [ExpertsInt8](https://www.ai21.com/blog/announcing-jamba-model-family#:~:text=Like%20all%20models%20in%20its%20size%20class%2C%20Jamba%201.5%20Large%20can%E2%80%99t%20be%20loaded%20in%20full%20(FP32)%20or%20half%20(FP16/BF16)%20precision%20on%20a%20single%20node%20of%208%20GPUs.%20Dissatisfied%20with%20currently%20available%20quantization%20techniques%2C%20we%20developed%20ExpertsInt8%2C%20a%20novel%20quantization%20technique%20tailored%20for%20MoE%20models.), designed for MoE models deployed in vLLM, including Jamba models. Using it, you'll be able to deploy Jamba 1.5 Mini on a single 80GB GPU.

In order to use ExpertsInt8, you need to use vllm version 0.5.5 or higher: `pip install vllm>=0.5.5`

With default vLLM configuration, you can fit prompts up to 100K on a single 80GB A100 GPU:
```python
import os
os.environ['VLLM_FUSED_MOE_CHUNK_SIZE']='32768'    # This is a workaround a bug in vLLM's fused_moe kernel

from vllm import LLM
llm = LLM(model="ai21labs/AI21-Jamba-1.5-Mini",
          max_model_len=100*1024,
          quantization="experts_int8")
```


## Run the model with `transformers`

The following example loads Jamba 1.5 Mini to the GPU in BF16 precision, uses optimized [FlashAttention2](https://github.com/Dao-AILab/flash-attention) and Mamba kernels, and parallelizes the model across multiple GPUs using [accelerate](https://huggingface.co/docs/accelerate/index). Note that in half precision (FP16/BF16), Jamba 1.5 Mini is too large to fit on a single 80GB GPU, so you'll need at least 2 such GPUs.

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini",
                                             torch_dtype=torch.bfloat16,
                                             attn_implementation="flash_attention_2",
                                             device_map="auto")

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini")

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

<u>Note:</u> If you're having trouble installing `mamba-ssm` and `causal-conv1d` for the optimized Mamba kernels, you can run Jamba 1.5 Mini without them, at the cost of extra latency. In order to do that, add the kwarg `use_mamba_kernels=False` when loading the model via `AutoModelForCausalLM.from_pretained()`.

<details><summary><strong>Load the model in 8-bit</strong></summary>

  **Using 8-bit precision, it is possible to fit up to 140K sequence length on a single 80GB GPU.** You can easily quantize the model to 8-bit using [bitsandbytes](https://huggingface.co/docs/bitsandbytes/index). In order to not degrade model quality, we recommend to exclude the Mamba blocks from the quantization:

```python
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
quantization_config = BitsAndBytesConfig(load_in_8bit=True,
                                         llm_int8_skip_modules=["mamba"])
model = AutoModelForCausalLM.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini",
                                             torch_dtype=torch.bfloat16,
                                             attn_implementation="flash_attention_2",
                                             quantization_config=quantization_config)
```

</details>

<details><summary><strong>Load the model on CPU</strong></summary>

If you don't have access to a GPU, you can also load and run Jamba 1.5 Mini on a CPU. Note this will result in poor inference performance.

```python
from transformers import AutoModelForCausalLM
model = AutoModelForCausalLM.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini",
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

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini")

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

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini")

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

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini")

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

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini")
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

# Fine-tuning examples

The examples below use the `SFTTrainer` from [huggingface/trl](https://github.com/huggingface/trl), so ensure it's installed:
```bash
pip install trl
```

## Full Fine-tuning example
To train a full finetune using AWS multi nodes and FSDP configuration, follow the instructions here [hf-finetune-sagemaker](https://github.com/AI21Labs/hf-finetune-sagemaker)

## LoRA example

Here is an example of fine-tuning with LoRA PEFT, in bfloat16 (requires ~130GB GPU RAM, so e.g. 2xA100 80GB):

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig
from peft import LoraConfig

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini")
model = AutoModelForCausalLM.from_pretrained(
    "ai21labs/AI21-Jamba-1.5-Mini",
    device_map="auto",
    torch_dtype=torch.bfloat16,
    attn_implementation="flash_attention_2",
)

lora_config = LoraConfig(
    r=8,
    target_modules=[
        "embed_tokens",
        "x_proj", "in_proj", "out_proj", # mamba
        "gate_proj", "up_proj", "down_proj", # mlp
        "q_proj", "k_proj", "v_proj", "o_proj", # attention
    ],
    task_type="CAUSAL_LM",
    bias="none",
)

dataset = load_dataset("philschmid/dolly-15k-oai-style", split="train")
training_args = SFTConfig(
    output_dir="/dev/shm/results",
    logging_dir="./logs",
    num_train_epochs=2,
    per_device_train_batch_size=4,
    learning_rate=1e-5,
    logging_steps=10,
    gradient_checkpointing=True,
    max_seq_length=4096,
    save_steps=100,
)
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    args=training_args,
    peft_config=lora_config,
    train_dataset=dataset,
)
trainer.train()
```

Note that the dataset in the example uses conversational format (with `messages` column), so `SFTTrainer` automatically applies Jamba's chat-template as explained in [TRL docs](https://huggingface.co/docs/trl/main/en/sft_trainer#dataset-format-support).

## QLoRA example

To fit fine-tuning on a single 80GB GPU, you can levarage [QLoRA](https://arxiv.org/abs/2305.14314) which combines LoRA with the frozen model quantized to 4-bit:

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig
from peft import LoraConfig

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-1.5-Mini")
quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)
model = AutoModelForCausalLM.from_pretrained(
    "ai21labs/AI21-Jamba-1.5-Mini",
    device_map="auto",
    quantization_config=quantization_config,
    torch_dtype=torch.bfloat16,
    attn_implementation="flash_attention_2",
)
lora_config = LoraConfig(
    r=8,
    target_modules=[
        "embed_tokens", "x_proj", "in_proj", "out_proj", # mamba
        "gate_proj", "up_proj", "down_proj",  # mlp
        "q_proj", "k_proj", "v_proj", "o_proj", # attention
    ],
    task_type="CAUSAL_LM",
    bias="none",
)

dataset = load_dataset("philschmid/dolly-15k-oai-style", split="train")
training_args = SFTConfig(
    output_dir="./results",
    logging_dir="./logs",
    num_train_epochs=2,
    per_device_train_batch_size=8,
    learning_rate=1e-5,
    logging_steps=1,
    gradient_checkpointing=True,
    gradient_checkpointing_kwargs={"use_reentrant": False},
    save_steps=100,
    max_seq_length=4096,
)
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    args=training_args,
    peft_config=lora_config,
    train_dataset=dataset,
)
trainer.train()
```

Note: the above example reqiures the `bitsandbytes` package for the 4-bit quantization:
```bash
pip install bitsandbytes
```

# About AI21

AI21 builds reliable, practical, and scalable AI solutions for the enterprise. The Jamba models are available in the [AI21 Studio](https://www.ai21.com/studio) and in leading cloud partners.
To learn more about how Jamba 1.5 Mini and Jamba 1.5 Large can bring real world value to your organization, let’s talk.