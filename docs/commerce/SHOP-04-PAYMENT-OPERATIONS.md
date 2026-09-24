# SHOP-04 Payment Operations

Status: implemented in code; a real Stripe test-mode checkout, PostgreSQL migration/restart, browser journey, and full release gates remain environment-dependent acceptance.

## Authority and state

`CheckoutProposal` remains the immutable server quote. A `CheckoutSession` binds its proposal, customer digest, site, currency, amount, attempt number, expiry, and safe return/cancel paths. Its binding key is unique, so a retry cannot silently create a second payable session. `PaymentAttempt` records the provider contract/API versions and is distinct from both `PaymentIntent` and `Order`.

Payment/attempt states are `initiated`, `action-required`, `processing`, `succeeded`, `failed`, `cancelled`, `partially-refunded`, `refunded`, `disputed`, and `unknown`. A browser redirect never advances them. Amount/currency disagreement moves the attempt to `unknown`; stale events cannot revive terminal failed/cancelled/refunded/disputed state.

Only signed normalized provider evidence or an authoritative provider reconciliation may settle an order. Order creation, immutable party/address/line/total/terms/source snapshots, inventory, entitlements, and downstream instructions run in one Payload database transaction. `orders.checkout_session_id` is unique. Existing snapshots are never rewritten by refund/dispute processing.

## Provider boundary

`PaymentProviderAdapter` is versioned as `shop-04.v1` and exposes readiness, hosted checkout creation, retrieve/reconcile/cancel/refund, dispute retrieval, limits/version metadata, and signed webhook normalization. Adapters declare `rawPaymentDataAccepted: false`; Renegade never renders or accepts card/bank fields.

- `deterministic-test` (and retained `development-*` keys) is deterministic across restart and supports signed fixture events.
- `stripe-test` uses Stripe-hosted Checkout only. It is disabled unless `COMMERCE_STRIPE_TEST_ENABLED=true` and rejects non-`sk_test_` keys. Creation/refund requests carry stable provider idempotency keys. Transport ambiguity becomes `unknown`; the reconciliation job may recover creation only by replaying the exact immutable request with the same provider idempotency key, never as a fresh charge.

The Stripe implementation follows the pinned `COMMERCE_STRIPE_API_VERSION`. Upgrades require adapter conformance and webhook fixture review.

## Webhooks and reconciliation

The public webhook route verifies the raw-body signature and timestamp, applies a 1 MB bound, normalizes an allowlisted event shape, hashes the raw body, and stores only sanitized evidence in the replay-unique inbox. It then returns `202`; an ordered durable Payload job processes financial changes. Raw provider payloads and secrets are not persisted.

The reconciliation job covers pending/unknown attempts. Verified retrieved money must exactly match the attempt before it emits synthetic reconciliation evidence into the same inbox path. Unknown creation is never assigned a new attempt or idempotency key. Duplicate event IDs and synthetic reconciliation IDs are harmless across process restart.

## Customer access and receipts

Return and cancel pages poll server truth and explicitly say that redirects do not prove payment. Member access requires the member who owns the cart. Guest access uses an HttpOnly, SameSite=Lax, expiring token scoped to checkout session and site. Status responses are `private, no-store` and project no email, address, provider evidence, or secret.

The verified settlement queues one Audience `transactional` receipt with a deterministic delivery key. It has `marketingConsentRequired: false` and does not imply marketing consent. Staff resend creates a new audited delivery key without changing the canonical receipt. Successful refunds queue a correction receipt through the same Audience delivery system.

## Refunds, disputes, and operations

The refund endpoint provides a minor-unit preview, prevents over-refund, requires a reason, supports an optional dual-control threshold with a different approver, uses provider idempotency, and records unknown/failure without blind retry. Successful refund evidence appends an order transition and downstream policy; it never mutates the original order snapshots. Provider-originated refunds are also materialized as audited refund records.

Dispute webhooks create a unique case and move the order to `exception`; evidence remains append-only. `/admin/commerce` reports health, state counts/totals/age, unknown/failure/pending work, refunds, disputes, and webhook gaps. Totals are explicitly an operational ledger, not certified accounting or settlement balances.

## Verification

Focused automated coverage is in `tests/unit/shop-04-payment-operations.test.ts`: adapter conformance, deterministic restart, Stripe request/idempotency/version shape, signed/forged/stale events, replay/out-of-order terminal protection, amount/currency mismatch, partial/full refund validation, refund failure, dispute normalization, guest-token scope/expiry, transactional receipt semantics, and dashboard totals/age.

Release acceptance still requires all of the following in a configured environment:

1. Apply the SHOP-04 migration up/down against disposable PostgreSQL and inspect constraints/indexes.
2. Complete one visible Stripe test checkout and deliver its signed webhook through the public route and worker; prove exactly one paid order and one receipt delivery after duplicate delivery and process restart.
3. Exercise redirect-before-webhook, cancel-before-late-success, asynchronous success/failure, unknown creation recovery, out-of-order/duplicate events, amount/currency mismatch, refund failure/success, dispute creation, and restart recovery.
4. Prove guest cross-session/site denial and member ownership; inspect HTTP, logs, dashboard, portability export, and backup output for secrets, raw payloads, email/address leakage, and hosted action URLs.
5. Run aggregate unit/integration/browser suites, typecheck, lint, formatting, production build, and backup/restore rehearsal.

Do not mark SHOP-04 release-verified until the hosted test-mode journey and these live gates have completed.
