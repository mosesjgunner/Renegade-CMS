# RC08-CURRENT-SECURITY — refresh RC-06 dependency decisions

Depends on the [unit release blocker](RC08-05-unit-release.md).
Evidence: [current audit](../evidence/rc-08-20261006/candidate-07e75a4/npm-audit.json).

The clean install reports 23 affected packages, including two critical package
entries, instead of RC-06's historical 21-package snapshot. The dependency graph
is Vitest 3.2.7 → tinypool 1.1.1. Ancestor severity counts do not prove a
production-exposed vulnerability; old adjudication does not cover new advisories.

Minimal action: refresh RC-06 decisions against the installed graph, current
upstream advisories, source imports, serving/worker entry points and newly built
standalone inventory. Prove exploit preconditions and evidence for nonblocking
decisions. Repair reachable high/critical findings separately; do not run audit
fix --force or redesign test/framework dependencies merely to erase counts.

Acceptance: no supported production path retains a reachable high/critical
finding. Authenticated boundary, runtime secret, webhook, readiness, public
bundle, privacy and restore gates need current candidate evidence. Tooling-only
classification does not replace application security acceptance.
