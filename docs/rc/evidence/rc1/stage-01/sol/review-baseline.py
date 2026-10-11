"""Read-only source audit and focused checks; no database/browser/provider execution."""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[6]
OUT = pathlib.Path(__file__).resolve().parent
BASE = OUT.parent

def dump(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')

def git(*args):
    p = subprocess.run(['git', *args], cwd=ROOT, capture_output=True)
    if p.returncode:
        raise RuntimeError('git ' + ' '.join(args) + ' failed: ' + str(p.returncode))
    return p.stdout.decode('utf-8').strip()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def snapshot():
    files = sorted(set(git('ls-files').splitlines() + git('ls-files', '--others', '--exclude-standard').splitlines()))
    hashes = {p: sha(ROOT / p) for p in files if (ROOT / p).is_file()
              and not p.startswith('docs/rc/evidence/rc1/stage-01/')
              and (not p.startswith('.env') or p == '.env.example')}
    canonical = json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode()
    return {'baseHead': git('rev-parse', 'HEAD'), 'fileHashAlgorithm': 'sha256',
            'manifestDigest': hashlib.sha256(canonical).hexdigest(), 'files': hashes,
            'exclusions': ['stage-01 evidence self-reference', 'ignored runtime/private files', 'private .env files; .env.example included'],
            'canonicalDigestEncoding': 'UTF-8 compact JSON of sorted files map'}

if '--checks' in sys.argv:
    manifest = snapshot()
    dump('tested-tree.json', manifest)
    inventory = json.loads((OUT / 'inventory.json').read_text())
    changed = inventory['trackedModifications'] + inventory['untrackedCandidateFiles']
    tests = sorted({p for p in changed if p.startswith('tests/unit/') and p.endswith(('.ts', '.tsx'))}
                   | {'tests/unit/staff-enrollment.test.ts', 'tests/unit/rc08d-lock-projection.test.ts', 'tests/unit/authorization-matrix.test.ts'})
    sources = sorted(p for p in changed if p.endswith(('.ts', '.tsx')) and p != 'src/payload-types.ts')
    env = os.environ.copy()
    env.update(NODE_ENV='test', DATABASE_URL='postgresql://rc1_disposable:unit_only@127.0.0.1:1/rc1_stage01_disposable_release_acceptance',
               PAYLOAD_SECRET='rc1-stage01-unit-only-synthetic-secret-32-characters', APP_URL='http://localhost:3110', RENEGADE_MODULES='all')
    result = {'scope': 'independent focused review; not release acceptance', 'baseHead': manifest['baseHead'],
              'testedTreeManifest': 'tested-tree.json', 'testedTreeDigest': manifest['manifestDigest'],
              'runtime': {'database': 'non-listening loopback port 1, synthetic disposable name; not provisioned',
                          'nodeEnv': 'test', 'modules': 'all', 'appUrl': 'http://localhost:3110',
                          'browser': 'unexecuted', 'media': 'unused', 'provider': 'mocked unit boundaries only'},
              'versions': {'node': subprocess.check_output(['node', '--version'], text=True).strip(),
                           'npm': subprocess.check_output(['npm.cmd', '--version'], text=True, shell=True).strip()}, 'checks': []}
    commands = [('focused-unit', ['node', 'node_modules/vitest/vitest.mjs', 'run', *tests, '--reporter=default', '--reporter=json', '--outputFile=' + str(OUT/'focused-unit.json')]),
                ('focused-lint', ['node', 'node_modules/eslint/bin/eslint.js', *sources, '--max-warnings=0']),
                ('focused-format', ['node', 'node_modules/prettier/bin/prettier.cjs', '--check', *[p for p in changed if p.endswith(('.ts','.tsx','.md','.yaml'))]]),
                ('diff-check', ['git', 'diff', '--check'])]
    for i, (name, cmd) in enumerate(commands):
        with (OUT/(name+'.log')).open('w', encoding='utf-8') as log:
            p = subprocess.run(cmd, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        row = {'name': name, 'commandArguments': cmd, 'exitCode': p.returncode, 'log': name+'.log'}
        if name == 'focused-unit':
            data = json.loads((OUT/'focused-unit.json').read_text())
            row['counts'] = {k: data.get(k) for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests','numTodoTests']}
            row['fileCount'] = len(data['testResults'])
        result['checks'].append(row)
        dump('focused-checks.json', result)
        print(json.dumps(row), flush=True)
        if p.returncode:
            result['unexecutedChecks'] = [n for n, _ in commands[i+1:]]
            dump('focused-checks.json', result)
            sys.exit(p.returncode)
    current = snapshot()
    dump('post-check-source.json', {'digestBefore': manifest['manifestDigest'], 'digestAfter': current['manifestDigest'],
                                   'unchanged': current['files'] == manifest['files']})
    sys.exit(0)

tracked = git('diff', '--name-only').splitlines()
untracked = git('ls-files', '--others', '--exclude-standard').splitlines()
candidate = [p for p in untracked if not p.startswith('docs/rc/evidence/rc1/stage-01/')]
inventory = {'head': git('rev-parse','HEAD'), 'indexPaths': git('diff','--cached','--name-only').splitlines(),
             'trackedModifications': tracked, 'untrackedCandidateFiles': candidate,
             'untrackedEvidenceFiles': [p for p in untracked if p not in candidate],
             'worktrees': git('worktree','list','--porcelain'), 'status': git('status','--porcelain=v1')}
dump('inventory.json', inventory)
old = json.loads((BASE/'candidate-groups.json').read_text())
disposition = []
for group, entries in old.items():
    for entry in entries:
        path = ROOT / entry['path']
        disposition.append({**entry, 'group': group, 'currentSha256': sha(path) if path.exists() else None,
                            'changedSinceOctober09': path.exists() and sha(path) != entry['initialSha256'],
                            'currentDisposition': 'documentation reviewed in Stage 01' if group == 'stage-01-plan' else 'still uncommitted; Gemini Stage 02 review/repair/commit; Sol Stage 02 verify'})
dump('candidate-disposition.json', disposition)
historical = json.loads((BASE/'historical-artifacts.json').read_text())
bad = [r['path'] for r in historical if not (ROOT/r['path']).exists() or sha(ROOT/r['path']) != r['sha256']]
gemini = {p.relative_to(ROOT).as_posix(): sha(p) for p in (BASE/'gemini').rglob('*') if p.is_file()}
dump('preservation.json', {'historicalArtifactsChecked': len(historical), 'historicalDifferences': bad, 'geminiArtifactHashes': gemini})
attribution = json.loads((BASE/'attachment-attribution.json').read_text())
dump('attachment-check.json', [{**a, 'currentlyExists': pathlib.Path(a['path']).exists(),
                               'matchesRecordedHash': pathlib.Path(a['path']).exists() and sha(pathlib.Path(a['path'])) == a['sha256']} for a in attribution])
rows = json.loads((BASE/'acceptance-inventory.json').read_text())
def gates(text, kind=''):
    s = text.lower()
    if kind == 'security': return ['05']
    if any(x in s for x in ['backup','restore','rollback','upgrade','maintenance','operational-status']): return ['06']
    if any(x in s for x in ['commerce','shop','cart','checkout','catalog','fulfillment','subscription','donation','affiliate','payment','refund','telecom','audience','newsletter','consent','suppression','forum','discussion','messages','notification','crm','automation','social','network','federat','webhook','connection','integration','release','event','calendar','timeline','analytics','experience','quality','sources','form','media-studio','podcast','video','books','graphic','tts','transcrib','ai/','ai.']): return ['04']
    return ['03']
for row in rows:
    stage = gates(row['item'] + ' ' + ' '.join(row.get('originalColumns',[])), 'security' if 'SECURITY' in row['ledger'] else '')
    row.update(acceptanceStages=stage + ([] if stage==['05'] else ['05']) + ['07'],
               owner='Gemini Stage '+stage[0]+' execute/repair; Sol Stage '+stage[0]+' independently verify',
               closureOwner='Sol Stage 07', classification='rerun required',
               reason='Historical ledger entry; no current runtime PASS. Specific repair/external overrides in REVIEW.md and mandatory-gates.md control.')
routes = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT/'src/app').rglob('*') if p.name in ['route.ts','page.tsx','page.ts'])
for p in routes:
    stage = gates(p)
    rows.append({'ledger':'current route source','item':p,'classification':'rerun required', 'acceptanceStages':stage+['05','07'],
                 'owner':'Gemini Stage '+stage[0]+' execute/repair; Sol Stage '+stage[0]+' independently verify',
                 'closureOwner':'Sol Stage 07','requirements':['allowed outcome and persisted/refetched state or approved explicit unavailable state','five actor/two site policy','cross-object denial leaves state unchanged','module-enabled and module-disabled behavior']})
registry = (ROOT/'src/modules/module-registry.ts').read_text()
modules = re.findall(r"\n    id: '([^']+)'",registry)
for module in modules:
    rows.append({'ledger':'current module registry','item':module,'classification':'rerun required',
                 'acceptanceStages':['02','03','04','05','06','07'],
                 'owner':'Gemini Stage 02 schema/registration; Gemini Stage 03 configuration/roles; Gemini Stage 04 outcomes; corresponding Sol independent verification',
                 'closureOwner':'Sol Stage 07', 'requirements':['every registered collection/global/task, API and visible control','persisted ordinary outcome or previously approved honest unavailable state','optional provider absence does not excuse broken shipping workflow']})
dump('claim-ownership.json',rows)
dump('coverage-check.json',{'command':'python docs/rc/evidence/rc1/stage-01/sol/review-baseline.py',
                           'exitCode':0 if not bad and len(modules)==17 and all(r.get('owner') and r.get('acceptanceStages') for r in rows) else 1,
                           'historicalLedgerEntries':len(rows)-len(routes)-len(modules),'currentRoutesAndPages':len(routes),
                           'moduleIds':modules,'assignedEntries':len(rows),'unassignedEntries':sum(not r.get('owner') or not r.get('acceptanceStages') for r in rows),
                           'passed':3 if not bad else 2,'failed':int(bool(bad)), 'skipped':0,
                           'limit':'assignment completeness only; not executable capability coverage; granular overrides mandatory-gates.md govern'})
print(json.dumps({'head':inventory['head'],'tracked':len(tracked),'untrackedCandidate':len(candidate),
                  'historicalDifferences':bad,'routes':len(routes),'modules':modules,'claimsAssigned':len(rows)}))
