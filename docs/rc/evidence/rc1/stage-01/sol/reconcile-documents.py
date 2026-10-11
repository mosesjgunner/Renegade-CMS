"""Append current authority without rewriting historical receipts or ledger rows."""
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[6]
OUT = pathlib.Path(__file__).resolve().parent
notice = (
    '> October 11 final completion run: **STAGE 01 SOL PASS; RC1 NOT READY**. '
    'Sol independently reviewed HEAD `764e77dd869564e13ab5add7e10710f2cb6c61e9` plus the '
    '[full dirty-tree manifest](evidence/rc1/stage-01/sol/tested-tree.json). '
    'Focused review: 22 files / 155 passed / 0 failed / 0 skipped; focused lint, candidate formatting and diff checks passed. '
    'This supersedes the October 9 current-format failure only; it does not pass full quality or runtime gates. '
    'All 82 implementation/operations candidate paths remain uncommitted. '
    '[Independent review](evidence/rc1/stage-01/sol/REVIEW.md), '
    '[complete assigned inventory](evidence/rc1/stage-01/sol/claim-ownership.json) and '
    '[mandatory gates/owners](evidence/rc1/stage-01/sol/mandatory-gates.md) govern Stages 02–07. '
    'Gemini Stage N precedes Sol Stage N; next is Gemini 02, then Sol 02. '
    'Historical statements below retain their dated sources and do not establish current acceptance. '
    'No new runtime/provider/image/upgrade/restore PASS is claimed. Only final Sol Stage 07 may create a local RC1 tag after actual PASS; no push, publish or deploy.\n\n'
)
names = ['FINAL_RC_REPORT.md','BLOCKERS.md','HANDOFF.md','RC_SCOPE.md','CAPABILITY_LEDGER.md',
         'ROUTE_MATRIX.md','PROVIDER_MATRIX.md','SECURITY_LEDGER.md','README.md','RC1-SCOPE.md','RC1-ACCEPTANCE-MATRIX.md']
for name in names:
    path = ROOT/'docs/rc'/name
    path.write_text(notice + path.read_text(encoding='utf-8'), encoding='utf-8')
path = ROOT/'docs/rc/RC1-ACCEPTANCE-MATRIX.md'
s = path.read_text(encoding='utf-8')
s = s.replace('Preserve 12-file format failure;', 'Preserve the historical 12-file failure (focused formatting now passes);')
s = s.replace('Tag/push/deploy remain unauthorized.', 'Only final Sol Stage 07 may create a local tag after actual PASS; push/publish/deploy remain unauthorized.')
s += '\nEvery row is owned by Gemini Stage N for execution/repair and Sol Stage N for independent closure; multi-stage rows require corresponding verification in each named stage. The concrete [Sol mandatory gates](evidence/rc1/stage-01/sol/mandatory-gates.md) and [1,215-entry ownership inventory](evidence/rc1/stage-01/sol/claim-ownership.json) add current routes/pages and all module IDs and override historical broad assignments. No current runtime proof is retained as PASS solely by ancestry.\n'
path.write_text(s, encoding='utf-8')
path = ROOT/'docs/rc/RC1-PLAN-AND-PROMPTS.md'
s = path.read_text(encoding='utf-8')
prefix = ('> Execution authority (2026-10-11): the user has assigned the final seven sequential Gemini→Sol pairs. '
          'Use the assigned stage instruction with [Sol mandatory gates/owners](evidence/rc1/stage-01/sol/mandatory-gates.md). '
          'The self-contained stage prompts below remain the stage scopes; do not create another round. '
          'Only final Sol Stage 07 may create a local RC1 tag after actual PASS; older no-tag wording below is superseded solely for that action. No push, publish or deploy.\n\n')
path.write_text(prefix+s, encoding='utf-8')
audit = []
for args in [['merge-base','--is-ancestor','100bd80fa8451ab04eb6e14c937697bb77970e4c','HEAD'],
             ['diff','100bd80fa8451ab04eb6e14c937697bb77970e4c','HEAD','--name-only'],
             ['grep','-n','test.skip','100bd80fa8451ab04eb6e14c937697bb77970e4c','--','tests/browser']]:
    p = subprocess.run(['git',*args],cwd=ROOT,capture_output=True,text=True)
    audit.append({'commandArguments':['git',*args],'exitCode':p.returncode,'stdout':p.stdout,
                  'scope':'source inspection only; not historical execution report'})
(OUT/'source-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
