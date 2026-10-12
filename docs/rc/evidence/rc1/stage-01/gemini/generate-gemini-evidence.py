import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
OUT = Path(__file__).resolve().parent

# 1. Inventory git state
head_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
status_out = subprocess.check_output(['git', 'status', '--porcelain=v1', '--untracked-files=all'], cwd=ROOT, text=True)

tracked_mods = []
untracked = []
for line in status_out.splitlines():
    if not line:
        continue
    code = line[:2]
    path = line[3:].strip()
    path = path.replace('\\', '/').strip('"')
    if code == '??':
        untracked.append(path)
    else:
        tracked_mods.append(path)

wt_out = subprocess.check_output(['git', 'worktree', 'list', '--porcelain'], cwd=ROOT, text=True)
worktrees = []
cur_wt = {}
for line in wt_out.splitlines():
    if line.startswith('worktree '):
        cur_wt = {'worktree': line.split(' ', 1)[1]}
    elif line.startswith('HEAD '):
        cur_wt['head'] = line.split(' ', 1)[1]
    elif line.startswith('branch '):
        cur_wt['branch'] = line.split(' ', 1)[1]
    elif not line and cur_wt:
        worktrees.append(cur_wt)
        cur_wt = {}
if cur_wt:
    worktrees.append(cur_wt)

inventory = {
    'head': head_sha,
    'trackedModifications': sorted(tracked_mods),
    'untrackedFiles': sorted(untracked),
    'worktrees': worktrees,
}
(OUT / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n', encoding='utf-8')
print(f'Inventory written: {len(tracked_mods)} tracked mods, {len(untracked)} untracked files.')

# 2. Run focused checks
changed = [p for p in (tracked_mods + untracked) if not p.startswith('docs/rc/evidence/rc1/stage-01/gemini/')]
tests = sorted(
    {p for p in changed if p.startswith('tests/unit/') and p.endswith(('.ts', '.tsx'))}
    | {
        'tests/unit/staff-enrollment.test.ts',
        'tests/unit/rc08d-lock-projection.test.ts',
        'tests/unit/authorization-matrix.test.ts',
    }
)
sources = sorted(p for p in changed if p.endswith(('.ts', '.tsx')) and p != 'src/payload-types.ts')

env = os.environ.copy()
env.update({
    'NODE_ENV': 'test',
    'DATABASE_URL': (
        'postgresql://rc1_disposable:unit_only@127.0.0.1:1/rc1_stage01_disposable_release_acceptance'
    ),
    'PAYLOAD_SECRET': 'rc1-stage01-unit-only-synthetic-secret-32-characters',
    'APP_URL': 'http://localhost:3110',
    'RENEGADE_MODULES': 'all',
})

result = {
    'scope': 'Stage 01 Gemini focused pre-commit review; not release acceptance',
    'baseHead': head_sha,
    'runtime': {
        'nodeEnv': 'test',
        'database': (
            'non-listening loopback port 1, explicitly disposable name; no database provisioned'
        ),
        'modules': 'all',
        'browser': 'unexecuted',
        'media': 'unused',
        'providers': 'mocked unit boundaries only',
    },
    'checks': [],
}

commands = [
    (
        'focused-unit',
        [
            'node',
            'node_modules/vitest/vitest.mjs',
            'run',
            *tests,
            '--reporter=default',
            '--reporter=json',
            '--outputFile=' + str(OUT / 'focused-unit.json'),
        ],
    ),
    (
        'focused-lint',
        ['node', 'node_modules/eslint/bin/eslint.js', *sources, '--max-warnings=0'],
    ),
    (
        'focused-format',
        [
            'node',
            'node_modules/prettier/bin/prettier.cjs',
            '--check',
            *[
                p
                for p in changed
                if p.endswith(('.ts', '.tsx', '.md', '.yaml'))
                and not p.startswith('docs/rc/evidence/rc1/stage-01/gemini/')
            ],
        ],
    ),
    ('diff-check', ['git', 'diff', '--check']),
]

for name, cmd in commands:
    with (OUT / f'{name}.log').open('w', encoding='utf-8') as log:
        p = subprocess.run(cmd, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    row = {
        'name': name,
        'command': subprocess.list2cmdline(cmd),
        'exitCode': p.returncode,
        'log': f'{name}.log',
    }
    if name == 'focused-unit' and (OUT / 'focused-unit.json').exists():
        data = json.loads((OUT / 'focused-unit.json').read_text(encoding='utf-8'))
        row['counts'] = {
            key: data.get(key)
            for key in [
                'numTotalTestSuites',
                'numPassedTestSuites',
                'numFailedTestSuites',
                'numTotalTests',
                'numPassedTests',
                'numFailedTests',
                'numPendingTests',
                'numTodoTests',
            ]
        }
        row['fileCount'] = len(data.get('testResults', []))
    result['checks'].append(row)
    print(f'Check {name}: exit code {p.returncode}')

(OUT / 'focused-checks.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print('Focused checks completed and saved.')
