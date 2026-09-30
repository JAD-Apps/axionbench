---
license: apache-2.0
datasets:
- allenai/tmax-sft
base_model:
- Qwen/Qwen3-8B
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

# TMax 8B

TMax 8B is a model trained using SFT on top of Qwen 3 8B for use as a terminal-agent.
It was used as a base for the RL training of [Tmax 8B](https://huggingface.co/allenai/tmax-8b).

This model is part of [a collection of terminal agents](https://huggingface.co/collections/allenai/tmax) in various sizes.


## Evaluation Results

| Model        | TB Lite | TB 2.1   |
|--------------|---------|----------|
| [Qwen 3 8B](https://huggingface.co/Qwen/Qwen3-8B)    | 7.3 +/- 1.0 | 1.1 +/- 0.9 |
| [Tmax SFT 8B](https://huggingface.co/allenai/tmax-sft-8b) **(this model!)** | 11.5 +/- 0.1 | **6.0 +/- 1.4** |
| [Tmax 8B](https://huggingface.co/allenai/tmax-8b) | **17.7 +/- 1.9** | 5.2 +/- 2.3 |



For details on evaluation methodology please check our paper. In general, we used a podman (docker) backend with default timeouts and custom harness similar to mini-swe-agent.

## Model Details

### Model Description

<!-- Provide a longer summary of what this model is. -->
- **Developed by:** Ai2
- **Language(s) (NLP):** English
- **License:** Apache 2.0
- **Finetuned from model:** Qwen 3 8B
- **Dataset:** [TMax-15k](https://huggingface.co/datasets/allenai/tmax-15k-open-instruct)


### Use

To use this model, we recommend serving with vllm (or your inference framework of choice) with:
```bash
uvx vllm==0.19.1 serve allenai/tmax-8b \
  --served-model-name tmax-8b \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --port 8008 \
  --max-model-len 40960 \
  --tensor-parallel-size 8 \
  --language_model_only
```

Make sure to set `language_model_only` as we removed the vision head during training.

For more details on evaluation, please see [our codebase](https://github.com/hamishivi/tmax).

### Hyperparameters

This model was trained using SFT with the following hyperparameters:
- **base model**: [Qwen/Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B)
- **Dataset**: [tmax SFT](https://huggingface.co/datasets/allenai/tmax-sft)
- **Max overall tokens**: 32768
- **Global train batch size**: 128
- **Epochs**: 2
- **Learning rate**: 2e-5
- **LR scheduler**: 0.03% warmup, linear cooldown

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

