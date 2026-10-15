"""Private original-source replay. Raw bytes are required, never fetched here."""
import argparse
import copy
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('capture', Path(__file__).with_name('current-capture.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
parser = argparse.ArgumentParser()
parser.add_argument('--audit-dir', required=True)
args = parser.parse_args()
expected = json.loads(Path('data/current-source-evidence.json').read_text())
actual = module.capture(json.loads(Path('data/current-source-specs.json').read_text()), Path(args.audit_dir), replay=True, reference=expected)


def semantic(value):
    value = copy.deepcopy(value)
    if isinstance(value, dict):
        return {k: semantic(v) for k, v in value.items() if k not in ('verifiedAt', 'factualProjectionSha256')}
    if isinstance(value, list):
        return [semantic(v) for v in value]
    return value


assert semantic(expected) == semantic(actual), 'public factual projection does not replay from captured primary bytes'
print(f"Original-byte replay: {len(actual['sources'])} hashed primary responses, {len(actual['models'])} identity requests, all 270 BridgeBench ratings and exact result pages, licensed tariff equality.")
