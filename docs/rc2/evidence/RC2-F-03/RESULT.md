# RC2-F-03 — Commerce integrity under attack

**Verdict: PASS** — journey 13/13 stages on the disposable two-site world, deterministic sandbox
provider only; no real funds, cards, or production webhooks. Duplicate requests, replayed signed
events, a worker restart, and cross-site attempts could not double-charge, double-entitle,
double-fulfill, or double-count; failures reconciled instead of becoming false success. Real
provider behavior remains **NOT VERIFIED** (Stripe is the only live adapter; nothing here speaks
to it).

## Duplicates and concurrency

- Two concurrent checkout initiates carrying the same idempotency key return the **same
  session**; exactly one payment attempt exists.
- Two concurrent sandbox confirms of that session settle **exactly one paid order** and
  decrement tracked inventory exactly once (5 → 4). Both callers receive a normal redirect; no
  500s.

## Webhook attacks

- A **forged signature** is refused 401 with a generic error.
- A **validly signed event with the wrong amount** ($1.00 against a $26.25 order) is accepted
  into the inbox and marked `processed` — handled — but settlement validates the amount and the
  order is **never created or marked paid**; stock does not move. The order surface, not the
  event surface, is the success record, and it stays clean. (Characterization: no `failed` event
  row persisted in this scenario, so the admin webhook-retry endpoint had nothing to retry; the
  retry route's preconditions — failed + verified + payload hash — are code-verified only and
  the endpoint itself is **not exercised** by this journey.)
- The **correct signed event settles order 2 exactly once**. Replaying the identical event
  twice returns `{replay: true}` and changes nothing; a late sandbox confirm of the same attempt
  is likewise a no-op (stock 4 → 3, one order throughout).
- A signed event naming an **unknown attempt** is answered 202 with "Webhook cannot be
  correlated to a payment attempt." and creates nothing.

## Worker restart mid-flight

- With the jobs worker killed (verified: no worker processes remain), a confirmed payment is
  **not** marked paid — no false success while the settlement pipeline is down. After the worker
  restarts, the same payment settles **exactly once** (one order, stock decremented once).

## Refund / cancel path (dual control)

The sandbox ran with `COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR=1`, so every refund requires
a second operator:

- Preview returns the refund computation; **request → 202 `awaiting-approval`** with an audit
  entry. A duplicate request while one is pending is refused 409 ("Resolve the pending refund
  before requesting another") and creates no second refund row.
- The **requester cannot approve their own refund** (409), and the **other site's admin cannot
  approve it either** (403, object belongs to another site).
- A **second operator on the same site approves** → the provider refund executes, refund state
  `succeeded`, order state `refunded`, and the refund's audit log records the full chain:
  `requested, approved, provider-succeeded`.
- After a full refund, a new refund request is refused 422 and re-approving the settled refund
  is refused 409.
- Characterization: a refund does **not** restock inventory automatically — the refund record's
  downstream policy is `fulfillment: manual-review`, so restocking stays an operator decision.

## Cross-site payment binding and secrets

- Checkout initiation against Site A's proposal with **Site B's payment capability** is refused
  403 (capability is bound to its owning site/merchant).
- Across all 79 responses the journey captured, **none** contains the webhook signing secret,
  the affiliate callback secret, or any signature value; the 401 body is a generic message.

## Sandbox topology note

The refund route and the admin-mutation proxy each compare the request `Origin` (against the
request URL and against `APP_URL` respectively). In this sandbox the two agree only when
`APP_URL` is the `localhost` origin the standalone server reports for itself, so the F-03 server
ran with `APP_URL=http://localhost:39071` (still loopback, still valid under
`LOCAL_E2E_TEST_MODE`). In production topology both are the site's public origin and coincide —
the same family as RC2-DEBT-14, not a new defect.

## Findings

No new engineering debt filed. Behaviors characterized above: amount-mismatched events are
processed-but-never-settled; refunds do not auto-restock (manual-review policy); the
webhook-retry endpoint remains unexercised for lack of a failed event row.

## Evidence

- `tests/rc2-f03/journey.mjs` — 13/13 stages (final run, exit 0): concurrency, webhook
  forgery/replay/unknown-attempt, cross-site capability binding, worker kill + restart,
  dual-control refund chain, secret-redaction sweep.
