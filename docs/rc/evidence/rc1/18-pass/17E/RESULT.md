# RC1 17E — Interruption recovery, deduplication and job integrity

## Status

**PASS** (2026-11-02), bounded exactly as stated below. Real web and
worker processes were SIGKILLed at the publication-lease, message-dispatch,
payment-settlement, subscription-grant and fulfillment-submission
boundaries against isolated provider harnesses (a local raw SMTP server, a
durable POD simulator, and a local Stripe API harness). Pending and failed
state was created through normal product actions only — never by marking
success in the database. After every kill, the surviving product machinery
(recovery sweeps, lease expiry, provider reconciliation, operator retry)
was required to converge the work to exactly one business effect, or to
hold it in a truthful, repairable state. One real silent-drop defect was
found and repaired; everything else verified as already correct.

## The one repair (product code)

**Orphaned payment-event job lease deadlocked the settlement lane.**
`recoverStaleCommerceJobs` reset a stale `payment-webhook-events` inbox
row to `received` and queued a replacement `commerce-process-payment-event`
job — but the killed worker's own `payload-jobs` row stays
`processing=true` forever, and Payload's runner excludes every queued job
whose `concurrencyKey` is held by a processing row
(`node_modules/payload/dist/queues/operations/runJobs/index.js`). The
replacement job could therefore never run: the paid event silently never
settled. Reproduced before repair on the unrepaired tree: after crash +
recovery + 180 s of worker cycles the inbox was still `received`,
attempts 1, orders 0 (`pre-repair-stall.json` preserves the persisted
rows). Repair (commit `645d31f`, `src/modules/commerce/tasks.ts`): extend
the function's existing stale-lease reset — already applied to
`commerce-reconcile-subscriptions` / `commerce-reconcile-referrals` — to
`commerce-process-payment-event`. The handler is idempotent (a processed
inbox returns early), so orphan and replacement cannot double-apply.
Focused unit coverage added in `tests/unit/commerce-stale-jobs.test.ts`
(3/3). After repair the same scenario converges: inbox processed,
attempts 2, exactly one order.

## Base and containment

- Base: `6a0a42a` (17D PASS) on local branch `rc1-17e`.
- Product change: exactly one fix commit (`645d31f`, above) plus its unit
  test. Everything else is the disposable acceptance harness
  `tests/rc1-17e/` and this evidence.
- Source containment: 1,632 files, SHA-256 `d47e6193214fedf8158c3775b2257730c7d17e5b428127d58ed9c33f1566b2db`
  (`source-tree.json`, frozen before the final full run and `--check`
  verified after it).
- Full-project `npx tsc --noEmit`: exit 0 on the final tree (see
  Verification).
- Environment: PostgreSQL **16.15** local (CI uses 17.6 — recorded
  verbatim, never upgraded). One disposable database
  `rc117e_release_acceptance`; web on `127.0.0.1:39075`, SMTP harness
  39096, POD simulator 39097, Stripe harness 39098. No live charge,
  message, payout or external post occurred.

## Acceptance run (single fresh-database `run.sh all`: 64/64 checks)

### Publication lease (15 checks — `trace-publication.json`)

A scheduled publish created through the editorial service was executed by
a child worker that acquired the lease and was SIGKILLed while blocked
inside the publish transaction (parent-held advisory lock). The article
was **not** published and no partial publication persisted; the job stayed
truthfully `processing` under the dead lease; a second worker was refused
while the lease was valid. After lease expiry, the operator
schedule-health **reconcile** action completed the job and published
exactly the pinned revision (public render confirms); re-running
reconcile did not republish; the queued Payload `editorial-publish` job
then drained as an idempotent no-op. A rights-gated article failed
through the normal path (3 bounded retries → `failed` with a sanitized
error), the operator **retry** action reset it truthfully, and after the
rights fix reconcile published it exactly once. A future-dated job stayed
queued and unpublished.

### Payment settle (17 checks — `trace-payment.json`)

Deterministic-provider checkout → signed local confirmation → webhook
inbox `received`. The worker was SIGKILLed inside
`finalizeVerifiedOrder`'s stock-lock wait: attempt and intent honestly
show provider success, and **no order exists** (the finalize transaction
rolled back atomically). The recovery sweep requeued the inbox
(`processing` → `received`), a rebooted worker settled it: attempts
counted **2**, the provider event recorded exactly once on attempt and
intent, exactly **one order** and one receipt delivery. A duplicate
signed webhook replay was acknowledged without a second inbox row, order
or charge effect. A signed *failed* event settled truthfully (attempt and
session `failed`, no order). Separately, the Stripe harness **dropped the
creation response** after creating a checkout session: the checkout
stayed truthfully `unknown` with `reconcileRequired`, the attempt
persisted as `unknown` with no provider reference (never marked success),
and the worker reconciliation task recovered the **same** provider
session by idempotency key (provider-side create calls for the key: 2 —
the original plus the idempotent reconcile lookup — resolving to one
session) and converged it to exactly one order; a second reconciliation
was a complete no-op.

### Subscription grant (7 checks — `trace-subscription.json`)

Member checkout with an idempotency key replayed without a second
provider checkout or subscription row. The signed
`customer.subscription.created` event granted exactly the plan's two
entitlements and did **not** fake payment (order stayed
`pending-payment`). For the `invoice.paid` grant/settle event, the web
process was SIGKILLed mid-transaction (harness blocked the provider read
inside the transaction): event row, order payment and entitlement change
**all rolled back atomically** (subscription version unchanged, grants
still 2). Redelivery settled exactly once (order paid, one event row,
grants still exactly two); a third delivery was a replay no-op; two
worker reconciliation passes changed nothing (no version bump, no new
event, no duplicate grant).

### Fulfillment transition (10 checks — `trace-fulfillment.json`)

A paid order created one held POD job; the operator released the hold.
The submitter child was SIGKILLed while the simulator withheld its
response: the job landed truthfully in `exception` with the attempt
reserved (`attemptCount` 1, no external id claimed) while the provider
held exactly **one** order for the job's idempotency key. Worker
reconciliation recovered the external order id **without resubmitting**
(provider create-call count stayed 1); marking the provider order
shipped reconciled the job `submitted → shipped` and completed order
fulfillment. A second order met a known provider rejection → job
`failed` (no unknown-outcome limbo); retry without an audited repair
reason was refused; the audited retry submitted exactly once and recorded
the recovered external order.

### Message dispatch (7 + 3 checks — `trace-email-smtp.json`, `trace-email-dev.json`)

SMTP (no provider reconciliation available, the hard case): the harness
stored the message and withheld the response; the worker was SIGKILLed
mid-send. The delivery stayed `sending` under its lease with attempts 1
and exactly one provider copy. After lease expiry a rebooted worker
converted it to **`unknown`** (outcome `interrupted_send`) and **never
resent it** — provider copy count stayed 1 across further cycles — and
the operator retry route truthfully refused it (409; an unreconcilable
unknown is not silently resent). A known-retryable failure retried with
backoff and was accepted exactly once (attempts 2, one copy). An
always-retryable delivery exhausted four bounded attempts → dead-letter
with zero provider copies; operator retry requeued it and the repaired
delivery was accepted exactly once.
Dev-capture provider (reconciliation available): two concurrent handler
processes dispatched one delivery → exactly one sink receipt, attempts 1;
a double-queued job plus outbox recovery still produced a single send
attempt; the dev adapter never reconciled or resent the interrupted SMTP
delivery.

### Restart (5 checks — `trace-restart.json`)

Web and worker rebooted over the accumulated state: the future
publication job was still truthfully pending (not executed early, not
lost); the recovered payment still had exactly one order; the
subscription remained active with exactly its two grants; the shipped
fulfillment outcome persisted; the `unknown` dispatch was neither resent
nor dropped (still `unknown`, one provider copy).

## Negatives and denials exercised

Operator retry refused for an `unknown` dispatch (409); fulfillment retry
refused without an audited repair reason; second publication worker
refused under a live lease; duplicate webhook and subscription-event
deliveries acknowledged as replays with zero new effects; failed payment
and rejected fulfillment settle into truthful terminal states instead of
limbo.

## Bounds and disclosures

- Web proof uses local `next dev` processes, not the production image —
  the production-image track is 17C's open Docker-host item (unchanged;
  now being run by Matthew on his Windows machine, evidence pending).
- Operator access in the harness uses the disclosed fixture-session
  pattern of prior subpasses (`createPasskeySession` + `admin_sessions`
  row); no passkey-acceptance claim is made here. The member session was
  minted with the identity module's own `digest()` (17D lesson).
- The deterministic and Stripe payment providers, POD provider and SMTP
  server are isolated local harnesses; provider *semantics* (idempotency
  keys, unknown outcomes, lost responses) are the real adapters' code
  paths, exercised unmodified.
- **Environment loss recorded honestly:** this VM was replaced before
  17E began; the retained 17C/17D evidence databases
  (`rc117c_release_acceptance`, `rc117d_source`, `rc117d_restored`) did
  not survive the replacement and no longer exist in the local cluster.
  Nothing in 17E depended on them; 17D's proof remains its committed
  evidence. Disposable DBs are evidence conveniences, not the record.
- Pre-existing unit coverage already pinning parts of this contract —
  `tests/unit/audience-interrupted-delivery.test.ts` (email
  interrupted-send quarantine) and the stale-inbox half of
  `tests/unit/commerce-stale-jobs.test.ts` — was cited, not duplicated.

## Verification

- Acceptance: `bash tests/rc1-17e/run.sh all` — 64/64 checks green in one
  fresh-database run (sections: publication 15, payment 17, subscription
  7, fulfillment 10, email-smtp 7, email-dev 3, restart 5). Section logs
  and per-section traces are in this directory.
- Focused units: `tests/unit/commerce-stale-jobs.test.ts` 3/3 (includes
  the new orphan-lease regression test).
- Full unit suite: **2041 passed / 5 failed** — baseline held exactly
  (2040 + the one new 17E regression test), and the 5 failures are the
  same named pre-existing set: `flow-04-acceptance`, `payload-domains`,
  `rc1-04d-campaign-commerce`, `shop-08` ×2.
- Full-project `npx tsc --noEmit`: exit 0, re-run as the last step on
  the committed final tree (harness commit `3157dd4`).
