import importlib.util
import json
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('capture', Path(__file__).with_name('capture-google.py'))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)
facts = json.loads(Path('data/public-price-facts.json').read_text())
assert len(facts['records']) == len(capture.MODELS) == 11
assert capture.parse_cell('$2.00, prompts <= 200k tokens | $4.00, prompts > 200k tokens')['long'] == 4
assert capture.parse_cell('$0.25 (text / image / video) | $0.50 (audio)')['base'] == .25
assert capture.parse_cell('$0.75 through December 31, 2026. | $1.50 starting January 1, 2027.')['expiresAt'] == '2027-01-01T00:00:00Z'
for cell in ['$2.00 unknown tier', '$2.00, prompts <= 200k tokens | $3.00, prompts >= 200k', '$2.00 through December 31, 2026. | $3.00 unknown future']:
    try:
        capture.parse_cell(cell)
        raise AssertionError('unsupported tariff silently admitted')
    except ValueError:
        pass
if len(sys.argv) > 1:
    raw = (Path(sys.argv[1]) / (facts['source']['sha256'] + '.html')).read_bytes()
    extracted = capture.extract(raw, facts['source']['retrievedAt'])
    assert extracted == facts, 'all published tariffs re-extract byte-for-byte from original captured source'
    for mutation in [raw.replace(b'Creative Commons Attribution 4.0 License', b'Unlicensed content'),
                     raw.replace(b'Paid Tier, per 1M tokens in USD', b'Unspecified units'),
                     raw.replace(b'Output price (including thinking tokens)', b'Output price')]:
        try:
            capture.extract(mutation, facts['source']['retrievedAt'])
            raise AssertionError('lost permission/unit/billing semantics silently admitted')
        except ValueError:
            pass
    print('Original archived HTML replay passed: all 11 records, all 33 tariff cells; permission/unit/thinking failures rejected.')
else:
    print('Pricing extractor adversarial fixtures passed. Original-source replay requires -- audit directory argument.')
