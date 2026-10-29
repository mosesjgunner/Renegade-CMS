# RC1 11E: PASS

2026-10-28 (America/Chicago). Inventory races, retry, worker interruption recovery, dual-site guest/member storefront checkout, digital entitlement/refund paths, Commerce Command Center operations, and restart acceptance. Aggregate RC1 remains NOT READY. No next subpass was executed by this agent.

## Exact source and containment

Tested base commit `ed1ec703ef0401d0876932c310d6f831fc74aef4` plus 1479-file dirty [source manifest](source-tree.json), SHA-256 treeHash `593dfda196c0cb122fea869beb44a317c020cfe6355458720491ef1f1b8e8cd3`. This agent made no commit, reset, cleanup, push, tag or deployment.

All runtime source and 11E verifier files match their tested hashes: `node --import tsx tests/rc1-11e/provenance.ts --check` exited `0`. This is scoped source containment, not whole-checkout or aggregate release sign-off. Prior subpass evidence retained under their respective directories.

## Implementation

- **Checkout Payment Retry**: Repaired `src/app/(frontend)/api/commerce/checkout/initiate/route.ts` to allow reopening failed checkout sessions (`state: 'failed'`). On retry, the session transitions to `state: 'open'`, `session.attempt` increments, `bindingKey` updates, and a fresh `payment-intent` and `payment-attempt` are created (`idempotencyKey = checkout:${session.id}:${attempt}`) while keeping active stock reservations intact.
- **Cart/Proposal/Initiate Host Validation**: Updated origin checks in `src/app/(frontend)/api/commerce/checkout/initiate/route.ts`, `src/app/(frontend)/api/commerce/cart/route.ts`, and `src/app/(frontend)/api/commerce/proposal/route.ts` to accept origins matching either `new URL(request.url).origin` or `protocol + '//' + request.headers.get('host')`, supporting multi-site host headers without bypassing CSRF origin protection.
- **Atomic Promotion Usage Tracking**: Repaired `finalizeVerifiedOrder` in `src/modules/commerce/service.ts` to atomically increment `promotions.usageCount` inside the order completion transaction for applied adjustments (`pricingSnapshot.adjustments`). Replayed settlements do not re-increment `usageCount`.
- **Proposal & Reservation Expiry on Abandonment**: Repaired `abandonCheckoutTask` in `src/modules/commerce/tasks.ts` so when stale `open`/`pending` checkout sessions expire, both active `inventory-reservations` and `checkout-proposals` in `['active', 'consumed']` are marked `expired`.
- **Commerce Command Center Orders & Audit**: Extended `/api/admin/commerce/dashboard` in `src/app/(frontend)/api/admin/commerce/dashboard/route.ts` to include site-scoped settled orders with their `transitionLog` audit entries. Updated `src/modules/admin/CommerceOperations.tsx` to render the Orders and Audit section alongside provider health, currency-separated totals, oldest reconciliation age, pending/unknown actions, refunds, disputes, webhook failures, and quarantined cases.

Changed implementation paths:
- `src/app/(frontend)/api/commerce/checkout/initiate/route.ts`
- `src/app/(frontend)/api/commerce/cart/route.ts`
- `src/app/(frontend)/api/commerce/proposal/route.ts`
- `src/modules/commerce/service.ts`
- `src/modules/commerce/tasks.ts`
- `src/app/(frontend)/api/admin/commerce/dashboard/route.ts`
- `src/modules/admin/CommerceOperations.tsx`
- `tests/unit/rc1-11e-commerce-acceptance.test.ts`
- `tests/rc1-11e/{run.ps1,journey.ts,provenance.ts}`

## Ordinary actions and actual persisted results

Acceptance executed via real Chromium browser contexts (guest sessions on Site Alpha and Site Beta, member sessions via canonical magic-link service, operator sessions via admin fixtures) against a dedicated PostgreSQL container (`rc111e-20261028` on `127.0.0.1:5463`, DB `rc111e_release_acceptance`) and an isolated Next.js instance on port 39019:

1. **Stock Concurrency & Exhaustion**:
   - Two concurrent checkout proposals compete for the last unit of tracked SKU `PIN-11E-BRASS` (inventory 1). Winner receives active reservation (200); contender is rejected with 409 (`insufficient_stock`).
   - `abandonCheckoutTask` runs, marking the stale checkout session abandoned and expiring its inventory reservation and proposal.
   - Contender retries, acquires released stock, completes checkout and settlement, exhausting inventory to 0.
   - Subsequent cart addition for exhausted SKU is rejected with out-of-stock reconciliation note.
2. **Coupons & Discount Stacking**:
   - Member Alpha checkout applies order coupon `SAVE5` (500 minor unit discount) and `FREESHIP` shipping coupon (500 -> 0 net shipping) for exact 2603 USD minor total.
   - First payment attempt fails (simulated card decline); session marks `failed`, preserving active reservation.
   - Retrying checkout initiation reopens session on attempt 2 with fresh intent and idempotency key (`checkout:${session.id}:2`).
   - Interrupted webhook processing simulates worker crash; `recoverStaleCommerceJobs` resets event to `received` and re-enqueues job.
   - Commerce worker settles order at 2603 USD minor, decrements Almanac stock (8 -> 7), increments `SAVE5` usageCount (0 -> 1), and issues 1 entitlement and 1 download grant.
   - Exhausted `SAVE5` coupon (usageCount 1 === usageLimitTotal 1) is rejected on subsequent carts.
3. **Digital Entitlements & Download Limits**:
   - Member Alpha downloads owned private digital file twice with exact byte equality (200). 3rd download attempt is denied (404) with `DOWNLOAD_LIMIT_REACHED` audit record in `digital-download-events`.
4. **Multi-Site Guest & Member Journeys with Full Refunds**:
   - **Site Alpha Guest**: Storefront cart -> proposal -> checkout -> webhook settlement -> order view (3634 USD minor, stock 7 -> 6). Downloads private asset (200). Dual-control full refund revokes bearer download (404) and updates browser view to `refunded`.
   - **Site Beta Guest**: Storefront cart -> proposal -> checkout -> webhook settlement -> order view on Beta host (3050 USD minor, Beta stock 5 -> 4). Downloads Beta private file on Beta host (200); download is denied on Alpha host (404).
   - **Site Beta Member**: Downloads owned digital file on Beta host (200 byte-equal). Anonymous (404) and Site Alpha member (404) are denied access.
   - **Site Beta Refund**: Full refund on Site Beta member order revokes Beta digital grant (404) and updates order view, leaving Site Beta guest order intact.
5. **Commerce Command Center**:
   - Anonymous, member, and foreign-site staff requests to `/api/admin/commerce/dashboard`, `/reconcile`, and `/webhooks/retry` return 403.
   - Dashboard API and Command Center UI report currency-separated totals (USD 12287, EUR 4500), oldest reconciliation age, pending/unknown actions, orders with transition audit trail, refunds, disputes, webhook failures, and quarantined mismatch cases.
   - Operator clicks "Retry verified payment event" in UI; worker re-processes failed webhook event to `processed`.
   - Operator clicks "Queue reconciliation" in UI; queues and executes `commerce-reconcile-payments` task.

## Negatives, recovery and restart

- Contender 409 on reserved inventory race.
- Out-of-stock rejection on exhausted SKU (inventory 0).
- Exceeded coupon usage rejection on `usageCount === usageLimitTotal`.
- Download limit reached denial (404) with audit entry.
- Host-mismatch denial on Site Beta bearer grant on Site Alpha host (404).
- Cross-tenant member download denial on foreign member attempt (404).
- 403 authorization denials for anonymous, member, and foreign staff on Command Center endpoints.
- Interrupted worker recovery via `recoverStaleCommerceJobs`.
- Container restart (`docker restart rc111e-20261028`) and Next.js process restart:
  - Check 1: Site Alpha member order retains exception state, receipt number, 2603 USD minor total, and revoked download.
  - Check 2: Site Beta guest order retains paid state (3050 USD minor) and active private digital download on Beta host (200).
  - Check 3: Refunded Site Beta member order and refunded Site Alpha guest order keep digital downloads revoked (404).
  - Check 4: After replay, inventory quantities (Alpha Almanac=6, Alpha Pin=0, Beta Handbook=4), coupon usageCount (SAVE5=1), and Command Center currency totals remain exact.

## Commands, exit codes and counts

| Command | Exit | Result |
| --- | --- | --- |
| `npm run test:migrations:fresh` | 0 | 127 migrations applied cleanly on isolated PostgreSQL |
| `npx.cmd vitest run tests/unit/shop-04-payment-operations.test.ts tests/unit/commerce-dashboard-scope.test.ts tests/unit/commerce-webhook-retry.test.ts tests/unit/shop-02-tampering-and-invariants.test.ts tests/unit/shop-02-carts-and-proposals.test.ts tests/unit/commerce-stale-jobs.test.ts tests/unit/rc1-11c-checkout-settlement.test.ts tests/unit/rc1-11d-digital-revocation.test.ts tests/unit/rc1-11e-commerce-acceptance.test.ts` | 0 | 9 test files passed, 64 tests passed, 0 failed, 0 skipped |
| `pwsh -File tests/rc1-11e/run.ps1 journey` | 0 | 27 journey checks passed, 0 failed, 0 skipped |
| `docker restart rc111e-20261028` | 0 | Isolated PostgreSQL container restarted |
| `pwsh -File tests/rc1-11e/run.ps1 restart` | 0 | 4 restart checks passed, 0 failed, 0 skipped |
| `node --import tsx tests/rc1-11e/provenance.ts --check` | 0 | Source containment PASS (1479 files; SHA-256 `593dfda196c0cb122fea869beb44a317c020cfe6355458720491ef1f1b8e8cd3`) |
| `npx.cmd tsc --noEmit` | 0 | TypeScript type check clean |
| `npx.cmd prettier --check ...` | 0 | Prettier code style verified across all touched files |
| `npx.cmd eslint ...` | 0 | ESLint clean across all touched files |

Total automated assertions: **95 passed, 0 failed, 0 skipped**.

## Provider and environment distinction

- Local adapter harness: Local deterministic-test signed webhook adapter and Stripe-test signature/replay contract.
- Remote sandbox: None configured; remote sandboxes remain distinguished and unexecuted.
- Real-world provider: No live credit card charges, no external refunds, no real POD orders, no external social posts.
- Authentication: Genuine guest Chromium sessions on Site Alpha and Site Beta; member sessions via canonical magic-link service; operator sessions via admin fixtures. No WebAuthn/passkey ceremony claim.

## Open blockers

None within subpass 11E scope. Aggregate RC1 remains NOT READY. Disposable container `rc111e-20261028` stopped; database preserved. No next subpass was executed.

