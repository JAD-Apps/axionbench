"""Capture primary pages and project bounded facts; HTML stays in the audit dir.

python3 scripts/authority/current-capture.py --audit-dir <private-dir> [--replay]
No result, lifecycle or identity is inferred from a third-party catalogue.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import importlib.util
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def digest(value):
    return hashlib.sha256(json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


class PageText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, text):
        if not self.skip:
            self.parts.append(text)


def page_text(raw):
    parser = PageText()
    parser.feed(raw.decode())
    return ' '.join(' '.join(parser.parts).split())


def bridge_rows(raw):
    """Read published server component facts, never execute publisher JavaScript."""
    chunks = []
    for match in re.finditer(r'self\.__next_f\.push\((\[.*?\])\)</script>', raw.decode()):
        chunk = json.loads(match[1])
        if len(chunk) > 1 and isinstance(chunk[1], str):
            chunks.append(chunk[1])
    rows = []

    def walk(value):
        if isinstance(value, dict):
            if isinstance(value.get('scores'), dict) and value.get('href', '').startswith('/leaderboard/') and value.get('name'):
                rows.append({k: value[k] for k in ('id', 'href', 'name', 'vendor', 'provisional', 'scores')})
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    for line in ''.join(chunks).splitlines():
        try:
            value = json.loads(line.split(':', 1)[1])
        except (ValueError, IndexError):
            continue  # component references and length-prefixed text are not JSON facts
        walk(value)
    assert rows and len({r['id'] for r in rows}) == len(rows), 'BridgeBench rows missing or duplicated'
    assert all(set(r['scores']) == set(AXES) for r in rows), 'BridgeBench axis schema drift'
    return rows


AXES = ['overall', 'reasoning', 'frontend', 'backend', 'oneShot', 'security', 'trustworthiness', 'efficiency', 'speed', 'cost']
AXIS_LABELS = ['Overall', 'Reasoning', 'Front End', 'Back End', 'One Shot', 'Security', 'Trustworthiness', 'Efficiency', 'Speed', 'Cost']


def capture(specs, audit, replay=False, reference=None):
    audit.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(audit, 0o700)
    archive = audit / 'blobs'
    archive.mkdir(exist_ok=True, mode=0o700)
    previous_sources = {s['id']: s for s in (reference or {}).get('sources', [])}
    now = datetime.now(timezone.utc).isoformat()
    sources, bodies = {}, {}

    def get(spec):
        key, url = spec['id'], spec['url']
        raw_path, receipt_path = audit / (key + '.raw'), audit / (key + '.receipt.json')
        if replay:
            receipt = dict(previous_sources[key]) if key in previous_sources else json.loads(receipt_path.read_text())
            assert receipt['url'] == url, 'capture URL differs from spec'
            archived = archive / (receipt['sha256'] + '.raw') if receipt['sha256'] else None
            raw = (archived if archived.exists() else raw_path).read_bytes() if archived else None
        else:
            at = datetime.now(timezone.utc).isoformat()
            receipt = dict(id=key, url=url, finalUrl=None, httpStatus=None, retrievedAt=at, verifiedAt=at,
                           sha256=None, bytes=None)
            try:
                with urlopen(Request(url, headers={'User-Agent': 'AxionBench source adapter/1'}), timeout=40) as response:
                    raw = response.read(5_000_001)
                    assert 0 < len(raw) <= 5_000_000, 'primary response exceeds capture bounds'
                    receipt.update(finalUrl=response.url, httpStatus=response.status)
            except HTTPError as error:
                raw = error.read(5_000_001)
                receipt.update(finalUrl=error.url, httpStatus=error.code, unavailableReason=f'HTTP {error.code}')
            except (OSError, TimeoutError) as error:
                raw = None
                receipt['unavailableReason'] = str(error)
            if raw is not None:
                receipt.update(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
                raw_path.write_bytes(raw)
                os.chmod(raw_path, 0o600)
            receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
        if raw is not None:
            assert hashlib.sha256(raw).hexdigest() == receipt['sha256'], 'original source hash mismatch'
            assert len(raw) == receipt['bytes'], 'original source size mismatch'
            archived = archive / (receipt['sha256'] + '.raw')
            if archived.exists():
                assert archived.read_bytes() == raw, 'content-addressed private capture changed'
            else:
                archived.write_bytes(raw)
                os.chmod(archived, 0o600)
        # A byte replay is a verification, not a new original retrieval.
        receipt['verifiedAt'] = now
        receipt['lastRetrievedAt'] = receipt.get('lastRetrievedAt', receipt['retrievedAt'])
        receipt['rights'] = 'Attributed factual projection only; raw page reuse permission is not presumed.'
        receipt['publisher'] = spec['publisher']
        receipt['sourceClass'] = spec['sourceClass']
        return key, receipt, raw

    with ThreadPoolExecutor(max_workers=6) as pool:
        for key, source, raw in pool.map(get, specs['sources']):
            sources[key], bodies[key] = source, raw
    models = []
    for request in specs['models']:
        source = sources[request['sourceId']]
        text = page_text(bodies[source['id']]) if source['httpStatus'] == 200 else ''
        claim = request['claim']
        found = bool(re.search(r'(?<![\w.-])' + re.escape(claim) + r'(?![\w.-])', text, re.I))
        model = {k: request[k] for k in ('key', 'name', 'labId', 'apiId', 'selection', 'lifecycle', 'sourceId')}
        model.update(identityVerified=found, verifiedClaim=claim if found else None,
                     identityReason=None if found else source.get('unavailableReason', 'Exact requested identity is not stated in primary page text.'),
                     originalSourceUrl=source['url'], originalSourceSha256=source['sha256'],
                     retrievedAt=source['retrievedAt'], verifiedAt=source['verifiedAt'],
                     releaseDate=None, parameters=None, confidence=None, apiPrice=None,
                     missingReasons={'releaseDate': 'No release date extracted from this exact primary identity.',
                                     'parameters': 'No qualified parameter-count projection for this identity.',
                                     'confidence': 'Identity evidence has no statistical confidence estimate.',
                                     'apiPrice': 'Only separately licensed direct API tariffs may supply prices.'})
        if request['labId'] == 'anthropic' and found:
            match = re.search(r'Availability Status ([A-Za-z ()]+?) Released ([A-Za-z]+ \d+, \d{4})', text)
            if match:
                model['releaseDate'] = datetime.strptime(match[2], '%B %d, %Y').date().isoformat()
                model['missingReasons'].pop('releaseDate')
                model['lifecycle'] = ('retired' if match[1].strip() in ('Deprecated', 'Retired') else
                                      'version' if 'legacy' in match[1] else 'current')
        if not found:
            model['lifecycle'] = 'unverified'
        model['factualProjectionSha256'] = digest(model)
        models.append(model)
    defaults = [m for m in models if m['selection'] == 'default']
    assert 8 <= len(defaults) <= 12 and all(m['identityVerified'] and m['lifecycle'] == 'current' for m in defaults), 'current default identities failed qualification; retain last good'
    leader = sources['bridge-leaderboard']
    assert leader['httpStatus'] == 200, 'A real BridgeBench primary snapshot is required; retain last good on failure'
    guide = sources['bridge-guide']
    assert guide['httpStatus'] == 200, 'BridgeBench publisher guide retrieval failed'
    guide_text = page_text(bodies['bridge-guide'])
    assert 'proprietary' in guide_text and 'not success percentages' in guide_text, 'publisher methodology limits changed'
    records = []
    for row in bridge_rows(bodies['bridge-leaderboard']):
        source = sources['bridge-result-' + row['href'].split('/')[-1]]
        assert source['httpStatus'] == 200, f"missing exact result page: {source['url']}"
        text = page_text(bodies[source['id']])
        assert row['name'] in text, 'result page model name differs'
        if row['scores']['overall'] is not None:
            assert re.search(r'Overall rating\s+' + str(row['scores']['overall']) + r'\b', text), 'snapshot and model result overall differ'
        # Per-axis values must agree with the exact result page, not just the aggregate snapshot.
        for axis, label in zip(AXES[1:], AXIS_LABELS[1:]):
            value = row['scores'][axis]
            if value is not None:
                assert re.search(re.escape(label) + r'\s+\d+(?:st|nd|rd|th) of \d+\s+' + str(value) + r'\b', text), f"axis differs: {row['name']} {axis}"
        key = row['href'].split('/')[-1]
        verified = next((m for m in models if m['key'] == key and m['identityVerified']), None)
        record = dict(id=row['id'], modelKey=key, modelLabel=row['name'], modelLab=row['vendor'], publisher='BridgeMind / BridgeBench',
                      ratings=row['scores'], provisional=row['provisional'], unit='BridgeBench rating',
                      provenance='publisher-rating', version='snapshot:' + leader['sha256'],
                      configuration={'harness': None, 'revision': None, 'reasoningEffort': None,
                                     'reason': 'Publisher does not disclose a reproducible evaluation protocol.'},
                      resultUrl=source['url'], originalSourceSha256=source['sha256'],
                      snapshotSha256=leader['sha256'], retrievedAt=source['retrievedAt'], verifiedAt=source['verifiedAt'],
                      evaluatedAt=None, confidence=None, identityVerified=bool(verified),
                      identityReason=None if verified else 'No exact first-party model identity was qualified in this capture.',
                      scoringEligible=False, exclusion='Proprietary comparative rating; overall includes cost and speed. Display separately from capability scoring.',
                      missingReasons={'evaluatedAt': 'Publisher does not report evaluation dates.',
                                      'confidence': 'Publisher does not report uncertainty.',
                                      'ratings': {a: 'Publisher has no rating on this axis.' for a in AXES if row['scores'][a] is None}})
        record['factualProjectionSha256'] = digest(record)
        records.append(record)
    price_module_spec = importlib.util.spec_from_file_location('licensed_prices', Path(__file__).parents[1] / 'pricing/capture-google.py')
    price_module = importlib.util.module_from_spec(price_module_spec)
    price_module_spec.loader.exec_module(price_module)
    fresh_prices = price_module.extract(bodies['google-pricing'], sources['google-pricing']['retrievedAt'])
    retained_prices = json.loads(Path('data/public-price-facts.json').read_text())
    tariff_facts = lambda prices: [{k: v for k, v in row.items() if k != 'retrievedAt'} for row in prices['records']]
    assert tariff_facts(fresh_prices) == tariff_facts(retained_prices), 'licensed tariff changed; retain last good until full price qualification'
    price_verification = dict(sourceId='google-pricing', originalSourceSha256=retained_prices['source']['sha256'],
                              verificationSourceSha256=sources['google-pricing']['sha256'],
                              originalRetrievedAt=retained_prices['source']['retrievedAt'], verifiedAt=now,
                              recordCount=len(retained_prices['records']), factualProjectionSha256=hashlib.sha256(Path('data/public-price-facts.json').read_bytes()).hexdigest(),
                              outcome='Fresh licensed primary capture has identical tariff facts, including cache/thinking/200K tiers/promotion expiry. Original retrieval retained.')
    bfcl_text = page_text(bodies['bfcl-current'])
    updated = re.search(r'Last Updated:\s*(\d{4}-\d{2}-\d{2})', bfcl_text)
    commit = re.search(r'Models are evaluated using commit\s+([a-f0-9]+)', bfcl_text)
    package = re.search(r'bfcl-eval==(\d{4}\.\d{2}\.\d{2})', bfcl_text)
    assert updated and commit and package and 'BFCL) V4' in bfcl_text, 'BFCL version/protocol metadata drift'
    maintenance = [dict(sourceId='bfcl-current', versionId='BFCL-V4:' + commit[1],
                        harnessVersion=commit[1] + '; bfcl-eval==' + package[1],
                        maintainedAt=updated[1] + 'T00:00:00Z', originalSourceSha256=sources['bfcl-current']['sha256'])]
    return dict(schemaVersion='axionbench-current-evidence-v1', verifiedAt=now,
                sources=list(sources.values()), models=models,
                pricingVerification=price_verification,
                benchmarkMaintenance=maintenance,
                bridgeBench=dict(id='bridgebench-published-ratings', name='BridgeBench',
                                 sourceId='bridge-leaderboard', guideUrl=guide['url'],
                                 version='snapshot:' + leader['sha256'], unit='BridgeBench rating',
                                 axes=[dict(id=a, label=l) for a, l in zip(AXES, AXIS_LABELS)],
                                 methodology='Comparative publisher ratings. Protocol, sample size and uncertainty are unpublished. Higher cost rating means more affordable.',
                                 scoringEligible=False, normalization=None, records=records))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit-dir', required=True)
    parser.add_argument('--replay', action='store_true')
    parser.add_argument('--output', default='data/current-source-evidence.json')
    args = parser.parse_args()
    output = Path(args.output)
    reference = json.loads(output.read_text()) if args.replay and output.exists() else None
    result = capture(json.loads(Path('data/current-source-specs.json').read_text()), Path(args.audit_dir), args.replay, reference)
    # Preserve first retrieval for unchanged responses, even after a later GET.
    if output.exists():
        previous = json.loads(output.read_text())
        for source in result['sources']:
            old = next((s for s in previous['sources'] if s['id'] == source['id'] and s['sha256'] == source['sha256']), None)
            if old:
                source['retrievedAt'] = old['retrievedAt']
        for model in result['models']:
            model['retrievedAt'] = next(s['retrievedAt'] for s in result['sources'] if s['id'] == model['sourceId'])
            model.pop('factualProjectionSha256')
            model['factualProjectionSha256'] = digest(model)
        for row in result['bridgeBench']['records']:
            row['retrievedAt'] = next(s['retrievedAt'] for s in result['sources'] if s['url'] == row['resultUrl'])
            row.pop('factualProjectionSha256')
            row['factualProjectionSha256'] = digest(row)
    temp = output.with_suffix('.tmp')
    temp.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    temp.replace(output)
    print(f"Captured {len(result['sources'])} primary responses; {sum(m['identityVerified'] for m in result['models'])}/{len(result['models'])} exact model identities; {len(result['bridgeBench']['records'])} BridgeBench models.")
