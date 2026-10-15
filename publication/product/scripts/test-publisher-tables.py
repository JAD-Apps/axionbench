"""Check extraction separately from downstream admission using genuine saved facts."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('publisher_tables', ROOT / 'scripts/publisher-tables.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
data = json.loads((ROOT / 'data/publisher-percentage-facts.json').read_text())
sources = {s['sourceId']: s for s in data['sources']}
assert set(sources) == set(adapter.SOURCES)
if len(sys.argv) == 2:
    audit = Path(sys.argv[1])
    for source in sources.values():
        raw = (audit / (source['sourceSha256'] + '.html')).read_bytes()
        extracted = adapter.extract(raw, source['sourceId'], source['retrievedAt'])
        assert extracted == source, 'published facts differ from genuine archived source bytes'
expected = {'google-gemini38': ('Gemini 3.8 Flash', 'DeepSWE v1.1 Long-horizon software engineering', 73.7),
            'anthropic-sonnet55': ('Sonnet 5.5', 'Agentic codingTerminal-Bench 4.0', 70.6),
            'anthropic-opus55': ('Opus 5.5', 'Agentic codingTerminal-Bench 4.0¹', 66.4)}
for key, (model, benchmark, score) in expected.items():
    source = sources[key]
    actual = [c for c in source['cells'] if c['modelLabel'] == model and c['benchmarkLabel'] == benchmark]
    assert len(actual) == 1 and actual[0]['value'] == score
    assert len(source['sourceSha256']) == 64 and source['httpStatus'] == 200
    coordinates = {(c['tableIndex'], c['rowIndex'], c['columnIndex']) for c in source['cells']}
    assert len(coordinates) == len(source['cells'])
    for cell in source['cells']:
        assert cell['unit'] == 'percent' and cell['unitEvidence'] == 'literal-percent-sign'
        assert cell['strictComparisonEligible'] is False and cell['independentReplication'] is False
        assert cell['evaluatedAt'] is None
        assert cell['modelRelationship'] == ('publisher-model' if cell['modelLabel'] == model else 'publisher-comparison-claim')

# Counterexamples are extraction tests; never used as product observations.
html = b'<table><tr><th></th><th>Sonnet 5.5</th><th>GPT-6 Sol</th></tr><tr><td>Test</td><td>82.4%</td><td>90.1</td></tr><tr><td>Test Elo</td><td>1824</td><td>0.5</td></tr><tr><td colspan="3">85.1%</td></tr></table>'
sample = adapter.extract(html, 'anthropic-sonnet55', '2026-09-30T00:00:00+00:00')
assert len(sample['cells']) == 1 and sample['cells'][0]['value'] == 82.4
assert sample['cells'][0]['modelRelationship'] == 'publisher-model'
assert len(sample['excludedRows']) == 1
for malformed in (html.replace(b'Sonnet 5.5', b'Sonnet 5'), html.replace(b'82.4%', b'101.2%'), b'<html>blocked</html>'):
    try:
        adapter.extract(malformed, 'anthropic-sonnet55', '2026-09-30T00:00:00+00:00')
    except ValueError:
        pass
    else:
        raise AssertionError('malformed publisher table admitted')

with tempfile.TemporaryDirectory() as directory:
    output = Path(directory) / 'last-good.json'
    previous = (ROOT / 'data/publisher-percentage-facts.json').read_bytes()
    output.write_bytes(previous)
    with patch.object(adapter, 'urlopen', side_effect=OSError('HTTP failure')):
        try:
            adapter.capture(output, Path(directory) / 'audit')
        except OSError:
            pass
        else:
            raise AssertionError('failed retrieval unexpectedly succeeded')
    assert output.read_bytes() == previous

print('Publisher extraction passed: 3 original sources / 110 explicit-percentage cells; unknowns excluded, peer claims separate, last-good preserved.')
