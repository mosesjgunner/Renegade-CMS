# Next after 16B

Proceed to the next designated subpass per project schedule (16C — import/
export, provider conformance and the extensions boundary). Subpass 16B is
complete; no next subpass was executed.

Pickup notes for whoever runs 16C:

- Branch state: 16B lives on local branch `rc1-16b` (from 16A head
  `6c62037`; 16A itself is PR #15, unmerged at the time of writing).
  Delivery/review of both branches is Matthew's step — work from the
  branch state you are handed, and keep the one-subpass-at-a-time rule.
- Reusable disposable harness: `tests/rc1-16b/run.sh` / `journey.ts`
  (Linux; local PostgreSQL 16.15 database `rc116b_release_acceptance`, no
  Docker on this VM). Copy the shape for `rc116c_release_acceptance`:
  `run.sh migrate|journey|restart`, fixture passkey sessions (no genuine
  passkey claim), traces written live into
  `docs/rc/evidence/rc1/18-pass/16C/`, provenance freeze at the end.
  PostgreSQL restarts between phases via `sudo pg_ctlcluster 16 main
  restart`. Repo-local git identity is `Harbor <harbor@localhost>`.
- Webhook facts 16C can rely on: outbound delivery signatures are
  HMAC `t=<ts>,v1=<hmac>` over `${timestamp}.${raw}` with a 300 s
  tolerance and timing-safe verification; enqueue is idempotent per
  subscription+event; retries back off 30/60/120/240 s to a 5-failure
  dead-letter + auto-disable; redelivery creates a fresh idempotency key;
  `reconcileWebhookSubscriptions` (`src/modules/integrations/
  reconciliation.ts`) is the delivery-vs-provider truth view — do not
  confuse it with 16A's `reconcileProviderState` (provider health).
  Inbound email/commerce callbacks are rate-limited per key
  (`INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE`, default 300) before any
  processing, and email effects apply in `occurredAt` order.
- Signature encodings differ by family — check before signing anything:
  email webhooks use HMAC-SHA256 **base64url**; the commerce deterministic
  adapter uses **hex**.
- Payload IDs are integers: compare with `String(...)` on both sides in
  harness assertions. Next dev regenerates `next-env.d.ts` /
  `tsconfig.json` for the harness dist dir — revert both before the
  provenance freeze so the delivered tree stays clean.
- Pre-existing failures (verified, do not chase): 5 unit failures at base
  (`flow-04-acceptance`, `payload-domains`, `rc1-04d-campaign-commerce`,
  `shop-08-command-center-boundaries` ×2) and 2 rc05 integration failures
  (product lifecycle + price tampering, catalog publish hook) reproduced
  identically at base `6c62037`. Full unit suite at 16B: 2018 passed /
  5 failed.
- If 16C needs a loopback HTTP peer, the transport now allows it only
  under a test environment (`NODE_ENV=test` or `VITEST=true` —
  `isWebhookTestEnv()` in `src/modules/integrations/webhooks.ts`);
  production stays HTTPS/public-only. The 16B receiver harness
  (`tests/rc1-16b/journey.ts`) is a working model, including the
  lost-response mode and cross-restart receiver history persisted under
  `scratch/`.
