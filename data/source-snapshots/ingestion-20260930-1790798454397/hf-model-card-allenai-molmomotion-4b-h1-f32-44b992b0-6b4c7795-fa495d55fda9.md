---
library_name: transformers
license: apache-2.0
pipeline_tag: image-text-to-text
tags:
  - molmo-motion
  - trajectory-forecasting
  - 3d
  - vision-language
  - image-text-to-text
---

<div align="center">
  <img src="assets/logo.png" alt="MolmoMotion" width="1100">
</div>

# **MolmoMotion-4B-H1-F32**

MolmoMotion is a 4B vision-language model that **forecasts 3D point trajectories** under natural-language action instructions. Given a short RGB observation history, a set of user-specified 2D query points with their 3D history, and an action description, it predicts where those points move in 3D (camera frame, in meters) over a future horizon.

This checkpoint is the **autoregressive (AR)** variant with **history H=1** and **future horizon F=32**. Pick this variant when only a single query keyframe is available.

## Quick Links

- 📂 Models: [MolmoMotion collection](https://huggingface.co/collections/allenai/molmomotion)
- 📂 Dataset: [allenai/molmo-motion-1m](https://huggingface.co/datasets/allenai/molmo-motion-1m)
- 📊 Benchmark: [allenai/PointMotionBench](https://huggingface.co/datasets/allenai/PointMotionBench)
- 💻 Code: [allenai/molmo-motion](https://github.com/allenai/molmo-motion)
- 🎥 Blog Post: [MolmoMotion](https://allenai.org/blog/molmo-motion)
- 📄 Paper: coming soon

## Intended Use

MolmoMotion forecasts 3D point trajectories from RGB video, 2D query points, and a language action. Use it for trajectory-prediction / motion-forecasting research and as a starting point for downstream finetuning (e.g. the robot pick-and-place recipe in [`robotics/`](https://github.com/allenai/molmo-motion/tree/main/robotics)).

Pick the variant that matches your input:

| Model | History H | Future F | When to use |
|---|---:|---:|---|
| [MolmoMotion-4B-H3-F30](https://huggingface.co/allenai/MolmoMotion-4B-H3-F30) | 3 | 30 | Typical video use: 3 history frames, predict ~2 s at 15 fps. |
| [MolmoMotion-4B-H1-F32](https://huggingface.co/allenai/MolmoMotion-4B-H1-F32) | 1 | 32 | Only a single query keyframe is available. |

## Usage

Install the package, then load this checkpoint:

```bash
pip install git+https://github.com/allenai/molmo-motion.git
```

```python
import torch
from molmo_motion import MolmoMotion, MolmoMotionProcessor

CKPT = "allenai/MolmoMotion-4B-H1-F32"
processor = MolmoMotionProcessor.from_pretrained(CKPT)
model = MolmoMotion.from_pretrained(CKPT)
model._internal = model._internal.to(torch.bfloat16).cuda()  # 4B params
```

See [`examples/01_quickstart.py`](https://github.com/allenai/molmo-motion/blob/main/examples/01_quickstart.py) for a full forward pass (building inputs, `predict_trajectory`, and visualizing the predicted trajectory).

## Responsible Use

MolmoMotion is a research model that predicts point trajectories; it is intended for research and educational use in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use). Predicted trajectories are model estimates and should be validated before being used to drive any downstream actuated system.

## Disclaimer

MolmoMotion is trained on [MolmoMotion-1M](https://huggingface.co/datasets/allenai/molmo-motion-1m), which includes captions and trajectory annotations based on coordinates of objects in videos. The videos are provided by the owners of the datasets listed in [allenai/molmo-motion-1m](https://huggingface.co/datasets/allenai/molmo-motion-1m) and [allenai/PointMotionBench](https://huggingface.co/datasets/allenai/PointMotionBench), and are subject to their respective license terms and use restrictions. Users who access videos from these sources to reconstruct any portion of the training data are responsible for reviewing and confirming that their intended use complies with the terms and conditions.   

## Acknowledgement

We thank [Ropedia](https://huggingface.co/ropedia-ai) for providing videos from the [Xperience dataset](https://huggingface.co/datasets/ropedia-ai/xperience-10m) that were used in our research and development of MolmoMotion. The Xperience dataset is governed by Ropedia’s terms and conditions.

## Citation

```bibtex
@misc{zhang2026molmomotionforecastingpointtrajectories,
    title={MolmoMotion: Forecasting Point Trajectories in 3D with Language Instruction}, 
    author={Jianing Zhang and Chenhao Zheng and Yajun Yang and Max Argus and Rustin Soraki and Winson Han and Taira Anderson and Chun-Liang Li and Shuo Liu and Jiafei Duan and Zhongzheng Ren and Jieyu Zhang and Ranjay Krishna},
    year={2026},
    eprint={2606.18558},
    archivePrefix={arXiv},
    primaryClass={cs.CV},
    url={https://arxiv.org/abs/2606.18558}, 
}
```