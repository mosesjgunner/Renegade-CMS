"""Read-only source inventory; writes only this stage's evidence directory."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
if (OUT / 'tested-tree.json').exists():
    raise SystemExit('Immutable Stage 01 snapshot already exists; use a new evidence directory for a new tree.')

def git(*args):
    p = subprocess.run(['git', *args], cwd=ROOT, capture_output=True)
    return p.returncode, p.stdout.decode('utf-8', errors='replace').strip()

def save(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

head = git('rev-parse', 'HEAD')[1]
tracked = git('ls-files', '-z')[1].split('\0')
untracked = git('ls-files', '--others', '--exclude-standard', '-z')[1].split('\0')
files = {}
for name in sorted(set(tracked + untracked)):
    if not name or name.startswith('docs/rc/evidence/rc1/stage-01/'):
        continue
    # Never read private environment files, credentials or generated runtime artifacts.
    if (Path(name).name.startswith('.env') and name != '.env.example') or name.startswith(('media/', 'scratch/', 'test-results/', '.next/', 'node_modules/')):
        continue
    path = ROOT / name
    files[name] = digest(path) if path.is_file() else None
manifest_digest = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
save('tested-tree.json', {'baseHead': head, 'fileHashAlgorithm': 'sha256', 'manifestDigest': manifest_digest, 'exclusions': ['stage-01 evidence (self-reference)', 'private environment/credentials', 'ignored runtime artifacts'], 'files': files})
save('inventory.json', {'baseHead': head, 'status': git('status', '--porcelain=v1', '--untracked-files=all')[1].splitlines(), 'index': git('diff', '--cached', '--name-status')[1].splitlines(), 'trackedModifications': git('diff', '--name-only')[1].splitlines(), 'untrackedFiles': [n for n in untracked if n and not n.startswith('docs/rc/evidence/rc1/stage-01/')], 'worktrees': git('worktree', 'list', '--porcelain')[1].splitlines(), 'diffNumstat': git('diff', '--numstat')[1].splitlines(), 'toolVersions': {tool: subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True).stdout.strip() for tool, cmd in [('node', ['node', '--version']), ('npm', ['npm.cmd', '--version']), ('python', ['python', '--version'])]}})
sources = ['100bd80fa8451ab04eb6e14c937697bb77970e4c', '7f0ef9f2defebf6443f407487a97f64248b5348f', 'd3a37e1d150cdf273b63afa8dc14b3d14296987a', '01908f39a3ce40b5eae5d4dec64b981e103d5fb1', 'b684ee11460637bf2177f349057f14d6e804bbbd', 'fb8c9d7c3211f4c257ad569edb366d089074e492', '97ce2c1e4a253289d0d4f9da66c154afce74c6e9']
save('containment.json', [{'historicalSha': sha, 'ancestorCommand': f'git merge-base --is-ancestor {sha} {head}', 'ancestorExitCode': git('merge-base', '--is-ancestor', sha, head)[0], 'changedCommittedPaths': git('diff', '--name-only', sha, head)[1].splitlines(), 'qualification': 'Ancestry proves commit containment only; changed behavior and dirty-tree files invalidate automatic reuse.'} for sha in sources])
receipts = []
for path in sorted((ROOT / 'docs/rc/evidence').rglob('*')):
    if path.is_file() and 'rc1' not in path.parts:
        receipts.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path), 'bytes': path.stat().st_size})
save('historical-artifacts.json', receipts)
matrix = []
for ledger in ['CAPABILITY_LEDGER', 'ROUTE_MATRIX', 'PROVIDER_MATRIX', 'SECURITY_LEDGER']:
    text = (ROOT / f'docs/rc/{ledger}.md').read_text(encoding='utf-8-sig')
    for line_no, line in enumerate(text.splitlines(), 1):
        if not line.startswith('|') or re.match(r'^\|\s*[-:]+\s*\|', line):
            continue
        cols = [v.strip() for v in line.strip('|').split('|')]
        if cols[0] in ['Capability', 'Capability ID', 'Surface', 'Boundary', 'Route', 'Adapter / boundary', 'Provider surface', 'Adapter source'] or 'Status' in cols:
            continue
        low = line.lower()
        stage = '03'
        if ledger == 'PROVIDER_MATRIX': stage = '04/05'
        elif ledger == 'SECURITY_LEDGER': stage = '05'
        elif any(t in low for t in ['commerce', 'audience', 'community', 'newsletter', 'telecom', 'crm', 'messages', 'notifications', 'donation', 'subscription', 'fulfillment', 'shop', 'affiliate']): stage = '04'
        elif any(t in low for t in ['operational', 'backup', 'restore', 'rollback', 'upgrade']): stage = '06'
        matrix.append({'ledger': f'docs/rc/{ledger}.md', 'line': line_no, 'item': cols[0], 'originalColumns': cols, 'classification': 'rerun required', 'stage': stage, 'requirements': ['ordinary permitted action and persisted/refetched result', 'wrong role and anonymous denial', 'foreign site/object denial without state change', 'empty/unconfigured/provider-error state', 'visible controls produce supported outcome'], 'roles': ['owner', 'administrator', 'staff', 'member', 'anonymous'], 'moduleConfigurations': ['Lean/default floor', 'Standard/default floor', 'Standard/all', 'Lean/all if advertised'], 'reason': 'Historical row is retained as inventory, not current-tree acceptance. See baseline report for bounded historical proof, repair and external prerequisite overrides.'})
# Capture current routes added since the original inventory was generated.
for path in sorted((ROOT / 'src/app').rglob('route.ts')):
    rel = path.relative_to(ROOT).as_posix()
    if not any(rel in ' '.join(row.get('originalColumns', [])) for row in matrix):
        stage = '04' if any(k in rel for k in ['commerce', 'fulfillment', 'telecom', 'community', 'audience']) else '03'
        matrix.append({'ledger': 'current route discovery', 'item': rel, 'classification': 'rerun required', 'stage': stage, 'roles': ['owner', 'administrator', 'staff', 'member', 'anonymous'], 'moduleConfigurations': ['Lean/default floor', 'Standard/default floor', 'Standard/all'], 'requirements': ['ordinary action/refetch', 'role/site/object negatives', 'unconfigured/error state']})
save('acceptance-inventory.json', matrix)
attachments = []
for folder in ['ff8fe46c-8269-44ad-85a2-63839e21c47c', 'ba453a3b-cd38-4414-9438-1ea42eceed65', 'c4a47fe4-9997-4f9a-a517-9711717da4b0']:
    p = Path('C:/Users/moses/.codex/attachments') / folder / 'Pasted text.txt'
    data = p.read_text(encoding='utf-8-sig')
    attachments.append({'path': str(p), 'sha256': digest(p), 'goldenDefinition': 'MANDATORY GOLDEN BROWSER JOURNEY' in data})
    if 'MANDATORY GOLDEN BROWSER JOURNEY' in data:
        golden = data.split('MANDATORY GOLDEN BROWSER JOURNEY', 1)[1].split('NEGATIVE/SECURITY PROOF', 1)[0].strip()
        (OUT / 'golden-journey.txt').write_text(golden + '\n', encoding='utf-8')
save('attachment-attribution.json', attachments)
print(json.dumps({'head': head, 'manifestDigest': manifest_digest, 'manifestFiles': len(files), 'acceptanceItems': len(matrix), 'historicalArtifacts': len(receipts), 'indexEmpty': not git('diff', '--cached', '--name-only')[1]}))
