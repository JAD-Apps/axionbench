"""Capture factual publisher tables; percentages require a literal percent sign.

This is source extraction, not benchmark admission or evidence of peer replication.
Unknown units, benchmark mappings and evaluation conditions remain unknown.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.request import Request, urlopen

SOURCES = {
    'google-gemini38': ('https://deepmind.google/models/model-cards/gemini-3-8-flash/', 'Google', 'Gemini 3.8 Flash', 'Benchmark', 2),
    'anthropic-sonnet55': ('https://www.anthropic.com/claude-sonnet-5-5', 'Anthropic', 'Sonnet 5.5', '', 1),
    'anthropic-opus55': ('https://www.anthropic.com/claude-opus-5-5', 'Anthropic', 'Opus 5.5', '', 1),
}


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.table, self.row, self.cell = [], None, None, None
        self.attrs = {}

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            if self.table is not None:
                raise ValueError('nested tables require a source-specific parser')
            self.table = []
        elif self.table is not None and tag == 'tr':
            self.row = []
        elif self.row is not None and tag in ('th', 'td'):
            self.cell, self.attrs = [], dict(attrs)
        elif self.cell is not None and tag == 'br':
            self.cell.append(' ')

    def handle_data(self, value):
        if self.cell is not None:
            self.cell.append(value)

    def handle_endtag(self, tag):
        if tag in ('th', 'td') and self.cell is not None:
            self.row.append({'text': ' '.join(''.join(self.cell).split()),
                             'rowspan': int(self.attrs.get('rowspan', 1)),
                             'colspan': int(self.attrs.get('colspan', 1))})
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def extract(raw, key, retrieved_at):
    url, publisher, own_model, benchmark_header, first_model = SOURCES[key]
    parser = Tables()
    parser.feed(raw.decode('utf-8'))
    if not parser.tables:
        raise ValueError('expected publisher result table absent')
    table = parser.tables[0]
    headers = [cell['text'] for cell in table[0]]
    if headers[0] != benchmark_header or headers[first_model] != own_model:
        raise ValueError('publisher table identity changed; explicit review required')
    cells, excluded = [], []
    for row_index, row in enumerate(table[1:], 1):
        # Never guess alignment for rowspan/colspan or one-cell continuation rows.
        # Preserve them for source-specific review, including secondary settings.
        if len(row) != len(headers) or any(c['rowspan'] != 1 or c['colspan'] != 1 for c in row):
            excluded.append({'tableIndex': 0, 'rowIndex': row_index, 'reason': 'ambiguous-alignment-or-continuation'})
            continue
        benchmark = row[0]['text']
        if not benchmark:
            raise ValueError('missing benchmark identity')
        if benchmark.startswith(('Input price', 'Output price')):
            continue
        for column_index in range(first_model, len(headers)):
            text = row[column_index]['text']
            match = re.fullmatch(r'(\d+(?:\.\d+)?)%([^\d%]*)', text)
            if not match:
                continue
            value = float(match.group(1))
            if not 0 <= value <= 100:
                raise ValueError('explicit percentage outside its declared unit')
            cells.append({
                'tableIndex': 0, 'rowIndex': row_index, 'columnIndex': column_index,
                'modelLabel': headers[column_index], 'benchmarkLabel': benchmark,
                'value': value, 'unit': 'percent', 'unitEvidence': 'literal-percent-sign',
                'cellSuffix': match.group(2).strip() or None,
                'notes': row[1]['text'] if first_model == 2 else None,
                'sourceClass': 'original_publisher_reported',
                'modelRelationship': 'publisher-model' if headers[column_index] == own_model else 'publisher-comparison-claim',
                'independentReplication': False,
                'evaluatedAt': None, 'strictComparisonEligible': False,
            })
    if not any(c['modelRelationship'] == 'publisher-model' for c in cells):
        raise ValueError('no genuine own-model percentage results extracted')
    return {'schemaVersion': 1, 'sourceId': key, 'publisher': publisher,
            'resultUrl': url, 'retrievedAt': retrieved_at,
            'sourceSha256': hashlib.sha256(raw).hexdigest(),
            'sourceBytes': len(raw), 'httpStatus': 200,
            'cells': cells, 'excludedRows': excluded,
            'status': 'extracted-facts-require-reviewed-benchmark-mapping'}


def capture(output, audit_dir):
    projections = []
    audit_dir = Path(audit_dir)
    audit_dir.mkdir(parents=True, exist_ok=True)
    for key, (url, *_rest) in SOURCES.items():
        with urlopen(Request(url, headers={'User-Agent': 'AxionBench source adapter/1'}), timeout=30) as response:
            if response.status != 200 or response.url != url:
                raise ValueError('unexpected publisher response or redirect')
            raw = response.read(5_000_001)
        if len(raw) > 5_000_000:
            raise ValueError('publisher response exceeds reviewed source size')
        projection = extract(raw, key, datetime.now(timezone.utc).isoformat())
        archive = audit_dir / (projection['sourceSha256'] + '.html')
        if archive.exists():
            if archive.read_bytes() != raw:
                raise ValueError('content-addressed source mismatch')
        else:
            with archive.open('xb') as target:
                os.chmod(archive, 0o600)
                target.write(raw)
        projections.append(projection)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Replace only after every source was fetched and validated. Retain last good on failure.
    if output.exists():
        previous = {p['sourceId']: p for p in json.loads(output.read_text())['sources']}
        for item in projections:
            old = previous.get(item['sourceId'])
            if old and old['sourceSha256'] == item['sourceSha256']:
                item['retrievedAt'] = old['retrievedAt']
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=output.parent, delete=False) as target:
            temporary = Path(target.name)
            json.dump({'schemaVersion': 1, 'sources': projections}, target, indent=2)
            target.write('\n')
        temporary.replace(output)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    return projections


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: python3 scripts/publisher-tables.py <factual-output.json> <private-audit-directory>')
    result = capture(sys.argv[1], sys.argv[2])
    print(json.dumps({s['sourceId']: len(s['cells']) for s in result}))
