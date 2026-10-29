# RC1 11D: PASS

2026-10-28 (America/Chicago). Bounded order views, receipts, refunds, disputes and digital access acceptance. Aggregate RC1 remains NOT READY. No next subpass was executed by this agent.

## Exact source and containment

Tested base `ed1ec703ef0401d0876932c310d6f831fc74aef4` plus the complete 1473-file dirty [source manifest](source-tree.json), SHA-256 treeHash `be4f9115f8c68e6e32c77225dc8731168e2bb751b58f17f10a51ad3076046729`. Initial HEAD was `87a9ef6bb35405658ef5dd3fb94f3f95771a799e`; another actor committed and continued unrelated changes during this run. This agent made no commit, reset, cleanup, push, tag or deployment.

All runtime source and 11D verifier files still match their tested hashes: [containment.json](containment.json). The strict whole-tree `provenance.ts --check` returned 1 after concurrent changes to generated `next-env.d.ts` and an unexecuted 11E verifier. These are reported rather than relabeled as identical. They do not change the executed 11D runtime graph. This is scoped source containment, not whole-checkout or aggregate release sign-off. Prior receipts retain their original identities; they were read as handoffs, not reissued as current proof.

## Implementation

- Personal member downloads require the owning authenticated member. Host, grant, product and media site ownership, entitlement start/end, asset privacy/rights/health and download bounds apply. Guest digital receipts retain their existing bearer-grant policy. Download audit records no longer derive fingerprints from IP addresses or user agents.
- Full operator refunds transactionally revoke both entitlements and durable file grants. Partial refunds retain access. Refund reconciliation updates the payment intent financial event ledger, attempt balance and order balance, keeps immutable price/receipt snapshots and queues one correction notification. Reconciliation never issues another provider refund. A mismatched provider refund amount becomes unknown without applying local success.
- Refund actions and receipt resends require same-origin requests and authorized operators. Invalid actions fail closed. Pending/unknown/approval-required refunds block another request. Existing second-operator approval policy is exercised.
- Verified provider refunds use canonical reconciliation and correction notifications. Verified cancellation/dispute/full refund revoke order access. Cancellations persist cancelled order history; disputes remain open review records with an order exception, without invented provider resolution.
- Customer order views retain receipts after refunds and expose status, refund totals and history. Financial records remain protected against native deletion/mutation.
- Operations and commerce worker dispatch use `limit: 1` so session advisory locks leave database connections available to execute their callbacks; canonical durable outbox recovery drains due notifications. This fixes the reproduced saturated-pool batch stall. Large parallel dispatch throughput is not claimed.

Changed implementation/test paths (some partial changes were included in the concurrent commit):

- `src/app/(frontend)/api/admin/commerce/refunds/route.ts`
- `src/app/(frontend)/api/admin/commerce/receipts/[orderId]/resend/route.ts`
- `src/app/(frontend)/api/commerce/checkout/status/route.ts`
- `src/app/(frontend)/api/commerce/download/[grantKey]/route.ts`
- `src/modules/commerce/CheckoutStatus.tsx`
- `src/modules/commerce/digital-delivery.ts`
- `src/modules/commerce/refund-execution.ts`
- `src/modules/commerce/payment-provider.ts`
- `src/modules/commerce/tasks.ts`
- `src/scripts/run-jobs-worker.ts`
- `tests/unit/refund-reconciliation.test.ts`
- `tests/unit/rc1-11d-digital-revocation.test.ts`

- `tests/rc1-11d/{run.ps1,journey.ts,notifications.ts,smtp-sink.ts,provenance.ts}`.
- Next generated declarations/config includes changed during dev-server boot; unrelated existing edits and concurrent commerce/11E work were preserved, including the unrelated checkout-abandonment changes in the shared task file. No new collection or schema field was needed; no type generation or new migration was required.

## Ordinary actions and actual persisted results

The real Chromium guest and member journeys create published products through operator REST, add products to the cart, create proposals, initiate checkout, confirm local test payment, and settle signed webhook events through the commerce worker. Test authentication routes are disabled. Member sessions come from the canonical magic-link service; operator sessions are fixtures. No passkey ceremony is claimed.

- Guest physical order settles at **2359 USD minor units**, member physical+digital order at **3634**. The browser displays order number, original receipt, immutable totals and items. Catalog price edit **1750 -> 2900** leaves settled snapshots unchanged.
- The owning member downloads the uploaded private PNG with exact byte equality and `private, no-store`. Anonymous, another authenticated member and a foreign host cannot use that member link; another member cannot read its order status.
- Owner refunds **100**, retaining access. A request for the remaining **3534** waits for second approval; self-approval and a second pending refund request return **409**. A second owner approves. The actual adapter result persists full **3634** reconciliation, refunded order/attempt/intent, revoked entitlement and grant, one correction delivery, and denied old download URL. Reconciliation replay preserves one history entry and unchanged price/totals snapshots.
- Customer reload displays the original receipt, **refunded** status, refund total and history, with no download link. Receipt resend is authorized, queued to the immutable recipient and uses the original amount.
- Signed local dispute creates one open review record and order exception. A separate provider-originated refund persists canonical financial reconciliation.
- Three additional fresh digital orders each settle, issue a receipt and return byte-equal owned bearer downloads. Signed **cancelled**, **disputed**, and **refunded** events each revoke entitlement/download access and persist the appropriate cancelled/exception/refunded order state. No business state was directly flipped to manufacture these outcomes.
- An actual `src/scripts/run-jobs-worker.ts` process dispatches and recovers **11** receipt/correction deliveries through a real SMTP adapter to the dedicated **127.0.0.1:3143** sink. The target correction has exactly one captured MIME with its canonical idempotency header and persisted **accepted / smtp** state. A fresh worker process sends zero duplicates. All three physical packages remain **pending_acknowledgement**, and **0** orders are marked fulfilled. SMTP acceptance is not remote inbox delivery or physical fulfillment.

Persistence traces/checks: [journey.json](journey.json), [state.json](state.json), [notifications.json](notifications.json), worker logs and [restart.json](restart.json). The state file contains disposable IDs and revoked download links; authentication secrets/session tokens remain outside the evidence directory.

## Negatives, recovery and restart

Customer/anonymous/foreign staff refunds and customer/foreign staff receipt resends return **403**. Cross-origin refunds return **403**, invalid actions **400**, excessive refund amounts **422**. Existing checkout actor/host boundaries, invalid merchant capability, forged signature, webhook replay/out-of-order/amount conflict, three-way checkout/settlement races and native financial write denials are exercised. Native order deletion and fabricated dispute success are denied. Unit cases cover unknown/mismatched provider refunds retaining benefits and transactional local-failure reconciliation without another provider refund.

Only the isolated PostgreSQL container was restarted, then a fresh Next.js process and browser contexts loaded persisted state. Original receipts, refunded/disputed statuses, immutable **2359 / 3634** snapshots, inventory **7**, reconciliation cases and all four revoked digital links survive. The notification worker is separately restarted, proving no second SMTP send.

## Commands, exit codes and counts

All accepted commands below exited **0**. Exact commands are run from the repository root; `paths` below is the explicit scoped lint/format set.

```powershell
npx.cmd vitest run tests/unit/shop-04-payment-operations.test.ts tests/unit/refund-reconciliation.test.ts tests/unit/digital-delivery-readiness.test.ts tests/unit/rc1-11c-checkout-settlement.test.ts tests/unit/rc1-11d-digital-revocation.test.ts tests/unit/commerce-checkout.test.ts tests/unit/commerce-contracts.test.ts tests/unit/commerce-webhook-retry.test.ts tests/unit/commerce-reconcile-scope.test.ts tests/unit/commerce-stale-jobs.test.ts
npx.cmd tsc --noEmit
powershell -ExecutionPolicy Bypass -File tests/rc1-11d/run.ps1 migrate
powershell -ExecutionPolicy Bypass -File tests/rc1-11d/run.ps1 journey
powershell -ExecutionPolicy Bypass -File tests/rc1-11d/run.ps1 notifications
docker restart rc111d-20261028
powershell -ExecutionPolicy Bypass -File tests/rc1-11d/run.ps1 restart
```

```powershell
$paths = @(
  'src/app/(frontend)/api/admin/commerce/refunds/route.ts'
  'src/app/(frontend)/api/admin/commerce/receipts/[orderId]/resend/route.ts'
  'src/app/(frontend)/api/commerce/checkout/status/route.ts'
  'src/app/(frontend)/api/commerce/download/[grantKey]/route.ts'
  'src/modules/commerce/CheckoutStatus.tsx'
  'src/modules/commerce/digital-delivery.ts'
  'src/modules/commerce/refund-execution.ts'
  'src/modules/commerce/payment-provider.ts'
  'src/modules/commerce/tasks.ts'
  'src/scripts/run-jobs-worker.ts'
  'tests/unit/refund-reconciliation.test.ts'
  'tests/unit/rc1-11d-digital-revocation.test.ts'
  'tests/rc1-11d/*.ts'
)
npx.cmd eslint $paths
npx.cmd prettier --check $paths
git diff --check
```

| Accepted gate | Passed | Failed | Skipped | Evidence |
| --- | ---: | ---: | ---: | --- |
| Focused units, 10 files | 54 | 0 | 0 | unit.log |
| Ordinary browser/API/worker/persistence journey | 58 | 0 | 0 | journey.log / journey.json |
| Actual worker, SMTP MIME, retry and provider truth | 5 | 0 | 0 | notifications.log / notifications.json |
| PostgreSQL + fresh web/browser restart | 7 | 0 | 0 | restart.log / restart.json |
| **Total assertions** | **124** | **0** | **0** | |

Fresh migration acceptance applied **127** registered migrations and verified repeat application/schema. Types, focused ESLint/Prettier and diff checks pass. No mandatory 11D group remains unexecuted. Production application build/image, remote payment sandbox/live charges, remote inbox delivery, actual POD/carrier fulfillment and ordinary WebAuthn login were not executed or claimed; these counts are not aggregate RC1 acceptance.

Nonaccepted diagnostic attempts are excluded from those totals: an overridden Host ignored by Node fetch (replaced by raw HTTP), a worker-event assertion before the target queue event ran (now waits on persisted processing outcome), initial type errors (repaired), an oversized notification batch stalled on pool exhaustion (isolated process stopped; worker dispatch bounded), and folded MIME-subject matching (now checks canonical idempotency header). The inherited direct-status unknown-attempt simulation was removed from the accepted harness. `journey-failure.json` retains a superseded queue-timing failure. Strict whole-source equality remains separately reported above, not concealed as a successful command.

## Isolation and exit

Only container **rc111d-20261028**, label **rc1.scope=11d**, PostgreSQL port **127.0.0.1:5462**, DB **rc111d_release_acceptance**, web **39018**, SMTP **127.0.0.1:3143**, media **scratch/rc111d/media** and build directory **.next-rc111d** were used. The migration runner fixes and guards that disposable database before its destructive schema reset; migrations were never run against a prior evidence or user DB.

Container ID/image identity are in [isolation.json](isolation.json): PostgreSQL image **sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab**. This is the DB image, not a tested application image. Web/browser/SMTP/worker processes and this container are stopped; its data is retained. No existing sibling environments, media, secrets or historical receipts were reset or removed.

**Open scoped blockers: none.** Current whole-checkout/aggregate release readiness is not established. See [NEXT.md](NEXT.md); stop at 11D.
