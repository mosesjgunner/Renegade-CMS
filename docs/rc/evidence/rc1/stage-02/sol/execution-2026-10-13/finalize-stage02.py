import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import urlparse, unquote

root = Path.cwd()
destination = Path('C:/Projects/RENEGADE CMS/Renegade-CMS/docs/rc/evidence/rc1/stage-02/sol')
source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
assert source == 'f487dcb67f0649ffc1ecd09b9a47cc845d705f61'
assert not subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip()
gates = json.loads(Path('scratch/sol-evidence/gates-from-0.json').read_text())
assert len(gates) == 10 and all(g['exitCode'] == 0 and g['sourceSha'] == source for g in gates)
run = destination / 'execution-2026-10-13'
run.mkdir(parents=True, exist_ok=True)
history = destination / 'history-2026-10-11'
history.mkdir(exist_ok=True)
for name in ['HANDOFF.md', 'VERIFICATION.md', 'prerequisite-inspection.json']:
    if not (history / name).exists(): shutil.copyfile(destination / name, history / name)
env = dict(line.split('=', 1) for line in Path('.env.acceptance').read_text().splitlines())
secrets = [env['DATABASE_URL'], env['UPGRADE_MIGRATION_DATABASE_URL'], env['PAYLOAD_SECRET'], unquote(urlparse(env['DATABASE_URL']).password)]


def safe_text(path):
    data = Path(path).read_bytes()
    text = data.decode('utf-16') if data.startswith(b'\xff\xfe') else data.decode('utf-8', errors='replace')
    for value in secrets:
        text = text.replace(value, '[REDACTED]')
    return re.sub(r'(Renegade CMS setup token[^\n]*?: )([A-Za-z0-9_-]{43})', r'\1[REDACTED]', text)


files = []
for gate in [{'gate': '01-ci', 'command': 'npm.cmd ci --include=dev', 'exitCode': 0,
              'sourceSha': source, 'log': 'scratch/sol-evidence/candidate-04/01-ci.log'}, *gates]:
    path = run / (gate['gate'] + '.txt')
    path.write_text(safe_text(gate['log']), encoding='utf-8')
    gate['retainedLog'] = path.name
    files.append({'path': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
reports = {}
for name in ['unit', 'integration']:
    report = json.loads(Path('scratch/sol-evidence/' + name + '.json').read_text())
    assert report['numFailedTests'] == 0 and report['numPendingTests'] == 0
    (run / (name + '.json')).write_text(safe_text('scratch/sol-evidence/' + name + '.json'), encoding='utf-8')
    reports[name] = {k: report[k] for k in ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests']}
    reports[name]['files'] = len(report['testResults'])
shutil.copyfile('build-provenance.json', run / 'build-provenance.json')
manifest = []
for path in subprocess.check_output(['git', 'ls-files'], text=True).splitlines():
    file = root / path
    if file.is_file(): manifest.append({'path': path, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
(run / 'source-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
receipt = {
    'status': 'STAGE 02 SOL PASS', 'signedOffBy': 'Sol', 'date': '2026-10-13',
    'sourceSha': source, 'sourceClean': True, 'commands': [{'gate': '01-ci', 'command': 'npm.cmd ci --include=dev',
    'exitCode': 0, 'sourceSha': source, 'retainedLog': '01-ci.txt'}, *gates],
    'counts': {'commandsPassed': 11, 'commandsFailed': 0, 'commandsSkipped': 0, 'commandsUnexecuted': 0, **reports},
    'environment': {'node': 'v24.19.0', 'npm': '11.17.0', 'databaseContainer': 'sol-rc1-20261013-postgres',
        'containerLabel': 'purpose=disposable-sol-rc1-20261013', 'databaseHost': '127.0.0.1', 'databasePort': 15433,
        'freshAndIntegrationDatabase': 'solrc1_20261013_release_acceptance',
        'upgradeDatabase': 'solrc1_20261013_upgrade_acceptance', 'commerceDatabase': 'solrc1_20261013_commerce_release_acceptance',
        'media': str(root / 'scratch/sol-quality-media'), 'envFallback': False, 'initialTestAuth': False,
        'integrationBoundary': 'Some existing local fixtures explicitly enable test authentication; not ordinary browser proof.',
        'externalProviderCalls': False, 'imageDigest': None},
    'artifactHashes': files, 'repairs': ['Private uploaded digital fixture', 'Strict site/provider adapter binding and safe unconfigured errors',
        'Explicit artwork/placement preflight and HTTP/body error agreement', 'Failed-job/manual-handoff completion and complete sibling pagination',
        'Real validated shipping normalization and no invented address', 'Durable fulfillment recovery after paid receipt persistence'],
    'laterGates': 'Stage 03 ordinary browser and authorization, then the remaining assigned stages; RC1 NOT READY.',
}
(run / 'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'source': source, 'status': receipt['status'], 'counts': receipt['counts']}, indent=2))
