"""Export review evidence; keep complete credential-bearing browser traces private."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

golden = '--golden' in sys.argv
lane = 'golden' if golden else 'batch'
scratch = Path(f'scratch/rc118c-final-{lane}')
root = Path(f'docs/rc/evidence/rc1/18-pass/18C/final-{lane}')
project = 'rc118cgolden20261107' if golden else 'rc118cfinalb20261105'
restore_project = 'rc118cgoldenrestore20261107' if golden else 'rc118cfinalrestoreb20261105'
private_values = set()
sensitive = re.compile(r'(^|[-_])(authorization|cookie|set-cookie|password|secret|token|challenge|recoverycodes?|privatekey|credentialid)($|[-_])', re.I)


def secrets(value, key=''):
    if isinstance(value, dict):
        if 'Bootstrap token' in str(value.get('selector', '')) and isinstance(value.get('value'), str):
            private_values.add(value['value'])
        for k, v in value.items():
            secrets(v, k)
    elif isinstance(value, list):
        for v in value:
            secrets(v, key)
    elif isinstance(value, str):
        if sensitive.search(key) or any(word in key.lower() for word in ['password', 'secret', 'token', 'privatekey', 'recoverycode']) or key.lower() in ['credentialid', 'apikey', 'accessjwt', 'refreshjwt']:
            if len(value) >= 12:
                private_values.add(value)
        try:
            nested = json.loads(value)
            if isinstance(nested, (dict, list)):
                secrets(nested)
        except ValueError:
            pass


for file in scratch.glob('*.json'):
    try:
        secrets(json.loads(file.read_text(encoding='utf-8-sig')))
    except (ValueError, UnicodeError):
        pass
for file in scratch.glob('*.env'):
    for line in file.read_text(encoding='utf-8-sig').splitlines():
        key, _, value = line.partition('=')
        if re.search(r'SECRET|PASSWORD|PRIVATE_KEY|ENCRYPTION_KEY', key) and len(value) >= 12:
            private_values.add(value)


def redact(text):
    for value in sorted(private_values, key=len, reverse=True):
        text = text.replace(value, '[REDACTED]')
    text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED JWT]', text)
    text = re.sub(r'(?i)([?&](?:token|code|challenge)=)[^\s"&<>\\]+', r'\1[REDACTED]', text)
    text = re.sub(r'\b[A-F0-9]{20}\b', '[REDACTED RECOVERY CODE]', text)
    text = re.sub(r'(?i)(setup token[^\n]*?: )\S+', r'\1[REDACTED]', text)
    text = re.sub(r'-----BEGIN (?:RSA )?PRIVATE KEY-----.*?-----END (?:RSA )?PRIVATE KEY-----', '[REDACTED PRIVATE KEY]', text, flags=re.S)
    return text


def clean(value):
    if isinstance(value, dict):
        if str(value.get('name', '')).lower() in ['cookie', 'set-cookie', 'authorization', 'x-member-csrf']:
            return {**value, 'value': '[REDACTED]'}
        return {k: '[REDACTED]' if sensitive.search(k) or any(word in k.lower() for word in ['password', 'secret', 'token', 'privatekey', 'recoverycode']) or k.lower() in ['connectionreference', 'apikey', 'cookies', 'accessjwt', 'refreshjwt', 'clientdatajson', 'authenticatordata', 'signature', 'rawid'] else clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, str):
        try:
            nested = json.loads(value)
            if isinstance(nested, (dict, list)):
                return json.dumps(clean(nested))
        except ValueError:
            pass
        return redact(value)
    return value


def clean_text(text):
    lines = []
    for line in text.splitlines():
        try:
            lines.append(json.dumps(clean(json.loads(line)), separators=(',', ':')))
        except ValueError:
            lines.append(redact(line))
    return '\n'.join(lines)


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def log_text(file):
    data = file.read_bytes()
    return data.decode('utf-16') if data.startswith((b'\xff\xfe', b'\xfe\xff')) else data.decode('utf-8', errors='replace')


manifest = {'rawTraces': [], 'logs': [], 'policy': 'Complete raw traces remain private in scratch. Review copies redact credentials and omit raster trace frames; separately captured masked screenshots remain in evidence.'}
traces = root / 'traces'
traces.mkdir(exist_ok=True)
for file in sorted(scratch.glob('*-raw-trace.zip')):
    target = traces / file.name.replace('-raw-trace', '-review-trace')
    omitted = 0
    with zipfile.ZipFile(file) as source, zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as out:
        for name in source.namelist():
            try:
                for line in source.read(name).decode('utf-8').splitlines():
                    try:
                        secrets(json.loads(line))
                    except ValueError:
                        pass
            except UnicodeError:
                pass
        for name in source.namelist():
            data = source.read(name)
            if data.startswith((b'\x89PNG', b'\xff\xd8\xff', b'GIF8', b'RIFF')):
                omitted += 1
                continue
            try:
                data = clean_text(data.decode('utf-8')).encode('utf-8')
            except UnicodeError:
                pass
            out.writestr(name, data)
    manifest['rawTraces'].append({'path': file.as_posix(), 'sha256': sha(file), 'bytes': file.stat().st_size, 'review': target.as_posix(), 'reviewSha256': sha(target), 'omittedRasterFrames': omitted})
for suffix in ['renegade-web', 'renegade-worker', 'postgres', 'migrate', 'mailpit', 'local-peer', 'tls-proxy']:
    for instance in [project, restore_project]:
        name = f'{instance}-{suffix}-1'
        result = subprocess.run(['docker', 'logs', '--timestamps', name], capture_output=True)
        if result.returncode:
            continue
        raw = scratch / f'{name}-server.log'
        raw.write_bytes(result.stdout + result.stderr)
        target = root / raw.name
        target.write_text(clean_text(log_text(raw)), encoding='utf-8')
        manifest['logs'].append({'path': target.as_posix(), 'sha256': sha(target), 'rawSha256': sha(raw), 'exit': result.returncode})
for raw in scratch.glob('*-complete.log'):
    target = root / raw.name
    target.write_text(clean_text(log_text(raw)), encoding='utf-8')
    manifest['logs'].append({'path': target.as_posix(), 'sha256': sha(target), 'rawSha256': sha(raw)})
checks = []
for file in sorted(root.glob('*-checks.json')):
    for item in json.loads(file.read_text(encoding='utf-8')):
        checks.append({'file': file.name, **item})
manifest['checks'] = {'passed': sum(x['passed'] for x in checks), 'failed': sum(not x['passed'] for x in checks), 'skipped': 0, 'items': checks}
latest = {}
for item in checks:
    match = re.match(r'(.+)-(\d+)-checks.json$', item['file'])
    phase, timestamp = (match[1], int(match[2])) if match else (item['file'], 0)
    key = (phase, item.get('profile', 'Standard/all').replace('/', '-'))
    if key not in latest or timestamp > latest[key][0]:
        latest[key] = (timestamp, item['file'])
accepted = [x for x in checks if x['file'] in {v[1] for v in latest.values()}]
manifest['finalAcceptance'] = {'passed': sum(x['passed'] for x in accepted), 'failed': sum(not x['passed'] for x in accepted), 'skipped': 0, 'items': accepted}
manifest['harness'] = [{'path': file.as_posix(), 'sha256': sha(file)} for file in sorted(Path('tests/rc1-18c').glob('*')) if file.is_file()]
manifest['image'] = subprocess.check_output(['docker', 'image', 'inspect', 'renegade-cms:rc118c-batch-shipping-20261107', '--format', '{{.Id}}'], text=True).strip()
(root / 'evidence-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({'traces': len(manifest['rawTraces']), 'logs': len(manifest['logs']), 'passed': manifest['checks']['passed'], 'failed': manifest['checks']['failed'], 'image': manifest['image']}))
