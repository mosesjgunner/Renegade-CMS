# RC3-15A — Thread subscriptions and community standing — Result

Date: 2026-11-21. Branch: `rc3-15a` (local only; nothing pushed).
Base: `refs/gh/main` at `82b5c6c`, which already contains the salvaged
Codex work for this pass (`6b51bc6` + `6e34a10`). Per Matthew's
decision that history stays on main as-is; this branch verifies it
where it sits and completes the pass on top. This document replaces
the earlier "not ready" draft (including its stray BOM). The draft's
complaint about a moved branch is moot: the concurrent history it
described is now simply main, by the owner's explicit call.

**Hard boundary honored:** the join-before-posting enforcement flip
was NOT made. `postingStandingDecision()` still reports
`owner-decision-required` with `enforcementEnabled: false`, and
current posting behavior is preserved pending Matthew's authorization.

## Phase 1 — salvage verdicts (commits `6b51bc6` + `6e34a10`, verified on main)

Focused verification on the main tree, database
`rc315a_release_acceptance` (fresh migrations + fixture seed):
`rc315a-thread-notifications` 7/7, `thread-subscriptions-identity`
7/7, `community-cross-site-boundaries` 7/7, `comm-00-community-pass`
11/11, unit `rc315a-standing-preview` 2/2 — 34/34, on top of the green
full-suite baseline recorded for `82b5c6c` (unit 348/2,822;
integration 98 files / 576 tests, 570 pass + 6 skipped).

| Salvaged piece                                                                                                                                                                                                                | Verdict                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thread-subscriber fanout from the canonical reply writes (`comment.reply`, `thread.reply`), with eligibility rechecked at dispatch (active status, policy read access, actor excluded)                                        | **Sound** — suite tests 1–3, 6.                                                                                                                                                                                     |
| Transactional v1 fanout with dispatch marker (migration `20261121_120000_rc315a_thread_notification_dispatch`): interrupted fanout rolls back and retries without duplicates; idempotency replay completes exactly one fanout | **Sound** — suite tests 4, 6, 7. Interruption is simulated transactionally; no process-restart proof was performed (see open items).                                                                                |
| Readback privacy: notifications for a thread that has since gone private are hidden; new notices stop after access is lost                                                                                                    | **Sound** — suite test 2.                                                                                                                                                                                           |
| Blocks/mutes suppress new notices                                                                                                                                                                                             | **Sound** — suite test 3.                                                                                                                                                                                           |
| Preferences: a subscriber with in-app `thread.reply` frequency `off` is not notified                                                                                                                                          | **Sound** — suite test 1 (the preference is set mid-test and the unread count holds).                                                                                                                               |
| Subscription routes: session + host-bound, foreign site rejected, header-only impersonation rejected, CSRF required                                                                                                           | **Sound** — suite test 5 + the identity suite (7/7).                                                                                                                                                                |
| Friends-vs-private: legacy `friends` visibility is treated as private (a one-way follow is not friendship) and labeled in the owner projection (`visibilityNotice`)                                                           | **Sound, resolved in the narrower direction and labeled** — unit proof in `rc315a-standing-preview`; community policy groups `friends` with `private`. Browser presentation of the label is unverified (open item). |
| Standing decision surface (`postingStandingDecision`, join route reports the decision + `wouldRequireJoin`)                                                                                                                   | **Sound as a synthetic preview (E0 mechanism, honestly labeled)** — unit 2/2. Enforcement NOT flipped (boundary above).                                                                                             |

## Phase 2 — gap filled on this branch

The brief's one named case without its own proof was the pure
**self-reply**: an owner subscribed to their own thread who replies to
it. Added `tests/integration/rc315a-self-reply.integration.test.ts`
(1 test, passing): the owner's unread count stays 0 while a second
subscriber's rises to 1, proving the fanout ran and the replier was
excluded. No product code changed in Phase 2 — every other brief leg
was already proven by the salvaged suites re-run in Phase 1.

| Leg                                                                                  | Level        | Proof                                                                                                         |
| ------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------- |
| Subscribe/unsubscribe, owner+subscriber dedupe, unread readback + site-scoped counts | E2           | Salvage suite tests 1, 5 (verified on main).                                                                  |
| Self-reply exclusion                                                                 | E2           | Phase 2 test above + author-exclusion assertions in salvage test 1.                                           |
| Preferences, blocks/mutes                                                            | E2           | Salvage suite tests 1, 3.                                                                                     |
| Access lost since subscribe (old notices hidden, new ones skipped)                   | E2           | Salvage suite test 2.                                                                                         |
| Second-site privacy                                                                  | E2           | Salvage suite tests 1, 5 + `community-cross-site-boundaries` 7/7.                                             |
| Interrupted dispatch retry without duplicates                                        | E2           | Salvage suite tests 4, 6, 7 (transactional interruption + idempotency replay).                                |
| Friends-vs-private semantics                                                         | E2           | Narrower access kept and labeled in the owner projection; unit proof. Browser presentation unverified.        |
| Join-before-posting decision + synthetic compatibility                               | E0 mechanism | `postingStandingDecision` preview (unit 2/2); enforcement deliberately unflipped — the decision is Matthew's. |
| Role, moderation, account export intact                                              | E2           | `comm-00-community-pass` 11/11 and cross-site moderation suites green in Phase 1 and in the branch gauntlet.  |

## Gauntlet (branch tree, CI order, database `rc315a_release_acceptance`)

| Step             | Result                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Fresh migrations | Pass                                                                                                                |
| Fixture seed     | Pass                                                                                                                |
| Format check     | Pass (repo-wide, pinned Prettier 3.6.2)                                                                             |
| Lint             | Pass                                                                                                                |
| Typecheck        | Pass                                                                                                                |
| Unit             | 348 files / 2,822 tests pass — identical to the main baseline                                                       |
| Integration      | 99 files (97 pass, 2 skipped) / 577 tests (571 pass, 6 skipped) — baseline plus the self-reply test, no regressions |
| Production build | Pass (reduced-memory recipe)                                                                                        |
| Smoke            | Pass                                                                                                                |

## Open items (at their true level)

- **No process-restart proof**: interruption recovery is proven
  transactionally (rollback + idempotent replay), not by killing a
  process mid-dispatch and restarting it.
- **No browser journey**: suites drive services and route handlers,
  not a browser; the legacy-`friends` label's browser presentation is
  unverified. Legs are E2, not E3.
- **Enforcement flip remains Matthew's call**: the standing decision
  machinery is built and previewed; posting behavior is unchanged.
- External notification transports (email digests of thread replies)
  are unverified by this pass.
