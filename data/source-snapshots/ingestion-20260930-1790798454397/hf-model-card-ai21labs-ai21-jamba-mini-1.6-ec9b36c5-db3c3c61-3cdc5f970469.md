---
license: other
license_name: jamba-open-model-license
license_link: https://huggingface.co/ai21labs/AI21-Jamba-Mini-1.6/blob/main/LICENSE.txt
library_name: transformers
new_version: ai21labs/AI21-Jamba-Mini-1.7
---
# Model Information

The AI21 Jamba 1.6 family of models is state-of-the-art, hybrid SSM-Transformer instruction following foundation models. The Jamba models are the most powerful & efficient long-context models on the market, which deliver up to 2.5X faster inference than leading models of comparable sizes.

The models demonstrate superior long context handling, speed, and quality. They mark the first time a non-Transformer model has been successfully scaled to the quality and strength of the market's leading models. 

[Jamba Mini 1.6](https://huggingface.co/ai21labs/AI21-Jamba-Mini-1.6) (12B active/52B total) and [Jamba Large 1.6](https://huggingface.co/ai21labs/AI21-Jamba-Large-1.6) (94B active/398B total) are also optimized for business use cases and capabilities such as function calling, structured output (JSON), and grounded generation.

The models are released under the [Jamba Open Model License](https://www.ai21.com/licenses/jamba-open-model-license), a permissive license allowing full research use and commercial use under the license terms. If you need to license the model for your needs, [talk to us](https://www.ai21.com/talk-to-us). 

For more details of this model, see the white paper and the release [blog post](https://www.ai21.com/blog/introducing-jamba-1-6).

## Model Details

- **Developed by:** [AI21](https://www.ai21.com)
- **Model type:** Joint Attention and Mamba (Jamba)
- **License:** [Jamba Open Model License](https://www.ai21.com/licenses/jamba-open-model-license)
- **Context length:** 256K
- **Knowledge cutoff date:** March 5, 2024
- **Supported languages:** English, Spanish, French, Portuguese, Italian, Dutch, German, Arabic and Hebrew


## Results on common benchmarks
  | Benchmark    | Jamba Mini 1.6 | Ministral 8B | Llama 3.1 8B | Command R7B |
|--------------|:-----:|:-----:|:-----:|:-----:|
| Arena Hard    | 51.2| 41.35| 28.17| 27.95| 
| CRAG | 76.2| 52| 60| 23.1| 
| FinanceBench (FullDoc)  | 45.4 | 19.2 | 28.4 | 2.8|
| HELMET LongQA     | 46.9 | 33 | 29.2| 9.6|
| LongBench | 32 | 17.5 | 17.7 | 2|

LongBench and Arena Hard scores are from official leaderboards for applicable models. Examples that couldn't fit models' context windows were scored accordingly. Due to a 32K context limit in its vLLM deployment, Ministral 8B was evaluated through its official API.


## Usage
### Prerequisites

You have to have the model on a CUDA device.

### Run the model with vLLM

The recommended way to perform efficient inference with Jamba is using [vLLM](https://docs.vllm.ai/en/latest/). First, make sure to install vLLM (version 0.6.5 or higher is required)
```bash
pip install "vllm>=0.6.5"
```

In the example below, number_gpus should match the number of GPUs you want to deploy Jamba Mini 1.6 on. A minimum of 2 80GB GPUs is required.

We've developed an innovative and efficient quantization technique, [ExpertsInt8](https://www.ai21.com/blog/announcing-jamba-model-family/#:~:text=Like%20all%20models%20in%20its%20size%20class%2C%20Jamba%201.6%20Large%20can%E2%80%99t%20be%20loaded%20in%20full%20(FP32)%20or%20half%20(FP16/BF16)%20precision%20on%20a%20single%20node%20of%208%20GPUs.%20Dissatisfied%20with%20currently%20available%20quantization%20techniques%2C%20we%20developed%20ExpertsInt8%2C%20a%20novel%20quantization%20technique%20tailored%20for%20MoE%20models.), designed for MoE models deployed in vLLM, including Jamba models. Using it, you'll be able to deploy Jamba Mini 1.6 on a single 80GB GPU.

```python
from vllm import LLM, SamplingParams
from transformers import AutoTokenizer

model = "ai21labs/AI21-Jamba-Large-1.6"

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

With the default BF16 precision on 2 80GB A100 GPUs and default vLLM configuration, you'll be able to perform inference on prompts up to 200K tokens long. On more than 2 80GB GPUs, you can easily fit the full 256K context.


## Documentation

For comprehensive guides and advanced usage:
- [Tokenization Guide](https://docs.ai21.com/docs/tokenization) - Using ai21-tokenizer
- [Quantization Guide](https://docs.ai21.com/docs/quantization) - ExpertsInt8, bitsandbytes
- [Fine-tuning Guide](https://docs.ai21.com/docs/fine-tuning) - LoRA, qLoRA and full fine-tuning

**For complete documentation and deployment guides, visit our [official documentation](https://docs.ai21.com/docs).**
