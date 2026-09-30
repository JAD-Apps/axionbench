---
license: cc-by-nc-4.0
datasets:
- Setiaku/Stheno-v3.4-Instruct
- Setiaku/Stheno-3.4-Creative-2
language:
- en
---

![img](https://huggingface.co/Sao10K/L3.1-70B-Euryale-v2.2/resolve/main/__euryale_and_euryale_fate_and_2_more_drawn_by_denoia__3f98d42ac68c388b677cd5a7a83ee785.jpg)

---

Thanks to Gargamel for the compute, to train this!
<br>It took ~4 Days on 8x A100s.

---

Llama-3.1-70B-Euryale-v2.2

This model has went through a single stage finetuning process, over 2 epochs. Datasets are cleanly seperated in order, and not merged unlike Stheno v3.4 .
```
- 1st, over a multi-turn Conversational-Instruct
- 2nd, over a Creative Writing / Roleplay along with some Creative-based Instruct Datasets.
- - Dataset consists of a mixture of Human and Claude Data.
```

Personal Opinions:
```
- Llama 3.1 is... meh. I'm sure you guys in the community have debated over this.
- Whatever they did to their Instruct overcooked the model. Base is weird compared to Llama 3.
- Still, the 70B is pretty nice to use, though sometimes it bugs out? A swipe / regen always fixes it.
- May be less 'uncensored' zero-shot due to removal of c2 samples, but it is perfectly fine for roleplaying purposes.
- I never got the feeling Euryale was ever too horny or rushing ahead, even with v2.1, ymmv.
```

Prompting Format:
```
- Use the L3 Instruct Formatting - Euryale 2.1 Preset Works Well
- Temperature + min_p as per usual, I recommend 1.2 Temp + 0.2 min_p.
- Has a different vibe to previous versions. Tinker around.
```

Changes since Euryale v2.1 \[Same Dataset as Stheno 3.4\]
```
- Included Multi-turn Conversation-based Instruct Datasets to boost multi-turn coherency. # This is a seperate set, not the ones made by Kalomaze and Nopm, that are used in Magnum. They're completely different data.
- Replaced Single-Turn Instruct with Better Prompts and Answers by Claude 3.5 Sonnet and Claude 3 Opus.
- Removed c2 Samples -> Underway of re-filtering and masking to use with custom prefills. TBD
- Included 55% more Roleplaying Examples based of [Gryphe's](https://huggingface.co/datasets/Gryphe/Sonnet3.5-Charcard-Roleplay) Charcard RP Sets. Further filtered and cleaned on.
- Included 40% More Creative Writing Examples.
- Included Datasets Targeting System Prompt Adherence.
- Included Datasets targeting Reasoning / Spatial Awareness.
- Filtered for the usual errors, slop and stuff at the end. Some may have slipped through, but I removed nearly all of it.
```


Below are some graphs and all for you to observe.

---

`Turn Distribution # 1 Turn is considered as 1 combined Human/GPT pair in a ShareGPT format. 4 Turns means 1 System Row + 8 Human/GPT rows in total.`

![Turn](https://huggingface.co/Sao10K/Llama-3.1-8B-Stheno-v3.4/resolve/main/turns_distribution_bar_graph.png)

`Token Count Histogram # Based on the Llama 3 Tokenizer`

![Turn](https://huggingface.co/Sao10K/Llama-3.1-8B-Stheno-v3.4/resolve/main/token_count_histogram.png)

---

Have a good one.

```
Source Image: https://danbooru.donmai.us/posts/6657609
```