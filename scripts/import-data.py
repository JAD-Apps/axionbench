#!/usr/bin/env python3
"""Import a supplied MetaBench snapshot without personal subscription metadata."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path, help="Original MetaBench HTML or JSON snapshot")
args = parser.parse_args()
raw = args.source.read_text()
if args.source.suffix == ".html":
    match = re.search(r"const DATA = (.*?);\s*const COLORS", raw, re.S)
    if not match:
        raise SystemExit("Expected an original MetaBench HTML snapshot with const DATA.")
    raw = match.group(1)
original = json.loads(raw)
developers = {"gpt": "openai", "claude": "anthropic", "gemini": "google", "grok": "xai", "kimi": "moonshot"}
models = []
for model in original["models"]:
    developer = developers[model["model"].split("-")[0]]
    models.append({key: model[key] for key in ["model", "name", "apiUsdPerMTok", "capabilities"]} | {"developer": developer})
sources = original["sources"]
for key, source in sources.items():
    if key.startswith("bb."):
        source["source"] = "https://www.bridgebench.ai/leaderboard"
data = {
    "builtAt": original["builtAt"],
    "capabilities": original["capabilities"],
    "sources": sources,
    "models": models,
    "pricing": {
        "unit": "USD per million blended tokens",
        "mix": {"input": 0.3, "cacheRead": 0.6, "output": 0.1},
        "provenance": "Blended API prices from the supplied snapshot, originally sourced from JadBot's pricing table and the LiteLLM catalogue.",
        "catalogue": "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json",
    },
}
(ROOT / "data.json").write_text(json.dumps(data, indent=2) + "\n")
(ROOT / "assets/data.js").write_text("window.METABENCH_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
print(f"Imported {len(models)} models; public data contains no plans, subscription costs, or owner policy.")
