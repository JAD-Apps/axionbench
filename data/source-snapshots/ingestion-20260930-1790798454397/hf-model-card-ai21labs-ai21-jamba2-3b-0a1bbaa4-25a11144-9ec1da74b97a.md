---
license: apache-2.0
pipeline_tag: text-generation
library_name: transformers
---

# Introduction
Jamba2 3B is an ultra-compact open source model designed to bring enterprise-grade reliability to on-device deployments. At just 3B parameters, it runs efficiently on consumer devices—iPhones, Androids, Macs, and PCs—while maintaining the grounding and instruction-following capabilities required for production use.

Released under Apache 2.0 License with a 256K context window, Jamba2 3B enables developers to build reliable AI applications for edge environments. For more details, read the [full release blog post](https://www.ai21.com/blog/introducing-jamba2/).

# Key Advantages
* **On-device deployment:** Runs efficiently on iPhones, Androids, Macs, and PCs
* **Ultra-compact footprint:** 3B parameters enabling edge deployments with minimal resources
* **Benchmark leadership:** Excels on IFBench, IFEval, Collie, and FACTS
* **256K context window:** Processes long documents and knowledge bases
* **Apache 2.0 License:** Fully open source for commercial use
* **SSM-Transformer architecture:** Memory-efficient design for resource-constrained environments

# Evaluation Results
Jamba2 3B achieves category-leading performance on instruction following and grounding benchmarks despite its compact size. The model delivers consistent, context-faithful outputs across diverse enterprise tasks including RAG workflows and technical document processing.

<img src="https://huggingface.co/ai21labs/AI21-Jamba2-3B/resolve/main/assets/Enterprise%20Reliability%20Benchmarks%20for%20Tiny%20Models.png" width="900"/>

# Training and Evaluation Details
Jamba2 models were developed using a comprehensive post-training pipeline starting from Jamba 1.5 pre-training. The models underwent mid-training on 500B carefully curated tokens with increased representation of math, code, high-quality web data, and long documents. A state passing phase optimized the Mamba layers for effective context length generalization. Training continued with cold start supervised fine-tuning to establish instruction-following and reasoning capabilities, followed by DPO optimization.

The final training stages involved multiple on-policy reinforcement learning phases, progressively moving from short-context verifiable rewards to longer context training with mixed verifiable and model-based rewards. Evaluation focused on two key enterprise reliability signals: instruction-following benchmarks measuring steerability, and grounding benchmarks testing context faithfulness. Human evaluators assessed performance on real-world enterprise tasks using blind, counterbalanced side-by-side comparisons, rating outputs on factuality, style, constraint-adherence, instruction-following, and helpfulness.

# Quickstart
## Run with vLLM
Best results require vLLM version **0.10.2** or higher.
```
vllm serve "ai21labs/AI21-Jamba2-3B" --mamba-ssm-cache-dtype float32 --enable-auto-tool-choice --tool-call-parser hermes --enable-prefix-caching
```
## Run with Transformers
```
pip install transformers>= 4.54.0
pip install flash-attn --no-build-isolation
pip install causal-conv1d>=1.2.0
pip install mamba-ssm
```
```
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("ai21labs/AI21-Jamba2-3B",
                                      dtype=torch.bfloat16,
                		attn_implementation="flash_attention_2",
                                             device_map="auto")

tokenizer = AutoTokenizer.from_pretrained("ai21labs/AI21-Jamba-3B")

messages = [
    {"role": "system",
     "content": "You are an HR Policy Assistant.
                 Answer employee questions using only the provided policy documents.
                 If the answer isn't in the documents, say so clearly.
                 Be concise and cite the specific policy section when possible."
},
    {"role": "user",
     "content": "Context documents: {retrieved_chunks}.
                 Employee question: {user_question}.
                 Answer:"
},
]

prompts = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)

outputs = model.generate(**tokenizer(prompts, return_tensors="pt").to(model.device), do_sample=True, temperature=0.6)

generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(generated_text)
```
