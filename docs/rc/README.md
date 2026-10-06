> RC-04 Pass 2 current-tree recheck: bounded PASS after repairing profile-loading data loss. Source repair d1cb789908c11f3624cba6468d59c8ec556a029f plus recorded pre-existing source diff; clean candidate freeze remains open. [Recheck evidence](evidence/RC-04-PASS2-RECHECK.md).

> Current audience/community gate: **RC-04 PASS 2 PASS (bounded scope)**, source `3a3260f120f500a48d51a5251a7fd3b900ba6e93`. [Evidence](evidence/RC-04-PASS2.md). Three real browser/API journeys, 270 unit tests, 52 integration tests, typecheck, lint and production build pass. Local SMTP proof includes MIME, failure, disabled transport and operator recovery; it is not production delivery proof. Forms/automation, telecom dispatch, external community notifications/digests, per-event switches, permanent deletion, complete export and private attachment launch are explicitly deferred. Broader RC-01 gates remain open. NEXT: RC-04 cleanup/final gate only; RC-05 requires its own instruction.

> Current orchestration gate: **RC-03 PASS 3 PASS**, source `97ce2c1e4a253289d0d4f9da66c154afce74c6e9`. [Final gate evidence](evidence/RC-03-PASS3.md). Small cleanup reconciled operator claims; final browser, 107 unit and 18 integration tests, typecheck, lint and build pass. Calendar/feed/timelines and remote federation remain deferred. Broader RC-01 release blockers remain open. NEXT: RC-04 and RC-05.

Current orchestration gate: **RC-03 PASS 2 PASS**, source `bb93ea8b562bc91e71e64afeabb6d7ead6607bc2`. [Evidence](evidence/RC-03.md). Partial provider failure, failed-only recovery and worker restart/idempotency proved on the RC-02 publication copy. Calendar/timeline deferred; federation limited to local signing/outbox/failure. Broader RC-01 release blockers remain open. Sol Light: small cleanup only.

> Current core-site gate: **RC-02 PASS**, source `b684ee11460637bf2177f349057f14d6e804bbbd`. [Evidence](evidence/RC-02.md). RC-00/RC-01 source and blockers below are historical broader scope, which remains open.

# Current release truth

RC-05 Pass 3: **FAIL**, inspected HEAD `e25f1b554eeae6e898d754822c64181f4b8040cc` with pre-existing changes. [Final gate evidence](evidence/RC-05-PASS3.md). No completed RC-05 Pass 1/Pass 2 acceptance is available in this checkout. 161 unit and 28 affiliate/POD contract tests, typecheck, lint and build pass; ordinary checkout, persisted settlement/recovery/isolation and inventory-race gates remain unproved. Synthesized Printful provider outcomes remain a blocker. RC-06 is gated on RC-05 acceptance.

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

> Current audience/community gate: **RC-04 FINAL PASS (bounded scope)**, tested source `fb8c9d7c3211f4c257ad569edb366d089074e492`. [Final evidence](evidence/RC-04-PASS3.md). Cleanup reconciled readiness and moderation status copy; 270 unit tests, 52 integration tests, three browser journeys, typecheck, lint and production build pass. Live email/SMS-RCS remain provider-required and documented unsupported surfaces remain deferred. NEXT: RC-06 after RC-05 merges.
