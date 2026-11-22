# RC3-13 — Membership purchase, access and revocation (non-podcast slice)

**Verdict: DONE at E2 per leg** on branch `rc3-13`, based on `82b5c6c`
(GitHub main). Local commits only; nothing pushed.

Scope was set by the owner's option A decision (Nov 21, 2026): build
the non-podcast parts of RC3-12/13/14 now; podcast-dependent slices
close when RC3-10/11 land with the podcaster build. Ledger areas
#46/#47/#48/#49, owner pass 13.

## What was built

The membership chain downstream of the provider — checkout route,
signed webhook route, `applySubscriptionEvent`,
`reconcileBillingSubscription`, entitlement recompute, order
settlement — already existed and is provider-agnostic. The missing
piece (named gap **F-02**, ledger #48) was a recurring-capable test
provider: `recurringProvider()` refused the deterministic adapter
("does not support recurring billing"), and Stripe — the only
recurring adapter — needs real test keys and network. This pass
closes that gap and proves the whole journey in provider test mode:

- **Deterministic recurring fixture** (`payment-provider.ts`): the
  deterministic adapter now implements the full
  `RecurringPaymentProvider` contract as an explicit test-mode
  fixture — subscription checkout with bounded idempotency (replay
  returns the same checkout/subscription/customer references),
  trial vs incomplete start states, reconcile projection, customer
  portal, price preview against registered prices, invoice/charge
  payment resolution, and HMAC-signed subscription webhooks using
  the same timing-safe scheme as the one-time side. Test controls
  mirror the existing `setState`: `setSubscriptionState`,
  `setSubscriptionPrice`, `setInvoice`, `signSubscriptionEvent`.
  Stores are shared module-level maps in the existing style (so the
  adapter instance a route builds and the instance a test drives
  see the same provider-side truth), with an `isolated: true`
  option for unit tests. No production path changes; Stripe remains
  the only live recurring adapter, and `configuredPaymentProvider`
  already routed `deterministic-test`/`development-*` keys here.
- **Journey proof** (`rc313-membership-journey.integration.test.ts`,
  real Postgres, two-site rc2 world, real route handlers): an
  operator publishes a membership plan whose entitlements are the
  exact resources the public page gate (`members-lounge` read) and
  the protected download route (`media:<assetId>` download,
  `unmetered`) consult; members buy through the real checkout route
  with magic-link sessions; provider truth advances through the
  fixture and arrives as signed webhooks through the real webhook
  route.
- **Product bug found and fixed**: the member billing readback
  built protected download paths with `slice(5)` on `media:<id>`
  resources, emitting `/download/:<id>` — a stray colon in the
  media id, so the link could never resolve. Fixed to `slice(6)`
  (`api/commerce/subscriptions/route.ts`); the journey asserts the
  corrected path from the real readback.

## Per-leg levels (all E2 — real Postgres, two-site rc2 world)

| Leg                                                                                                                                                                                                                                                                     | Level | Proof                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| Recurring fixture contract (F-02 seam): checkout idempotency, trials, reconcile, portal, preview, invoice resolution, signed-webhook verify/tamper rejection                                                                                                            | E2    | `tests/unit/rc3-13-deterministic-recurring.test.ts` (8 tests) |
| Purchase in provider test mode → incomplete subscription, pending order/session, no access before payment; purchase replay reuses the subscription                                                                                                                      | E2    | journey test 1 (checkout route, real session + CSRF)          |
| Receipt + access: signed `activated` + `invoice_paid` → subscription active, order paid (`subscription-invoice-paid`), session completed, 2 grants, gated-page + media entitlement readback true on A / false on B                                                      | E2    | journey test 2                                                |
| Member billing/operator ledger readback: state, paid invoice ledger (`subscriptionInvoices`), protected download path agree with order/session/entitlements                                                                                                             | E2    | journey test 2 (real GET route)                               |
| Duplicate delivery: same event id → `replay: true`, event/grant counts unchanged, order stays paid                                                                                                                                                                      | E2    | journey test 3                                                |
| Cancel: `cancel_scheduled` → `cancel_at_period_end` with access retained; reconcile past period end → `canceled`, grants revoked                                                                                                                                        | E2    | journey test 4                                                |
| Out-of-order delivery: `invoice_paid` (seq 2) before `activated` (seq 1) converges to active + paid; a later stale failure event is recorded but moves neither state, version nor access                                                                                | E2    | journey test 5                                                |
| Failed payment: `invoice_failed` → `grace` (failure `renewal-failed`, access retained); reconcile past the grace deadline → `expired`, grants revoked                                                                                                                   | E2    | journey test 6                                                |
| Refund/revoke: invoice-only `refund_recorded` resolved through the provider to a full refund → `payment_refunded` hold (`paused`), access revoked, `billing.payment_refunded` member notice created                                                                     | E2    | journey test 7                                                |
| Second-site isolation: site B member buys site B plan → access on B only; site A plan via site B host → 404                                                                                                                                                             | E2    | journey test 8                                                |
| Shop readback (focused check): world paid order, its checkout session and amounts agree; unpaid order still `pending-payment`                                                                                                                                           | E2    | journey test 9                                                |
| Donation readback (focused check): one-time donation settles through the local test checkout → exactly 1 donation, 1 order with receipt `issued`, campaign donations sum to the gift (totals are derived — campaign revisions are immutable and store no running total) | E2    | journey test 10                                               |

No E3 claimed: there is no browser leg — proof is at the real
route/service layer against real Postgres, as with RC3-12/15B. The
browser purchase journey (#46) stays unrun and rides the F-01/GUI
line, exactly as the ledger already states.

## Named observations (not failures of this pass)

- **Plan keys are global, not per-site**: `plan-revisions` has a
  unique index on `(planKey, revision)` with no site component, so
  two sites cannot both publish a plan keyed e.g. `members`
  revision 1. Operators must namespace plan keys per site until
  that index is revisited.
- **Webhook dedupe keys are global** (`provider:<key>:<eventId>`):
  correct for a single provider account, and the reason the
  journey scopes its event ids per run.
- The deterministic adapter's webhook secret is
  `COMMERCE_TEST_WEBHOOK_SECRET` (shared with the local test
  checkout), read at call time.

## Deferred (option A, by design — named, not hidden)

- **Protected member FEED readback for podcast episodes** — the
  podcast-dependent slice of this pass. The feed surface is
  RC3-11's (`podcast-studio/member-feeds.ts` consumes the same
  `hasEntitlement` seam proven here); the feed leg itself closes
  with RC3-10/11.
- **Podcast episode catalog entitlement wiring** — RC3-12's viewer
  seam takes `entitled` as an input; it consumes this pass's
  `hasEntitlement` at merge time (the rc3-12 branch is not in this
  tree; all Wave 2 passes branch from `82b5c6c`).
- **Live Stripe recurring proof** — never claimed. All evidence
  here is provider test mode via the deterministic fixture, which
  is the fixture/test-mode proof attempt ledger #48 assigns to
  this pass; the provider-hosted recurring checkout leg (F-02's
  live half) remains NOT VERIFIED against a real provider.
- **Browser-level purchase journey** (#46) — unrun; rides the
  F-01/GUI line per the ledger.

## Gauntlet (CI order, final tree)

Baselines on pristine `82b5c6c` (recorded): unit 348 files /
2,822 tests; integration 98 files / 576 tests (570 pass + 6 skip).

Final tree: migrations fresh ✓ · seed ✓ · lint ✓ · typecheck ✓ ·
unit **349 files / 2,830 tests, all pass** (baseline +1 file /
+8 tests — the fixture unit proof) · integration \*\*97 files passed

- 2 skipped (99 files); 580 tests passed + 6 skipped, 0 fail\*\*
  (baseline +1 file / +10 tests — the journey proof) · build ✓ ·
  smoke ✓ (`PASS: Next.js public/admin routes and Payload PostgreSQL
persistence are operational`).

Environment notes, for the record: the first gauntlet attempt was
killed by a **VM replacement** during the lint stage (migrations,
seed and format had passed); Postgres was wiped with the VM and
recovered (postgresql-16 reinstall, role and both acceptance
databases recreated) before the full re-run above. That re-run's
format stage flagged this RESULT.md itself; it was prettier-fixed
and the closing whole-tree `format:check` is exit 0. The re-run's
build OOM-died silently at the TypeScript phase
(`/proc/vmstat` oom_kill 1, log truncated) at RAYON 2 / 3 GB heap
and passed clean on retry from a clean `.next` at RAYON 1 /
2.5 GB heap — environment, not code: no source changed between
attempts.

Also recorded this pass, per the rig rules: the RC3-14 gauntlet
that was already running when RC3-13 started finished **PASS
(exit 0)** — unit 349 files / 2,829 tests; integration 98 files
passed + 2 skipped (100), 579 tests passed + 6 skipped; build and
smoke PASS. No 313 test, migration, seed or build command ran
before its exit file appeared.
