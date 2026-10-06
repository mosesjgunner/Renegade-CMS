# RC08-UNIT-RELEASE — first blocker on the clean candidate

Candidate: `07e75a47dec8424d26d7829ec9daba7e34c4c859`.
Evidence: [RC-08 restart](../evidence/RC-08-2026-10-06.md) and its unit JSON receipt.

Failure: flow-04-acceptance.test.ts:399 expects five successful artifacts after
one injected redirect failure; only two succeed. The suite reports 1,106 passed
and one failed, stopping RC-08 before integration.

Minimal repair: inspect mock artifact errors and canonical revision, publication
approval, audit, search and media prerequisites. Determine whether the fixture
is stale or production regressed. Supply valid canonical fixtures and realistic
mock persistence if needed, preserving publication/media guards. Otherwise fix
the smallest proven production cause in a dedicated commit. Do not lower the
five/six-artifact expectations, skip the case or synthesize successful execution.

Acceptance: preserve blocking-gate/waiver, partial failure, five successes/one
failure, failed-only retry, single execution of successful artifacts, six final
successes, public URLs, six compensations and retained audit assertions. Run the
focused case and full unit suite, then restart RC-08 in a clean checkout at the
new immutable SHA with fresh dependencies. Run all later gates, ordinary A–T,
negative security and second-environment restore. No unexecuted gate is passed.
