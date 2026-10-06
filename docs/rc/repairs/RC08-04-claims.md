# RC08-CLAIMS — reconcile release documents after acceptance

Depends on passing prerequisite gates and current immutable-candidate evidence.

Minimal action: prepare package/lockfile version and release notes for
`0.1.0-rc.1`; reconcile README, readiness counts and ledgers with measured results.
Use only current executed suite totals and registered/applied migration counts.
Preserve historical execution files and explicitly label their older counts.

Acceptance: no shipping UNKNOWN status; no advertised capability has an open
release blocker; deferred/partial features and configured-provider requirements
are explicit and truthful. Commit reconciliation, then restart affected RC-08
checks against the final immutable SHA. Only a complete PASS permits the final
report, candidate freeze and recommendation of `v0.1.0-rc.1`; do not tag/push/release.
