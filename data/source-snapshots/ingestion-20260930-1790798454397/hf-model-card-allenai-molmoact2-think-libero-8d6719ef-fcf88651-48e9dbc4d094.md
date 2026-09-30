---
library_name: transformers
tags:
  - molmoact2
  - robotics
  - image-text-to-text
  - depth-reasoning
  - libero
---

<img src="assets/MolmoAct2-Think.svg" alt="MolmoAct Think Logo" height="50">

# **MolmoAct2-Think-LIBERO**

MolmoAct2-Think extends MolmoAct2 with depth-token reasoning. It predicts compact 10 x 10 depth codes before acting, then conditions the continuous action expert on the prompt, image observations, state tokens, and generated depth prefix.

This checkpoint is fine-tuned on the full LIBERO training mixture with depth-and-action examples and a learned per-layer depth gate. It is intended for both further fine-tuning and LIBERO policy inference with depth reasoning.

## Quick Links

- 📂 Models: [Models](https://huggingface.co/collections/allenai/molmoact2-models), [Finetuned Models](https://huggingface.co/collections/allenai/molmoact2-finetuned-models)
- 📂 Datasets: [MolmoAct2-BimanualYAM Dataset](https://huggingface.co/collections/allenai/molmoact2-datasets), [MolmoAct2 Datasets](https://huggingface.co/collections/allenai/molmoact2-datasets), [Molmo2-ER Datasets](https://huggingface.co/collections/allenai/molmo2-er-datasets)
- 📄 Paper: [arXiv:2605.02881](https://arxiv.org/abs/2605.02881)
- 💻 Code: [allenai/molmoact2](https://github.com/allenai/molmoact2)
- 🎥 Blog Post: [MolmoAct2](https://allenai.org/blog/molmoact2)

## Intended Use

Use this checkpoint for LIBERO inference or for further fine-tuning with depth reasoning. Dataset normalization metadata is stored in `norm_stats.json`. pass `norm_tag="libero"` at inference time.

For this checkpoint, use depth reasoning and adaptive depth by default: pass `enable_depth_reasoning=True` and `enable_adaptive_depth=True`. Continuous action prediction is the intended and recommended inference mode.

## Install

```bash
pip install torch transformers pillow numpy huggingface_hub
```

## Sample Input

This sample comes from `libero_10`, episode 0, frame 0. The LIBERO camera order is front/agent view followed by wrist view.

| Agentview RGB | Wrist RGB |
| --- | --- |
| ![Sample agentview RGB](assets/sample_agentview_rgb.png) | ![Sample wrist RGB](assets/sample_wrist_rgb.png) |

```python
from huggingface_hub import hf_hub_download
from PIL import Image
import numpy as np

repo_id = "allenai/MolmoAct2-Think-LIBERO"

agentview_rgb = Image.open(
    hf_hub_download(repo_id, "assets/sample_agentview_rgb.png")
).convert("RGB")
wrist_rgb = Image.open(
    hf_hub_download(repo_id, "assets/sample_wrist_rgb.png")
).convert("RGB")

task = "put the white mug on the left plate and put the yellow and white mug on the right plate"
robot_state = np.array(
    [
        -0.05338004603981972,
        0.007029631175100803,
        0.6783280968666077,
        3.1407692432403564,
        0.0017593271331861615,
        -0.08994418382644653,
        0.03878866136074066,
        -0.03878721222281456,
    ],
    dtype=np.float32,
)
```

## Continuous Actions With Adaptive Depth

```python
import numpy as np
import torch
from huggingface_hub import hf_hub_download
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor

repo_id = "allenai/MolmoAct2-Think-LIBERO"

agentview_rgb = Image.open(
    hf_hub_download(repo_id, "assets/sample_agentview_rgb.png")
).convert("RGB")
wrist_rgb = Image.open(
    hf_hub_download(repo_id, "assets/sample_wrist_rgb.png")
).convert("RGB")
task = "put the white mug on the left plate and put the yellow and white mug on the right plate"
robot_state = np.array(
    [
        -0.05338004603981972,
        0.007029631175100803,
        0.6783280968666077,
        3.1407692432403564,
        0.0017593271331861615,
        -0.08994418382644653,
        0.03878866136074066,
        -0.03878721222281456,
    ],
    dtype=np.float32,
)

processor = AutoProcessor.from_pretrained(repo_id, trust_remote_code=True)
model = AutoModelForImageTextToText.from_pretrained(
    repo_id,
    trust_remote_code=True,
    dtype=torch.float32,
).to("cuda").eval()

depth_cache = None

out = model.predict_action(
    processor=processor,
    images=[agentview_rgb, wrist_rgb],
    task=task,
    state=robot_state,
    norm_tag="libero",
    inference_action_mode="continuous",
    enable_depth_reasoning=True,
    enable_adaptive_depth=True,
    depth_cache=depth_cache,
    num_steps=10,
    normalize_language=True,
    enable_cuda_graph=True,
)

actions = out.actions
depth_cache = out.depth_cache
depth_bins = out.depth_bins
```

MolmoAct2 was trained with mixed precision. For our reported experiments, we ran inference in `float32`. This path uses the most GPU memory: roughly 26GB with CUDA graph enabled, or around 24GB without CUDA graph.

If you have a GPU with less memory, you can run inference with `bfloat16` instead:

```python
model = AutoModelForImageTextToText.from_pretrained(
    repo_id,
    trust_remote_code=True,
    dtype=torch.bfloat16,
).to("cuda").eval()

with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
    out = model.predict_action(...)
```

Using `bfloat16` is much more memory efficient and can run under 16GB of GPU memory in our tests. It usually does not hurt performance much.


`images` should preserve camera order, for example `[agentview_rgb, wrist_rgb]`. Images may be PIL images or RGB arrays. `state` is the raw robot state, and actions are returned in robot scale.

Adaptive depth is caller-owned. Pass the returned `depth_cache` into the next call for the same environment stream. With adaptive depth enabled, the model reuses unchanged depth cells from the cache and only regenerates changed cells. with `enable_adaptive_depth=False`, it runs depth mode 1 and regenerates the full depth prefix each call. In both cases, depth generation stops at `<depth_end>` before action generation.

`normalize_language=True` is the default. It lowercases the task string and removes trailing sentence punctuation to match training preprocessing. Set it to `False` if you need to preserve the task text exactly.

`enable_cuda_graph=True` is the default. The first few calls can be slow because the model warms up and captures CUDA graphs. run several random warm-up calls before measuring deployment latency. `num_steps` controls the continuous flow solver and defaults to the checkpoint config value, 10.

## Discrete Actions With Depth

Discrete action inference requires a caller-provided action tokenizer. It is not saved in this repository. Discrete mode decodes action tokens directly. the continuous action expert is not used.

```python
action_tokenizer = AutoProcessor.from_pretrained(
    "allenai/MolmoAct2-FAST-Tokenizer",
    trust_remote_code=True,
)

out = model.predict_action(
    processor=processor,
    images=[agentview_rgb, wrist_rgb],
    task=task,
    state=robot_state,
    norm_tag="libero",
    inference_action_mode="discrete",
    action_tokenizer=action_tokenizer,
    enable_depth_reasoning=True,
    enable_adaptive_depth=True,
    depth_cache=depth_cache,
)
```

## Model and Hardware Safety

MolmoAct2 generate robot actions from visual observations and language instructions, but their behavior may vary across embodiments, environments, and hardware configurations. Users should carefully validate model outputs before deployment, especially when operating physical robots or other actuated systems. Where possible, actions should be monitored through interpretable intermediate outputs (adaptive depth map), simulation rollouts, action limits, or other safety checks before execution on hardware. The model’s action space should be bounded by the training data, robot controller limits, and task-specific safety constraints, including limits on speed, workspace, torque, and contact force. Users should follow the hardware manufacturer’s safety guidelines, use appropriate emergency-stop mechanisms, and operate the system only in a safely configured environment with human supervision.

## Citation

```bibtex
@misc{fang2026molmoact2actionreasoningmodels,
      title={MolmoAct2: Action Reasoning Models for Real-world Deployment}, 
      author={Haoquan Fang and Jiafei Duan and Donovan Clay and Sam Wang and Shuo Liu and Weikai Huang and Xiang Fan and Wei-Chuan Tsai and Shirui Chen and Yi Ru Wang and Shanli Xing and Jaemin Cho and Jae Sung Park and Ainaz Eftekhar and Peter Sushko and Karen Farley and Angad Wadhwa and Cole Harrison and Winson Han and Ying-Chun Lee and Eli VanderBilt and Rose Hendrix and Suveen Ellawela and Lucas Ngoo and Joyce Chai and Zhongzheng Ren and Ali Farhadi and Dieter Fox and Ranjay Krishna},
      year={2026},
      eprint={2605.02881},
      archivePrefix={arXiv},
      primaryClass={cs.RO},
      url={https://arxiv.org/abs/2605.02881}, 
}
```
