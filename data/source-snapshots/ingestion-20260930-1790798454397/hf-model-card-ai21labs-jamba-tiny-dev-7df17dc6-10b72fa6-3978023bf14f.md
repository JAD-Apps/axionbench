---
license: apache-2.0
---

This is a tiny Jamba model used for development, debugging and experimentation over the Jamba architecture.

It has 319M parameters (instead of 52B in [Jamba 1.5 Mini](https://huggingface.co/ai21labs/AI21-Jamba-1.5-Mini) (and [Jamba v0.1](https://huggingface.co/ai21labs/Jamba-v0.1)) and 398B in [Jamba 1.5 Large](https://huggingface.co/ai21labs/AI21-Jamba-1.5-Large)),
and was trained on ~40B tokens.

It is great for use in unittests since it is a small model (doesn't take long to download) that has valid and non-random outputs. Yet, **it did not undergo extensive training and should not be expected to generate high-quality text**.
