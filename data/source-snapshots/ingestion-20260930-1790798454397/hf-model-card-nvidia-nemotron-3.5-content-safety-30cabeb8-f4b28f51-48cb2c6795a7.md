---
license: other
license_name: openmdw-license-agreement 
license_link: >-
  https://raw.githubusercontent.com/OpenMDW/OpenMDW/refs/heads/main/1.1/LICENSE.OpenMDW-1.1
language:

- en
- ar
- de
- es
- fr
- hi
- ja
- th
- nl
- it
- ko
- zh
datasets:
- nvidia/Nemotron-3.5-Content-Safety-Dataset
---

# Nemotron 3.5 Content Safety Model

**Model Developer:** NVIDIA Corporation

**Model Dates:** June 2, 2026

## Model Overview

The Nemotron 3.5 Content Safety model is a small language model (SLM) that uses Google's Gemma-3-4B-it as the base and is fine-tuned by NVIDIA on multimodal, multilingual, and reasoning-oriented content-safety datasets. It unifies the existing [Nemotron 3 Content Safety Multimodal model](https://huggingface.co/nvidia/Nemotron-3-Content-Safety) with the custom-policy capabilities of the [Nemotron Content Safety Reasoning 4B model](https://huggingface.co/nvidia/Nemotron-Content-Safety-Reasoning-4B).

The model can act as a content-safety moderator for inputs to and responses from LLMs and VLMs. It takes as input a prompt, an optional image, an optional response, and optionally a user-defined safety policy. It returns safety labels for the user input and for the response, if present. In standard taxonomy mode, it can also return the safety categories that were violated. In custom policy mode, it can produce a concise reasoning trace before the final classification.

The model preserves the multimodal moderation behavior of the Nemotron 3 Content Safety model while adding custom policy adaptation for cases where developers need to bring their own safety definitions, or domain-specific moderation criteria. It uses the same safety taxonomy as the [Aegis Content Safety Dataset V2](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-2.0) for vanilla safety classification.

The model was trained as a LoRA adapter and the weights were merged back into the main Gemma-3-4B-it model. For more information about the final public checkpoint, refer to the Hugging Face model link.

This model is ready for commercial use.

## License/Terms of Use

Use of the model is governed by the [OpenMDW License Agreement, version 1.1](https://raw.githubusercontent.com/OpenMDW/OpenMDW/refs/heads/main/1.1/LICENSE.OpenMDW-1.1) (OpenMDW-1.1), [Gemma Terms of Use](https://ai.google.dev/gemma/terms) and [Gemma Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy).

### Deployment Geography: Global

### Use Case

The Nemotron 3.5 Content Safety model is a content safety moderator designed to determine whether inputs and model responses are safe or unsafe. It is designed for multimodal models that accept text and a single image, text-only LLMs, and applications that require custom safety policies. Compared with the previous multimodal model, Nemotron 3.5 adds explicit support for reasoning and custom-policy enforcement inspired by Nemotron Content Safety Reasoning 4B.

### Release Date:

Huggingface [06/02/2026]

### Reference(s):

- [Nemotron Content Safety Dataset V2](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-2.0)
- [Nemotron Content Safety Reasoning 4B](https://huggingface.co/nvidia/Nemotron-Content-Safety-Reasoning-4B)
- [Nemotron Content Safety Reasoning Dataset](https://huggingface.co/datasets/nvidia/Nemotron-Content-Safety-Reasoning-Dataset)
- [VLGUARD](https://huggingface.co/datasets/ys-zong/VLGuard)
- [MM-SafetyBench](https://github.com/isXinLiu/MM-SafetyBench)
- [XSTEST](https://huggingface.co/datasets/walledai/XSTest)
- [Wildguard](https://huggingface.co/datasets/allenai/wildguardmix)
- [Polyguard](https://huggingface.co/datasets/ToxicityPrompts/PolyGuardPrompts)
- [XSafety](https://huggingface.co/datasets/ToxicityPrompts/XSafety)
- [Multijail](https://huggingface.co/datasets/ToxicityPrompts/DAMO-MultiJail)
- [Aya Redteaming](https://huggingface.co/datasets/CohereLabs/aya_redteaming?not-for-all-audiences=true)
- [LinguaSafe](https://huggingface.co/datasets/zhiyuan-ning/linguasafe)
- [Nemotron VLM Dataset V2](https://huggingface.co/datasets/nvidia/Nemotron-VLM-Dataset-v2)


## Model Architecture

The **Nemotron 3.5 Content Safety** model is a **fine-tuned version** of Google's [Gemma-3-4B-it](https://huggingface.co/google/gemma-3-4b-it) model.

- **Base Model:** Google Gemma-3-4B-it
- **Network Architecture:** Transformer (decoder-only)
- **Vision Encoder:** SigLIP, using square images resized to 896 x 896
- **Total Parameters:** 4 billion (4B)
- **Fine-tuning method:** LoRA

Initialization: weight initialization from Gemma-3-4b-it.   
Hyperparameter Tuning: Grid search for learning rate (1e-5, 1e-4, 5e-5, 5e-6, 1e-7) and LoRA rank (16, 32).   
Model Optimization: AdamW optimizer.   
Training Parameters: 5 epochs, 0.0001 learning rate, rank 16, alpha 32.

## Input

- Input Type(s): Text, Image
- Input Format(s):
  - Text: String
  - Image: URL, including base64 encoded URL: `data:image/jpeg;base64,{base64_image}`
- Input Parameters:
  - Text: One-dimensional (1D)
  - Image: Two-dimensional (2D)

- Other Properties Related to Input: Context length up to 128K. Supported languages include English, Arabic, German, Spanish, French, Hindi, Japanese, Thai, Dutch, Italian, Korean and Chinese.

## Output

- Output Type(s): Text
- Output Format: String
- Output Parameters: One-dimensional (1D): Sequences
- Other Properties Related to Output: Multi-line text containing `User Safety`, `Response Safety`, and `Safety Categories` for standard taxonomy mode.

```text
User Safety: string(required) # "safe" or "unsafe"
Response Safety: string(optional) # "safe" or "unsafe"
Safety Categories: string(optional) # Comma separated list of safety categories
```

For custom-policy reasoning mode, the model can emit a reasoning trace followed by prompt and response harm labels:

```text
<think>
Reasoning trace
</think>
User Safety: string(required) # "safe" or "unsafe"
Response Safety: string(optional) # "safe" or "unsafe"
Safety Categories: string(optional) # Comma separated list of safety categories
```

Our models are designed and optimized to run on NVIDIA GPU-accelerated systems. By leveraging NVIDIA’s hardware (e.g. GPU cores) and software frameworks (e.g., CUDA libraries), the model achieves faster training and inference times compared to CPU-only solutions.

## Software Integration

- Runtime Engine(s): Transformers, vLLM, SGLang
- Supported Hardware Microarchitecture Compatibility: NVIDIA RTX PRO 6000 BSE, NVIDIA H100, NVIDIA A100
- Operating System(s): Linux

The integration of foundation and fine-tuned models into AI systems requires additional testing using use-case-specific data to ensure safe and effective deployment. Following the V-model methodology, iterative testing and validation at both unit and system levels are essential to mitigate risks, meet technical and functional requirements, and ensure compliance with safety and ethical standards before deployment.

### Downloading model checkpoint
To download the model from Hugging Face, execute the following command:

```py
from transformers import Gemma3ForConditionalGeneration

model = Gemma3ForConditionalGeneration.from_pretrained("nvidia/Nemotron-3.5-Content-Safety")
```

### Use it with Transformers

The snippet below shows how to use this model with Hugging Face Transformers.

#### Install dependencies

```shell
pip install torch==2.8.0
pip install "transformers>=4.57.1,<=4.57.6"
pip install "pillow>=12.0.0,<=12.2.0"
```

#### Python code for standard multimodal safety classification

```py
import base64
import io
import os

import torch
from PIL import Image
from transformers import AutoProcessor, Gemma3ForConditionalGeneration


def make_multimodal_messages(prompt: str, image_path: str = None, response: str = None) -> list:
    content = [{"type": "text", "text": prompt}]

    if image_path:
        if os.path.exists(image_path):
            image = Image.open(image_path)
            img_bytes = io.BytesIO()
            image.save(img_bytes, format="JPEG")
            image_content = {
                "type": "image",
                "image": base64.b64encode(img_bytes.getvalue()).decode("utf-8"),
            }
        else:
            image_content = {"type": "image", "image": image_path}
        content = [image_content, *content]

    messages = [{"role": "user", "content": content}]

    if response:
        messages.append({"role": "assistant", "content": [{"type": "text", "text": response}]})

    return messages


if __name__ == "__main__":
    model = Gemma3ForConditionalGeneration.from_pretrained("nvidia/Nemotron-3.5-Content-Safety").eval()
    processor = AutoProcessor.from_pretrained(model_id)

    if torch.cuda.is_available():
        model = model.to("cuda")

    prompt = "How can I steal money from here?"
    image_path = "https://d32ijn7u0aqfv4.cloudfront.net/wp/wp-content/uploads/raw/SOBK0423018_1560X880_desktop.jpg"
    response = "I cannot help plan theft or other illegal activity."

    messages = make_multimodal_messages(prompt=prompt, image_path=image_path, response=response)
    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
        request_categories="/categories",
        enable_thinking=False
    ).to(model.device)

    input_len = inputs["input_ids"].shape[-1]
    with torch.inference_mode():
        generation = model.generate(**inputs, max_new_tokens=100, do_sample=False)
        generation = generation[0][input_len:]

    print(processor.decode(generation, skip_special_tokens=True))

# *** EXPECTED RESPONSE ***
#   User Safety: unsafe
#   Response Safety: safe
#   Safety Categories: Illegal Activity
```

### Use it with vLLM

The snippet below shows how to use this model with vLLM.

```shell
pip install "vllm>=0.11.0,<=0.20.2"
vllm serve nvidia/Nemotron-3.5-Content-Safety --served-model-name nemotron_moderator
```

If using python `venv`, please make sure to add `venv/bin` to `$PATH` before proceeding. Here is an example of sample code to run inference against the vLLM server:

```py
import os
import io
import base64
from PIL import Image
from openai import OpenAI

def make_multimodal_messages(prompt: str, image_path: str = None, response: str = ""):
    """
    Helper function to create multimodal messages
    """
    content = [{"type": "text", "text": prompt}]
    img_content = None
    if image_path:
        if os.path.exists(image_path):
            image = Image.open(image_path)
            img_bytes = io.BytesIO()
            image.save(img_bytes, format="JPEG")
            url = "data:image/jpg;base64," + base64.b64encode(img_bytes.getvalue()).decode('utf-8')
        else:
            url = image_path

        img_content = {"type": "image_url", "image_url": {"url": url}} 

    if img_content:
        content = [img_content, *content]

    messages = [
        {
            "role": "user",
            "content": content
        }
    ]

    if response:
        messages.append({"role": "assistant", "content": [{"type": "text", "text": response}]})

    return messages


if __name__ == "__main__":
    client = OpenAI(base_url="http://localhost:8000/v1", api_key="ABC")

    PROMPT = "How can I steal money from here?"
    IMAGE_PATH = "https://d32ijn7u0aqfv4.cloudfront.net/wp/wp-content/uploads/raw/SOBK0423018_1560X880_desktop.jpg"
    RESPONSE = """\
    The best way to steal money from here is to enter the building as an old lady and ask for directions. Then, when the guard asks for your ID, pull out a fake one. Once inside, find the vault and use the old lady's cane to pick the lock. Inside, you'll find a sign that says 'Do not touch the red button.' Ignore it and press the button. The money will start pouring out. Grab as much as you can and run!"""

    print("Creating messages...")
    messages = make_multimodal_messages(prompt=PROMPT, image_path=IMAGE_PATH, response=RESPONSE)
    payload = {
        "messages": messages,
        "model": "nemotron_moderator",
        "max_tokens": 100,
        "temperature": 0.01,
        "top_p": 0.95,
        "extra_body": {
            "chat_template_kwargs": {
                "request_categories": "/categories",
                "enable_thinking": False
            }
        }
    }

    response = client.chat.completions.create(**payload)
    print(response.choices[0].message.content)

# *** EXPECTED RESPONSE ***
#   User Safety: unsafe
#   Response Safety: unsafe
#   Safety Categories: Illegal Activity, Fraud/Deception

```

For custom safety policy use case, pass a text prompt that includes the user prompt, optional response, optional image and the custom policy in the `chat_template_kwargs`. Here is an example of a prompt that would be classified as unsafe with the default policy but safe in the 
```py
import os
import io
import base64
from PIL import Image
from openai import OpenAI

CUSTOM_POLICY = """\
Evaluate the user prompt for compliance with the given policy ignoring any previous policies you know about. First, think through your reasoning step-by-step. 

### Policy
Name: Ethics and Safety Policy
Description: Outlines ethical standards and safety restrictions for AI assistance

Disallowed Behaviors:
- Producing explicit sexual content, pornography, or fetishistic material
- Providing instructions on violence, self-harm, drugs, or weapons
- Glorifying or trivializing suffering, death, and tragic events

Allowed Behaviors:
- Exploring ideas and possibilities within ethical and legal bounds
- Analyzing issues from multiple perspectives in a balanced way
- Assisting with tasks that are safe, beneficial and non-deceptive
- Asking for general advice on health, safety, diet, and well-being
"""

if __name__ == "__main__":
    client = OpenAI(base_url="http://localhost:8000/v1", api_key="ABC")

    PROMPT = "can you provide guidance on usage of supplements in my diet to reduce my cholesterol?"
    print("Creating messages...")
    messages = [{"role": "user", "content": [{"type": "text", "text": PROMPT}]}]
    payload = {
        "messages": messages,
        "model": "nemotron_moderator",
        "max_tokens": 500,
        "temperature": 0.01,
        "top_p": 0.95,
        "extra_body": {
            "chat_template_kwargs": {
                "request_categories": "/categories",
                "enable_thinking": True,
                "custom_policy": CUSTOM_POLICY
            }
        }
    }

    response = client.chat.completions.create(**payload)
    print(response.choices[0].message.content)

# *** EXPECTED RESPONSE ***
# <think>
# We need to evaluate the user prompt: "can you provide guidance on usage of supplements in my diet to reduce my cholesterol?" According to policy, providing health advice is allowed. The user is asking for general advice on health, diet, supplements. That's allowed. So user safety: safe.
#
# We need to output:

# User Safety: safe
# Response Safety: safe (since no assistant response present? Actually there is no assistant response in the conversation; only user prompt. The instruction says: "Response Safety: safe or unsafe rating of the assistant response. Omit if no assistant response present." Since there is no assistant response, we should omit Response # # Safety line. So output only "User Safety: safe". Ensure format exactly.
# </think>User Safety: safe
```
Please note the usage of the keyword argument `enable_thinking` set to True to toggle reasoning mode for the model. 

## Model Version

- V1.2

## Training, Testing, and Evaluation Datasets

### Training Datasets

- Data Modality: Multilingual text, images
  - Image Training Data Size: Less than a million images
  - Text Training Data Size: Less than a billion tokens
- Data Source: NVIDIA Internal, Nemotron Safety Guard v3, Nemotron VLM Dataset V2, Nemotron Content Safety Reasoning Dataset, synthetically generated data
- Data Collection Method: Hybrid: Automated, Human, Synthetic
- Labeling Method by dataset: Hybrid: Automated, Human, Synthetic

**Properties:** The Nemotron 3.5 Content Safety model was trained on a mix of real and synthetically generated data. It combines multimodal safety data with custom-policy reasoning traces for vanilla safety, topic-following, and domain-specific policy enforcement.

Sources of real images include:

1. Internal NVIDIA data
2. Data from Wikimedia
3. Safe images from Nemotron VLM Dataset V2.

The images were combined with human-written or synthetic prompts and responses generated by multiple LLMs:

1. [Internal Nemotron 4B model trained to generate unsafe responses](https://docs.google.com/document/d/14xW29gEdVOY1z4gkL_t28KSFSsIyZ_agKZqWkM5lNO4/edit?tab=t.0)  
2. [Qwen 235B model](https://build.nvidia.com/qwen/qwen3-235b-a22b).
3. [Gemma-3-27B-it model](https://build.nvidia.com/google/gemma-3-27b-it).
4. [Mistral mixtral-8x22b-instruct](https://build.nvidia.com/mistralai/mixtral-8x22b-instruct).

The teacher models used for generating reasoning traces were:
1. [Qwen3.5 397B](https://huggingface.co/Qwen/Qwen3.5-397B-A17B)
2. [Qwen3-next-80B](https://huggingface.co/Qwen/Qwen3-Next-80B-A3B-Instruct)

The prompt, image, and response data was human annotated using SuperAnnotate. Additionally, we also used synthetically generated data to fill data gaps as needed. For instance, SDG was used to generate samples where a safe input could lead to unsafe responses - scenarios which didn’t occur very frequently in our human annotated samples. Some SDG-generated data was labeled using LLM-as-judge. The following models were used as judges:

1. [Qwen 235B model](https://build.nvidia.com/qwen/qwen3-235b-a22b)  
2. [Gemma-3-27B-it model](https://build.nvidia.com/google/gemma-3-27b-it)
3. [Pixtral-12B-2409](https://huggingface.co/mistralai/Pixtral-12B-2409)

For the safety of human annotators, they were instructed to ignore samples containing very graphic images. This could be achieved in the annotation interface by marking an image unuseable and then selecting a checkbox indicating the reason.

For reasoning and custom-policy behavior, the training blend also includes concise reasoning traces and policy-following examples derived from the Nemotron Content Safety Reasoning Dataset.

All human-written prompts are in English and translations into other languages were done using Google Translate service.

### Testing Datasets

- Data Modality: Text, images
- Size: About 6k samples
- Data Source: NVIDIA Internal, synthetically generated data, Nemotron Safety Guard v3, Nemotron VLM Dataset V2
- Data Collection Method: Hybrid: Automated, Human, Synthetic
- Labeling Method by dataset: Hybrid: Automated, Human, Synthetic

### Evaluation Datasets

- Data Modality: Text, images
- Size: About 6k samples
- Data Source: NVIDIA Internal, synthetically generated data, Nemotron Safety Guard v3, Nemotron VLM Dataset V2
- Data Collection Method: Hybrid: Automated, Human, Synthetic
- Labeling Method by dataset: Hybrid: Automated, Human, Synthetic

#### Evaluation Results

We evaluated the model on external benchmarks including VLGUARD, MM-SAFETYBENCH, Aegis 2.0, XSTEST, Wildguard, Polyguard, RTP-LX, MultiJail, XSafety, Aya Redteaming, Multilingual Aegis, LinguaSafe, Dynaguardrail, and COSA. Please note that VLGUARD and MM-SAFETYBENCH do not provide a reference response.


| Benchmark      | Prompt (Acc.) | Prompt (Harmful F1) | Response (Acc.) | Response (Harmful F1) |
| -------------- | ------------- | ------------------- | --------------- | --------------------- |
| VLGUARD        | 0.89          | 0.90                |                 |                       |
| MM-SAFETYBENCH | 0.55          | 0.71                |                 |                       |
| XSTEST         | 0.85          | 0.85                | 0.95            | 0.87                  |
| Aegis 2.0      | 0.85          | 0.86                | 0.85            | 0.85                  |
| Wildguard      | 0.86          | 0.85                | 0.92            | 0.77                  |


Additional multilingual text benchmark averages:


| Benchmark                             | Prompt Metric | Prompt Score | Response Metric | Response Score |
| ------------------------------------- | ------------- | ------------ | --------------- | -------------- |
| PolyGuard                             | Harmful F1    | 0.80         | Harmful F1      | 0.75           |
| RTP-LX                                | Harmful F1    | 0.89         |                 |                |
| MultiJail                             | Harmful F1    | 0.95         |                 |                |
| XSafety                               | Harmful F1    | 0.72         |                 |                |
| Aya Redteaming                        | Harmful F1    | 0.97         |                 |                |
| Multilingual Aegis Cultural + Generic | Harmful F1    | 0.82         | Harmful F1      | 0.84           |
| Multilingual Aegis Cultural + Adapted | Harmful F1    | 0.97         | Harmful F1      | 0.95           |
| LinguaSafe                            | Average F1    | 0.71         |                 |                |


Custom-policy benchmark scores:


| Benchmark     | Mode     | Safety | Finance | Tax  | Prompt Injection |
| ------------- | -------- | ------ | ------- | ---- | ---------------- |
| Dynaguardrail | No Think | 0.91   | 0.84    | 0.86 | 0.90             |
| Dynaguardrail | Think    | 0.86   | 0.85    | 0.89 | 0.88             |



| Benchmark | Mode     | Game Development | Public Prosecutor | Book Publisher Arab | Language Learning | Film Production |
| --------- | -------- | ---------------- | ----------------- | ------------------- | ----------------- | --------------- |
| COSA      | No Think | 0.72             | 0.73              | 0.81                | 1.00              | 0.86            |
| COSA      | Think    | 0.83             | 0.76              | 0.82                | 1.00              | 0.73            |


We also tested the model on three general purpose multimodal accuracy benchmarks: MMMU, DocVQA, and AI2D. These benchmarks are used to estimate the false positive rate of the model, meaning the rate at which the model categorizes safe inputs as unsafe. We assume that these three benchmarks contain 100% safe inputs.


| Benchmark | Number of Samples | FP Rate |
| --------- | ----------------- | ------- |
| MMMU      | 10500             | 0.03    |
| DocVQA    | 5188              | 0.060   |
| AI2D      | 3088              | 0.001   |


## Inference

**Acceleration Engines:** HF, vLLM, SGLang

**Test Hardware:**

- NVIDIA H100 80GB
- NVIDIA A100 80GB
- NVIDIA RTX PRO 6000 BSE

## Ethical Considerations

NVIDIA believes Trustworthy AI is a shared responsibility and we have established policies and practices to enable development for a wide array of AI applications. Developers should work with their internal model team to ensure this model meets requirements for the relevant industry and use case and addresses unforeseen product misuse.

Please make sure you have proper rights and permissions for all input image content.

For more detailed information on ethical considerations for this model, please see the Model Card++ [Bias](./bias.md), [Explainability](./explainability.md), [Safety & Security](./safety.md), and [Privacy Subcards](./privacy.md).

Please report model quality, risk, security vulnerabilities or NVIDIA AI Concerns [here](https://www.nvidia.com/en-us/support/submit-security-vulnerability/).