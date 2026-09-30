---
license: apache-2.0
language:
- en
tags:
- chat
pipeline_tag: text-generation
library_name: transformers
datasets:
- anthracite-org/c2_logs_32k_llama3_qwen2_v1.2
- anthracite-org/kalo-opus-instruct-22k-no-refusal
- lodrick-the-lafted/kalo-opus-instruct-3k-filtered
- anthracite-org/nopm_claude_writing_fixed
- anthracite-org/kalo_opus_misc_240827
- anthracite-org/kalo_misc_part2
---


![image/png](https://cdn-uploads.huggingface.co/production/uploads/658a46cbfb9c2bdfae75b3a6/ZmOOkB2QwItLmoqmnxNWO.png)


This is a series of models designed to replicate the prose quality of the Claude 3 models, specifically Sonnet and Opus.

experimental because trained on top of instruct; but turned out amazing; hence code named magnum-alter, the original model that kickstarted the v4 family

This model is fine-tuned on top of [Qwen2.5-72B-Instruct](https://huggingface.co/Qwen/Qwen2.5-72B-Instruct).

## Prompting
A typical input would look like this:

```py
<|im_start|>system
system prompt<|im_end|>
<|im_start|>user
Hi there!<|im_end|>
<|im_start|>assistant
Nice to meet you!<|im_end|>
<|im_start|>user
Can I ask a question?<|im_end|>
<|im_start|>assistant
```

## SillyTavern templates

Below are Instruct and Context templates for use within SillyTavern.

<details><summary>context template</summary>
  
```yaml
{
  "story_string": "<|im_start|>system\n{{#if system}}{{system}}\n{{/if}}{{#if wiBefore}}{{wiBefore}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if personality}}{{char}}'s personality: {{personality}}\n{{/if}}{{#if scenario}}Scenario: {{scenario}}\n{{/if}}{{#if wiAfter}}{{wiAfter}}\n{{/if}}{{#if persona}}{{persona}}\n{{/if}}{{trim}}<|im_end|>\n",
  "example_separator": "",
  "chat_start": "",
  "use_stop_strings": false,
  "allow_jailbreak": false,
  "always_force_name2": true,
  "trim_sentences": false,
  "include_newline": false,
  "single_line": false,
  "name": "Magnum ChatML"
}
```

</details><br>
<details><summary>instruct template</summary>
  
```yaml
{
  "system_prompt": "Currently, your role is {{char}}, described in detail below. As {{char}}, continue the narrative exchange with {{user}}.\n\n<Guidelines>\n• Maintain the character persona but allow it to evolve with the story.\n• Be creative and proactive. Drive the story forward, introducing plotlines and events when relevant.\n• All types of outputs are encouraged; respond accordingly to the narrative.\n• Include dialogues, actions, and thoughts in each response.\n• Utilize all five senses to describe scenarios within {{char}}'s dialogue.\n• Use emotional symbols such as "!" and "~" in appropriate contexts.\n• Incorporate onomatopoeia when suitable.\n• Allow time for {{user}} to respond with their own input, respecting their agency.\n• Act as secondary characters and NPCs as needed, and remove them when appropriate.\n• When prompted for an Out of Character [OOC:] reply, answer neutrally and in plaintext, not as {{char}}.\n</Guidelines>\n\n<Forbidden>\n• Using excessive literary embellishments and purple prose unless dictated by {{char}}'s persona.\n• Writing for, speaking, thinking, acting, or replying as {{user}} in your response.\n• Repetitive and monotonous outputs.\n• Positivity bias in your replies.\n• Being overly extreme or NSFW when the narrative context is inappropriate.\n</Forbidden>\n\nFollow the instructions in <Guidelines></Guidelines>, avoiding the items listed in <Forbidden></Forbidden>.",
  "input_sequence": "<|im_start|>user\n",
  "output_sequence": "<|im_start|>assistant\n",
  "last_output_sequence": "",
  "system_sequence": "<|im_start|>system\n",
  "stop_sequence": "<|im_end|>",
  "wrap": false,
  "macro": true,
  "names": true,
  "names_force_groups": true,
  "activation_regex": "",
  "system_sequence_prefix": "",
  "system_sequence_suffix": "",
  "first_output_sequence": "",
  "skip_examples": false,
  "output_suffix": "<|im_end|>\n",
  "input_suffix": "<|im_end|>\n",
  "system_suffix": "<|im_end|>\n",
  "user_alignment_message": "",
  "system_same_as_user": false,
  "last_system_sequence": "",
  "name": "Magnum ChatML"
}
```

</details><br>

## Axolotl config

<details><summary>See axolotl config</summary>

```yaml
base_model: /workspace/data/models/Qwen2.5-72B-Instruct
model_type: AutoModelForCausalLM
tokenizer_type: AutoTokenizer

plugins:
  - axolotl.integrations.liger.LigerPlugin
liger_rope: true
liger_rms_norm: true
liger_swiglu: true
liger_fused_linear_cross_entropy: true

load_in_8bit: false
load_in_4bit: false
strict: false

datasets:
  - path: anthracite-org/c2_logs_32k_llama3_qwen2_v1.2
    type: sharegpt
    conversation: chatml
  - path: anthracite-org/kalo-opus-instruct-22k-no-refusal
    type: sharegpt
    conversation: chatml
  - path: lodrick-the-lafted/kalo-opus-instruct-3k-filtered
    type: sharegpt
    conversation: chatml
  - path: anthracite-org/nopm_claude_writing_fixed
    type: sharegpt
    conversation: chatml
  - path: anthracite-org/kalo_opus_misc_240827
    type: sharegpt
    conversation: chatml
  - path: anthracite-org/kalo_misc_part2
    type: sharegpt
    conversation: chatml
#chat_template: chatml
shuffle_merged_datasets: true
#default_system_message: "You are an assistant that responds to the user."
dataset_prepared_path: /workspace/data/magnum-72b-data
val_set_size: 0.0
output_dir: /workspace/data/72b-fft-out

sequence_len: 32768
sample_packing: true
pad_to_sequence_len: true

adapter:
lora_model_dir:
lora_r:
lora_alpha:
lora_dropout:
lora_target_linear:
lora_fan_in_fan_out:

wandb_project: 72b-magnum-fft
wandb_entity:
wandb_watch:
wandb_name: alter-attempt-01
wandb_log_model:

gradient_accumulation_steps: 2
micro_batch_size: 1
num_epochs: 2
optimizer: adamw_bnb_8bit
lr_scheduler: cosine
learning_rate: 0.000004

train_on_inputs: false
group_by_length: false
bf16: auto
fp16:
tf32: false

gradient_checkpointing: true
early_stopping_patience:
resume_from_checkpoint:
local_rank:
logging_steps: 1
xformers_attention:
flash_attention: true

warmup_steps: 40
evals_per_epoch:
eval_table_size:
eval_max_new_tokens:
saves_per_epoch: 2
debug:
deepspeed: deepspeed_configs/zero3_bf16.json
weight_decay: 0.01
fsdp:
fsdp_config:
special_tokens:
```
</details><br>

## Credits
We'd like to thank [DoctorShotgun](https://huggingface.co/Doctor-Shotgun) for sponsoring the compute for this train.
We would also like to thank all members of Anthracite who made this finetune possible. 

## Datasets
- [anthracite-org/c2_logs_32k_llama3_qwen2_v1.2](https://huggingface.co/datasets/anthracite-org/c2_logs_32k_llama3_qwen2_v1.2)
- [anthracite-org/kalo-opus-instruct-22k-no-refusal](https://huggingface.co/datasets/anthracite-org/kalo-opus-instruct-22k-no-refusal)
- [lodrick-the-lafted/kalo-opus-instruct-3k-filtered](https://huggingface.co/datasets/lodrick-the-lafted/kalo-opus-instruct-3k-filtered)
- [anthracite-org/nopm_claude_writing_fixed](https://huggingface.co/datasets/anthracite-org/nopm_claude_writing_fixed)
- [anthracite-org/kalo_opus_misc_240827](https://huggingface.co/datasets/anthracite-org/kalo_opus_misc_240827)
- [anthracite-org/kalo_misc_part2](https://huggingface.co/datasets/anthracite-org/kalo_misc_part2)

## Training
We used  8x mi300x GPUs graciously provided by [DoctorShotgun](https://huggingface.co/Doctor-Shotgun) for the full-parameter fine-tuning of the model.

[<img src="https://raw.githubusercontent.com/OpenAccess-AI-Collective/axolotl/main/image/axolotl-badge-web.png" alt="Built with Axolotl" width="200" height="32"/>](https://github.com/OpenAccess-AI-Collective/axolotl)

## Safety
...