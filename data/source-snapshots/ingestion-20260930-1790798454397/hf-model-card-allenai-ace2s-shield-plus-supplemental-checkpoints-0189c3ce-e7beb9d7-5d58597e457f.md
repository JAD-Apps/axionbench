---
license: apache-2.0
library_name: fme
---

<img src="ACE-logo.png" alt="Logo for the ACE Project" style="width: auto; height: 50px;">

# ACE2S-SHiELD+ supplemental checkpoints

This repository contains a collection of checkpoints associated with
supplemental models trained and referenced in the 
[ACE2S-SHiELD+ manuscript](https://arxiv.org/abs/2606.07928). These checkpoints 
may be useful for certain research purposes, but **for almost all cases we 
recommend using the ACE2S-SHiELD+ checkpoint from 
[this repository](https://huggingface.co/allenai/ACE2S-SHiELD-plus)**, which 
contains the model featured in the manuscript, which will likely produce the 
best results.

The models here were trained for ablation experiments and/or with alternative 
random seeds. The ablation experiments aimed to separate the impacts of 
including random CO<sub>2</sub> data in training and imposing energy 
conservation. Accordingly models with four different configurations are included
in separate subdirectories, which are described in the table below. For the 
technical details regarding what these different configuration options mean, 
please see discussion in the manuscript.

| Subdirectory                    | Description                                                 | Best inference seed |
|---------------------------------|-------------------------------------------------------------|---------------------|
| `ace2s_shield_plus_no_RC_no_EC` | Without random CO<sub>2</sub> data or energy conservation   | `rs0_ckpt.tar`      |
| `ace2s_shield_plus_no_RC`       | Without random CO<sub>2</sub> data with energy conservation | `rs0_ckpt.tar`      |
| `ace2s_shield_plus_no_EC`       | With random CO<sub>2</sub> data without energy conservation | `rs1_ckpt.tar`      |
| `ace2s_shield_plus`             | With random CO<sub>2</sub> data and energy conservation     | `rs0_ckpt.tar`*     |

Two models with different random seeds were trained for each configuration. 
Within each subdirectory they are labeled `rs0_ckpt.tar` and `rs1_ckpt.tar`. For
each model, the checkpoint was chosen from the epoch with best inline inference
skill. In the manuscript, unless results from both seeds are shown, for visual 
clarity results from the model with best inline inference skill for the 
particular configuration are used, which is denoted in the table above. In all 
cases, inline inference consisted of an ensemble of simulations in 1x, 
2x, and 4xCO<sub>2</sub> equilibrium climates, and the error was computed based
on the approach described in 
[Watt-Meyer et al. (2025)](https://www.nature.com/articles/s41612-025-01090-0).

*This is the checkpoint featured in the main 
[ACE2S-SHiELD-plus repository](https://huggingface.co/allenai/ACE2S-SHiELD-plus). 
Therefore it is not included in this repository.

## License

These models are licensed under Apache 2.0. They are intended for research and
educational use in accordance with Ai2’s
[Responsible Use Guidelines](https://allenai.org/responsible-use).
