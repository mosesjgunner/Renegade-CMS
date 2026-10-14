import json
import os
from pathlib import Path
import subprocess
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

out = Path('scratch/sol-evidence')
env = os.environ.copy()
for line in Path('.env.acceptance').read_text().splitlines():
    key, value = line.split('=', 1)
    env[key] = value
assert env['DATABASE_URL'].endswith('/solrc1_20261013_release_acceptance')
assert env['LOCAL_E2E_TEST_MODE'] == 'false'
env['NODE_ENV'] = 'test'
env['APP_URL'] = 'http://localhost:3000'
gates = [
    ('02-format', 'npm.cmd run format:check'),
    ('03-lint', 'npm.cmd run lint'),
    ('04-typecheck', 'npm.cmd run typecheck'),
    ('05-unit', 'npm.cmd test -- --reporter=default --reporter=json --outputFile=scratch/sol-evidence/unit.json'),
    ('06-fresh', 'npm.cmd run test:migrations:fresh'),
    ('07-upgrade', 'npm.cmd run test:migrations:upgrade'),
    ('08-commerce', 'npm.cmd run test:migrations:commerce'),
    ('09-integration', 'npm.cmd run test:integration -- --reporter=default --reporter=json --outputFile=scratch/sol-evidence/integration.json'),
    ('10-build', 'npm.cmd run build'),
    ('11-bundles', 'npm.cmd run verify:presentation-bundles'),
]
results = []
start_at = int(os.environ.get('SOL_START_GATE', '0'))
for index, (name, cmd) in enumerate(gates):
    if index < start_at:
        continue
    gate_env = env.copy()
    if name == '08-commerce':
        gate_env['DATABASE_URL'] = env['DATABASE_URL'].replace('20261013_release', '20261013_commerce_release')
    if name in ['10-build', '11-bundles']:
        gate_env['NODE_ENV'] = 'production'
        gate_env['APP_URL'] = 'https://dispatch.rc02.test:3129'
    started = time.time()
    print('START ' + name, flush=True)
    with (out / (name + '.log')).open('w', encoding='utf-8') as log:
        result = subprocess.run(cmd, shell=True, env=gate_env, stdout=log, stderr=subprocess.STDOUT)
    receipt = {'gate': name, 'command': cmd, 'exitCode': result.returncode,
               'durationSeconds': time.time() - started,
               'sourceSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
               'log': (out / (name + '.log')).as_posix()}
    results.append(receipt)
    (out / ('gates-from-' + str(start_at) + '.json')).write_text(json.dumps(results, indent=2)+'\n')
    print('END ' + name + ' exit=' + str(result.returncode), flush=True)
    if result.returncode:
        print((out / (name + '.log')).read_text(encoding='utf-8')[-5000:], flush=True)
        raise SystemExit(result.returncode)
