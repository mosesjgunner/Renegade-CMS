# Operator runbook — jobs, webhooks, federation, module gates (RC2-H-05)

Symptom-first diagnostics for the durable-work systems. Every state and
action named here was traced live in RC2-H-05 (see RESULT.md in this
folder). Nothing in this runbook invents a delivery: if a surface says
failed, it failed; recovery means a named action below, not hope.

## A social post never landed

1. Find the queue item: Payload admin → `social-queue-items` for the
   draft, or `GET /api/social-queue-items/<id>`. Read `status`,
   `attemptCount`, `deadLetterReason` (`kind`, `providerCode`,
   `remoteOutcome`), and `nextAttemptAt`.
2. Read its attempts: `GET /api/social-publish-attempts?where[queueItem][equals]=<id>`
   — one row per real provider attempt, in order.
3. Act by state:
   - `scheduled`, due time passed, worker running → the jobs worker or the
     outbox sweep dispatches it. If it sits: check the worker (below).
   - `failed` with `nextAttemptAt` in the future → transient backoff; the
     sweep retries when due. No action needed.
   - `failed`, kind `transient`/`rate-limit`, attempts < 3 → the sweep or
     an operator retry (`POST /api/admin/social/worker`
     `{action:'retry-failed', queueItemId}`) will re-attempt.
   - `failed`, kind `validation` (e.g. provider code
     `DestinationDisabled`, HTTP 422) → the automatic sweep will NEVER
     retry this class. Repair the cause at the provider first (re-enable
     the destination, reconnect the account), then the operator's
     explicit per-item `retry-failed` recovers it (attempts bound and the
     unknown-outcome guard still apply). Retrying before repair is safe —
     it fails honestly again — but it spends one of the 3 attempts.
   - `unknown` → do NOT retry. Run `{action:'reconcile', queueItemId}`:
     reconcile asks the provider whether the deterministic record exists
     and settles the item from the answer.
   - `failed`, attempts = 3, and the provider shows the post IS live →
     known divergence (RC2-DEBT-25): no operator action can settle this
     item today. Verify at the provider, then supersede with a fresh
     draft; do not repost blindly — the original post exists.
4. Site scoping: queue items and attempts are readable only by operators
   of the owning site (another site's operator gets 404).

## A webhook was not delivered (or a subscription went silent)

1. Payload admin → `webhook-deliveries`: find by event id/type. States:
   `queued` → `retrying` (with `nextAttemptAt`; backoff doubles from 30s,
   capped at 1h) → `delivered` | `dead-letter`. `attempts` and
   `lastError` (redacted response) are on the delivery.
2. Deliveries are driven by the `webhook-delivery-dispatch` job (worker
   must be running; the task is module-gated — see "module off" below).
3. The failure counter lives on the SUBSCRIPTION: at 5 failures the
   current delivery dead-letters AND the subscription is auto-disabled —
   it will silently stop receiving events. Check
   `webhook-subscriptions.status` and `failureCount` before debugging
   the receiver.
4. Recovery: fix the receiver, re-enable the subscription if disabled,
   then redeliver (admin integrations surface / `redeliverWebhook`):
   redelivery creates a fresh queued delivery for the same event; a
   successful delivery resets the subscription's failureCount to 0.
5. Enqueueing is idempotent per (subscription, event): replaying the
   source event never creates a second delivery.

## A federation (ActivityPub) activity seems lost

1. Payload admin → `inbound-network-activities`: one record per accepted
   activity, keyed by `dedupeKey`, status `accepted` → `processed`.
2. Since RC2-H-05 (RC2-DEBT-22 fixed): if processing fails, the inbox
   rolls the record back, so the peer's legitimate retry is processed
   fresh — a retry is no longer acknowledged-and-dropped. A record stuck
   at `accepted` therefore means the rollback itself failed; the activity
   can be recovered by asking the peer to redeliver after fixing the
   cause, or by operator review of the stuck record.
3. Repeated invalid signatures from one source escalate: inbox quota
   30/min, invalid-signature quota 8/hour, then 429s. A blocked peer is
   usually a key mismatch, not an attack.
4. With networking disabled, every federation route is 404 by design and
   the CMS serves normally — check `NETWORKING_ENABLED` before debugging.

## Jobs are stuck / the worker looks dead

1. Worker heartbeat: `/tmp/renegade-worker/heartbeat.json` on the worker
   host updates every cycle (default poll 10s). Stale heartbeat = dead
   worker; restart `npm run jobs:worker`.
2. Payload admin → `payload-jobs`: a job with `hasError` carries its
   error; `processing: true` with an old `updatedAt` means a worker died
   mid-job — a restarted worker re-runs it (jobs are durable; F-03 proved
   the commerce settlement completes exactly once after a worker kill).
3. A job that NEVER runs under a reduced profile is usually gated, not
   stuck — see below.

## A module is off (Lean profile) but its jobs exist

By design: the worker only runs tasks registered in the active profile
(33 tasks with all modules, 14 under Lean). Jobs belonging to a disabled
module stay queued — unprocessed, unfailed — and resume when the module
is re-enabled. Mandatory core work keeps flowing under Lean. Do not
delete queued jobs of a disabled module; they are the resume state.

## Operator health surfaces

- `GET /api/admin/schedule-health` (staff): counts, worker health and
  scheduled-publish job states.
- Social command center / `social-queue-items` + attempts (above).
- Integrations admin (`webhook-subscriptions`, `webhook-deliveries`).
- Known gap: the notification inbox projector is not wired to any
  producer (RC2-DEBT-21 remainder) — the canonical notifications
  collection is the only live read; do not diagnose notification issues
  from the inbox tables.
