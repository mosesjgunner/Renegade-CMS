# RC-00 handoff

Source candidate: `e24fc53d9e370e28f01398c561b0f5adc4884756`. Reconciled 2026-10-03. Initial working tree was clean. This documentation freeze binds the source candidate; its artifact commit is discoverable with git log -- docs/rc. It does not establish runtime release readiness.

NEXT: RC-01. Freeze and validate the candidate before product implementation. Do not advance automatically.

Read README.md, evidence/RC-00.md and BLOCKERS.md. Preserve ordinary existing data; use a disposable database for later migration/browser acceptance. Do not use LOCAL_E2E_TEST_MODE for ordinary operator proof. Stop at the first invalidating acceptance failure and preserve rendered/console/network/server evidence. A failed baseline or shipping capability stays BLOCKER.

Reconciliation deliverables enumerate all runtime registrations and routes and are bound to the source SHA in this documentation freeze. RC-01 must freeze the successor runtime candidate before release proof. Full browser/integration/unit suites, build, live provider delivery and destructive migration/reset were not executed in this inventory pass.
