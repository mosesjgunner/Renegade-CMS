# RC3-07 — Production email isolation (fixture legs only) — Result

Date: 2026-11-20 (overnight run). Branch: `rc3-07` (local only; nothing pushed).
Baseline: fresh `main` fetched and pinned at the RC2 tag tree
`2d4cb3ddf70db5b5f9570297e6bae0d7ff8774bf` before the worktree was created.

## Hold compliance

Matthew's Nov 18 email HOLD is fully in force. This pass used only
deterministic fixtures: the development capture sink, scripted in-process
provider adapters, and a fetch-stubbed Postmark error path. No real provider
account, no real send, no real inbox, no DNS change, and no credential was
touched anywhere. Real-inbox evidence remains **BLOCKED-ON-OWNER** (see the
last section); `EMAIL-11` is unchanged by this pass.

## Harness design

- Own acceptance database `rc307_release_acceptance` (never shared with the
  concurrently running RC3-04 pass); fresh migrations + fixture seed.
- Two sites: the seeded demo site (site A; its id taken from
  `ensureRenegadePartyDemo`'s return value — a bare `sites` find with
  `limit: 1` is not deterministic once extra sites exist) and a created
  site B (`email07-b`).
- Account mail is exercised through `dispatchEmailIntent`'s existing
  `adapterOverride` seam with scripted fixture adapters (per-site From
  identities, call recording, scripted ambiguous outcomes + reconcile).
- Audience mail is exercised through the real audience task machinery
  (`runAudienceEmailTasks`, `queueNewsletterDeliveries`) against the
  deterministic development sink (per-idempotency-key accept/delay
  scripting), plus env-stubbed configuration for the broken-boundary leg.
- Suite: `tests/integration/email-rc3-07-isolation.integration.test.ts`
  (10 tests).
- Baseline dependency: this tree is the pinned RC2 tag. RC3-02's DEBT-15
  suppression-counting fix (branch `rc3-02` @ `3cd4f4b`) is **not** in this
  tree; the suppression fixtures therefore assert dispatch/suppression
  behavior only, never count surfaces.

## Per-flow verdicts

| Flow                                          | Verdict                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account recovery (`account-recovery` purpose) | PROVEN at the outbox contract level — dispatched through a fixture adapter with site A's From identity and zero cross-traffic. Observation: no production route enqueues this purpose at baseline (the product is passwordless — passkey/magic-link); the staff invitation below is the live account-mail route. Recorded, not changed.                                                     |
| Staff invitation                              | PROVEN — site B intent dispatched with site B's identity; neither adapter ever saw the other site's traffic.                                                                                                                                                                                                                                                                                |
| Double opt-in (same address on both sites)    | PROVEN — separate subscriber rows, tokens, and confirmation deliveries per site; site A's token activated site A only while site B stayed pending; site B then confirmed independently.                                                                                                                                                                                                     |
| Campaign send                                 | PROVEN — queueing selected exactly the eligible site A member: a bounce-suppressed member was skipped and a site B subscriber anomalously holding a site A list membership was skipped. The delivery was accepted through the sink with the campaign's subject and recipient. An unsubscribe landing after queueing cancelled the delivery at dispatch (`suppressed-before-send`, no send). |
| Suppression handling                          | PROVEN, scoped per site — an `invalid` suppression blocked audience delivery on site A and not on site B; marketing suppression never blocked account mail (boundary split in `canDeliverToSubscriber`).                                                                                                                                                                                    |
| Campaign backpressure                         | PROVEN — 12 sink-delayed campaign deliveries stayed `queued` through a recovery sweep while a confirmation delivery and a site B account intent both completed `accepted` in the same cycle (the sweep dispatches confirmations ahead of marketing); the backlog then drained cleanly once the delay cleared.                                                                               |
| Bad provider configuration                    | PROVEN — a Postmark adapter whose fetch is stubbed to return 401 ends the intent `rejected` with `authentication_failed`: a clean, deterministic, permanent failure with zero network traffic.                                                                                                                                                                                              |
| Unknown provider outcome — account outbox     | **GAP FOUND + FIXED** (below).                                                                                                                                                                                                                                                                                                                                                              |
| Unknown provider outcome — audience outbox    | PROVEN at baseline — the audience handler reconciles `sending`/`unknown` deliveries before any resend; no gap found.                                                                                                                                                                                                                                                                        |
| Broken audience boundary isolation            | PROVEN — with the audience boundary env-stubbed to a broken Postmark configuration, the campaign delivery ended not-accepted (no sink receipt, no throw) while account mail still dispatched `accepted` in the same test.                                                                                                                                                                   |

## Gap found + fixed: blind resend of `unknown` account intents

At baseline, `dispatchEmailIntent` guarded terminal states and
leased/submitting intents, but an intent whose submission state was
`unknown` fell through to a fresh provider send on any direct re-dispatch —
a duplicate-send hazard that contradicts the outbox module's own header
contract ("an unknown outcome is quarantined until the provider can be
reconciled") and the operator runbook §4. The hazard was latent: the
recovery sweep never selects `unknown` rows, so only a direct re-dispatch
could trigger it.

Fix (`src/modules/email/outbox.ts`): an intent in `unknown` submission
state now routes to the same reconcile-or-quarantine machinery used for
interrupted sends, with a distinct source (`unknown-outcome`):

- adapter reconciles → intent completes `accepted` with the reconciled
  provider message id; the provider's `send` was called exactly once;
- adapter cannot reconcile → the intent stays `unknown`, `lastError` code
  `unknown_outcome`, ledger event `quarantined-unknown-outcome`. It is
  never resent.

The interrupted-send path keeps its existing codes
(`interrupted_send` / `quarantined-interrupted-send`); sweep selection is
intentionally unchanged. The two regression tests fail on baseline code
(both fell through to a second send) and pass with the fix.

## Docs-vs-code check (operator setup instructions)

Verified consistent with the code: every runbook environment name against
`src/modules/email/config.ts` (including the documented legacy aliases);
the partial-Postmark-configuration startup failure; per-boundary webhook
secrets (`EMAIL_WEBHOOK_SECRET_ACCOUNT` / `_AUDIENCE`); the
`WORKER_PROFILE` worker profiles and the `email-account-worker` compose
service; and the SPF-at-the-Return-Path-host model against the adapters'
explicit `ReturnPath` handling.

One clear factual drift found and fixed in
`docs/rc/email/EMAIL_OPERATOR_RUNBOOK.md` §1: it claimed each boundary can
use its own "provider, From identity, quota, and webhook secret" — no
per-boundary quota configuration exists anywhere in the codebase. The
sentence now states that quota is a property of the Postmark account
itself. (Conceptual "quota exhaustion" language in the sending contract
and system map is failure-mode prose, not a setup instruction, and was
left alone.)

## Verification (CI order; exits are actual)

| Stage                                                                                                                                                                  | Result                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Fresh migrations on `rc307_release_acceptance`                                                                                                                         | PASS (exit 0)                                                                                   |
| Fixture seed                                                                                                                                                           | PASS (exit 0)                                                                                   |
| New suite standalone                                                                                                                                                   | 10/10 PASS, twice consecutively (exit 0)                                                        |
| New suite with the fix reverted (baseline proof)                                                                                                                       | exit 1 — both unknown-outcome regression tests failed as designed; all behavior pins passed     |
| `format:check` (repo-wide)                                                                                                                                             | PASS (exit 0)                                                                                   |
| ESLint on touched files (`--max-warnings=0`)                                                                                                                           | PASS (exit 0)                                                                                   |
| Typecheck                                                                                                                                                              | PASS (exit 0)                                                                                   |
| Unit suite                                                                                                                                                             | PASS — 343 files / 2,792 tests (exit 0)                                                         |
| Focused integration (this suite + EMAIL-01 isolation + audience dispatch concurrency + AUD-08 gate + public subscription journey + shared audience/community contract) | PASS — 6 files / 51 tests (exit 0)                                                              |
| Upgrade-migrations stage                                                                                                                                               | NOT RUN — this pass changes no migrations                                                       |
| Production build + smoke                                                                                                                                               | **NOT RUN** — excluded by the pass brief; deferred to the combined RC2 maintenance verification |

## Files changed

- `src/modules/email/outbox.ts` — unknown-outcome reconcile-or-quarantine
  routing in `dispatchEmailIntent`.
- `tests/integration/email-rc3-07-isolation.integration.test.ts` — new
  two-site fixture suite (10 tests).
- `docs/rc/email/EMAIL_OPERATOR_RUNBOOK.md` — per-boundary quota drift fix.
- `docs/rc3/evidence/RC3-07/RESULT.md` — this file.

## Remaining risks

- The Postmark and SMTP adapters expose no reconcile operation. If a real
  Postmark send ever lands `unknown`, the quarantine is terminal until an
  operator resolves it manually — safe (no duplicate) but manual. A
  provider-side message lookup would close it; that is future work tied
  to the owner's Postmark decisions (email remains HELD).
- The recovery sweep still never selects `unknown` intents (unchanged by
  design); quarantine visibility comes from the dispatch result and the
  intent ledger events.
- The `account-recovery` purpose is fixture-proven at the contract level
  only, since no production route enqueues it at baseline.

## Real-inbox evidence — BLOCKED-ON-OWNER

Unchanged from `docs/rc/email/EMAIL_EXIT_REPORT.md` (`EMAIL-11`): there
are still no Postmark account/Sending Signatures, no sender-domain DNS
records (SPF/DKIM/Return-Path), and no owner seed inboxes, so no real
receipt, rendering, or placement evidence exists or was attempted. The
owner actions that unblock it are listed in that report. The default
no-mail development setup remains usable exactly as before.
