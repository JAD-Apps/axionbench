---
language:
- en
library_name: lerobot
pipeline_tag: robotics
tags:
- vision-language-action
- imitation-learning
- robotics
- lerobot
- molmoact2
- libero
inference: false
datasets:
- allenai/MolmoAct2-LIBERO-Dataset
license: apache-2.0
---

# MolmoAct2-LIBERO (LeRobot)

This MolmoAct2 checkpoint is the LeRobot version of MolmoAct2-LIBERO, fine-tuned and evaluated on LIBERO tasks.

This checkpoint was fine-tuned from `allenai/MolmoAct2-LIBERO` for an additional
10k steps on `allenai/MolmoAct2-LIBERO-Dataset` with per-GPU batch size 32 on 8
H100 GPUs.

**Original paper:** MolmoAct2: Action Reasoning Models for Real-world Deployment  
**Reference implementation:** https://github.com/allenai/molmoact2  
**LeRobot policy:** `lerobot.policies.molmoact2`

## Model Description

- **Inputs:** multi-view RGB images, robot state, and language instruction
- **Outputs:** continuous robot actions for LIBERO
- **Training objective:** flow matching and discrete action-token losses
- **Action representation:** continuous inference from the flow-matching action expert
- **Base checkpoint:** `allenai/MolmoAct2-LIBERO`
- **Fine-tuning dataset:** `allenai/MolmoAct2-LIBERO-Dataset`
- **Intended use:** LeRobot checkpoint for LIBERO evaluation and as a starting
  point for fine-tuning MolmoAct2 on related robot datasets

This LeRobot checkpoint restores the policy config, model weights, preprocessor,
postprocessor, and normalization statistics through `policy.path`.

## Results

| Benchmark      | LeRobot Implementation | MolmoAct2 Original |
| -------------- | ---------------------: | -----------------: |
| LIBERO Spatial |                  98.4% |              97.8% |
| LIBERO Object  |                 100.0% |             100.0% |
| LIBERO Goal    |                  98.0% |              97.8% |
| LIBERO 10      |                  96.6% |              93.2% |
| Average        |                 98.25% |             97.20% |

These results use continuous action inference with per-episode seeding.

## Quick Start

### Installation

Install a LeRobot version that includes the MolmoAct2 policy:

```bash
pip install "lerobot[molmoact2,libero] @ git+https://github.com/huggingface/lerobot.git"
```

For full LeRobot installation details, see the official documentation:
https://huggingface.co/docs/lerobot/installation

### Load Model and Run `select_action`

```python
import torch
from lerobot.datasets.lerobot_dataset import LeRobotDataset
from lerobot.policies.factory import make_pre_post_processors
from lerobot.policies.molmoact2 import MolmoAct2Policy

model_id = "allenai/MolmoAct2-LIBERO-LeRobot"
dataset_id = "allenai/MolmoAct2-LIBERO-Dataset"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

policy = MolmoAct2Policy.from_pretrained(model_id).to(device).eval()

preprocess, postprocess = make_pre_post_processors(
    policy.config,
    model_id,
    preprocessor_overrides={"device_processor": {"device": str(device)}},
)

dataset = LeRobotDataset(dataset_id)
frame = dict(dataset[0])

batch = preprocess(frame)
with torch.inference_mode():
    action = policy.select_action(batch, inference_action_mode="continuous")
    action = postprocess(action)
```

## Training Step

For fine-tuning, MolmoAct2 follows the standard LeRobot policy API. A training
batch should include the observation keys, state, task text, and action chunk
prepared by the LeRobot dataloader and MolmoAct2 preprocessor.

```python
policy.train()
batch = preprocess(dict(dataset[0]))

loss, metrics = policy.forward(batch)
loss.backward()
```

Use `lerobot-train` for full training loops, checkpointing, logging, and
distributed execution.

## Fine-Tuning

To continue fine-tuning this LeRobot checkpoint on LIBERO:

```bash
accelerate launch \
  --num_processes=8 \
  --mixed_precision=bf16 \
  -m lerobot.scripts.lerobot_train \
  --dataset.repo_id=allenai/MolmoAct2-LIBERO-Dataset \
  --dataset.root=/path/to/lerobot/data/allenai/MolmoAct2-LIBERO-Dataset \
  --dataset.video_backend=pyav \
  --dataset.image_transforms.enable=true \
  --policy.path=allenai/MolmoAct2-LIBERO-LeRobot \
  --policy.device=cuda \
  --policy.action_mode=both \
  --policy.chunk_size=10 \
  --policy.n_action_steps=10 \
  --policy.model_dtype=bfloat16 \
  --policy.num_flow_timesteps=8 \
  --policy.gradient_checkpointing=true \
  --wandb.enable=false \
  --job_name=<job_name> \
  --output_dir=outputs/<job_name> \
  --steps=10000 \
  --batch_size=32 \
  --num_workers=4 \
  --log_freq=20 \
  --eval_freq=-1 \
  --save_checkpoint=true \
  --save_freq=2000
```

Common MolmoAct2 options:

- `policy.action_mode=both` trains continuous flow matching and discrete action tokens.
- `policy.inference_action_mode=continuous` selects the continuous action head for rollout.
- `policy.chunk_size=10` is the LIBERO action horizon used by this checkpoint.
- `policy.n_action_steps=10` consumes the full predicted LIBERO action chunk.
- `policy.model_dtype=bfloat16` is recommended for GPU training.
- `policy.num_flow_timesteps=8` matches the MolmoAct2 fine-tuning setup.
- `policy.gradient_checkpointing=true` reduces activation memory.

When using `policy.path`, the saved LeRobot processor is restored from this
checkpoint. That means LIBERO-specific prompt and input settings such as
`setup_type`, `control_mode`, `image_keys`, and normalization statistics are
loaded from the checkpoint rather than supplied in the command above. This is
the recommended path for continuing LIBERO fine-tuning.

Set `--wandb.enable=true` and provide `--wandb.entity` and `--wandb.project` if
you want to log the run to Weights & Biases.

For a different robot setup, control space, or camera layout, initialize from an
original MolmoAct2 checkpoint with `policy.checkpoint_path` and explicitly set
the corresponding policy fields while creating a new LeRobot checkpoint.

## Evaluate in Simulation

You can evaluate this checkpoint in LIBERO with `lerobot-eval`:

```bash
export MUJOCO_GL=egl
export PYOPENGL_PLATFORM=egl
export OMP_NUM_THREADS=1
export MKL_NUM_THREADS=1

lerobot-eval \
  --policy.path=allenai/MolmoAct2-LIBERO-LeRobot \
  --policy.inference_action_mode=continuous \
  --policy.model_dtype=bfloat16 \
  --policy.use_amp=true \
  --policy.enable_inference_cuda_graph=true \
  --policy.device=cuda \
  --policy.per_episode_seed=true \
  --policy.eval_seed=1000 \
  --env.type=libero \
  --env.task=libero_10,libero_goal,libero_object,libero_spatial \
  --env.camera_name_mapping='{"agentview_image":"image","robot0_eye_in_hand_image":"wrist_image"}' \
  --eval.batch_size=1 \
  --eval.n_episodes=50 \
  --seed=1000
```

## Notes

- This checkpoint is saved in LeRobot format. Use `policy.path`, not
  `policy.checkpoint_path`, when you want to evaluate it or continue LIBERO
  fine-tuning with the saved processor.
- The reported LIBERO numbers use continuous inference.
- The checkpoint was trained with `policy.action_mode=both`, so discrete action
  inference is also supported by the model, but the reported LIBERO results use
  `policy.inference_action_mode=continuous`.
- Released MolmoAct2 checkpoints have a fixed maximum action dimension of 32.
  Padded dimensions are masked in the flow loss.

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

## License

This model is licensed under Apache 2.0. It is intended for research and
educational use in accordance with Ai2's Responsible Use Guidelines:
https://allenai.org/responsible-use
