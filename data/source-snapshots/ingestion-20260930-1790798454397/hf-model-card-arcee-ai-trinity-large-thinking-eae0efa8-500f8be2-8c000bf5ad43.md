---
license: other
language:
- en
- es
- fr
- de
- it
- pt
- ru
- ar
- hi
- ko
- zh
library_name: transformers
base_model:
- arcee-ai/Trinity-Large-Base
arxiv:
- 2602.17004
tags:
- reasoning
- agentic
- tool-calling
- thinking
license_link: LICENSE
license_name: openmdw-1.1
---
<!-- markdownlint-disable first-line-h1 -->
<!-- markdownlint-disable html -->
<!-- markdownlint-disable no-duplicate-header -->

<div align="center">
  <picture>
    <img
      src="https://cdn-uploads.huggingface.co/production/uploads/6435718aaaef013d1aec3b8b/i-v1KyAMOW_mgVGeic9WJ.png"
      alt="Arcee Trinity Large Thinking"
      style="max-width: 100%; height: auto;"
    >
  </picture>
</div>
<hr>

# Trinity-Large-Thinking

## Introduction

Trinity-Large-Thinking is a reasoning-optimized variant of Arcee AI's Trinity-Large family — a 398B-parameter sparse Mixture-of-Experts (MoE) model with approximately 13B active parameters per token. Built on Trinity-Large-Base and post-trained with extended chain-of-thought reasoning and agentic RL, Trinity-Large-Thinking delivers state-of-the-art performance on agentic benchmarks while maintaining strong general capabilities.

Trinity-Large-Thinking generates explicit reasoning traces wrapped in `<think>...</think>` blocks before producing its final response. This thinking process is critical to the model's performance — **thinking tokens must be kept in context** for multi-turn conversations and agentic loops to function correctly.

Try it at [chat.arcee.ai](http://chat.arcee.ai/)

More details on the training of Trinity Large are available in the [technical report](https://arxiv.org/abs/2602.17004).

## Key Highlights

- **Agentic-first design**: Purpose-built for tool calling, multi-step planning, and agent workflows
- **State-of-the-art agentic performance**: 94.7% on τ²-Bench, 91.9% on PinchBench, 98.2% on LiveCodeBench
- **Native reasoning traces**: Extended chain-of-thought via `<think>...</think>` blocks
- **Compatible with major agent frameworks**: Works out of the box with [OpenClaw](https://github.com/openclaw) and [Hermes Agent](https://github.com/NousResearch/hermes-agent)
- **Ready to use on [OpenRouter](https://openrouter.ai/)**: No setup required — full reasoning and tool calling support via API

## Model Variants

The Trinity Large family consists of four checkpoints:

- **Trinity-Large-Thinking** (this release): Reasoning-optimized, agentic post-training with extended chain-of-thought
- **[Trinity-Large-Preview](https://huggingface.co/arcee-ai/Trinity-Large-Preview)**: Lightly post-trained, chat-ready instruct model (no reasoning_content).
- **[Trinity-Large-TrueBase](https://huggingface.co/arcee-ai/Trinity-Large-TrueBase)**: 10T-token pre-anneal pretraining checkpoint
- **[Trinity-Large-Base](https://huggingface.co/arcee-ai/Trinity-Large-Base)**: Full 17T-token pretrained foundation model with mid-training anneals

## Architecture

Trinity-Large-Thinking shares the same sparse MoE architecture as Trinity-Large-Preview.

| Hyperparameter | Value |
|:---|:---:|
| Total parameters | ~398B |
| Active parameters per token | ~13B |
| Experts | 256 (1 shared) |
| Active experts | 4 |
| Routing strategy | 4-of-256 (1.56% sparsity) |
| Dense layers | 6 |
| Pretraining context length | 8,192 |
| Context length after extension | 512k |
| Architecture | Sparse MoE (AfmoeForCausalLM) |

## Benchmarks
![Benchmark charts](https://huggingface.co/arcee-ai/Trinity-Large-Thinking/resolve/main/All_charts.jpg)

| Benchmark | Trinity-Large-Thinking | Opus-4.6 | GLM-5 | MiniMax-M2.7 | Kimi-K2.5 |
|---|---:|---:|---:|---:|---:|
| IFBench | 52.3 | 53.1 | 72.3 | **75.7** | 70.2 |
| GPQA-Diamond | 76.3 | **89.2** | 81.6 | 86.2 | 86.9 |
| Tau2-Airline | **88.0** | 82.0 | 80.5 | 80.0 | 80.0 |
| Tau2-Telecom | 94.7 | 92.1 | **98.2** | 84.8 | 95.9 |
| PinchBench | 91.9 | **93.3** | 86.4 | 89.8 | 84.8 |
| AIME25 | 96.3 | **99.8** | 93.3 | 80.0 | 96.3 |
| BCFLv4 | 70.1 | **77.0** | 70.8 | 70.6 | 68.3 |
| MMLU-Pro | 83.4 | **89.1** | 85.8 | 80.8 | 87.1 |
| SWE-bench Verified* | 63.2 | **75.6** | 72.8 | 75.4 | 70.8 |

 *All models evaluated in mini-swe-agent-v2

## Thinking-in-Context: Important Usage Note

Trinity-Large-Thinking produces reasoning traces inside `<think>...</think>` blocks before generating its final response.

This means:

1. **Multi-turn conversations**: When building chat applications, include the full assistant response (thinking + answer) in the conversation history for subsequent turns.
2. **Agentic loops**: When using Trinity-Large-Thinking as the backbone of an agent (OpenClaw, Hermes Agent, or custom), ensure your tool-calling loop preserves reasoning in the message history between steps.
3. **Context window management**: The 512k extended context window accommodates long reasoning chains across many agentic steps. If you must truncate history, prefer removing older turns entirely rather than stripping thinking tokens from recent turns.

### How thinking works

The model reasons internally before producing its response. When served via vLLM, the reasoning is separated into a dedicated field in the API response:

```json
// API response structure
{
  "message": {
    "role": "assistant",
    "reasoning_content": "The user wants flight information. I need to determine the date for next Tuesday, search for flights SFO → JFK, and filter by price < $300.",
    "content": "\n",
    "tool_calls": [{
      "function": {
        "name": "search_flights",
        "arguments": "{\"origin\": \"SFO\", \"destination\": \"JFK\", \"date\": \"2026-04-07\", \"max_price\": 300}"
      }
    }]
  }
}
```

### Preserving reasoning in multi-turn conversations

When building multi-turn agentic loops, you **must** pass `reasoning_content` back on assistant messages in subsequent requests. The chat template reads this field and re-wraps it in `<think>...</think>` tags during tokenization, maintaining the model's chain-of-thought across turns.

**What happens if reasoning is omitted entirely?** The model can lose prior chain-of-thought context. On simple tasks this may work fine, but on complex multi-step agentic tasks, the model can produce malformed tool calls (e.g., tool call XML appearing inside the reasoning field instead of as structured `tool_calls`). For best results, always preserve `reasoning_content` and use `""` instead of `null` for content on tool-call turns.

For implementation details, pitfalls (`reasoning` vs `reasoning_content`), and Python/TypeScript examples, see [Reasoning Traces](https://docs.arcee.ai/capabilities/reasoning-traces).

## Training Configuration

### Pretraining

- Training tokens: 17 trillion
- Data partner: [Datology](https://www.datologyai.com/)

### Posttraining

- Instruction tuning and agentic RL with extended chain-of-thought
- Trained on tool-calling trajectories, multi-step agent tasks, and reasoning chains

### Infrastructure

- Hardware: 2,048 NVIDIA B300 GPUs
- Parallelism: HSDP + Expert Parallelism
- Compute partner: [Prime Intellect](https://www.primeintellect.ai/)

## Usage

### Running our model

- [vLLM](#vllm) (recommended for agentic deployments)
- [Transformers](#transformers)
- [API](#api)

### vLLM

Supported in vLLM 0.11.1+. For agentic use with both reasoning and tool calling:

```bash
vllm serve arcee-ai/Trinity-Large-Thinking \
  --dtype bfloat16 \
  --reasoning-parser deepseek_r1 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder
```
**Recommended inference settings**: `temperature=0.45–0.6`, `top_p=0.95`, `top_k=50`

This configuration:
- `--reasoning-parser deepseek_r1` — Parses `<think>...</think>` reasoning blocks and exposes them via the `reasoning_content` field in the API response
- `--tool-call-parser qwen3_coder` — Parses structured tool calls from the model output into the OpenAI-compatible `tool_calls` array


#### Single-turn example

```python
from openai import OpenAI

client = OpenAI(api_key="EMPTY", base_url="http://localhost:8000/v1")

response = client.chat.completions.create(
    model="arcee-ai/Trinity-Large-Thinking",
    messages=[
        {"role": "user", "content": "What's the weather like in Paris?"}
    ],
    tools=[{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a location",
            "parameters": {
                "type": "object",
                "properties": {"location": {"type": "string"}},
                "required": ["location"]
            }
        }
    }],
)

# Access reasoning (thinking) content
reasoning = response.choices[0].message.reasoning_content

# Access final response or tool calls
content = response.choices[0].message.content
tool_calls = response.choices[0].message.tool_calls
```

#### Multi-turn agentic loop example

The key pattern: after each turn, append the **full** assistant response (including reasoning) back to the message history, then append tool results, and send the updated history for the next turn.

```python
import json
from openai import OpenAI

client = OpenAI(api_key="EMPTY", base_url="http://localhost:8000/v1")
MODEL = "arcee-ai/Trinity-Large-Thinking"

tools = [
    {"type": "function", "function": {
        "name": "get_customer_by_email",
        "description": "Look up a customer by email.",
        "parameters": {"type": "object", "properties": {"email": {"type": "string"}}, "required": ["email"]}
    }},
    {"type": "function", "function": {
        "name": "cancel_subscription",
        "description": "Cancel a subscription. Requires customer_id.",
        "parameters": {"type": "object", "properties": {"customer_id": {"type": "string"}, "reason": {"type": "string"}}, "required": ["customer_id"]}
    }}
]

def execute_tool(name, arguments):
    """Simulate tool execution — replace with real implementations."""
    args = json.loads(arguments)
    if name == "get_customer_by_email":
        return json.dumps({"customer_id": "C2001", "name": "Jane Doe", "plan": "Premium", "status": "active"})
    elif name == "cancel_subscription":
        return json.dumps({"success": True, "message": f"Subscription cancelled for {args['customer_id']}"})

messages = [
    {"role": "system", "content": "You are a helpful customer service agent."},
    {"role": "user", "content": "I want to cancel my subscription. My email is jane@example.com"}
]

# Agent loop
while True:
    response = client.chat.completions.create(
        model=MODEL, messages=messages, tools=tools,
        tool_choice="auto", temperature=0, max_tokens=1000
    )
    msg = response.choices[0].message

    # Build assistant message — PRESERVE reasoning_content
    assistant_msg = {"role": "assistant", "content": msg.content}
    if msg.reasoning_content:
        assistant_msg["reasoning_content"] = msg.reasoning_content  # ← critical for multi-turn
    if msg.tool_calls:
        assistant_msg["tool_calls"] = [
            {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in msg.tool_calls
        ]
    messages.append(assistant_msg)

    # If no tool calls, model gave its final response — done
    if not msg.tool_calls:
        print(f"Final response: {msg.content}")
        break

    # Execute tool calls and append results
    for tc in msg.tool_calls:
        result = execute_tool(tc.function.name, tc.function.arguments)
        print(f"  Tool: {tc.function.name}({tc.function.arguments}) → {result}")
        messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
```

Expected output:
```
  Tool: get_customer_by_email({"email": "jane@example.com"}) → {"customer_id": "C2001", ...}
  Tool: cancel_subscription({"customer_id": "C2001", ...}) → {"success": true, ...}
  Final response: Your subscription has been cancelled successfully.
```

The critical line is:
```python
assistant_msg["reasoning_content"] = msg.reasoning_content  # ← pass reasoning_content back
```

The chat template re-wraps it in `<think>...</think>` tags automatically. See [Reasoning Traces](https://docs.arcee.ai/capabilities/reasoning-traces) for full details.

### Transformers

Use the `main` transformers branch or pass `trust_remote_code=True` with a released version.

```python
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

model_id = "arcee-ai/Trinity-Large-Thinking"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    torch_dtype=torch.bfloat16,
    device_map="auto",
    trust_remote_code=True
)

messages = [
    {"role": "user", "content": "Who are you?"},
]

input_ids = tokenizer.apply_chat_template(
    messages,
    add_generation_prompt=True,
    return_tensors="pt"
).to(model.device)

outputs = model.generate(
    input_ids,
    max_new_tokens=4096,
    do_sample=True,
    temperature=0.6,
    top_k=50,
    top_p=0.95
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(response)
```

### API

#### OpenRouter

Available on [OpenRouter](https://openrouter.ai/) with full reasoning and tool calling support:

```bash
curl -X POST "https://openrouter.ai/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "arcee-ai/trinity-large-thinking",
    "messages": [
      {
        "role": "user",
        "content": "What are some fun things to do in New York?"
      }
    ]
  }'
```

**Multi-turn with OpenRouter**: OpenRouter returns reasoning in a `reasoning_details` object (their unified reasoning shape). For multi-turn conversations, pass `reasoning_details` back as-is on assistant messages in subsequent requests — OpenRouter handles model-specific upstream translation (for Trinity, this is sent as `reasoning_content` on assistant turns upstream). For debugging, enable echo to inspect the upstream API call:

```json
{"debug": {"echo_upstream_body": true}}
```

See [OpenRouter debugging docs](https://openrouter.ai/docs/api/reference/errors-and-debugging#debugging) for details.

## Agentic Use Cases

Trinity-Large-Thinking is optimized for deployment as the reasoning backbone of AI agent systems. It has been evaluated and performs excellently with:

### OpenClaw

Trinity-Large-Thinking works as a drop-in brain for OpenClaw agents. Its native tool-calling format is compatible with OpenClaw's execution loop, and the extended reasoning enables reliable multi-step task completion — from email triage to code generation to meeting scheduling. Our 91.9% PinchBench score reflects real-world OpenClaw task performance.

**Deploying for OpenClaw users**: OpenClaw preserves full assistant turns across steps. Ensure `reasoning_content` is forwarded on assistant messages in subsequent turns, and keep `content` non-null (empty string `""` is fine on tool-call turns). See [Reasoning Traces](https://docs.arcee.ai/capabilities/reasoning-traces) for full integration details.

### Hermes Agent

Compatible with the Hermes Agent framework from Nous Research. Trinity-Large-Thinking's reasoning traces pair naturally with Hermes's skill-learning loop — the model's explicit chain-of-thought makes skill extraction more reliable, and its strong tool-calling capabilities integrate directly via the Hermes tool-use protocol.

### Custom Agent Loops

For custom implementations, the key integration pattern is:

1. Send the user message with tool definitions
2. Receive the response with `reasoning_content` + `content` + `tool_calls`
3. Execute the tool calls
4. Append the **full** assistant response (reasoning_content + content + tool calls) and tool results to the message history
5. Send the updated history back for the next step
6. Repeat until the model produces a final response without tool calls

> **Important**: Step 4 must include `reasoning_content` on the assistant message. The chat template reads this field and re-wraps it in `<think>...</think>` tags during tokenization. Omitting it degrades multi-step performance — see [Reasoning Traces](https://docs.arcee.ai/capabilities/reasoning-traces) for full details.

## License

Trinity-Large-Thinking is released under the OpenMDW License, version 1.1 (OpenMDW-1.1).

## Citation

If you use this model, please cite:

```bibtex
@misc{singh2026arceetrinity,
  title        = {Arcee Trinity Large Technical Report},
  author       = {Varun Singh and Lucas Krauss and Sami Jaghouar and Matej Sirovatka and Charles Goddard and Fares Obied and Jack Min Ong and Jannik Straube and Fern and Aria Harley and Conner Stewart and Colin Kealty and Maziyar Panahi and Simon Kirsten and Anushka Deshpande and Anneketh Vij and Arthur Bresnu and Pranav Veldurthi and Raghav Ravishankar and Hardik Bishnoi and DatologyAI Team and Arcee AI Team and Prime Intellect Team and Mark McQuade and Johannes Hagemann and Lucas Atkins},
  year         = {2026},
  eprint       = {2602.17004},
  archivePrefix= {arXiv},
  primaryClass = {cs.LG},
  doi          = {10.48550/arXiv.2602.17004},
  url          = {https://arxiv.org/abs/2602.17004}
}
```