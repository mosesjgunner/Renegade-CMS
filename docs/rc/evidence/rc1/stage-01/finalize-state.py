"""Record documentation commit and unchanged pending implementation; never edit source."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent

def git(*args):
    p = subprocess.run(['git', *args], cwd=ROOT, capture_output=True)
    return p.returncode, p.stdout

tree = json.loads((OUT / 'tested-tree.json').read_text())
initial = json.loads((OUT / 'inventory.json').read_text())
head = git('rev-parse', 'HEAD')[1].decode().strip()
modified = git('diff', '--name-only')[1].decode().splitlines()
untracked = git('ls-files', '--others', '--exclude-standard')[1].decode().splitlines()
pending_original = [p for p in initial['trackedModifications'] + initial['untrackedFiles'] if p in modified or p in untracked]
preserved = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == tree['files'][p] for p in initial['trackedModifications'] + initial['untrackedFiles'])
history = json.loads((OUT / 'historical-artifacts.json').read_text())
history_preserved = all(hashlib.sha256((ROOT / r['path']).read_bytes()).hexdigest() == r['sha256'] for r in history)
archive_path = 'docs/rc/evidence/rc1/stage-01/historical/FINAL_RC_REPORT-2026-10-08.md'
blob_exit, archive_blob = git('show', f'{head}:{archive_path}')
archive_preserved = blob_exit == 0 and hashlib.sha256(archive_blob).hexdigest() == tree['files']['docs/rc/FINAL_RC_REPORT.md']
delta_exit, delta = git('diff', '--name-only', tree['baseHead'], head)
executable_paths = [p for p in delta.decode().splitlines() if p.startswith(('src/', 'tests/', 'scripts/')) or p in ['compose.restore.yaml', '.env.example', 'package.json', 'package-lock.json']]
check_exit, check_output = git('diff', f'{head}^', head, '--check')
receipt = {'documentationCommit': head, 'documentationCommitCommand': 'git commit -m "docs(rc1): establish Stage 01 source-bound baseline and acceptance scope"', 'documentationCommitExitCode': 0, 'executableBaseHead': tree['baseHead'], 'testedTreeManifest': 'tested-tree.json', 'testedTreeDigest': tree['manifestDigest'], 'committedDifferenceCommand': f'git diff --name-only {tree["baseHead"]} {head}', 'committedDifferenceExitCode': delta_exit, 'committedPaths': delta.decode().splitlines(), 'committedExecutablePaths': executable_paths, 'pendingOriginalPaths': pending_original, 'pendingOriginalTrackedCount': sum(p in initial['trackedModifications'] for p in pending_original), 'pendingOriginalUntrackedCount': sum(p in initial['untrackedFiles'] for p in pending_original), 'preservation': {'all83OriginalUserPathsByteIdentical': preserved, 'all607HistoricalArtifactsByteIdentical': history_preserved, 'archivedFinalReportGitBlobByteIdentical': archive_preserved}, 'postCommitDiffCheck': {'command': f'git diff {head}^ {head} --check', 'exitCode': check_exit, 'outputBytes': len(check_output)}, 'followupCommitScope': 'Record final state and CR-at-EOL receipt attributes only; no executable changes or additional acceptance.'}
(OUT / 'git-state.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'documentationCommit': head, 'pendingTracked': receipt['pendingOriginalTrackedCount'], 'pendingUntracked': receipt['pendingOriginalUntrackedCount'], 'preservation': receipt['preservation'], 'committedExecutablePaths': executable_paths}))
if not preserved or not history_preserved or not archive_preserved or executable_paths or check_exit: raise SystemExit('Final preservation or containment check failed')
