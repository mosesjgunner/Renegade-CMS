# RC1 07A ? PASS (bounded), 2026-10-19

Review/approval, QA, revision attribution and document locks passed the scoped ordinary operator/UI, negative and restart acceptance. Aggregate RC1 remains NOT READY: full repository types retain seven unrelated 03D diagnostics.

## Source and changes

Final source: **`eba7408e45f242ed4e45ce98fb16738c0540233d` plus overlay `8781ce4e5bd4b25a23a947fe02e1b09495b74fb3e4a0f6a11d9fbf0199ff0126`**. The user created that commit during the pause; the agent did not commit. It also contains earlier 06B/06C work, which this receipt does not claim. The one-path overlay changes only `tests/rc1-07a/verify.ts` to shut down the complete Payload runtime and return the real result exit code.

`final-tested-tree.json` records the exact overlay, all 16 owned source/test hashes and accepted artifact hashes. The committed pre-resume `tested-tree.json` is preserved: **53/54 files still match; only the verifier cleanup differs**. Product implementation bytes match. `containment.json` preserves historical 06B 24/26 and 06C 38/39 containment; Publishing changed here, and 06B discovery had already changed in 06C. Previous receipts/ledger rows keep their original identities. The committed `failure.png` is historical and is not final proof.

Implemented across the 12 implementation and four test/runner paths listed in the final manifest:

- Canonical content-row transactions serialize decisions, native saves and lock acquisition. Bulk decisions reuse the same guarded persistence path. Authenticated actor IDs/server time replace caller-supplied attribution.
- Submit/approve/override run real local QA; blocking findings deny single/bulk approval and owner override. Structured Lexical link traversal replaces the broken JSON expression; internal-link lookups are site-scoped. Quorum uses distinct reviewers in the current submission/revision.
- Native writes cannot bypass review or rewrite workflow history. Editing reviewed/approved content invalidates approval; immutable companion revisions attribute the actual editor. Canonical member owners resolve to staff identities.
- The existing Payload lock collection enforces site/owner authority, acquisition conflicts and release ownership. Another editor cannot force-save with `overrideLock=true`. Native heartbeat/release remain enabled.
- The queue exposes Review, Reject and Reopen, full audit feedback, persisted comments/status and real bulk errors. Emergency justification uses the entered value directly. No new 07A migration or generated collection type change was necessary.

## Operator/UI ? persistence ? observed output

**31 assertions / exit 0**, `journey.txt` and `journey-trace.json`. Two staff accounts and an owner acted through native/custom HTTP routes. Staff A created a draft, acquired/released its lock and submitted. Staff B returned it for edits, created a review comment, rejected a later submission and approved a new review. Normal staff editing produced revision 2 with the actual staff user ID. Competing approvals produced one 200 and one 422 without losing any of the three accepted review decisions. The owner resolved the thread.

The browser displayed the approved queue and persisted feedback, including after refresh (`review-queue.png`). Another article's actual broken Lexical internal link produced a blocked queue item. Single/bulk approval and unauthorized overrides failed. After staff repaired and resubmitted the body, the owner clicked **Approve** with ?Owner verified QA repair?; HTTP returned 200 and an independent persisted read showed approved (`owner-approval.png`). A later body edit returned that article to draft, made approval stale and retained its decision. Direct audit deletion returned 403.

Identities/grants and signed, revocable `admin_sessions` were isolated fixtures issued through the canonical helper. **Test auth and test routes were off**. This proves supported authenticated operator APIs and real UI actions; it does not claim WebAuthn enrollment/login. The browser declined optional consent through the actual privacy UI.

## Negatives / restart

Denied: approval before review; self-approval despite forged reviewer/role hints; anonymous/ungranted/foreign staff transitions; staff native approval/publication; foreign audit/lock access; cross-origin mutation; conflicting lock acquisition; another editor's force-save/release/transition; blocking QA through single/bulk/owner override; staff override; missing override justification; direct history deletion. The second editor successfully retried acquisition/release after release by the first editor.

**7 restart assertions / exit 0**, `restart.txt` and `restart-trace.json`. Replaced the web process and restarted PostgreSQL. Approval, decision feedback, both revision bodies and resolved comments survived. The fresh active lock row survived, denied another editor with the explicit lock error, then allowed its original owner to release it. The overnight lock had expired naturally and was not used for this claim: the accepted fresh journey created the tested lock normally.

## Exact commands and counts

Run from the repository root. The runner exports only the declared disposable DB/media/runtime targets; its destructive migration script was inspected first.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-07a/run-isolated.ps1 start-db
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-07a/run-isolated.ps1 migrate
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-07a/run-isolated.ps1 serve
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-07a/run-isolated.ps1 verify
# Replace only the owned web process; invoke serve again, then:
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-07a/run-isolated.ps1 restart-check
```

Start/migrate: exit 0, **123 migrations** recorded exactly once; the fresh verifier's second migration pass was clean (`migrations.txt`). Serve was deliberately stopped after proof. Verify: exit 0 / 31 passed. Restart-check: exit 0 / 7 passed.

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5449/rc107a_release_acceptance'
node node_modules/vitest/vitest.mjs run tests/unit/rc1-07a-review.test.ts tests/unit/flow-01-cmos-workflow.test.ts tests/unit/editorial-workflow.test.ts tests/unit/editorial-workflow-permissions.test.ts tests/unit/persisted-review-comments.test.ts tests/unit/rc08d-lock-projection.test.ts tests/unit/long-form-quality.test.ts tests/unit/flow-00-workflow-contract.test.ts tests/unit/editorial-contracts.test.ts tests/integration/flow-01-workflow-api.integration.test.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/rc1-07a/tsconfig.json
node node_modules/eslint/bin/eslint.js src/modules/editorial/cmos-persistence.ts src/modules/editorial/cmos-workflow.ts src/modules/editorial/review-write-guard.ts src/modules/editorial/document-locks.ts src/modules/admin/EditorialWorkflowCenter.tsx src/payload.config.ts src/collections/Publishing.ts src/modules/editorial/persistence.ts src/modules/quality/service.ts src/modules/quality/contracts.ts "src/app/(frontend)/api/admin/workflow/actions/route.ts" "src/app/(frontend)/api/admin/workflow/bulk/route.ts" tests/rc1-07a/verify.ts tests/unit/rc1-07a-review.test.ts --max-warnings=0
node node_modules/prettier/bin/prettier.cjs --check src/modules/editorial/cmos-persistence.ts src/modules/editorial/cmos-workflow.ts src/modules/editorial/review-write-guard.ts src/modules/editorial/document-locks.ts src/modules/admin/EditorialWorkflowCenter.tsx src/payload.config.ts src/collections/Publishing.ts src/modules/editorial/persistence.ts src/modules/quality/service.ts src/modules/quality/contracts.ts "src/app/(frontend)/api/admin/workflow/actions/route.ts" "src/app/(frontend)/api/admin/workflow/bulk/route.ts" tests/rc1-07a/verify.ts tests/unit/rc1-07a-review.test.ts tests/rc1-07a/tsconfig.json
git diff --check
npm.cmd run typecheck
```

Focused tests: exit 0, **10 files / 63 passed** (58 unit + five mocked persistence cases), zero failed/skipped (`focused-tests.txt`). Mocks are not DB acceptance; the separate HTTP journey is DB-backed. Scoped types/lint/format/diff checks exit 0 (`quality.txt`). Full types exit **2**, with **seven existing 03D errors**, first `tests/rc1-03d/verify-import-and-build.ts:31` (`full-types.txt`).

**Accepted scoped total: 101 passed / 0 failed / 0 skipped / 0 mandatory scoped checks unexecuted.** Separately, one broader gate fails (full types). Five broader gate groups were unexecuted here: WebAuthn enrollment/login; full-repository lint/test/integration; production image/build/security; scheduling/worker/publication; upgrade/restore. No success is implied for them.

Earlier fixture, cached-hook, QA-extractor, UI readiness/privacy and shutdown failures were repaired before the accepted run. Debug logs are preserved outside the lean receipt; historical committed artifacts remain intact.

## Isolation / exit

Only `rc107a-20261018`, DB `127.0.0.1:5449/rc107a_release_acceptance`, web `127.0.0.1:38983`, media `scratch/rc107a-20261018/media`, dist `.next-rc107a` were used. PostgreSQL image ID `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`; application proof is development source, **not an OCI application image**.

Owned web and DB are stopped; DB/media/evidence retained. No external calls/messages/charges/posts, shared reset, clean, push, tag, deployment or new agent commit. **No open 07A blocker**. First broader blocker: existing 03D full types. Next subpass unexecuted.
