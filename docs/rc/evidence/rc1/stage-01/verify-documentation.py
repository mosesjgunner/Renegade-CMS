"""Verify documentation changes independently of stopped executable acceptance."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
tree = json.loads((OUT / 'tested-tree.json').read_text())
initial = json.loads((OUT / 'inventory.json').read_text())
groups = json.loads((OUT / 'candidate-groups.json').read_text())
historical = json.loads((OUT / 'historical-artifacts.json').read_text())
result = {'scope': 'evidence-only documentation pre-commit validation; executable acceptance remains stopped', 'checks': []}
docs = ['FINAL_RC_REPORT', 'BLOCKERS', 'HANDOFF', 'RC_SCOPE', 'CAPABILITY_LEDGER', 'ROUTE_MATRIX', 'PROVIDER_MATRIX', 'SECURITY_LEDGER', 'README', 'RC1-SCOPE', 'RC1-ACCEPTANCE-MATRIX', 'RC1-PLAN-AND-PROMPTS']
commands = [('documentation-format', ['node', 'node_modules/prettier/bin/prettier.cjs', '--check', *[f'docs/rc/{n}.md' for n in docs]]), ('documentation-diff-check', ['git', 'diff', '--check', '--', 'docs/rc', '.prettierignore'])]
for name, cmd in commands:
    with (OUT / f'{name}.log').open('w', encoding='utf-8') as log:
        p = subprocess.run(cmd, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    result['checks'].append({'command': subprocess.list2cmdline(cmd), 'exitCode': p.returncode, 'log': f'{name}.log'})
    if p.returncode: raise SystemExit(f'{name} failed')
original_paths = initial['trackedModifications'] + initial['untrackedFiles']
changed = [p for p in original_paths if hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != tree['files'][p]]
history_changed = [r['path'] for r in historical if hashlib.sha256((ROOT / r['path']).read_bytes()).hexdigest() != r['sha256']]
group_paths = [row['path'] for rows in groups.values() for row in rows]
result['preservation'] = {'initialUserPaths': len(original_paths), 'changedInitialUserPaths': changed, 'historicalArtifacts': len(historical), 'changedHistoricalArtifacts': history_changed, 'candidateGroupingCompleteExactlyOnce': sorted(group_paths) == sorted(original_paths) and len(set(group_paths)) == len(group_paths), 'historicalFinalReportMatchesInitialHash': hashlib.sha256((OUT / 'historical/FINAL_RC_REPORT-2026-10-08.md').read_bytes()).hexdigest() == tree['files']['docs/rc/FINAL_RC_REPORT.md']}
result['summaryChange'] = 'Prepended current authorities while retaining historical summary text; formatted summary documents. Historical execution receipts and archived report bytes unchanged.'
(OUT / 'documentation-checks.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result['preservation']))
if changed or history_changed or not result['preservation']['candidateGroupingCompleteExactlyOnce']: raise SystemExit('Preservation failed')
