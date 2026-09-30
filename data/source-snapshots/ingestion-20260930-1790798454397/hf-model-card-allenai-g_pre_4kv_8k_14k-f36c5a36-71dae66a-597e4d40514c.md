---
license: apache-2.0
language:
- en
library_name: transformers
---

# Model Summary

This is one of the models from the OlmPool set of architectural variations. The final checkpoint for each model is a 7-8B model that has been trained to 150B tokens (140B in pretraining and 10B in context extension). Note that these models are *early in pretraining* with little-to-no instruction-format data, and thus are very poor at most tasks.

For more information about OlmPool, see the **paper**: http://allenai.org/papers/olmpool.
# Use

You **must specify a revision** and set `use_remote_code=True` to load OlmPool models. The revision is the checkpoint that you would like to load. For instance, to load the final post-context-extension model:
```python
from transformers import AutoModel
import torch

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

model = AutoModel.from_pretrained("allenai/G_pre_4kv_8k_14k", revision="longcontext-step2385", use_remote_code=True).to(DEVICE)
```

You can list all revisions/branches by installing `huggingface-hub` & running:
```python
from huggingface_hub import list_repo_refs
out = list_repo_refs("allenai/G_pre_4kv_8k_14k")
branches = [b.name for b in out.branches]
```

Important branches:
- `step34000`: Final pretraining checkpoint
- `longcontext-step2385`: Final long context checkpoint

# Citation

```bibtex
@misc{bertsch2026cracks,
    title={Cracks in the Foundation: Seemingly Minor Architectural Choices Impact Long Context Extension},
    author={Amanda Bertsch and Luca Soldaini and Matthew R. Gormley and Graham Neubig and Hanna Hajishirzi and Kyle Lo and Dirk Groeneveld},
    year={2026},
}
```

# License
This model is licensed under Apache 2.0. It is intended for research and educational use in accordance with Ai2's [Responsible Use Guidelines](https://allenai.org/responsible-use).
