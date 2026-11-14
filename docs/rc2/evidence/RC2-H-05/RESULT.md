# RC2-H-05 — Jobs, webhooks, module gates and operator health

**Verdict: PASS.** Failure was injected into the social, webhook, and federation paths and traced end to end (event → queue → retry/dead letter → operator display → recovery). Two disconnected operations states were found and FIXED in this PR; a third was measured precisely and filed as RC2-DEBT-25. The Platform family exit holds: operators can detect and act on real system failure. Base: main `ccf3c32` (after PR #73). Sandbox fixtures only — no external provider delivery is claimed anywhere below.

## Baselines carried, not re-proven (with the reason)

Commerce worker-kill recovery (F-03) and the social dispatch arcs (D-02) were NOT re-run: `git log` shows zero changes to the commerce, social-task, or integrations code since those passes merged, so their proofs stand on this tree. H-05 adds the failure/operator layer on top.

## Resolution 1 — RC2-DEBT-22 CLOSED: federation dedupe no longer burns failed activities

The inbox recorded the dedupe key before processing; a processing throw left the record 'accepted' forever and legitimate retries were acknowledged (202) as duplicates without processing. Fix: the route now tracks the record it created and rolls it back on processing failure (`releaseInbound` in `src/modules/social/activitypub-runtime.ts`; success clears the rollback handle). Proof: `tests/integration/federation-inbox-retry.integration.test.ts` — record → replay guard holds → release → the same key records fresh. **Passes on fixed code, fails on pre-fix code** (git stash). Edge, characterized not changed: if the Follow branch already queued an Accept delivery before a later step throws, the retry may queue a second Accept; Accept is idempotent at the peer and the relationship write is idempotency-guarded.

## Resolution 2 — operator retry could never recover a repaired destination (found by this pass)

Live trace (journey run 1): a dispatch refused by the provider with HTTP 422 `DestinationDisabled` landed as a terminal `failed` item (provider reason persisted, no retry scheduled, attempt persisted — all correct). But the operator's `retry-failed` action then **skipped it silently** (HTTP 200, `success: true`, attempts unchanged), before AND after provider repair. Root cause chain: the Bluesky adapter classifies a 422 as kind `validation`; `shouldRetryProviderError` retries only `transient`/`rate-limit`; so neither the sweep nor the operator action could ever touch the class — despite the provider's own "repair provider then retry failed delivery" contract and a retry button that reports success.

Fix (deliberately narrow): an explicit per-item operator retry now bypasses only the error-kind check, via `canOperatorRetrySocialQueueItem` + `operatorRequested` on the dispatch input, set only by the admin worker route when a `queueItemId` is named (already site-access checked). The duplicate-safety guards still bind every path: an unknown remote outcome is never blind-retried (reconcile first), the 3-attempt bound holds, backoff due-time holds, and the automatic sweep keeps the strict gate. Proof: unit `tests/unit/social-retry-gates.test.ts` **5/5** (fails on pre-fix code), and live journey run 3 on the rebuilt server: attempts went **1 → 2 → 3** under operator retries (pre-fix they never moved) and the post landed at the provider **exactly once**.

## Finding — RC2-DEBT-25 (P2, filed, not fixed): bounded-out items can diverge from provider truth

Journey run 3's terminal state, kept honest: the final allowed attempt ran against the fixture's lose-response mode — the provider committed the post, then the response was lost. The item ended `failed`, attempts 3/3, outcome recorded 'known-failed', while the provider holds the post (creates = 1). Retry is bounded out and `reconcile` accepts only `unknown`/expired-`publishing` items, so **no operator action can settle this item**; the runbook documents the current remedy (verify at the provider, supersede with a fresh draft). Fix direction recorded in the debt row: let reconcile — a read-only provider lookup — accept bounded-out failed items.

## Webhooks (integration proof over the real transport)

`tests/integration/webhook-failure-recovery.integration.test.ts` **2/2**: enqueue is site-scoped and idempotent per (subscription, event) (duplicate enqueue = 0 new); a failing receiver yields state `retrying`, attempts incrementing (the receiver sees the `x-renegade-attempt` header count up), `nextAttemptAt` backoff set, subscription `failureCount` growing; at the 5-failure limit the delivery dead-letters and the subscription auto-disables, and further attempts are refused; operator redelivery creates a fresh delivery which, with the receiver healthy, lands and resets the subscription counter to 0. Retry policy (code): backoff min(3600s, 2^attempts × 30s).

## Module gate under Lean (live worker proof)

Registration measured: **33 tasks with all modules, 14 under Lean** — 19 optional-module tasks gated out, including `social-publish`, `audience-email-delivery`, `network-delivery`, `webhook-delivery-dispatch`, and the commerce tasks. Queue-level: a `social-publish` job seeded under the full profile sat **byte-identical** (same `updatedAt`, never processing, no error) through ~40s of Lean worker cycles that were meanwhile processing core jobs ("Running 10 jobs" cycles + heartbeat advancing) — then the full-profile worker picked the same job up and attempted it within one cycle (`hasError: true`, `updatedAt` advanced). A disabled module neither processes hidden jobs nor breaks mandatory work, and re-enabling resumes the queued job. This matches the worker's own documented contract in `run-jobs-worker.ts`.

## Operator surfaces (traced during the social failure)

- Schedule-health answers 200 for staff mid-failure (`counts`, `workerHealth`, `jobs`).
- The failed queue item and its attempts are fully readable by the owning site's operator; **another site's operator gets 404** — site scoping holds on the failure surface.
- The one misleading surface found: the worker route's `success: true` on a skipped retry (Resolution 2's symptom). The fix makes the named-item retry execute; the response's `summary.skippedCount` already distinguishes skips for batch calls.
- DEBT-21 remainder confirmed unchanged: the notification projector remains unwired; canonical notifications are the live read (H-03). The runbook names this so operators do not diagnose from the inbox tables.

## Deliverables in this PR

- Fixes: `src/modules/social/activitypub-runtime.ts` (+ `releaseInbound`), inbox route rollback wiring; `src/modules/social/tasks.ts` (operator retry gate), social worker route (`operatorRequested`).
- Tests: `tests/integration/federation-inbox-retry.integration.test.ts`, `tests/integration/webhook-failure-recovery.integration.test.ts`, `tests/unit/social-retry-gates.test.ts`, `tests/rc2-h05/journey.mjs` (live ops journey, 6/7 stages — the 7th is the DEBT-25 divergence, kept as a failing stage on purpose), `tests/rc2-h05/list-tasks.ts` + `seed-job.ts` + `read-job.ts` (Lean-gate harness).
- `RUNBOOK.md` in this folder: the reproducible operator diagnostic runbook (symptom → queue state → retry/dead-letter → display → recovery).
- Typecheck clean; prettier applied to every shipped file; CI is the deciding gate.

## Environment notes

A VM replacement (~09:52 CT) killed the first post-fix journey mid-recovery; the rig was rebuilt via env-up and the journey re-run end to end (run 3) on the fresh world. Journey runs 1–2 stand as the pre-fix and partial evidence; run 3 is canonical for the fixed tree.
