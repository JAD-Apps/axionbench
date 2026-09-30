---
library_name: transformers
pipeline_tag: image-text-to-text
license: other
license_name: reka-edge-2603-license
license_link: LICENSE
---

# Reka Edge

**Reka Edge** is an extremely efficient 7B multimodal vision-language model that accepts image/video+text inputs and generates text outputs. This model is optimized specifically to deliver industry-leading performance in image understanding, video analysis, object detection, and agentic tool-use. 

Learn more about the Reka Edge in our [announcement blog post](https://reka.ai/news/reka-edge-frontier-level-edge-intelligence-for-physical-ai).

[Demo](https://app.reka.ai/reka-edge) | [API Docs](https://docs.reka.ai/chat/overview) | [Discord](https://discord.com/invite/YqD7v2QQ5d)

## Key features

- Faster and more token-efficient than similarly sized VLMs
- Strong benchmark performance across VQA-v2, RefCOCO, MLVU, MMVU and Mobile Actions (see below)
- Support for vLLM (see [plugin](https://github.com/reka-ai/vllm-reka))
- Open weights license: the model can be used commercially if you make less than $1 million USD of revenue a year

## Benchmarks and metrics

|Benchmark|Reka Edge|Cosmos-Reason2 8B|Qwen 3.5 9B|Gemini 3 Pro|
|:-|:-|:-|:-|:-|
|**VQA-V2** *Visual Question Answering*|88.40|79.82|83.22|89.78|
|**MLVU** *Video Understanding*|74.30|37.85|52.39|80.68|
|**MMVU** *Multimodal Video Understanding*|71.68|51.52|68.64|78.88|
|**RefCOCO-A** *Object Detection*|93.13|90.98|93.62|81.46|
|**RefCOCO-B** *Object Detection*|86.70|85.74|88.83|82.85|
|**VideoHallucer** *Hallucination*|59.57|51.65|56.00|66.78|
|**Mobile Actions** *Tool Use*|88.40|77.94|91.78|89.39|

|Metric|Reka Edge|Cosmos-Reason2 8B|Qwen 3.5 9B|Gemini 3 Pro*|
|:-|:-|:-|:-|:-|
|Input tokens *For a 1024 x 1024 image*|331|1063|1041|1094|
|End-to-end latency (*in seconds*)|4.69 ± 2.48|10.56 ± 3.47|10.31 ± 1.81|16.67 ± 4.47|
|TTFT (s) *Time to first token*|0.522 ± 0.452|0.844 ± 0.923|0.60 ± 0.65|13.929 ± 3.872|

*\*Gemini 3 Pro measured via API call; other models measured with local inference.*


## Quick Start

### llama.cpp
To get started:
1. Use the weights from repo
2. Build the necessary artifacts from llama.cpp repo
```
cmake -B build
cmake --build build --target llama-server -j
cmake --build build --target llama-quantize -j
```
3. Run the GGUF conversion script (`convert_reka_vlm_to_gguf.py`) from the llama.cpp repo root
```
python3 convert_reka_vlm_to_gguf.py /path/to/reka/weights \
  --outfile /path/to/reka-text-f16.gguf \
  --outtype f16

# Export the vision encoder
python3 convert_reka_vlm_to_gguf.py /path/to/reka/weights \
  --mmproj \
  --outfile /path/to/reka-mmproj-f16.gguf \
  --outtype f16
```
4. (optional) Use the quantization scripts (`quantize_reka_...`) for simple quantizations of the model
```
# Example usage for text decoder quantization
bash inference/hf_release/quantize_reka_q4_last8_q8.sh /path/to/reka-text-f16.gguf /path/to/reka-text-q4_last8_q8.gguf
```
5. Run llama-server
```
./build/bin/llama-server -m /path/to/reka-text-f16.gguf \
  --mmproj /path/to/reka-mmproj-f16.gguf \
  -t 8 -c 2048 --host 0.0.0.0 --port 8080 --reasoning off \
```

One note: the model does not currently support reasoning, so we run llama-server with `--reasoning off`. 

### 🤗 Transformers (macOS)

The easiest way to run the model is with the included `example.py` script. It uses [PEP 723](https://peps.python.org/pep-0723/) inline metadata so `uv` resolves dependencies automatically — no manual install step:

```bash
uv run example.py --image media/hamburger.jpg --prompt "What is in this image?"
```

#### Requirements

##### Edge Deployment Devices

- **Mac devices with Apple Silicon**
  - **OS:** macOS 13+
  - **Minimum:** 24 GB memory
  - **Recommended:** 32 GB+ memory
- **Linux and Windows Subsystem for Linux (WSL) PCs**
  - **Minimum:** 24 GB GPU and 24 GB+ system memory
  - **Recommended:** 32 GB+ GPU and 32 GB+ system memory
- **Nvidia Robotics & Edge AI systems**
  - Jetson Thor
  - Jetson AGX Orin (both 32 GB and 64 GB variants)

##### Custom Deployment Options

With quantization, **Reka Edge** can also be run on:
- Jetson Orin Nano
- Samsung S25
- Qualcomm Snapdragon XR2 Gen 3 devices
- Apple iPhone, iPad, and Vision Pro

[Reach out](https://reka.ai/contact) for support deploying Reka Edge to a custom edge compute platform.

##### Software Requirements
- **Python:** 3.12+
- **[uv](https://docs.astral.sh/uv/)** (recommended) — handles dependencies automatically

#### Inline snippet

If you prefer not to use the script, install dependencies manually and paste the code below:

```bash
uv pip install "transformers==4.57.3" torch torchvision pillow tiktoken imageio einops av
```

```python
import torch
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor

model_id = "RekaAI/reka-edge-2603"

# Load processor and model
processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
model = AutoModelForImageTextToText.from_pretrained(
    model_id,
    trust_remote_code=True,
    torch_dtype=torch.float16,
).eval()

# Move to MPS (Apple Silicon GPU)
device = torch.device("mps")
model = model.to(device)

# Prepare an image + text query
image_path = "media/hamburger.jpg"  # included in the model repo
messages = [
    {
        "role": "user",
        "content": [
            {"type": "image", "image": image_path},
            {"type": "text", "text": "What is in this image?"},
        ],
    }
]

# Tokenize using the chat template
inputs = processor.apply_chat_template(
    messages,
    tokenize=True,
    add_generation_prompt=True,
    return_tensors="pt",
    return_dict=True,
)

# Move tensors to device
for key, val in inputs.items():
    if isinstance(val, torch.Tensor):
        if val.is_floating_point():
            inputs[key] = val.to(device=device, dtype=torch.float16)
        else:
            inputs[key] = val.to(device=device)

# Generate
with torch.inference_mode():
    # Stop on <sep> token (end-of-turn) in addition to default EOS
    sep_token_id = processor.tokenizer.convert_tokens_to_ids("<sep>")
    output_ids = model.generate(
        **inputs,
        max_new_tokens=256,
        do_sample=False,
        eos_token_id=[processor.tokenizer.eos_token_id, sep_token_id],
    )

# Decode only the generated tokens
input_len = inputs["input_ids"].shape[1]
new_tokens = output_ids[0, input_len:]
output_text = processor.tokenizer.decode(new_tokens, skip_special_tokens=True)

# Strip any trailing <sep> turn-boundary marker
output_text = output_text.replace("<sep>", "").strip()
print(output_text)
```

#### Video queries

The model also accepts video inputs. Use `--video` instead of `--image`:

```bash
uv run example.py --video media/dashcam.mp4 --prompt "Is this person falling asleep?"
```

```python
messages = [
    {
        "role": "user",
        "content": [
            {"type": "video", "video": "media/dashcam.mp4"},
            {"type": "text", "text": "Is this person falling asleep?"},
        ],
    }
]
```

#### Object detection queries

Given an input image, we use `Detect: {expression}` to instruct the model to perform object detection, where `{expression}` can describe a single object or multiple objects.

```python
messages = [
    {
        "role": "user",
        "content": [
            {"type": "image", "image": image_path},
            {"type": "text", "text": "Detect: red car, man in the white"},
        ],
    }
]
```

#### Text-only queries

Omit the image entry from the content list:

```python
messages = [
    {
        "role": "user",
        "content": [
            {"type": "text", "text": "What is the capital of France?"},
        ],
    }
]
```

Then run the same tokenization and generation steps as above.

#### Notes for MacOS

- **MPS and dtype:** Apple's MPS backend does not support `bfloat16`. Always use `torch.float16`. Do not use `device_map="auto"` — it is not compatible with MPS. Load the model to CPU first, then call `.to("mps")`.
- **Pinned transformers:** This checkpoint was exported with `transformers==4.57.3`. Using a different version may cause loading errors or incorrect behavior.
- **Memory:** The model requires ~14 GB in float16. A Mac with 32 GB unified memory is recommended to leave headroom for the OS and generation buffers.

### vLLM

For high-throughput serving, you can use the [vllm-reka](https://github.com/reka-ai/vllm-reka) plugin. This plugin extends standard [vLLM](https://github.com/vllm-project/vllm) to support Reka's custom architectures and optimized tokenizer.

#### Installation

Please follow our [vllm-reka installation instructions](https://github.com/reka-ai/vllm-reka/blob/main/README.md) to install the plugin along with `vLLM`.

#### Serving the Model

You can start the OpenAI-compatible API server by running the script `serve.sh` in [vllm-reka](https://github.com/reka-ai/vllm-reka) with `$MODEL_PATH` set to `RekaAI/reka-edge-2603`.

```bash
bash serve.sh
```

We enable BitsAndBytes quantization by default here to reduce memory usage. To disable quantization, remove the `--quantization` flag from `server.sh`.

#### Querying the Server

Once the server is running, you can send requests using the OpenAI API format:

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="EMPTY",
    timeout=3600
)

# Video query
response = client.chat.completions.create(
    model="RekaAI/reka-edge-2603",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "video_url", "video_url": {"url": "https://example.com/video.mp4"}},
                {"type": "text", "text": "Describe the video"},
            ],
        }
    ],
    stop=["\n\n<sep>"],
)
print(response.choices[0].message.content)

# Image query
response = client.chat.completions.create(
    model="RekaAI/reka-edge-2603",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": "https://example.com/image.png"}},
                {"type": "text", "text": "What is in this image?"}
            ]
        }
    ],
    stop=["\n\n<sep>"],
)
print(response.choices[0].message.content)

# Object detection query
response = client.chat.completions.create(
    model="RekaAI/reka-edge-2603",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": "https://example.com/image.png"}},
                {"type": "text", "text": "Detect: green banana"}
            ]
        }
    ],
    stop=["\n\n<sep>"],
)
print(response.choices[0].message.content)

# Text-only query
response = client.chat.completions.create(
    model="RekaAI/reka-edge-2603",
    messages=[
        {
            "role": "user",
            "content": "What is the capital of France?",
        }
    ],
    stop=["\n\n<sep>"],
)
print(response.choices[0].message.content)
```

## Notes

- `**trust_remote_code=True**` is required because the model uses custom architecture code (`Yasa2ForConditionalGeneration`) that is bundled in this repository and loaded via the `auto_map` config.

