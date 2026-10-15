"""Narrow CC BY 4.0 projection of Google's standard text API tariffs.

Raw HTML is archived outside the public repository. Fail closed on source or
table drift; promote only a complete validated capture and retain last good.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.request import Request, urlopen

URL = 'https://ai.google.dev/gemini-api/docs/pricing'
LICENSE = 'https://creativecommons.org/licenses/by/4.0/'
MODELS = [
    'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash',
    'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite',
    'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro',
    'gemini-2.5-flash', 'gemini-2.5-flash-lite',
]


class PricingTables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.model = None
        self.section = None
        self.heading = None
        self.tables = {}
        self.table = self.row = self.cell = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'h2':
            self.model = attrs.get('id')
            self.section = None
        if tag == 'h3':
            self.heading = []
        if tag == 'table' and self.model in MODELS and self.section == 'Standard':
            if self.model in self.tables:
                raise ValueError('duplicate standard table')
            self.table = []
        elif self.table is not None and tag == 'tr':
            self.row = []
        elif self.row is not None and tag in ('th', 'td'):
            if any(int(attrs.get(key, '1')) != 1 for key in ('colspan', 'rowspan')):
                raise ValueError('ambiguous pricing table alignment')
            self.cell = []
        elif tag == 'br' and self.cell is not None:
            self.cell.append(' | ')

    def handle_data(self, value):
        if self.heading is not None:
            self.heading.append(value)
        if self.cell is not None:
            self.cell.append(value)

    def handle_endtag(self, tag):
        if tag == 'h3' and self.heading is not None:
            self.section = ' '.join(''.join(self.heading).split())
            self.heading = None
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables[self.model] = self.table
            self.table = None


def parse_cell(text):
    """Text tariffs: plain, >200k tiers, or explicit dated introductory rates."""
    storage = re.findall(r'\$([\d.]+) / 1,000,000 tokens per hour', text)
    parts = [p.strip() for p in text.split('|') if 'storage price' not in p]
    if not parts:
        raise ValueError('no tariff')
    first = parts[0]
    rate = re.fullmatch(r'\$([\d.]+)(?: \(text / image / video(?: / audio)?\))?', first)
    if rate:
        return {'base': float(rate[1]), 'long': None, 'expiresAt': None,
                'future': None, 'storage': float(storage[0]) if storage else None}
    short = re.fullmatch(r'\$([\d.]+), prompts <= 200k(?: tokens)?', first)
    if short:
        if len(parts) != 2:
            raise ValueError('unknown prompt tiers')
        long = re.fullmatch(r'\$([\d.]+), prompts > 200k(?: tokens)?', parts[1])
        if not long:
            raise ValueError('unknown long prompt tariff')
        return {'base': float(short[1]), 'long': float(long[1]), 'expiresAt': None,
                'future': None, 'storage': float(storage[0]) if storage else None}
    promo = re.fullmatch(r'\$([\d.]+) through December 31, 2026\.', first)
    if promo:
        if len(parts) != 2:
            raise ValueError('unknown promotion')
        future = re.fullmatch(r'\$([\d.]+) starting January 1, 2027\.', parts[1])
        if not future:
            raise ValueError('unknown promotion expiry')
        return {'base': float(promo[1]), 'long': None, 'expiresAt': '2027-01-01T00:00:00Z',
                'future': float(future[1]), 'storage': float(storage[0]) if storage else None}
    # Flash-Lite lists audio separately; this projection is text only.
    if len(parts) == 2 and re.fullmatch(r'\$[\d.]+ \(audio\)', parts[1]):
        return parse_cell(parts[0] + (f' | ${storage[0]} / 1,000,000 tokens per hour (storage price)' if storage else ''))
    raise ValueError('unsupported tariff shape: ' + first)


def extract(raw, retrieved_at):
    html = raw.decode('utf-8')
    if 'Creative Commons Attribution 4.0 License' not in html or 'creativecommons.org/licenses/by/4.0' not in html:
        raise ValueError('explicit page reuse license absent')
    parser = PricingTables()
    parser.feed(html)
    records = []
    for model in MODELS:
        table = parser.tables.get(model)
        if not table or table[0] != ['', 'Free Tier', 'Paid Tier, per 1M tokens in USD']:
            raise ValueError('standard paid USD/1M table changed: ' + model)
        fields = {}
        evidence = []
        for index, row in enumerate(table[1:], 1):
            if len(row) != 3:
                raise ValueError('pricing column alignment changed')
            label = row[0]
            if label not in ('Input price', 'Input price (text, image, video)', 'Output price (including thinking tokens)', 'Context caching price'):
                continue
            field = {'Input price': 'input', 'Input price (text, image, video)': 'input', 'Output price (including thinking tokens)': 'output',
                     'Context caching price': 'cachedInputRead'}[label]
            fields[field] = parse_cell(row[2])
            evidence.append({'tableSection': 'Standard', 'row': index, 'column': 2,
                             'field': field, 'paidCell': row[2]})
        if set(fields) != {'input', 'output', 'cachedInputRead'}:
            raise ValueError('required rate or thinking billing statement missing')
        tiers = []
        if fields['input']['long'] is not None:
            if any(fields[k]['long'] is None for k in fields):
                raise ValueError('incomplete long prompt tariff')
            tiers = [{'minPromptTokens': 200001, **{k: fields[k]['long'] / 1_000_000 for k in fields}}]
        expires = {v['expiresAt'] for v in fields.values()}
        if len(expires) != 1:
            raise ValueError('inconsistent promotion dates')
        records.append({
            'id': 'google-standard-text:' + model, 'provider': 'Google Gemini Developer API',
            'endpointModelId': model, 'modelKey': re.sub(r'[^a-z0-9]+', '-', model),
            'currency': 'USD', 'unit': 'USD/token', 'serviceTier': 'Standard paid',
            **{k: fields[k]['base'] / 1_000_000 for k in fields},
            'cachedInputWrite': None, 'reasoningBilling': 'included-in-output',
            'reasoning': fields['output']['base'] / 1_000_000,
            'cacheStoragePerMillionTokenHour': fields['cachedInputRead']['storage'],
            'tiers': tiers, 'expiresAt': next(iter(expires)), 'effectiveAt': None,
            'retrievedAt': retrieved_at, 'sourceUrl': URL + '#' + model,
            'evidence': evidence,
            'limitations': ['Text-token scenario only; tools, images/audio/video and taxes excluded.',
                            'Explicit cache storage is billed separately; cache-write token tariff is unknown.',
                            'Quoted endpoint tariff does not establish the benchmark provider endpoint.'],
        })
    return {'schemaVersion': 'axionbench-price-facts-v1', 'source': {
        'id': 'google-standard-api-pricing', 'publisher': 'Google', 'url': URL,
        'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'retrievedAt': retrieved_at,
        'licence': 'CC BY 4.0', 'licenceUrl': LICENSE,
        'attribution': 'Adapted from Google Gemini Developer API pricing; numeric text tariffs projected, presentation changed.',
        'permissionBasis': 'The original pricing page explicitly licenses its content under CC BY 4.0.'},
        'coverage': 'Google standard paid text tariffs only; unlicensed routed endpoint rates remain withheld.',
        'records': records}


def capture(output, audit_dir):
    with urlopen(Request(URL, headers={'User-Agent': 'AxionBench public fact adapter/1'}), timeout=40) as response:
        if response.status != 200 or response.url != URL:
            raise ValueError('unexpected source response')
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('pricing source size exceeded')
    result = extract(raw, datetime.now(timezone.utc).isoformat())
    audit = Path(audit_dir)
    audit.mkdir(parents=True, exist_ok=True)
    archive = audit / (result['source']['sha256'] + '.html')
    if archive.exists() and archive.read_bytes() != raw:
        raise ValueError('source hash collision')
    archive.write_bytes(raw)
    os.chmod(archive, 0o600)
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as target:
        json.dump(result, target, indent=2)
        target.write('\n')
        temporary = Path(target.name)
    temporary.replace(path)
    print(f"Captured {len(result['records'])} licensed original price records; source {result['source']['sha256']}")


if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('--output', default='data/public-price-facts.json')
    cli.add_argument('--audit-dir', required=True)
    args = cli.parse_args()
    capture(args.output, args.audit_dir)
