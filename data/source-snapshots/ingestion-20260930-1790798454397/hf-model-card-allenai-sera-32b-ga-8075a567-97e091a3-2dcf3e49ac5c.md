---
license: apache-2.0
---

# SERA-32B-GA

**SERA-32B-GA** is the second model in Ai2's [Open Coding Agents](https://huggingface.co/collections/allenai/open-coding-agents) series. It is a state-of-the-art open-source coding agent that achieves **46.6%** on SWE-bench Verified, second among fully open source models, only weaker than SERA-32B.

- **Paper:** [https://allenai.org/papers/opencodingagents](https://allenai.org/papers/opencodingagents)
- **Code:** [https://github.com/allenai/SERA](https://github.com/allenai/SERA)
- **CLI:** [https://github.com/allenai/sera-cli](https://github.com/allenai/sera-cli) | [PyPI](https://pypi.org/project/ai2-sera-cli/)
- **Collection:** [https://huggingface.co/collections/allenai/open-coding-agents](https://huggingface.co/collections/allenai/open-coding-agents)
- **Dataset:** 16000 from [https://huggingface.co/datasets/allenai/Sera-4.5A-Lite-T2](https://huggingface.co/datasets/allenai/Sera-4.5A-Lite-T2)

## Model Variants

| Model | HuggingFace | Base | Teacher | SWE-bench Verified |
|-------|-------------|------|---------|-------------------|
| SERA-32B | [allenai/SERA-32B](https://huggingface.co/allenai/SERA-32B) | Qwen 3-32B | GLM-4.6 | 49.5% ± 1.9% |
| **SERA-32B-GA** | [allenai/SERA-32B-GA](https://huggingface.co/allenai/SERA-32B-GA) | Qwen 3-32B | GLM-4.5-Air | 46.6% ± 0.7% |
| SERA-8B | [allenai/SERA-8B](https://huggingface.co/allenai/SERA-8B) | Qwen 3-8B | GLM-4.6 | 31.7% ± 0.9% |
| SERA-8B-GA | [allenai/SERA-8B-GA](https://huggingface.co/allenai/SERA-8B-GA) | Qwen 3-8B | GLM-4.5-Air | 31.7% ± 0.4% |

All results evaluated at 32K context length. Standard deviations computed over 3 random seeds.

## Performance

### SWE-bench Verified (32K Context)

| Model | Type | Resolve Rate |
|-------|------|--------------|
| SkyRL-8B | Open-source | 9.4% |
| Nex-N1-8B | Open-source | 20.3% |
| **SERA-8B** | **Open-source** | **31.7%** |
| Qwen 3-32B (base) | Open-weight | 24.4% |
| SWE-smith | Open-source | 32.6% |
| SkyRL-Agent | Open-source | 39.4% |
| DeepSWE | Open-source | 42.2% |
| **SERA-32B** | **Open-source** | **49.5%** |
| Devstral-Small-2 (24B) | Open-weight | 50.0% |
| GLM-4.5-Air (110B) | Open-weight | 50.5% |

*Open-source: code, model weights, and data publicly available. Open-weight: model weights available but training data/code not fully released.*

## Quickstart

The easiest way to use SERA is with the `sera` CLI, which provides seamless integration with Claude Code:

```bash
# Install the CLI
uv tool install ai2-sera-cli

# Option 1: Deploy on Modal (recommended for trying out)
modal setup  # one-time setup
sera --modal

# Option 2: Use an existing endpoint
export SERA_API_KEY=<your_api_key>
sera --endpoint <endpoint_url>
```

The first run with `--modal` takes approximately 10 minutes to download the model (~65GB) and compile. Subsequent runs start in 1-2 minutes.

For more deployment options, see the [sera-cli documentation](https://github.com/allenai/sera-cli).

## Model Details

| | |
|---|---|
| **Developer** | Allen Institute for AI (Ai2) |
| **Authors** | Ethan Shen, Daniel Tormoen, Saurabh Shah, Ali Farhadi, Tim Dettmers |
| **Base Model** | Qwen 3-32B |
| **Teacher Model** | GLM-4.5-Air (110B) |
| **Model Type** | Coding agent / Software engineering agent |
| **Training Method** | Supervised fine-tuning on synthetic agent trajectories |
| **Context Length** | 32K tokens |
| **License** | Apache 2.0 |

### Training Configuration

| | |
|---|---|
| **Epochs** | 3 |
| **Learning Rate** | 1e-5 |
| **Weight Decay** | 0.01 |
| **Max Sequence Length** | 32,768 tokens |
| **Training Framework** | Axolotl |
| **Inference Framework** | vLLM |
| **Compute** | 40 GPU-days (~$2,000) |

## Training Data

SERA-32B-GA is trained on 16,000 synthetic coding agent trajectories generated using **Soft Verified Generation (SVG)**. SVG is a two-rollout pipeline:

1. **First rollout:** A teacher model makes a change to a codebase starting from a randomly selected function
2. **Synthetic PR:** The trajectory is converted into a pull request description
3. **Second rollout:** The teacher attempts to reproduce the change given only the PR description
4. **Soft verification:** Patches are compared using line-level recall (no test execution required)

This approach removes the need for test infrastructure and enables data generation from any repository.

- **Source Repositories:** 121 Python codebases
- **Teacher Model:** GLM-4.5-Air (110B)
- **Dataset:** [Coming soon]

## Intended Use

- **Automated software engineering:** Bug fixes, feature implementation, refactoring
- **Repository specialization:** Fine-tune on private codebases to create specialized coding agents (~8,000 trajectories / $1,300)
- **Research:** Studying coding agents, data generation methods, and agent behavior

## Limitations

- **SWE-bench training artifact:** The model was trained on SWE-bench-style tasks and may attempt to call a nonexistent `submit` tool when finished editing. The sera-cli proxy handles this automatically.
- **Evaluation scope:** Only validated on SWE-bench Verified (Python repositories). Performance on other languages or benchmarks is unknown.
- **Teacher bound:** Performance is largely bounded by the teacher model (GLM-4.5-Air) capability.
- **Statistical variance:** Results computed over 3 seeds. Effects smaller than 2-3% should be interpreted with caution.
- **Model-specific:** Experiments use Qwen 3 as the base model. Generalization to other model families is not validated.

## Bias, Risks, and Limitations

Like any language model without safety filtering, SERA can be prompted to generate harmful or insecure code. Users should be aware of the following risks:

- **Code security:** May generate code with security vulnerabilities (e.g., injection attacks, insecure defaults). All generated code should be reviewed before deployment.
- **Accuracy:** May produce incorrect or buggy code. Outputs should be tested and verified.
- **Inherited biases:** May reflect biases present in the Qwen 3-32B base model and GLM-4.5-Air teacher model.
- **Misuse potential:** Could potentially be used to generate malicious code or identify vulnerabilities for exploitation.

## Responsible Use

This model is intended for research and educational use. Users should adhere to Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use). Key principles include:

- Use the model for beneficial purposes
- Review and test all generated code before deployment
- Do not use to generate malicious software or exploit vulnerabilities
- Consider the potential impact of automated code generation in your context

## Hardware Requirements

| Configuration | GPU | Notes |
|--------------|-----|-------|
| Minimum | 1× 80GB GPU (A100, H100) | 32K context |
| Recommended | 1× H100 | Best performance |

Quantization (AWQ, GPTQ) can reduce memory requirements if needed.

## License

This model is licensed under **Apache 2.0**. It is intended for research and educational use and may be used commercially in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use).

## Citation

```bibtex
@misc{shen2026serasoftverifiedefficientrepository,
      title={SERA: Soft-Verified Efficient Repository Agents}, 
      author={Ethan Shen and Danny Tormoen and Saurabh Shah and Ali Farhadi and Tim Dettmers},
      year={2026},
      eprint={2601.20789},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2601.20789}, 
}
```

## Contact

- **Email:** ethans03@cs.washington.edu, dettmers@cmu.edu
- **Issues:** [GitHub Issues](https://github.com/allenai/SERA/issues)

SERA / Open Coding Agents  - Disclaimer Text

Bias, Risks, and Limitations
SERA-32B/SERA-8B is an open coding agent model released for research and educational purposes without any safety filtering or safety tuning. As a research artifact, this model is not suitable for real-world use without significant human oversight. Like other coding agents, this model may propagate biases present in training data or generate incorrect or insecure code. Security risks include prompt injection and data leakage. Always verify code outputs and manage context windows to avoid disclosing sensitive data or information.


Bias, Risks, and Limitations
Like any base language model or fine-tuned model without safety filtering, these models can easily be prompted by users to generate harmful and sensitive content. Such content may also be produced unintentionally, especially in cases involving bias, so we recommend that users consider the risks when applying this technology. Additionally, many statements from OLMo or any LLM are often inaccurate, so facts should be verified.
License
This model is licensed under Apache 2.0. It is intended for research and educational use in accordance with Ai2's Responsible Use Guidelines.