---
library_name: transformers
tags:
- robotics
- tokenizer
- action-tokenizer
---

# MolmoAct2-FAST Tokenizer

MolmoAct2-FAST Tokenizer is an action tokenizer for autoregressive vision-language-action models. It is a reimplementation of [physical-intelligence/fast](https://huggingface.co/physical-intelligence/fast) using fully open-sourced data.

The tokenizer turns robot action chunks into compact discrete action tokens and can decode those tokens back into continuous action chunks. This makes it useful for training policies that predict robot actions as token sequences.

## Installation

Install the Hugging Face `transformers` package plus `scipy`, which is used for the DCT-based action transform.

```bash
pip install transformers scipy numpy
```

## Load the Tokenizer

This repository provides a custom `AutoProcessor`, so `trust_remote_code=True` is required.

```python
from transformers import AutoProcessor

tokenizer = AutoProcessor.from_pretrained(
    "allenai/MolmoAct2-FAST-Tokenizer",
    trust_remote_code=True,
)
```

## Encode and Decode Actions

Use the tokenizer on 1-second robot action chunks that have been normalized consistently, typically to approximately `[-1, 1]`. Inputs may be a single action chunk with shape `[time_horizon, action_dim]` or a batch with shape `[batch, time_horizon, action_dim]`.

```python
import numpy as np
from transformers import AutoProcessor

tokenizer = AutoProcessor.from_pretrained(
    "allenai/MolmoAct2-FAST-Tokenizer",
    trust_remote_code=True,
)

# Example batch: 256 chunks, 50 timesteps per chunk, 14 action dimensions.
action_data = np.random.uniform(-1, 1, size=(256, 50, 14)).astype(np.float32)

tokens = tokenizer(action_data)
decoded_actions = tokenizer.decode(tokens)

print(len(tokens))
print(decoded_actions.shape)
```

During decoding, the processor needs to know the original time horizon and action dimension. If `decode()` is called after tokenizing a chunk, those dimensions are cached automatically. If you decode tokens in a separate process or before an encode call, pass the dimensions explicitly.

```python
decoded_actions = tokenizer.decode(tokens, time_horizon=50, action_dim=14)
```

## Train a Custom Action Tokenizer

You can train a new action tokenizer from your own action chunks with `.fit()`. Each chunk should be an array shaped `[time_horizon, action_dim]`; chunks may be passed as a list or as a batch array.

```python
import numpy as np
from transformers import AutoProcessor

base_tokenizer = AutoProcessor.from_pretrained(
    "allenai/MolmoAct2-FAST-Tokenizer",
    trust_remote_code=True,
)

training_chunks = np.random.uniform(-1, 1, size=(4000, 50, 14)).astype(np.float32)

custom_tokenizer = base_tokenizer.fit(
    training_chunks,
    vocab_size=2048,
    time_horizon=50,
    action_dim=14,
)

custom_tokenizer.save_pretrained("./my-fast-tokenizer")
# custom_tokenizer.push_to_hub("your-org/my-fast-tokenizer")
```

For best results, use the same action normalization when training, encoding, decoding, and evaluating decoded actions.

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
