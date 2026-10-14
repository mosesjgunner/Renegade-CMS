"""Read-only prerequisite and artifact audit; never loads runtime configuration."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[6]
CLAIMED = "be0f163e99e3ceb9ee3b93272ceb6508f1510b2a"


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


commands = [command("git", *args) for args in [
    ("rev-parse", "HEAD"), ("rev-parse", "HEAD^{tree}"),
    ("status", "--porcelain=v1", "--untracked-files=all"),
    ("worktree", "list", "--porcelain"),
    ("for-each-ref", "--format=%(refname) %(objectname)"),
    ("log", "--all", "--oneline", "--grep=Stage 02", "--grep=stage 02"),
    ("show", "-s", "--format=%H %T %P %s", CLAIMED),
    ("diff", "--name-status", CLAIMED, "HEAD"),
    ("merge-base", "--is-ancestor", CLAIMED, "HEAD"),
]]
paths = sorted(p.relative_to(ROOT).as_posix()
               for p in (ROOT / "docs/rc/evidence/rc1").rglob("*")
               if p.is_file() and OUT not in p.parents)
paths += ["AGENTS.md", "docs/rc/RC1-PLAN-AND-PROMPTS.md",
          "docs/rc/RC1-SCOPE.md", "docs/rc/RC1-ACCEPTANCE-MATRIX.md",
          "docs/rc/RC_SCOPE.md", "docs/rc/CAPABILITY_LEDGER.md",
          "docs/rc/ROUTE_MATRIX.md", "docs/rc/PROVIDER_MATRIX.md",
          "docs/rc/SECURITY_LEDGER.md", "playwright.rc02.config.ts",
          "tests/rc02/site-build.spec.ts", "tests/rc02/staff-invitation.spec.ts",
          "tests/integration/tenant-authorization-matrix.integration.test.ts",
          "docs/rc/evidence/rc-02/source-attribution.json",
          "docs/rc/evidence/rc-02/browser-results.json"]
traces = []
for trace in [ROOT / "docs/rc/evidence/rc-02/site-build-trace.zip",
              *sorted((ROOT / "test-results/rc02").rglob("trace.zip"))]:
    info = artifact(trace.relative_to(ROOT).as_posix())
    if info["exists"]:
        with zipfile.ZipFile(trace) as archive:
            info.update(entries=len(archive.infolist()), crcFailure=archive.testzip())
    traces.append(info)
report_path = ROOT / "docs/rc/evidence/rc-02/browser-results.json"
report = json.loads(report_path.read_text()) if report_path.exists() else {}
attribution_path = ROOT / "docs/rc/evidence/rc-02/source-attribution.json"
attribution = json.loads(attribution_path.read_text()) if attribution_path.exists() else {}
tests = []


def collect(suites):
    for suite in suites:
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                tests.append({"file": spec.get("file"), "title": spec.get("title"),
                              "status": test.get("status"),
                              "results": [{"status": r.get("status"),
                                           "duration": r.get("duration")}
                                          for r in test.get("results", [])]})
        collect(suite.get("suites", []))


collect(report.get("suites", []))
receipt = {
    "inspectionDate": "2026-10-13", "signedOffBy": "Sol", "status": "BLOCKED",
    "commands": commands, "artifacts": [artifact(p) for p in paths],
    "traceIntegrity": traces, "retainedBrowserReportStats": report.get("stats"),
    "retainedBrowserTests": tests,
    "retainedSourceAttribution": {k: attribution.get(k) for k in
                                 ["candidateSha", "traceSha256", "profile", "modules",
                                  "localE2ETestMode"]},
    "prerequisite": "Gemini Stage 02 documents now exist; independent Sol Stage 02 still BLOCKED with eleven commands unexecuted.",
    "runtimeAcceptance": {"executed": 0, "passed": 0, "failed": 0, "skipped": 0,
                          "unexecutedGroups": 3, "unexecutedTestCaseCount": None},
    "environment": {"shell": "PowerShell", "envFilesLoaded": False,
                    "databaseInvoked": False, "mediaInvoked": False,
                    "browserInvoked": False, "providerInvoked": False,
                    "imageDigest": None},
}
(OUT / "audit.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": receipt["status"], "commands": len(commands),
                  "artifactCount": len(paths), "traceCount": len(traces),
                  "crcFailures": [t["path"] for t in traces if t.get("crcFailure")],
                  "retainedStats": report.get("stats"),
                  "retainedTests": tests}, indent=2))
