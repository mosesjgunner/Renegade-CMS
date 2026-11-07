"""Check exported evidence for retained private keys, active cookies and JWTs."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

base = Path('docs/rc/evidence/rc1/18-pass/18C')
values = set()
for lane in ['batch', 'golden']:
    scratch = Path(f'scratch/rc118c-final-{lane}')
    for file in scratch.glob('*.env'):
        for line in file.read_text(encoding='utf-8-sig').splitlines():
            key, _, value = line.partition('=')
            if re.search(r'SECRET|PASSWORD|PRIVATE_KEY|ENCRYPTION_KEY', key) and len(value) >= 16:
                values.add(value.encode())
    for file in scratch.glob('*-session.json'):
        for cookie in json.loads(file.read_text())['cookies']:
            if any(x in cookie['name'] for x in ['passkey', 'csrf', 'member-session']):
                values.add(cookie['value'].encode())
    state = json.loads((scratch / 'state.json').read_text())
    for code in state.get('recoveryCodes', []):
        values.add(code.encode())
checked = 0
issues = []
for lane in ['batch', 'golden']:
    for file in (base / f'final-{lane}').rglob('*'):
        if not file.is_file() or file.suffix == '.png':
            continue
        if file.suffix == '.zip':
            with zipfile.ZipFile(file) as archive:
                entries = [(name, archive.read(name)) for name in archive.namelist()]
        else:
            entries = [('', file.read_bytes())]
        for name, data in entries:
            checked += 1
            if any(value in data for value in values) or re.search(rb'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', data):
                issues.append({'path': file.as_posix(), 'entry': name})
assert not issues, json.dumps(issues)
report = {'passed': True, 'exportedEntriesChecked': checked, 'credentialPatternsFound': 0, 'privateValuesChecked': len(values), 'rawTracesRetainedPrivately': True, 'maskedScreenshotsManuallyInspected': ['final-batch/setup-1794082413224-3.png']}
(base / 'evidence-safety.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
