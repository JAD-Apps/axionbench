---
library_name: transformers
license: llama3
base_model: meta-llama/Llama-3.3-70B-Instruct
tags:
- generated_from_trainer
model-index:
- name: L3.3-70B-Euryale-v2.3
  results: []
---

![eury](https://huggingface.co/Sao10K/L3.3-70B-Euryale-v2.3/resolve/main/Eury.png)

# L3.3-70B-Euryale-v2.3

A direct replacement / successor to Euryale v2.2, not Hanami-x1, though it is slightly better than them in my opinion.

This is entirely trained on top of Llama 3.3 Instruct, not Lora-extracted which is all the rage.

Recommended Model Settings | *Look, I just use these, they work fine enough. I don't even know how DRY or other meme samplers work. Your system prompt matters more anyway.*
```
Prompt Format: Llama-3-Instruct
Temperature: 1.1
min_p: 0.1
```


Future-ish plans:
<br>\- Further refine the Datasets used for quality, more secondary chats, more creative-related domains.
<br>\- Work on my other incomplete projects. About half a dozen on the backburner for a while now.

Special thanks to my wallet for funding this, my juniors who share a single braincell between them, and my current national service. 

Have a good day, don't shit yourselves friends. I had a nasty call today.

Also sorry for the inactivity. Life was in the way. It still is, just less so, for now. Burnout is a thing, huh?

https://sao10k.carrd.co/ for contact.

---

[<img src="https://raw.githubusercontent.com/axolotl-ai-cloud/axolotl/main/image/axolotl-badge-web.png" alt="Built with Axolotl" width="200" height="32"/>](https://github.com/axolotl-ai-cloud/axolotl)
<details><summary>See axolotl config</summary>

axolotl version: `0.5.2`
```yaml
base_model: meta-llama/Llama-3.3-70B-Instruct
model_type: AutoModelForCausalLM
tokenizer_type: AutoTokenizer

load_in_8bit: false
load_in_4bit: false
strict: false
sequence_len: 16384
bf16: auto
fp16:
tf32: false
flash_attention: true

adapter: lora
lora_model_dir:
lora_r: 128
lora_alpha: 16
lora_dropout: 0.1
lora_target_linear: true
lora_fan_in_fan_out:
peft_use_rslora: true

# Data
dataset_prepared_path: last_run_prepared
datasets:
  - path: datasets/amoral-full-sys-prompt.json # Unalignment Data - Cleaned Up from Original, Split to its own file
    type: customllama3
  - path: datasets/mimi-superfix-RP-filtered-fixed.json # RP / Creative-Instruct Data
    type: customllama3
  - path: datasets/hespera-smartshuffle.json # Hesperus-v2-Instruct Data
    type: customllama3
warmup_steps: 15

plugins:
  - axolotl.integrations.liger.LigerPlugin
liger_rope: true
liger_rms_norm: true
liger_layer_norm: true
liger_glu_activation: true
liger_fused_linear_cross_entropy: true

# Iterations
num_epochs: 1

# Batching
gradient_accumulation_steps: 4
micro_batch_size: 1
gradient_checkpointing: "unsloth"

# Optimizer
optimizer: paged_ademamix_8bit
lr_scheduler: cosine
learning_rate: 0.000004
weight_decay: 0.1
max_grad_norm: 25.0

# Iterations
num_epochs: 1

# Misc
deepspeed: ./deepspeed_configs/zero3_bf16.json
```

</details><br>

---

```
Art by てぃあ
https://www.pixiv.net/en/users/724263
```