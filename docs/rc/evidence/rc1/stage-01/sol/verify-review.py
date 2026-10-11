"""Verify documentation coverage, preservation and executable containment."""
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[6]
OUT = pathlib.Path(__file__).resolve().parent
rows = json.loads((OUT/'claim-ownership.json').read_text())
registry = (ROOT/'src/modules/module-registry.ts').read_text()
objects = []
starts = list(re.finditer(r"\n    id: '([^']+)'", registry))
for i, match in enumerate(starts):
    section = registry[match.start():starts[i+1].start() if i+1<len(starts) else registry.index('export function parseEnabledModules')]
    for field in ['collections','globals','tasks']:
        block = re.search(field+r': \[([\s\S]*?)\]',section)
        if not block: continue
        for slug in re.findall(r"'([^']+)'",block.group(1)):
            objects.append({'module':match.group(1),'kind':field,'slug':slug,
                            'owner':'Gemini 02 schema/registration; Gemini 03 configuration/roles; Gemini 04 actual outcome; corresponding Sol independent closure',
                            'gates':['02','03','04','05','06','07'],'classification':'rerun required'})
(OUT/'registered-object-ownership.json').write_text(json.dumps(objects,indent=2)+'\n',encoding='utf-8')
tested = json.loads((OUT/'tested-tree.json').read_text())
changed = [p for p,h in tested['files'].items() if not (ROOT/p).exists() or hashlib.sha256((ROOT/p).read_bytes()).hexdigest()!=h]
executable_changed = [p for p in changed if not p.startswith('docs/rc/')]
preservation = json.loads((OUT.parent/'historical-artifacts.json').read_text())
historical_diffs = [r['path'] for r in preservation if hashlib.sha256((ROOT/r['path']).read_bytes()).hexdigest()!=r['sha256']]
gemini_before = json.loads((OUT/'preservation.json').read_text())['geminiArtifactHashes']
gemini_diffs = [p for p,h in gemini_before.items() if hashlib.sha256((ROOT/p).read_bytes()).hexdigest()!=h]
docs = ['docs/rc/'+n for n in ['FINAL_RC_REPORT.md','BLOCKERS.md','HANDOFF.md','RC_SCOPE.md','CAPABILITY_LEDGER.md','ROUTE_MATRIX.md','PROVIDER_MATRIX.md','SECURITY_LEDGER.md','README.md','RC1-SCOPE.md','RC1-ACCEPTANCE-MATRIX.md','RC1-PLAN-AND-PROMPTS.md']]
result = {'sourceManifest':'tested-tree.json', 'sourceDigest':tested['manifestDigest'],
          'documentationOnlyDifferencesSinceChecks':changed,'executableDifferencesSinceChecks':executable_changed,
          'historicalArtifactsChecked':len(preservation),'historicalDifferences':historical_diffs,
          'geminiArtifactsChecked':len(gemini_before),'geminiDifferences':gemini_diffs,
          'assignedEntries':len(rows),'unassignedEntries':sum(not r.get('owner') or not r.get('acceptanceStages') for r in rows),
          'registeredObjectsAssigned':len(objects),'checks':[]}
for name, cmd in [('documentation-format',['node','node_modules/prettier/bin/prettier.cjs','--check',*docs]),
                  ('diff-check',['git','diff','--check'])]:
    with (OUT/(name+'.log')).open('w',encoding='utf-8') as log:
        p = subprocess.run(cmd,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
    result['checks'].append({'name':name,'commandArguments':cmd,'exitCode':p.returncode,'log':name+'.log'})
result['exitCode'] = int(bool(executable_changed or historical_diffs or gemini_diffs or result['unassignedEntries'] or any(r['exitCode'] for r in result['checks'])))
result['counts'] = {'passed':sum(not x for x in [executable_changed,historical_diffs,gemini_diffs,result['unassignedEntries']])+sum(r['exitCode']==0 for r in result['checks']),
                    'failed':int(bool(result['exitCode'])),'skipped':0,'unexecutedAcceptanceStages':['02','03','04','05','06','07']}
(OUT/'documentation-verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ['checks','documentationOnlyDifferencesSinceChecks']}))
raise SystemExit(result['exitCode'])
