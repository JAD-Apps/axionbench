---
license: apache-2.0
---

This is a tiny Jamba reward model used for development, debugging and experimentation over the Jamba architecture.

It has 319M parameters (instead of 52B in [Jamba 1.5 Mini](https://huggingface.co/ai21labs/AI21-Jamba-1.5-Mini) (and [Jamba v0.1](https://huggingface.co/ai21labs/Jamba-v0.1)) and 398B in [Jamba 1.5 Large](https://huggingface.co/ai21labs/AI21-Jamba-1.5-Large)),
and was trained on ~40B tokens.

This model was created for unit testing purposes, by turning the first three rows of Jamba-tiny-dev's LM Head into a 3-attribute reward head. The bias was set to [1000, -1000, 0], so the outputs will be in that ballpark. Due to the way it was created, this model does not aim to provide value as a reward model.

