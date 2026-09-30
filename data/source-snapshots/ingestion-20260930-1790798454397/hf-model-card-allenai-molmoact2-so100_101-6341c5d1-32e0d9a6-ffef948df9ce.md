---
library_name: transformers
tags:
  - molmoact2
  - robotics
  - image-text-to-text
  - so100
  - so101
---

<img src="assets/MolmoAct2.svg" alt="MolmoAct Logo" height="50">

# **MolmoAct2-SO100_101**

MolmoAct2 is an open vision-language-action model for robot control. It builds on Molmo2-ER and attaches a flow-matching continuous action expert that conditions on the VLM key-value cache through a per-layer connection.

This checkpoint is fine-tuned on the SO-100/101 mixture with absolute joint-pose control and annotated language instructions. It is intended for both further fine-tuning and SO-100/101 policy inference.

## Quick Links

- 📂 Models: [Models](https://huggingface.co/collections/allenai/molmoact2-models), [Finetuned Models](https://huggingface.co/collections/allenai/molmoact2-finetuned-models)
- 📂 Datasets: [MolmoAct2-BimanualYAM Dataset](https://huggingface.co/collections/allenai/molmoact2-datasets), [MolmoAct2 Datasets](https://huggingface.co/collections/allenai/molmoact2-datasets), [Molmo2-ER Datasets](https://huggingface.co/collections/allenai/molmo2-er-datasets)
- 📄 Paper: [arXiv:2605.02881](https://arxiv.org/abs/2605.02881)
- 💻 Code: [allenai/molmoact2](https://github.com/allenai/molmoact2)
- 🎥 Blog Post: [MolmoAct2](https://allenai.org/blog/molmoact2)

## Intended Use

Use this checkpoint for SO-100/101 inference or for further fine-tuning. Dataset normalization metadata is stored in `norm_stats.json`. pass `norm_tag="so100_so101_molmoact2"` at inference time.

Continuous action prediction is the intended and recommended inference mode. Discrete action prediction is exposed for parity and debugging, but we use continuous actions by default.

## Install

```bash
pip install torch transformers pillow numpy huggingface_hub
```

## Sample Input

This sample comes from `Beegbrain/pick_lemon_and_drop_in_bowl`, episode 0, frame 0. Camera order for this checkpoint does not matter. random camera order is acceptable.

| Realsense Top RGB | Realsense Side RGB |
| --- | --- |
| ![Sample realsense top RGB](assets/sample_realsense_top_rgb.png) | ![Sample realsense side RGB](assets/sample_realsense_side_rgb.png) |

```python
from huggingface_hub import hf_hub_download
from PIL import Image
import numpy as np

repo_id = "allenai/MolmoAct2-SO100_101"

top_rgb = Image.open(
    hf_hub_download(repo_id, "assets/sample_realsense_top_rgb.png")
).convert("RGB")
side_rgb = Image.open(
    hf_hub_download(repo_id, "assets/sample_realsense_side_rgb.png")
).convert("RGB")

task = "Move the arm towards the lemon, grasp it, lift it up, and drop it into the red bowl."
robot_state = np.array(
    [
        -0.52734375,
        189.140625,
        181.40625,
        60.64453125,
        -3.603515625,
        1.0971786975860596,
    ],
    dtype=np.float32,
)
```

## Continuous Actions

```python
import numpy as np
import torch
from huggingface_hub import hf_hub_download
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor

repo_id = "allenai/MolmoAct2-SO100_101"

top_rgb = Image.open(
    hf_hub_download(repo_id, "assets/sample_realsense_top_rgb.png")
).convert("RGB")
side_rgb = Image.open(
    hf_hub_download(repo_id, "assets/sample_realsense_side_rgb.png")
).convert("RGB")
task = "Move the arm towards the lemon, grasp it, lift it up, and drop it into the red bowl."
robot_state = np.array(
    [
        -0.52734375,
        189.140625,
        181.40625,
        60.64453125,
        -3.603515625,
        1.0971786975860596,
    ],
    dtype=np.float32,
)

processor = AutoProcessor.from_pretrained(repo_id, trust_remote_code=True)
model = AutoModelForImageTextToText.from_pretrained(
    repo_id,
    trust_remote_code=True,
    dtype=torch.float32,
).to("cuda").eval()

out = model.predict_action(
    processor=processor,
    images=[top_rgb, side_rgb],
    task=task,
    state=robot_state,
    norm_tag="so100_so101_molmoact2",
    inference_action_mode="continuous",
    enable_depth_reasoning=False,
    num_steps=10,
    normalize_language=True,
    enable_cuda_graph=True,
)

actions = out.actions
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


Images may be PIL images or RGB arrays. Camera order does not need to be fixed for this checkpoint. random camera order is acceptable. `state` is the raw robot state, and actions are returned in robot scale.

`normalize_language=True` is the default. It lowercases the task string and removes trailing sentence punctuation to match training preprocessing. Set it to `False` if you need to preserve the task text exactly.

`enable_cuda_graph=True` is the default. The first few calls can be slow because the model warms up and captures CUDA graphs. run several random warm-up calls before measuring deployment latency. `num_steps` controls the continuous flow solver and defaults to the checkpoint config value, 10.

Depth reasoning is disabled for this checkpoint. Calling `enable_depth_reasoning=True` will raise an error.

## Discrete Actions

Discrete action inference requires a caller-provided action tokenizer. It is not saved in this repository. Discrete mode decodes action tokens directly. the continuous action expert is not used.

```python
action_tokenizer = AutoProcessor.from_pretrained(
    "allenai/MolmoAct2-FAST-Tokenizer",
    trust_remote_code=True,
)

out = model.predict_action(
    processor=processor,
    images=[top_rgb, side_rgb],
    task=task,
    state=robot_state,
    norm_tag="so100_so101_molmoact2",
    inference_action_mode="discrete",
    action_tokenizer=action_tokenizer,
    enable_depth_reasoning=False,
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
