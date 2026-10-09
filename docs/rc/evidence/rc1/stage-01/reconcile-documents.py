"""One-time documentation reconciliation; preserve historical receipts and user source."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
initial = json.loads((OUT / 'inventory.json').read_text())
tree = json.loads((OUT / 'tested-tree.json').read_text())
groups = {name: [] for name in ['identity-grants-recovery', 'scoped-operator-native-access', 'cart-checkout-digital-subscriptions', 'audience-truth-disclosure', 'fulfillment', 'telecom-simulator', 'restore-configuration', 'stage-01-plan']}
for path in initial['trackedModifications'] + initial['untrackedFiles']:
    if path == 'compose.restore.yaml': group = 'restore-configuration'
    elif path == 'docs/rc/RC1-PLAN-AND-PROMPTS.md': group = 'stage-01-plan'
    elif 'fulfillment' in path.lower() or path == 'src/modules/commerce/service.ts': group = 'fulfillment'
    elif 'telecom' in path.lower(): group = 'telecom-simulator'
    elif any(k in path for k in ['staff', 'Staff', 'enroll', 'owner-recovery', 'recover-installation', 'onboarding', 'operator-grants', 'collections/Identity', 'SecurityCenter', 'rc08d-lock', 'tests/rc02/site-build']): group = 'identity-grants-recovery'
    elif any(k in path for k in ['AudienceCommandCenter', 'audience/command-center', 'progressive-disclosure', 'rc01-admin-truth', 'calendar/page']): group = 'audience-truth-disclosure'
    elif any(k in path for k in ['api/admin/', 'admin/catalog', 'connections/page', 'collections/Audience', 'collections/Commerce', 'tenant-isolation', 'dist-05']): group = 'scoped-operator-native-access'
    else: group = 'cart-checkout-digital-subscriptions'
    groups[group].append({'path': path, 'initialSha256': tree['files'].get(path), 'disposition': 'documentation candidate' if group == 'stage-01-plan' else 'preserved uncommitted; Stage 02 review/repair/commit required'})
(OUT / 'candidate-groups.json').write_text(json.dumps(groups, indent=2) + '\n', encoding='utf-8')

matrix_path = OUT / 'acceptance-inventory.json'
matrix = json.loads(matrix_path.read_text())
for row in matrix:
    low = (row['item'] + ' ' + ' '.join(row.get('originalColumns', []))).lower()
    if any(k in low for k in ['fulfillment', 'pod-real-provider', 'telecom/simulate']):
        row['classification'] = 'repair required'
        row['reason'] = 'Source findings in BASELINE.md; repair provider/address/outcome or simulator tenant boundaries before ordinary acceptance.'
    if row['ledger'] == 'docs/rc/PROVIDER_MATRIX.md':
        row['externalOutcome'] = {'classification': 'genuine external prerequisite', 'scope': 'external production outcome only, if advertised', 'requirement': 'provider-approved credentials/accounts/artifacts and observed signed outcomes; mandatory local safe error/adapter/retry/security acceptance remains pending'}
    if 'reference-adapters' in row['item']:
        row['scope'] = 'excluded developer reference; verify no shipping caller or misleading entry point'
        row.pop('externalOutcome', None)
    row['rolePolicy'] = 'Exercise permitted/denied actions according to actual policy; do not assume all listed actors may mutate.'
matrix_path.write_text(json.dumps(matrix, indent=2) + '\n', encoding='utf-8')

history = OUT / 'historical'
history.mkdir(exist_ok=True)
final_path = ROOT / 'docs/rc/FINAL_RC_REPORT.md'
original = final_path.read_bytes()
archive = history / 'FINAL_RC_REPORT-2026-10-08.md'
if archive.exists(): raise SystemExit('Historical archive exists; refusing a second reconciliation.')
if hashlib.sha256(original).hexdigest() != tree['files']['docs/rc/FINAL_RC_REPORT.md']:
    raise SystemExit('Final report changed concurrently; refusing overwrite.')
archive.write_bytes(original)
final_path.write_text('''# RC1 current readiness report — 2026-10-09

**NOT READY.** Stage 01 established the actual baseline; it did not execute RC1 acceptance. Source: `2aa4957ac044694714cb4dfc52fb76f7c4109262` plus the [complete initial tested tree](evidence/rc1/stage-01/tested-tree.json), digest `7b201f8b47d38c785c50a81dea45f3ab9b018850e6f2b656a130478cdadf1093`. The executable repairs remain uncommitted. A documentation commit does not freeze or accept those repairs.

Focused pre-commit review passed **22 unit files / 155 tests, zero failures or skips**, and corrected focused lint passed. Formatting failed on **12 changed files**; later checks stopped. The initial generated-file lint harness warning and corrected rerun are preserved. No full quality, migration, integration, build, ordinary browser, provider, image, runtime security, recovery or restore gate was executed in Stage 01. No current migration count or accepted image digest is claimed.

The October 8 report claimed PASS on `100bd80fa8451ab04eb6e14c937697bb77970e4c`. That source is contained in committed HEAD with only documentation differences, but it excludes the current dirty repairs. Its unbound prerequisite results and skipped ordinary setup/login path cannot establish current closure. The report is preserved verbatim as [historical October 8 report](evidence/rc1/stage-01/historical/FINAL_RC_REPORT-2026-10-08.md); RC08D receipts remain unchanged. Historical failures remain bound to their original trees rather than being asserted as current reproduced failures.

The supplied attachment resolves the authoritative [A–T golden journey](evidence/rc1/stage-01/golden-journey.txt). Newer scratch staff/digital/backup artifacts were found and retained as bounded historical facts, but lack the execution-time source binding needed for RC1 reuse. The sole skip guard in frozen browser source is the mandatory phase-a install/login case without `A01_SETUP_TOKEN` from supported container logs; it is not platform-specific. The raw historical runner report was not found, so its exact skip cause is not newly verified.

Source review identifies required repairs around fulfillment emulator provenance, fabricated fallback shipping address, persistence/completion outcomes, telecom simulator tenant boundaries, operator copy/reporting truth and restore test-mode defaults. These are static findings and pending acceptance, not claims of executed exploits.

Current authorities: [RC1 scope](RC1-SCOPE.md), [acceptance matrix](RC1-ACCEPTANCE-MATRIX.md), [Stage 01 baseline/evidence](evidence/rc1/stage-01/BASELINE.md), [blockers](BLOCKERS.md), [handoff](HANDOFF.md). Next: **Stage 02**, only upon its execution request. No tag, push, publish or deploy is authorized.
''', encoding='utf-8')
files = ['BLOCKERS.md', 'HANDOFF.md', 'RC_SCOPE.md', 'CAPABILITY_LEDGER.md', 'ROUTE_MATRIX.md', 'PROVIDER_MATRIX.md', 'SECURITY_LEDGER.md', 'README.md']
before = {'docs/rc/FINAL_RC_REPORT.md': hashlib.sha256(original).hexdigest()}
for name in files:
    path = ROOT / 'docs/rc' / name
    data = path.read_bytes()
    expected = tree['files'].get('docs/rc/' + name)
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit(f'{name} changed concurrently; refusing overwrite.')
    before['docs/rc/' + name] = hashlib.sha256(data).hexdigest()
    intro = '''> Current RC1 baseline (2026-10-09): **NOT READY**. Stage 01 inspected HEAD `2aa4957ac044694714cb4dfc52fb76f7c4109262` plus the [initial full tested-tree manifest](evidence/rc1/stage-01/tested-tree.json). Source repairs remain uncommitted. Focused unit review: 22 files / 155 passed / zero failed or skipped; corrected focused lint passed; format failed on 12 changed files. Stages 02–07 acceptance is pending. See [RC1 scope](RC1-SCOPE.md), [ordered matrix](RC1-ACCEPTANCE-MATRIX.md), [baseline findings](evidence/rc1/stage-01/BASELINE.md) and [handoff](evidence/rc1/stage-01/HANDOFF.md).
>
> The historical text below applies only to its original sources. It does not establish current readiness or current reproduced defects. RC-08B promotions and newer scratch workflow results remain bounded historical evidence; old deferrals are not automatically shipping exclusions. The supplied authoritative A–T definition is recovered. No current audit/image/browser/restore acceptance is claimed.

'''
    if name == 'BLOCKERS.md':
        intro += '''# Current RC1 blockers

1. Candidate formatting fails on 12 files; no clean executable candidate. Review/repair and commit the preserved groups in Stage 02.
2. Fulfillment source uses emulator submit/health for provider records, mock artwork and invented fallback shipping address; persistence failure/completion/UI success semantics need repair and ordinary acceptance.
3. Telecom simulator exposes process-global state after a requested-site check; tenant isolation/test boundary and reporting/copy truth require repair.
4. Restore migration test-mode default requires correction before ordinary recovery proof.
5. Source-bound ordinary identity/settings/locks/two-site role/action/module and commerce/audience/community acceptance remains pending despite focused tests and historical prose.
6. Current advisory/image/web+worker/runtime security decision and real pending-work recovery/complete restore remain pending.
7. Authentic predecessor artifact is required only for an advertised customer upgrade; fixture migration does not prove that claim. External provider outcome prerequisites remain explicit.
8. Final clean-source containment, full mandatory A–T and no-skips acceptance are pending. Do not tag or release.

## Preserved historical blocker snapshots

'''
    elif name == 'HANDOFF.md':
        intro += '''# Current handoff

Stage 01 completed inventory and reconciliation only. Execute Stage 02 next when requested: resolve format/source findings, commit coherent candidate groups, freeze clean isolated SHA and run quality/schema/integration/build/bundle gates. [Stages 02–07 checklist](evidence/rc1/stage-01/HANDOFF.md) and [candidate grouping](evidence/rc1/stage-01/candidate-groups.json) provide the dependency order. Preserve all local data, secrets, user source edits and historical evidence. No next stage was automatically executed.

## Preserved historical handoffs

'''
    elif name == 'RC_SCOPE.md':
        intro += '# Current scope authority\n\n[RC1-SCOPE.md](RC1-SCOPE.md) supersedes contradictory historical scope summaries below. Required enabled module features remain pending acceptance; local/provider/experimental boundaries are explicit.\n\n## Preserved historical scope snapshots\n\n'
    else:
        intro += 'Current acceptance dispositions are in [the expanded inventory](evidence/rc1/stage-01/acceptance-inventory.json), with dependency and scope overrides in [RC1-ACCEPTANCE-MATRIX.md](RC1-ACCEPTANCE-MATRIX.md). Original rows below are preserved for attribution and historical inventory.\n\n---\n\n'
    path.write_bytes(intro.encode('utf-8') + data)
(OUT / 'summary-documents-before.json').write_text(json.dumps(before, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'groupCounts': {k: len(v) for k, v in groups.items()}, 'historicalFinalReportBytePreserved': archive.read_bytes() == original, 'summaryDocumentsReconciled': len(files) + 1}))
