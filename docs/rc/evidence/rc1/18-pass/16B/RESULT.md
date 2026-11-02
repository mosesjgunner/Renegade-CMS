# RC1 Subpass 16B — Result

**Status: PASS (bounded)** — Webhooks, outbound delivery and reconciliation.
Provider callbacks and outbound events now behave deterministically under
failure: outbound deliveries are signed and verified with a timing-safe
comparison, retries are bounded with recorded backoff, dead-letter and
auto-disable fire at the limit, manual redelivery uses a fresh idempotency
key, inbound callbacks are rate-limited and replay-safe, email effects apply
in provider timestamp order, and a new reconciliation view reports delivery
state only from persisted delivery records.

Base commit `6c62037bdd4f2e7d6dc9bcfa46b82a7553b81ae2` (16A head) on local
branch `rc1-16b` (not pushed; delivery is the reviewer's step).
Implementation commits: `e6d6403` (feat), `e7e45bc` (unit tests), `7a1d981`
(reconciliation refinement), plus the harness and this evidence.
Source containment: 1,598 files, SHA-256
`4f5fcab22fa0b8247dcf9508af1845e68842daa7e9aa37bdd36a9c45d7d00738`
(`source-tree.json` beside this file; `--check` re-verified after freezing).
The manifest was frozen after a post-run Prettier pass over
`tests/rc1-16b/journey.ts` (formatting only, no logic change).

Environment substitution (recorded, not hidden): this VM has no Docker, so
the disposable acceptance database is a clearly-labeled local PostgreSQL
16.15 database — `PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)` —
named `rc116b_release_acceptance`, with a disposable media root under
`scratch/rc116b/`. The 16A database `rc116a_release_acceptance` was not
touched. 131 fresh migrations applied and verified by
`test:migrations:fresh` (exit 0, "Fresh migration acceptance passed").
All providers are local: a loopback webhook receiver harness, the
deterministic commerce test adapter, and locally signed email callbacks.
No external posts, no live charges, no real provider calls.

## Inventory questions — verified before fixing

1. **Email inbound replay:** deduplication already existed in
   `processProviderSuppressionEvent` (an `email-delivery-events` row keyed
   `provider:<provider>:<providerEventId ?? event:messageId>`; a seen event
   returns without re-applying effects; site/provider/recipient binding
   mismatches throw → route 400). Real flaw found: status was applied
   unconditionally, so a stale (older `occurredAt`) event could regress
   delivery status and `deferred` could overwrite terminal states. Fixed
   (item 4 below).
2. **Inbound rate limiting:** missing on both inbound routes. The only
   limiter (`consumeApiRateLimit`) is API-facing and process-local. Fixed
   (item 3 below).
3. **Signature comparison:** `verifyWebhookDeliverySignature` used plain
   `===`. Fixed (item 1 below).
4. **Reconciliation naming collision:** `reconcileProviderState` is 16A's
   provider-health projection, not delivery reconciliation. A new view was
   built instead (item 5 below); the 16A function is untouched.
5. **Out-of-order / lost response:** commerce subscriptions and payments
   were already ordered/deduplicated (sequence + `occurredAt` guards,
   `payment-webhook-events` inbox with replay pre-check and one durable
   processing lane). Outbound lost response re-sends the same event id, so
   a receiver deduplicating by event id observes an exactly-once effect —
   proven live in the journey (checks 19–20).

## Implementation

1. **Timing-safe delivery signature verification**
   (`src/modules/integrations/webhooks.ts`): the `v1` digest in
   `verifyWebhookDeliverySignature` is now compared with
   `timingSafeEqual` (length-checked); the return contract
   (`valid` / `malformed` / `stale` / `invalid`, 300-second tolerance) is
   unchanged. The same file now also honors loopback/private webhook
   targets **only** in a test environment (`NODE_ENV=test` or
   `VITEST=true`, exported as `isWebhookTestEnv()`): `webhookRequest`
   passes `allowHttp`/`allowPrivate` to `safeFetch` under exactly that
   condition. Production behavior is unchanged — HTTPS + public targets,
   DNS-validated. (Previously `supportedTarget` had a test allowance the
   transport never honored, so no local receiver could ever be delivered
   to in tests.)
2. **Inbound webhook rate limiting**
   (`src/modules/integrations/rate-limit.ts`): new
   `consumeInboundWebhookRateLimit(key)` — 60-second fixed window,
   per-key buckets, bound from `INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE`
   (default 300, floor 1), returning `{ allowed, retryAfter, remaining }`.
   Process-local, with the same documented stance as the existing API
   limiter: it sheds floods before any expensive work, and the same bound
   should also be applied independently at an outer edge when deployed.
3. **Routes shed floods before processing**
   (`src/app/(frontend)/api/email/webhook/route.ts`,
   `src/app/(frontend)/api/commerce/webhooks/[provider]/route.ts`): the
   limiter runs first (keys `email-webhook` and
   `commerce-webhook:<provider>`); on exceed the route returns
   `429 { error: 'Too many webhook requests.' }` with a `Retry-After`
   header, before signature verification or any database write — a
   limited callback is not processed at all.
4. **Email callback ordering guard** (`src/modules/audience/service.ts`):
   in `processProviderSuppressionEvent`, after the existing replay dedup,
   an event whose `occurredAt` is strictly older than the newest
   already-applied event for that delivery is still recorded in
   `email-delivery-events` (history stays complete) but applies no status
   change and no suppression. A `deferred` event never regresses a
   terminal status (`delivered`, `bounced`, `complained`, `cancelled`)
   regardless of timestamps. Events without a provider timestamp keep the
   previous arrival-order behavior; replay dedup is unchanged.
5. **Delivery reconciliation view** (new
   `src/modules/integrations/reconciliation.ts`):
   `reconcileWebhookSubscription(s)` compares each subscription's recorded
   state with the full persisted delivery pool and reports counts
   (queued/retrying/delivered/dead-letter), total attempts, `pending` /
   `duePending`, `lastDeliveredAt` (newest **delivered** record only —
   null when nothing ever delivered), `lastAttemptAt`, and findings:
   `dead-letter-awaiting-action` (critical; a dead-letter whose event was
   later redelivered and delivered counts as resolved history),
   `subscription-disabled-with-pending` (warning),
   `failure-limit-without-disable` (warning — recorded counter drift),
   `stalled-deliveries` (warning — due beyond a 10-minute threshold while
   dispatch runs every 10 seconds), `no-deliveries-recorded` (info).
   Surfaced in the admin integrations GET as `webhookReconciliation`
   (dedicated 1000-record pool fetch, not the recent-100 history window),
   computed identically on the Connections page, and rendered as a
   "Delivery Reconciliation" panel in the Connections Center Webhooks tab
   (`src/modules/extensions/ConnectionsCenter.tsx`).
6. No schema changes and no new migrations in this subpass.

## UI / operator proof (live, disposable resources)

Harness: `tests/rc1-16b/run.sh` (`migrate` / `journey` / `restart`),
`tests/rc1-16b/journey.ts`; traces in `journey-trace.json` (37 checks) and
`restart-trace.json` (8 checks) beside this file; web logs in `web.log` /
`restart-web.log`. Operator sessions are fixture passkey sessions
(`createPasskeySession`, the 15E/16A convention); no genuine passkey claim.

Journey (37/37 passed):

- Web boot; anonymous 403, foreign-site administrator 403, same
  administrator 200 on its own site.
- Owner creates three subscriptions through the operator API (201 each)
  after signed endpoint verification; the receiver observed a
  signature-valid verification POST per target.
- Outbound happy path: recording an execution event enqueues exactly one
  queued delivery; re-recording with the same idempotency key is a
  duplicate and enqueues no second delivery; dispatch delivers once —
  receiver got exactly one signature-valid POST, delivery `delivered`.
- Reconciliation via the API reports the subscription healthy with
  `lastDeliveredAt` from the delivered record, agreeing with the
  connection `lastSuccessAt`; Connections page returns 200 for the owner
  with the subscription rendered (the reconciliation panel itself renders
  client-side under the Webhooks tab from the same server-computed prop).
- Due-time gating: a delivery with a future `nextAttemptAt` is not
  attempted by dispatch; once due it is attempted and delivered.
- Failure arc: five failing attempts move the delivery
  retrying ×4 → dead-letter with recorded backoff ≈30/60/120/240 s
  (attempts invoked back-to-back through `deliverWebhook`; the wall-clock
  backoff was not waited out — the recorded `nextAttemptAt` progression
  is what is asserted); at the limit the subscription is auto-disabled
  with `failureCount` 5; the receiver saw exactly 5 signature-valid
  attempts; reconciliation flags the dead-letter critical with
  `lastDeliveredAt` null.
- Foreign-site administrator is denied redelivery (403) and re-enable
  (403) with nothing new persisted.
- Manual redelivery: 202, a new delivery row with a fresh idempotency key
  for the same event; after re-enable and receiver recovery it delivers;
  the event's business effect applied exactly once at the receiver;
  reconciliation then treats the dead-letter as resolved history.
- Lost response: the receiver applied its effect then dropped the first
  response — delivery left `retrying` with a recorded error; the retry
  completed it; receiver saw 2 HTTP attempts, business effect
  exactly-once (deduped by event id).
- Inbound email (real HTTP, locally signed): valid `delivered` → 200,
  status persists, one event record; exact replay → 200, still one
  record; tampered signature → 401, nothing recorded; correctly signed
  wrong-site body → 400, nothing recorded; in-order `bounce` → status
  bounced + one suppression; stale `delivered` (occurred before the
  bounce) → recorded for history, status stays bounced; `deferred` with a
  newer timestamp never regresses the terminal `delivered` status.
- Inbound commerce (deterministic test adapter): unsigned → 401, no inbox
  record; valid signed `succeeded` → 202 with exactly one durable inbox
  record; the durable job applies the effect exactly once (attempt
  `succeeded`, event id recorded once, re-running jobs changes nothing);
  replay → 200 `{ replay: true }`, no second inbox record, no re-applied
  effect; unknown-attempt event → 202 uncorrelated; bad signature → 401.
- Rate limiting (run last; harness budget 25/min): email flood shed with
  429 + `Retry-After`, and a valid callback during the window is not
  processed (no event recorded); commerce flood shed the same way on its
  own per-provider budget (no inbox record created).
- Restart setup left one delivery `queued` and one `retrying` (lost
  response, future `nextAttemptAt`); canary sweep clean (see below).

Restart (8/8 passed; web process restarted and PostgreSQL restarted with
`pg_ctlcluster 16 main restart` between phases):

- Queued and retrying deliveries and subscription records persisted
  unchanged across the restart.
- After the retrying delivery's recorded due time, dispatch delivers both
  deliveries; receiver history spans the restart — retry event: 2 HTTP
  attempts total, business effect still exactly-once; queued event
  delivered exactly once.
- Reconciliation reflects the drained state truthfully after restart.
- No harness secret (webhook subscription secret, email webhook secret,
  commerce test secret) appears in any response body, page HTML, or web
  log in either phase.

## Automated proof

- New unit tests (18): `tests/unit/webhooks-16b.test.ts` (13 — timing-safe
  signature verdicts, inbound limiter bound/window/per-key semantics,
  reconciliation finding matrix incl. redelivered-dead-letter resolution)
  and `tests/unit/audience-webhook-ordering.test.ts` (5 — replay dedup,
  stale recording without regression or suppression, terminal guard,
  in-order progression, against an in-memory store).
- Existing focused suites still pass (32 tests):
  `public-api-webhooks`, `integrations-service`,
  `integrations-operational-ux`, `connection-runtime`.
- Full unit suite: **2018 passed, 5 failed (2023)** — the 5 failures are
  exactly the pre-existing baseline verified at base `a7edf2d` during 16A
  (`flow-04-acceptance`, `payload-domains`, `rc1-04d-campaign-commerce`,
  `shop-08-command-center-boundaries` ×2). 2018 = 16A's 2000 + the 18 new
  tests. No new failures; none hidden.
- Integration suites (disposable DB, `scripts/run-integration.mjs`):
  `integrations-admin-api` + `ai-control-plane` — 16/16 passed;
  `aud-08-audience-pass-gate` — passed (email service regression check);
  `rc05-pass2-commerce-routes` — 3 passed / 2 failed, and the 2 failures
  (product lifecycle, price-tampering — a catalog publish hook in
  `src/collections/Commerce.ts`) were reproduced identically with the
  source tree reverted to base `6c62037`: pre-existing, unrelated to
  16B. The rc05 webhook security test (unsigned / invalid signature /
  replay / race) passes with the 16B route changes.
- Project typecheck (`npm run typecheck`) exit 0; harness typecheck
  (`tsc -p tests/rc1-16b/tsconfig.json`) exit 0; ESLint
  `--max-warnings=0` and Prettier clean on all touched files.

## Not executed / out of scope

- Real-world providers: no live Stripe/Postmark/etc. endpoints, no real
  POD orders, no external posts. Commerce proof uses the deterministic
  test adapter; email proof uses locally signed callbacks; outbound proof
  uses the local receiver. These are local-adapter/harness claims, not
  real-world provider claims.
- Wall-clock backoff waiting: failure-arc attempts were invoked
  back-to-back; the recorded backoff progression is asserted instead.
  (The restart phase does wait for a real recorded due time, ~30 s.)
- Browser click-through of the Connections Center Webhooks tab: the panel
  is a client-side tab; its data path is proven through the API and the
  server-rendered page (200) — no Chromium interaction was run.
- `verify:release` and the full release gate remain Pass 18 scope.
- Genuine passkey authentication (fixture sessions only, as in 15E/16A).

## Open blockers

None for the 16B scope. Carried notes, not blockers:

- The inbound limiter is process-local fixed-window state (same stance as
  the pre-existing API limiter); multi-process deployments should also
  enforce the bound at the edge, as its doc comment states.
- Pre-existing failures left untouched by design: the 5 unit failures
  above, the 2 rc05 integration failures above, the 15C ledger-record gap
  and CI run #174 (Pass 18A/18B territory).

## Resources

- Disposable database `rc116b_release_acceptance` retained on the local
  PostgreSQL 16.15 cluster; media under `scratch/rc116b/`; receiver log
  at `scratch/rc116b/receiver-log.json`. Web/receiver processes stopped.
- Harness: `tests/rc1-16b/{run.sh, journey.ts, provenance.ts, tsconfig.json}`.
- Aggregate RC1 remains NOT READY; the next subpass was not started.
