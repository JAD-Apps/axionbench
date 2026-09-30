---
library_name: transformers
tags:
  - molmoact2
  - robotics
  - image-text-to-text
---

<img src="assets/MolmoAct2.svg" alt="MolmoAct Logo" style="width: auto; height: 50px;">

# **MolmoAct2-Pretrain**

MolmoAct2-Pretrain adapts the Molmo2-ER vision-language backbone into a discrete autoregressive robot policy while keeping the Molmo2 token interface. Robot state is represented with discrete state tokens, and future one-second actions are represented with OpenFAST action tokens.

This checkpoint is the pre-trained VLA backbone before the continuous flow-matching action expert is attached. It is intended for further post-training or fine-tuning, not direct continuous-control inference.

## Quick Links

- 📂 Models: [Models](https://huggingface.co/collections/allenai/molmoact2-models), [Finetuned Models](https://huggingface.co/collections/allenai/molmoact2-finetuned-models)
- 📂 Datasets: [MolmoAct2-BimanualYAM Dataset](https://huggingface.co/collections/allenai/molmoact2-datasets), [MolmoAct2 Datasets](https://huggingface.co/collections/allenai/molmoact2-datasets), [Molmo2-ER Datasets](https://huggingface.co/collections/allenai/molmo2-er-datasets)
- 📄 Paper: [arXiv:2605.02881](https://arxiv.org/abs/2605.02881)
- 💻 Code: [allenai/molmoact2](https://github.com/allenai/molmoact2)
- 🎥 Blog Post: [MolmoAct2](https://allenai.org/blog/molmoact2)

## Intended Use

Use this checkpoint for further MolmoAct2 training stages. It was converted with `add_action_expert=false`, so `predict_action(...)` is intentionally unavailable. Standard Transformers generation can still be used for VLM-style behavior with `trust_remote_code=True`.

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
