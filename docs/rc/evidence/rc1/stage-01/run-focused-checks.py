"""Focused pre-commit review only; no database, browser or provider acceptance."""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
inventory = json.loads((OUT / 'inventory.json').read_text())
tree = json.loads((OUT / 'tested-tree.json').read_text())
changed = inventory['trackedModifications'] + inventory['untrackedFiles']
tests = sorted({p for p in changed if p.startswith('tests/unit/') and p.endswith(('.ts', '.tsx'))} | {'tests/unit/staff-enrollment.test.ts', 'tests/unit/rc08d-lock-projection.test.ts', 'tests/unit/authorization-matrix.test.ts'})
sources = sorted(p for p in changed if p.endswith(('.ts', '.tsx')) and p != 'src/payload-types.ts')
env = os.environ.copy()
env.update({'NODE_ENV': 'test', 'DATABASE_URL': 'postgresql://rc1_disposable:unit_only@127.0.0.1:1/rc1_stage01_disposable_release_acceptance', 'PAYLOAD_SECRET': 'rc1-stage01-unit-only-synthetic-secret-32-characters', 'APP_URL': 'http://localhost:3110', 'RENEGADE_MODULES': 'all'})
result = {'scope': 'focused pre-commit review; not release acceptance', 'baseHead': tree['baseHead'], 'testedTreeManifest': 'tested-tree.json', 'testedTreeDigest': tree['manifestDigest'], 'runtime': {'nodeEnv': 'test', 'database': 'non-listening loopback port 1, explicitly disposable name; no database provisioned', 'modules': 'all', 'browser': 'unexecuted', 'media': 'unused', 'providers': 'mocked unit boundaries only'}, 'checks': []}
commands = [
    ('focused-unit', ['node', 'node_modules/vitest/vitest.mjs', 'run', *tests, '--reporter=default', '--reporter=json', '--outputFile=' + str(OUT / 'focused-unit.json')]),
    ('focused-lint', ['node', 'node_modules/eslint/bin/eslint.js', *sources, '--max-warnings=0']),
    ('focused-format', ['node', 'node_modules/prettier/bin/prettier.cjs', '--check', *[p for p in changed if p.endswith(('.ts', '.tsx', '.md', '.yaml'))]]),
    ('diff-check', ['git', 'diff', '--check']),
]
if '--resume-lint' in sys.argv:
    # Preserve the initial harness failure. The repository already excludes generated types.
    (OUT / 'focused-checks-attempt-1.json').write_bytes((OUT / 'focused-checks.json').read_bytes())
    (OUT / 'focused-lint-attempt-1.log').write_bytes((OUT / 'focused-lint.log').read_bytes())
    result = json.loads((OUT / 'focused-checks.json').read_text())
    result['checks'] = result['checks'][:1]
    result.pop('firstFailure', None)
    result.pop('unexecutedChecks', None)
    result['harnessCorrection'] = 'Exclude src/payload-types.ts from explicit lint arguments, matching existing repository ESLint generated-file exclusion; no code or lint rules changed.'
    commands = commands[1:]
for command_index, (name, cmd) in enumerate(commands):
    with (OUT / f'{name}.log').open('w', encoding='utf-8') as log:
        p = subprocess.run(cmd, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    row = {'name': name, 'command': subprocess.list2cmdline(cmd), 'exitCode': p.returncode, 'log': f'{name}.log'}
    if name == 'focused-unit' and (OUT / 'focused-unit.json').exists():
        data = json.loads((OUT / 'focused-unit.json').read_text())
        row['counts'] = {key: data.get(key) for key in ['numTotalTestSuites', 'numPassedTestSuites', 'numFailedTestSuites', 'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests']}
        row['fileCount'] = len(data.get('testResults', []))
    result['checks'].append(row)
    (OUT / 'focused-checks.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(row), flush=True)
    if p.returncode:
        result['firstFailure'] = name
        result['unexecutedChecks'] = [label for label, _ in commands[command_index + 1:]]
        (OUT / 'focused-checks.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        break
