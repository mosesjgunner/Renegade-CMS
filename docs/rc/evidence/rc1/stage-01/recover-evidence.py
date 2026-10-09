"""Extract bounded facts; never copy private sessions, env files or raw scratch logs."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
SCRATCH = ROOT / 'scratch/implementation-closure'

def read(name):
    return json.loads((SCRATCH / name).read_text(encoding='utf-8-sig'))

recovered = {'classification': 'historical workflow artifacts found; current-source acceptance requires rerun', 'testedSha': None, 'testedTreeManifestAtExecution': None, 'artifacts': []}
for name in ['browser-observations.json', 'install2/staff-results.json', 'digital.json', 'digital-recovery.json', 'payment-recovery.json', 'digital-preflight.json', 'paid-checkout.json', 'install2/restart.json', 'operational-backup/manifest.json']:
    path = SCRATCH / name
    data = read(name)
    row = {'localPath': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size, 'sourceBinding': 'missing historical tested-tree manifest; do not assign current SHA'}
    if name.endswith('staff-results.json'):
        row['stats'] = data.get('stats')
        row['runnerErrorCount'] = len(data.get('errors', []))
        specs = []
        def walk(suite):
            for spec in suite.get('specs', []):
                specs.append({'title': spec['title'], 'ok': spec['ok'], 'statuses': [r['status'] for t in spec.get('tests', []) for r in t.get('results', [])]})
            for nested in suite.get('suites', []): walk(nested)
        for suite in data.get('suites', []): walk(suite)
        row['specs'] = specs
    elif name == 'digital.json': row['assertions'] = {'bytesMatch': data.get('bytesMatch'), 'downloadPathPresent': bool(data.get('path'))}
    elif name == 'digital-preflight.json': row['assertions'] = {'status': data.get('status'), 'providerAttempts': data.get('providerAttempts')}
    elif name == 'digital-recovery.json': row['assertions'] = {'orderPresent': bool(data.get('orderId')), 'downloadCount': data.get('downloads') if isinstance(data.get('downloads'), int) else len(data.get('downloads', []))}
    elif name == 'paid-checkout.json': row['assertions'] = {'orderPresent': bool(data.get('orderId')), 'amountMinor': data.get('amountMinor')}
    elif name == 'operational-backup/manifest.json':
        row['assertions'] = {'format': data.get('format'), 'version': data.get('version'), 'totals': data.get('totals'), 'files': [{k: f.get(k) for k in ['path', 'sizeBytes', 'sha256']} for f in data.get('files', [])]}
    else: row['assertions'] = {'recordCount': len(data) if isinstance(data, list) else 1, 'valuesWithheld': 'state/session/runtime details may include bearer authority'}
    recovered['artifacts'].append(row)
(OUT / 'recovered-workflow-artifacts.json').write_text(json.dumps(recovered, indent=2) + '\n', encoding='utf-8')
historical = []
for name in ['rc-02/source-attribution.json', 'rc-03-pass3/checks.json', 'rc-04-pass2-recheck/checks.json', 'rc-08c-2026-10-06/checks.json']:
    path = ROOT / 'docs/rc/evidence' / name
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    hashes = data.get('sourceFiles', {})
    comparison = [{'path': p, 'matchesCurrentBytes': (ROOT / p).is_file() and hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == sha} for p, sha in hashes.items()]
    historical.append({'path': path.relative_to(ROOT).as_posix(), 'sourceSha': data.get('testedSourceSHA', data.get('sourceSha', data.get('candidateSha'))), 'recordedSourceFileComparisons': comparison, 'qualification': 'Retain historical bounded results; matching selected files is not full dependency or current behavior containment.'})
(OUT / 'historical-proof-review.json').write_text(json.dumps(historical, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'recoveredArtifacts': len(recovered['artifacts']), 'staffStats': recovered['artifacts'][1].get('stats'), 'digitalByteEquality': recovered['artifacts'][2]['assertions']}))
