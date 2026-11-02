# Next after RC1 17A

17A is a scoped PASS: 91 unit + 68 ordinary browser/API/persistence + 6 PostgreSQL/web restart assertions = 165 passed, zero failed/skipped or mandatory scoped groups unexecuted. See RESULT.md, commands.json and containment.json. Aggregate RC1 remains NOT READY. No later subpass was executed.

Base: c322d2eecd02c1352a6a01c43e7f9057aac83aac. Runtime manifest SHA-256: da8286261c9c28cf1608f330a07aad02ad4ebdad858687f6f7dc92fbefc06560. Handoff SHA-256: edfe7a1d46b632a5767e8026265f6fdb1f810036267837f4fb9e57a21b1a4395; only two Next-generated type files were restored, all app/policy/verifier files match the tested source. Changes remain uncommitted for review.

Repairs: tenant-bound user/site/publication reads; global account/provisioning authority; scoped grant/deletion checks; no global promotion when a linked owner loses the final grant. Publication APIs still return active public records. Actual Chromium virtual CTAP2 and local SMTP were used; there is no test-auth, physical-key, remote-provider or production-image claim.

Retain the stopped rc117a-20261102 and rc117a-mail-20261102 containers, all five isolated databases, scratch media/authenticator state and the baseline typecheck worktree. The accepted database is rc117a_verified_release_acceptance; media is scratch/rc117a-verified/media. To inspect it, start only those containers and set RC117A_LANE=verified before the runner's serve action. Do not rerun migrate on retained evidence. The tested staff account was deliberately deleted and member/staff sessions revoked through supported APIs.

Carry forward: workspace-wide typecheck has the same two TS2352 errors at src/scripts/portability.ts:200 and :216 as clean base; scoped types/lint/format pass. The prior 16C handoff's other release blockers remain historical/out of 17A scope. Do not infer prior receipt containment or aggregate readiness from this PASS.

Next: review this bounded change, then execute only the next separately assigned subpass (17B). No automatic continuation.
