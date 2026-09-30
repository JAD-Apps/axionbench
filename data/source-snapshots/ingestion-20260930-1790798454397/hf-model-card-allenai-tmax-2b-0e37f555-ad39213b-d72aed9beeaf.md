---
license: apache-2.0
datasets:
- allenai/tmax-15k-open-instruct
base_model:
- Qwen/Qwen3.5-2B
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

# TMax 2B

TMax 2B is a model trained using DPPO on top of Qwen 3.5 2B for use as a terminal-agent.
It achieves roughly 4% on Terminal Bench 2.0 after 100 steps of RL training.

![image](https://cdn-uploads.huggingface.co/production/uploads/62608fc2ffe8827cb1d89f9f/4y85TkfC00SjDhW5Kk7FI.png)


This model is part of [a collection of terminal agents](https://huggingface.co/collections/allenai/tmax) in various sizes.

Additionally, we provide **model checkpoints** as branches of the repository.
The main model checkpoint is step 100 as this performed best on TBLite.

## Evaluation Results

| Model        | TB Lite | TB 2.1   | TB 2.0 (daytona) |
|--------------|---------|----------|------------------|
| [Qwen 3.5 2B](https://huggingface.co/Qwen/Qwen3.5-2B)  | 5.71 +/- 1.6 | 1.9 +/- 1.4 | 2.3 +/- 1.0|
| [Tmax 2B](https://huggingface.co/allenai/tmax-2b)      | **11.8 +/- 1.4** | **4.2 +/- 1.2** | **2.9 +/- 0.6** |
| [Qwen 3.5 4B](https://huggingface.co/Qwen/Qwen3.5-4B)  | 31.8 +/- 3.8 | ? | 16.6 +/- 1.7 |
| [Tmax 4B](https://huggingface.co/allenai/tmax-4b)  **(this model!)**    | **42.6 +/- 1.5** | **19.9 +/- 1.1** | **18.9 +/- 1.9** |
| [Qwen 3.5 9B](https://huggingface.co/Qwen/Qwen3.5-9B)  | 41.9 +/- 2.7 | 16.1 +/- 3.7 | 21.1 +/- 2.6 |
| [Tmax 9B](https://huggingface.co/allenai/tmax-9b) | **57.2 +/- 2.5** | **28.8 +/- 3.7** | **27.2 +/- 1.5** |
| [Qwen 3.6 27B](https://huggingface.co/Qwen/Qwen3.6-27B) | **70.8 +/- 2.1** | 40.5 +/- 2.4 | 39.6 +/- 2.1 |
| [Tmax 27B](https://huggingface.co/allenai/tmax-27b)     | 68.6 +/- 4.7 |  **44.9 +/- 1.8** | **42.7 +/- 0.7** |



For details on evaluation methodology please check our paper. In general, we used a podman (docker) backend with default timeouts and custom harness similar to mini-swe-agent.
For the 'daytona' runs, we used the daytona backend.
For Lite/2.1, we show mean and standard error over 3 runs. For daytona, we show it over 5 runs.

## Model Details

### Model Description

<!-- Provide a longer summary of what this model is. -->
- **Developed by:** Ai2
- **Language(s) (NLP):** English
- **License:** Apache 2.0
- **Finetuned from model [optional]:** Qwen 3.5 2B
- **Dataset:** [TMax-15k](https://huggingface.co/datasets/allenai/tmax-15k-open-instruct)


### Use

To use this model, we recommend serving with vllm (or your inference framework of choice) with:
```bash
uvx vllm==0.19.1 serve allenai/tmax-2b \
  --served-model-name tmax-2b \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --port 8008 \
  --max-model-len 65536 \
  --tensor-parallel-size 8 \
  --language_model_only
```

Make sure to set `language_model_only` as we removed the vision head during training.

For more details on evaluation, please see [our codebase](https://github.com/hamishivi/tmax).

### Hyperparameters

This model was trained using DPPO with the following hyperparameters:
- **base model**: [hamishivi/Qwen3.5-2B](https://huggingface.co/hamishivi/Qwen3.5-2B)
- **Dataset**: [tmax 15K](https://huggingface.co/datasets/allenai/tmax-15k-open-instruct)
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

