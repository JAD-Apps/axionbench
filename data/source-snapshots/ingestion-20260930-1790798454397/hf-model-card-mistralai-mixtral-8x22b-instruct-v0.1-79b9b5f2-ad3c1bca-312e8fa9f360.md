---
library_name: vllm
language:
- en
- es
- it
- de
- fr
license: apache-2.0
base_model: mistralai/Mixtral-8x22B-v0.1
extra_gated_description: >-
  If you want to learn more about how we process your personal data, please read
  our <a href="https://mistral.ai/terms/">Privacy Policy</a>.
tags:
- mistral-common
---

# Model Card for Mixtral-8x22B-Instruct-v0.1


## Encode and Decode with `mistral_common`
            
```py
from mistral_common.tokens.tokenizers.mistral import MistralTokenizer
from mistral_common.protocol.instruct.messages import UserMessage
from mistral_common.protocol.instruct.request import ChatCompletionRequest
 
mistral_models_path = "MISTRAL_MODELS_PATH"
 
tokenizer = MistralTokenizer.v3()
 
completion_request = ChatCompletionRequest(messages=[UserMessage(content="Explain Machine Learning to me in a nutshell.")])
 
tokens = tokenizer.encode_chat_completion(completion_request).tokens
```
 
## Inference with `mistral_inference`
 
 ```py
from mistral_inference.transformer import Transformer
from mistral_inference.generate import generate
 
model = Transformer.from_folder(mistral_models_path)
out_tokens, _ = generate([tokens], model, max_tokens=64, temperature=0.0, eos_id=tokenizer.instruct_tokenizer.tokenizer.eos_id)

result = tokenizer.decode(out_tokens[0])

print(result)
```

## Preparing inputs with Hugging Face `transformers`

```py
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("mistralai/Mixtral-8x22B-Instruct-v0.1")

chat = [{"role": "user", "content": "Explain Machine Learning to me in a nutshell."}]

tokens = tokenizer.apply_chat_template(chat, return_dict=True, return_tensors="pt", add_generation_prompt=True)
```

## Inference with hugging face `transformers`
 
```py
from transformers import AutoModelForCausalLM
import torch

# You can also use 8-bit or 4-bit quantization here
model = AutoModelForCausalLM.from_pretrained("mistralai/Mixtral-8x22B-Instruct-v0.1", torch_dtype=torch.bfloat16, device_map="auto")
model.to("cuda")
 
generated_ids = model.generate(**tokens, max_new_tokens=1000, do_sample=True)

# decode with HF tokenizer
result = tokenizer.decode(generated_ids[0])
print(result)
```

> [!TIP]
> PRs to correct the `transformers` tokenizer so that it gives 1-to-1 the same results as the `mistral_common` reference implementation are very welcome!
            
---
The Mixtral-8x22B-Instruct-v0.1 Large Language Model (LLM) is an instruct fine-tuned version of the [Mixtral-8x22B-v0.1](https://huggingface.co/mistralai/Mixtral-8x22B-v0.1).

## Function calling example
```python
from transformers import AutoModelForCausalLM
from mistral_common.protocol.instruct.messages import (
    AssistantMessage,
    UserMessage,
)
from mistral_common.protocol.instruct.tool_calls import (
    Tool,
    Function,
)
from mistral_common.tokens.tokenizers.mistral import MistralTokenizer
from mistral_common.tokens.instruct.normalize import ChatCompletionRequest

device = "cuda" # the device to load the model onto

tokenizer_v3 = MistralTokenizer.v3()

mistral_query = ChatCompletionRequest(
    tools=[
        Tool(
            function=Function(
                name="get_current_weather",
                description="Get the current weather",
                parameters={
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "The city and state, e.g. San Francisco, CA",
                        },
                        "format": {
                            "type": "string",
                            "enum": ["celsius", "fahrenheit"],
                            "description": "The temperature unit to use. Infer this from the users location.",
                        },
                    },
                    "required": ["location", "format"],
                },
            )
        )
    ],
    messages=[
        UserMessage(content="What's the weather like today in Paris"),
    ],
    model="test",
)

encodeds = tokenizer_v3.encode_chat_completion(mistral_query).tokens
model = AutoModelForCausalLM.from_pretrained("mistralai/Mixtral-8x22B-Instruct-v0.1")
model_inputs = encodeds.to(device)
model.to(device)

generated_ids = model.generate(model_inputs, max_new_tokens=1000, do_sample=True)
sp_tokenizer = tokenizer_v3.instruct_tokenizer.tokenizer
decoded = sp_tokenizer.decode(generated_ids[0])
print(decoded)
```

## Function calling with `transformers`

To use this example, you'll need `transformers` version 4.42.0 or higher. Please see the 
[function calling guide](https://huggingface.co/docs/transformers/main/chat_templating#advanced-tool-use--function-calling)
in the `transformers` docs for more information.

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model_id = "mistralai/Mixtral-8x22B-Instruct-v0.1"
tokenizer = AutoTokenizer.from_pretrained(model_id)

def get_current_weather(location: str, format: str):
    """
    Get the current weather

    Args:
        location: The city and state, e.g. San Francisco, CA
        format: The temperature unit to use. Infer this from the users location. (choices: ["celsius", "fahrenheit"])
    """
    pass

conversation = [{"role": "user", "content": "What's the weather like in Paris?"}]
tools = [get_current_weather]

# format and tokenize the tool use prompt 
inputs = tokenizer.apply_chat_template(
            conversation,
            tools=tools,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
)

model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype=torch.bfloat16, device_map="auto")

inputs.to(model.device)
outputs = model.generate(**inputs, max_new_tokens=1000)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

Note that, for reasons of space, this example does not show a complete cycle of calling a tool and adding the tool call and tool
results to the chat history so that the model can use them in its next generation. For a full tool calling example, please
see the [function calling guide](https://huggingface.co/docs/transformers/main/chat_templating#advanced-tool-use--function-calling), 
and note that Mixtral **does** use tool call IDs, so these must be included in your tool calls and tool results. They should be
exactly 9 alphanumeric characters.

# Instruct tokenizer
The HuggingFace tokenizer included in this release should match our own. To compare: 
`pip install mistral-common`

```py
from mistral_common.protocol.instruct.messages import (
    AssistantMessage,
    UserMessage,
)
from mistral_common.tokens.tokenizers.mistral import MistralTokenizer
from mistral_common.tokens.instruct.normalize import ChatCompletionRequest

from transformers import AutoTokenizer

tokenizer_v3 = MistralTokenizer.v3()

mistral_query = ChatCompletionRequest(
    messages=[
        UserMessage(content="How many experts ?"),
        AssistantMessage(content="8"),
        UserMessage(content="How big ?"),
        AssistantMessage(content="22B"),
        UserMessage(content="Noice 🎉 !"),
    ],
    model="test",
)
hf_messages = mistral_query.model_dump()['messages']

tokenized_mistral = tokenizer_v3.encode_chat_completion(mistral_query).tokens

tokenizer_hf = AutoTokenizer.from_pretrained('mistralai/Mixtral-8x22B-Instruct-v0.1')
tokenized_hf = tokenizer_hf.apply_chat_template(hf_messages, tokenize=True)

assert tokenized_hf == tokenized_mistral
```

# Function calling and special tokens
This tokenizer includes more special tokens, related to function calling : 
- [TOOL_CALLS]
- [AVAILABLE_TOOLS]
- [/AVAILABLE_TOOLS]
- [TOOL_RESULTS]
- [/TOOL_RESULTS]

If you want to use this model with function calling, please be sure to apply it similarly to what is done in our [SentencePieceTokenizerV3](https://github.com/mistralai/mistral-common/blob/main/src/mistral_common/tokens/tokenizers/sentencepiece.py#L299).

# The Mistral AI Team
Albert Jiang, Alexandre Sablayrolles, Alexis Tacnet, Antoine Roux,
Arthur Mensch, Audrey Herblin-Stoop, Baptiste Bout, Baudouin de Monicault,
Blanche Savary, Bam4d, Caroline Feldman, Devendra Singh Chaplot,
Diego de las Casas, Eleonore Arcelin, Emma Bou Hanna, Etienne Metzger,
Gianna Lengyel, Guillaume Bour, Guillaume Lample, Harizo Rajaona,
Jean-Malo Delignon, Jia Li, Justus Murke, Louis Martin, Louis Ternon,
Lucile Saulnier, Lélio Renard Lavaud, Margaret Jennings, Marie Pellat,
Marie Torelli, Marie-Anne Lachaux, Nicolas Schuhl, Patrick von Platen,
Pierre Stock, Sandeep Subramanian, Sophia Yang, Szymon Antoniak, Teven Le Scao,
Thibaut Lavril, Timothée Lacroix, Théophile Gervet, Thomas Wang,
Valera Nemychnikova, William El Sayed, William Marshall