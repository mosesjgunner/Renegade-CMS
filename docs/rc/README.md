> Current orchestration gate: **RC-03 PASS 2 PASS**, source `bb93ea8b562bc91e71e64afeabb6d7ead6607bc2`. [Evidence](evidence/RC-03.md). Partial provider failure, failed-only recovery and worker restart/idempotency proved on the RC-02 publication copy. Calendar/timeline deferred; federation limited to local signing/outbox/failure. Broader RC-01 release blockers remain open. Sol Light: small cleanup only.

> Current core-site gate: **RC-02 PASS**, source `b684ee11460637bf2177f349057f14d6e804bbbd`. [Evidence](evidence/RC-02.md). RC-00/RC-01 source and blockers below are historical broader scope, which remains open.

# Current release truth

Source candidate: `e24fc53d9e370e28f01398c561b0f5adc4884756`. Reconciled 2026-10-03. Initial working tree was clean. This documentation freeze binds the source candidate; its artifact commit is discoverable with git log -- docs/rc. It does not establish runtime release readiness.

This directory supersedes release-readiness prose elsewhere for the source candidate. RC-00 reconciles implemented scope and evidence; the release remains BLOCKED. No workflow or provider is promoted by historical PASS reports.

- [Scope and claim policy](RC_SCOPE.md)
- [Commit-bound capability ledger](CAPABILITY_LEDGER.md)
- [Route matrix](ROUTE_MATRIX.md)
- [Provider matrix](PROVIDER_MATRIX.md)
- [Security ledger](SECURITY_LEDGER.md)
- [Dependency-ordered blockers](BLOCKERS.md)
- [Execution evidence and current counts](evidence/RC-00.md)
- [Handoff](HANDOFF.md)

## Historical reconciliation

| Document                                                       | Conflicting prior claim                                                                     | Current interpretation                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| README.md / BETA_RELEASE_NOTES.md                              | 983 unit tests; 101 migrations; production-core labels                                      | Old snapshot; current registration counts in RC-00; no current test PASS count asserted                               |
| PROJECT_STATE.md (root)                                        | 987 tests / 102 migrations and broad VERIFIED entries mixed with partial entries            | Historical chronological record, not current status authority                                                         |
| docs/release/FEATURE_READINESS.md                              | Earlier domain statuses predate later audience/community/commerce changes                   | Historical feature snapshot; code-derived ledger supersedes both old incomplete and old VERIFIED claims               |
| docs/execution/final-release-proof-2026-09-24.md               | Clean candidate 3bccfc…; 987 unit / 196 integration / 102 migrations; test:shared-contracts | Immutable historical report; script test:shared-contracts is absent from current package.json; not rerun or rewritten |
| docs/execution/first-time-operator-visitor-sweep-2026-09-24.md | 997 tests / 104 migrations; PARTIAL customer-upgrade unavailable                            | Historical report with no current candidate proof; later counts do not reconcile HEAD automatically                   |

The two execution reports are marked historical by this external catalog; their bytes are preserved. The similarly named docs/PROJECT_STATE.md, if present, is also a historical state record rather than an alternate release authority.
