---
license: apache-2.0
datasets:
- allenai/open-instruct-cli-gym
base_model:
- Qwen/Qwen3.5-9B
---
![image](https://cdn-uploads.huggingface.co/production/uploads/62608fc2ffe8827cb1d89f9f/XMW9_q0GCubxzTOgdsb4K.png)
<p align="center">
  💻 <a href="https://github.com/hamishivi/tmax">Code</a> ·
  🤗 <a href="https://huggingface.co/collections/allenai/tmax">Models &amp; Data</a> ·
  📜 <a href="https://arxiv.org/abs/2606.23321">Paper</a> ·
  📓 <a href="https://wai-org.com/blog/tmax/">Blog</a>
</p>

> [!NOTE]
> For full information, go check out the Tmax paper [here](https://arxiv.org/abs/2606.23321).

# Qwen 3.5 9B - CLI-Gym

This is a model trained using DPPO on top of Qwen 3.5 9B for use as a terminal-agent.
This model was trained as an ablation on the CLI-Gym dataset.

This model is part of [a collection of terminal agents](https://huggingface.co/collections/allenai/tmax) in various sizes.

Additionally, we provide **model checkpoints** as branches of the repository.
The main model checkpoint is step 100 as this performed best on TBLite.

## Evaluation Results

| Model        | TB Lite | TB 2.1   | 
|--------------|---------|----------|
| [Qwen 3.5 9B](https://huggingface.co/Qwen/Qwen3.5-9B)  | 41.9 +/- 2.7 | 16.1 +/- 3.7 | 
| [Qwen 3.5 9B Endless](https://huggingface.co/allenai/qwen35-9b-endless)  | 52.6 ± 1.4 | 25.5 ± 1.4 | 
| [Qwen 3.5 9B CLI Gym](https://huggingface.co/allenai/qwen35-9b-cli-gym) (**this model**) | 50.7 ± 5.9 | 25.1 ± 1.4 | 
| [Qwen 3.5 9B TermiGen](https://huggingface.co/allenai/qwen35-9b-termigen)  | 49.4 ± 1.5 | 25.1 ± 1.9 | 
| [Qwen 3.5 9B Swe-Smith](https://huggingface.co/allenai/qwen35-9b-swesmith)  | 47.2 ± 2.2 | 21.0 ± 0.5 | 
| [Qwen 3.5 9B Terminal-Traj](https://huggingface.co/allenai/qwen35-9b-terminaltraj)  | 45.8 ± 2.7 | 18.0 ± 0.0 | 
| [Qwen 3.5 9B Open-thoughts](https://huggingface.co/allenai/qwen35-9b-openthoughts)  | 53.0 ± 0.7 | 25.1 ± 3.7 | 
| [Tmax 9B](https://huggingface.co/allenai/tmax-9b) | **57.2 ± 2.5** | **28.8 ± 3.7** | 


For details on evaluation methodology please check our paper. In general, we used a podman (docker) backend with default timeouts and custom harness similar to mini-swe-agent.


## Model Details

### Model Description

<!-- Provide a longer summary of what this model is. -->
- **Developed by:** Ai2
- **Language(s) (NLP):** English
- **License:** Apache 2.0
- **Finetuned from model:** Qwen 3.5 9B
- **Dataset:** [CLI-Gym](https://huggingface.co/datasets/LiberCoders/CLI-Gym)

### Hyperparameters

This model was trained using DPPO with the following hyperparameters:
- **base model**: [hamishivi/Qwen3.5-9B](https://huggingface.co/hamishivi/Qwen3.5-9B)
- **Max prompt tokens**: 2048
- **Max per-turn tokens**: 16384
- **Max overall tokens**: 65536
- **Pack length**: 67584
- **Per-device train batch size**: 1
- **Unique prompts per rollout**: 8
- **Samples per prompt rollout**: 32
- **Async steps**: 4
- **Max steps**: 64
- **Learning rate**: 1e-6
- **LR scheduler**: constant
- **Total training steps**: 500 steps (this checkpoint is from 200 steps of training, which performed best on TBLite)
- **Sampling Temperature**: 1.0
- **KL Beta**: 0.0
- **Loss fn**: DPPO
- **Divergence**: binary TV
- **TV threshold**: 0.1
- **Advantage normalization**: centered (no division by stdev)
- **FP32 LM head**: true

For more details on training, please see [our codebase](https://github.com/hamishivi/tmax).

## License

This model is licensed under Apache 2.0. It is intended for research and educational use in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use). 

## Citation

If you use our model or data, please cite our paper:
```
@misc{ivison2026tmaxsimplerecipeterminal,
      title={Tmax: A simple recipe for terminal agents}, 
      author={Hamish Ivison and Junjie Oscar Yin and Rulin Shao and Teng Xiao and Nathan Lambert and Hannaneh Hajishirzi},
      year={2026},
      eprint={2606.23321},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2606.23321}, 
}
```

