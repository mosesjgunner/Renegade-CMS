"""Read-only source/artifact inspection; does not load environment or invoke runtime."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[6]
OUT = Path(__file__).resolve().parent

def command(*args):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    return {"command": list(args), "exitCode": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr}

def artifact(path):
    source = ROOT / path
    if not source.is_file():
        return {"path": path, "exists": False}
    data = source.read_bytes()
    return {"path": path, "exists": True, "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}

claimed = "99f29f1c4dd0138102b6b757a477fe72e350ea95"
commands = [command("git", *args) for args in [
    ("rev-parse", "HEAD"), ("rev-parse", "HEAD^{tree}"),
    ("status", "--porcelain=v1", "--untracked-files=all"),
    ("worktree", "list", "--porcelain"),
    ("for-each-ref", "--format=%(refname) %(objectname)"),
    ("log", "--all", "--oneline", "--grep=stage 02", "--grep=Stage 02"),
    ("show", "-s", "--format=%H %T %P %s", claimed),
    ("diff", "--name-only", claimed, "HEAD"),
    ("merge-base", "--is-ancestor", claimed, "HEAD"),
]]
paths = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "docs/rc/evidence/rc1").rglob("*")
               if p.is_file() and OUT not in p.parents)
paths += ["AGENTS.md", "docs/rc/RC1-PLAN-AND-PROMPTS.md", "docs/rc/RC1-SCOPE.md",
          "docs/rc/RC_SCOPE.md", "docs/rc/RC1-ACCEPTANCE-MATRIX.md",
          "docs/rc/CAPABILITY_LEDGER.md", "docs/rc/ROUTE_MATRIX.md",
          "docs/rc/PROVIDER_MATRIX.md", "docs/rc/SECURITY_LEDGER.md",
          "docs/rc/evidence/rc1/stage-02/gemini/HANDOFF.md",
          "playwright.rc02.config.ts", "tests/rc02/site-build.spec.ts",
          "tests/rc02/staff-invitation.spec.ts", "tests/unit/authorization-matrix.test.ts",
          "tests/unit/tenant-isolation.test.ts",
          "tests/integration/rc08d-lock-projection.integration.test.ts",
          "docs/rc/evidence/rc-02/source-attribution.json",
          "docs/rc/evidence/rc-02/browser-results.json", "docs/rc/evidence/rc-02/site-build-trace.zip",
          "scratch/rc02-browser.log", "scratch/rc02-final-browser-exit.txt"]
report = json.loads((ROOT / "docs/rc/evidence/rc-02/browser-results.json").read_text())
attribution = json.loads((ROOT / "docs/rc/evidence/rc-02/source-attribution.json").read_text())
traces = []
trace_paths = [ROOT / "docs/rc/evidence/rc-02/site-build-trace.zip"]
trace_paths += list((ROOT / "test-results/rc02").rglob("trace.zip"))
for trace in trace_paths:
    info = artifact(trace.relative_to(ROOT).as_posix())
    if info["exists"]:
        with zipfile.ZipFile(trace) as archive:
            info.update(entries=len(archive.infolist()), crcFailure=archive.testzip(),
                        earliestEntry=min(str(i.date_time) for i in archive.infolist()),
                        latestEntry=max(str(i.date_time) for i in archive.infolist()))
    traces.append(info)
receipt = {
    "inspectionDate": "2026-10-12", "signedOffBy": "Sol", "status": "BLOCKED",
    "commands": commands, "artifacts": [artifact(p) for p in paths], "traceIntegrity": traces,
    "retainedBrowserReportStats": report.get("stats"),
    "retainedSourceAttribution": {k: attribution.get(k) for k in
        ["candidateSha", "traceSha256", "profile", "modules", "localE2ETestMode"]},
    "prerequisite": "Gemini Stage 02 handoff absent; Sol Stage 02 recorded BLOCKED, not PASS.",
    "runtimeAcceptance": {"executed": 0, "passed": 0, "failed": 0, "skipped": 0,
                          "unexecutedTestCaseCount": None},
    "environment": {"shell": "PowerShell", "envFilesLoaded": False,
                    "databaseInvoked": False, "mediaInvoked": False,
                    "browserInvoked": False, "providerInvoked": False,
                    "imageDigest": None},
}
(OUT / "prerequisite-audit.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"commands": len(commands), "artifacts": len(paths),
                  "traces": traces, "retainedStats": report.get("stats"),
                  "status": "BLOCKED"}, indent=2))
