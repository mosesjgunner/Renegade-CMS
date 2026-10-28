# RC1 subpass 11C - PASS

Date: 2026-10-27 (America/Chicago). Scope: checkout, merchant selection and payment settlement. Aggregate RC1 remains **NOT READY**. No next subpass was executed.

Base commit: `87a9ef6bb35405658ef5dd3fb94f3f95771a799e`. Changes remain uncommitted. The complete 1,463-file [source manifest](source-tree.json) has treeHash `09e0fe21b4d33250aefb358c002bdb836d73a540b88572ac32dbfd314095d9a7`. Final checkout/settlement actions and restart match this source; containment was checked after completion. Documentation/evidence, dependencies, media, databases and secrets are excluded; dependency identity is `package-lock.json`. Earlier receipts retain their original source identities.

## Implementation and changed paths

- `src/modules/commerce/contracts.ts`: hardened `eligiblePaymentMethods(...)` to filter out payment method capabilities whose `siteId` or `spaceId` mismatches `context.merchant` in addition to merchant connection, enabled, health, currency, and required capability checks.
- `src/modules/commerce/local-test-checkout.ts`: added `canConfirmTestCheckout(...)` so both guest checkout cookies (`guestCanConfirmTestCheckout`) and authenticated member cart owners (`currentMember` matching `cart.member ?? cart.owner` on active `catalogSiteForHost` before `expiresAt`) can access and confirm local test checkouts without cross-tenant or cross-actor access.
- `src/app/(frontend)/checkout/test/[reference]/page.tsx`: updated local test checkout page authorization to use `canConfirmTestCheckout(...)`.
- `src/app/(frontend)/api/commerce/checkout/test/confirm/route.ts`: updated local test confirmation route authorization to use `canConfirmTestCheckout(...)`.
- `src/app/(frontend)/api/commerce/checkout/initiate/route.ts`: added `origin` CSRF validation (`403` on cross-origin POST), wrapped checkout initiation in `withExecutionLock(payload, 'commerce.checkout.initiate:<proposalId|sessionId>', ...)` to prevent concurrent race creation of duplicate sessions/intents/attempts, and allowed idempotent replay when a proposal was already consumed by an active checkout session with matching integrity hash.
- `src/modules/commerce/tasks.ts`: wrapped `processPaymentEventTask.handler` in `withExecutionLock(req.payload, 'commerce.payment-attempt:<attemptId>', ...)` so concurrent webhook deliveries and workers for the same attempt serialize; recorded verified provider events in `payment-intents.financialEvents`; updated `reconcilePaymentsTask` to create `commerce-reconciliation-cases` on amount/currency mismatch and record `terminal-success-conflict` reason accurately.
- `src/modules/commerce/service.ts`: updated `finalizeVerifiedOrder` supporter email resolution to read `order.partySnapshot?.email ?? proposal?.customer?.email ?? cart?.customerEmail ?? order.customerEmail`.
- `src/app/(frontend)/api/commerce/checkout/status/route.ts` and `src/modules/commerce/CheckoutStatus.tsx`: included immutable `order.items` and `order.totalsSnapshot` in the authorized status response and rendered the settled total and line items on `/checkout/return?session=...`.
- `src/modules/commerce/payment-provider.ts`: shared in-process deterministic-test payment registry across `configuredPaymentProvider('deterministic-test')` instances (with optional `isolated: true`) so local reconciliation tasks observe deterministic provider state created during checkout initiation.
- `src/app/(frontend)/api/admin/commerce/reconcile/route.ts`: enforced explicit `siteId` authorization checks against `grant.authorizedSiteIds` for non-global operators (`403` on foreign site).
- New `tests/unit/rc1-11c-checkout-settlement.test.ts` and `tests/rc1-11c/{journey.ts,run.ps1,provenance.ts}`: focused unit tests, isolated runtime/browser/persistence/race/reconciliation harness, and source containment checker.

Existing schema and Payload generated types already contained `checkout-sessions`, `payment-intents`, `payment-attempts`, `payment-webhook-events`, `orders`, and `commerce-reconciliation-cases`; no new schema migration was required. Fresh migration verification applied all 127 existing migrations cleanly.

## Executed ordinary paths and persisted observations

1. **Controlled Guest Browser Checkout (`guest-buyer@11c.test`)**:
   - In genuine Chromium, a guest visited `/store/almanac-11c`, rejected non-essential privacy cookies via the banner, added 1 unit of `11C Field Almanac` (`ALMANAC-STD`, `1750` minor units), navigated to `/cart`, filled shipping/billing address (`100 Main St, Austin, TX 78701`), and clicked **Create Checkout Proposal**.
   - Proposal `guestProposalId` bound to Site Alpha's merchant connection (`alphaMerchant`) with `1750` subtotal + `500` shipping + `109` TX tax = **`2359` USD minor units**.
   - `GET /api/commerce/checkout/methods?proposal=...` returned strictly 1 eligible healthy USD method (`alpha-det-usd`), excluding disabled, unhealthy, EUR, and Site Beta methods.
   - Clicking **Proceed to Payment** called `POST /api/commerce/checkout/initiate`, creating 1 `checkout-session` (`open`), 1 `payment-intent` (`requires-action`), and 1 `payment-attempt` (`action-required`), and redirected the browser to `/checkout/test/det_cs_...`.
   - Navigating directly to `/checkout/return?session=...` before confirmation showed `Payment processing` and confirmed `0` orders existed (`browser return redirect does not settle payment`).
   - Clicking **Confirm test payment** on `/checkout/test/det_cs_...` submitted a signed webhook to `/api/commerce/webhooks/deterministic-test` (`202 Accepted`) and redirected to `/checkout/return?session=...`.
   - Running the `commerce` queue worker (`commerce-process-payment-event`) settled the attempt (`succeeded`), intent (`paid`, `financialEvents` populated), session (`completed`), and created **1** paid order (`ORD-...`, `2359` minor units) with receipt `RCT-...`, decremented inventory (`10 -> 9`), converted the cart, consumed the inventory reservation, queued 1 transactional receipt email, and rendered the confirmed order number, receipt number, settled total, and line item in the guest browser.

2. **Controlled Member Browser Checkout (`buyer-member@11c.test`)**:
   - In a separate Chromium context with a member session (`renegade-member`), the member added 1 physical `11C Field Almanac` (`1750`) and 1 digital `11C Digital Briefing` (`1200`) to `/cart`, created a proposal (`2950` subtotal + `500` shipping + `184` tax = **`3634` USD minor units**), and clicked **Proceed to Payment**.
   - The member browser loaded `/checkout/test/det_cs_...` authorized by member cart ownership without a guest checkout cookie. A guest context attempting to confirm the member's test checkout reference was denied (`403`).
   - The member clicked **Confirm test payment**, the webhook worker ran, and `/checkout/return?session=...` rendered the confirmed order number, receipt number, settled total (`3634 USD minor units`), both line items, and the authenticated digital download link (`Download purchased file BRIEFING-PDF`).
   - Database verification confirmed 1 paid member order, stock decremented once more (`9 -> 8`), 1 active `entitlements` grant (`11c.briefing.read`), and 1 active `digital-delivery-grants` record.

3. **Immutable Financial Snapshots After Catalog Price Change**:
   - Operator updated `11C Field Almanac` offer price from `1750` to `2900` minor units (`version: 2`) and republished.
   - Refetching guest and member checkout status and `orders` rows confirmed the settled guest order remained `2359` (`unitAmountMinor: '1750'`) and the settled member order remained `3634`.

4. **Provider & Authentication Truth**:
   - Provider mode: local `deterministic-test` signed webhook adapter and `stripe-test` signature/replay contract in unit tests; zero live external charges or remote network calls.
   - Authentication boundary: genuine anonymous guest Chromium context; member session created via canonical magic-link service and installed in browser; operator sessions via `admin_sessions` fixture (`LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`). No WebAuthn passkey ceremony or live SMTP delivery is claimed.

## Negatives, concurrency, reconciliation and restart

- **Webhook Forgery, Unknown Provider, Replay & Out-of-Order Events**:
  - Forged `x-commerce-signature` rejected with `401`; unconfigured provider route `/api/commerce/webhooks/unconfigured-provider` returned `404`.
  - Replaying the signed `succeeded` webhook for the guest attempt returned `200 { received: true, replay: true }` and left order count (`1`) and stock (`8`) unchanged.
  - Delivering a higher-sequence `succeeded` event (`sequence: 20`) followed by a stale lower-sequence `failed` event (`sequence: 5`) recorded both event IDs in `processedEventIds` while keeping `state === 'succeeded'`, `lastProviderSequence === 20`, and the order `paid`.
- **Payment Disagreement & Terminal-Success Conflict Quarantine**:
  - Signed `succeeded` webhook reporting `amountMinor: '100'` against a `3581` attempt transitioned the attempt to `unknown` (`failure.code: 'amount-or-currency-mismatch'`), created 1 `quarantined` case in `commerce-reconciliation-cases`, created `0` orders, and left stock at `8`.
  - A `failed` webhook (`sequence: 1`) followed by a late `succeeded` webhook (`sequence: 2`) transitioned the attempt to `unknown` (`failure.code: 'terminal-success-conflict'`), created 1 `quarantined` reconciliation case, and created `0` orders.
- **Concurrent Checkout Initiation & Concurrent Webhook Worker Race**:
  - 3 simultaneous `POST /api/commerce/checkout/initiate` requests for the same proposal serialized via `withExecutionLock` and returned the exact same `sessionId`, `intentId`, and `attemptId` (1 row each in DB).
  - 3 simultaneous webhook POSTs + concurrent `processPaymentEventTask.handler` executions for the same attempt serialized via `withExecutionLock` and produced **1** paid order and decremented stock once (`8 -> 7`).
- **Unknown Outcome & Operator Reconciliation**:
  - An attempt in `unknown` state (simulating post-send timeout before webhook arrival) was reconciled via `POST /api/admin/commerce/reconcile` (`202 Accepted` for Alpha owner; `403` for Beta staff), which queued `commerce-reconcile-payments`, recovered provider state via `idempotencyKey`, queued `commerce-process-payment-event`, and settled **1** order (`stock 7 -> 6`).
- **Access Control, Host Isolation & Native REST Denials**:
  - Guest reading member status (`403`), member reading guest status without guest cookie (`403`), foreign host `beta.11c.test` reading Alpha session (`404`), cross-origin `initiate` (`403`), cross-site capability (`403`), foreign staff on `/api/admin/commerce/dashboard?siteId=...` (`403`), and direct native `POST /api/{orders,payment-intents,payment-attempts,payment-webhook-events}` for both anonymous (`403`) and owner (`403`).
- **Restart Persistence**:
  - Restarted PostgreSQL container `rc111c-20261027` and started a fresh Next.js process. Both guest and member browsers reloaded `/checkout/return?session=...` and rendered their confirmed order numbers, receipt numbers, settled totals (`2359` and `3634`), and member digital download link; DB retained all paid orders, inventory (`6`), and quarantined reconciliation cases ([restart.json](restart.json): 3/3 passed).

## Commands and counts

All accepted final commands exited **0**.

| Command | Result / artifact |
| --- | --- |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-11c/run.ps1 migrate` | 127 fresh migrations; [migrations.log](migrations.log) |
| `npx.cmd tsc --noEmit` | Full checkout, 0 errors; [types.log](types.log) |
| `npx.cmd eslint <11cPaths>` | 0 errors/warnings; [lint.log](lint.log) |
| `npx.cmd vitest run <13 commerce unit files>` | 13 files, 69 passed / 0 failed / 0 skipped; [unit.log](unit.log) |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-11c/run.ps1 journey` | 32 passed / 0 failed / 0 skipped; [journey.log](journey.log), [journey.json](journey.json) |
| `docker restart rc111c-20261027` | Real PostgreSQL container restart |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-11c/run.ps1 restart` | 3 passed / 0 failed / 0 skipped; [restart.log](restart.log), [restart.json](restart.json) |
| `node --import tsx tests/rc1-11c/provenance.ts --check` | 1,463 files match `09e0fe21b4d33250aefb358c002bdb836d73a540b88572ac32dbfd314095d9a7`; [source-tree.json](source-tree.json) |
| `git diff --check` | Exit 0 |

Accepted totals: **69 unit tests + 32 runtime journey checks + 3 post-restart checks = 104 passed; 0 failed; 0 skipped; 0 mandatory 11C groups unexecuted**.

## Isolation and exit

Only new container `rc111c-20261027`, label `rc1.scope=11c`, ID `54c7d389d6422026294030b16cad33dbddbe880d317544a0f7ea6d3ca51a8111`, image `sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`, loopback port `5461`, DB `rc111c_release_acceptance`, media `scratch/rc111c/media`, Next output `.next-rc111c`, and web port `39017` were used. Container `rc111c-20261027` and all web/browser processes are stopped; data is retained. Preexisting databases, containers, media, secrets, and historical evidence were preserved untouched.

**11C PASS. Open scoped blockers: none.** See [NEXT.md](NEXT.md); stop here.

