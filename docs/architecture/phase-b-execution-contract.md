# Phase B execution contract (B01–B06)

Phase B state changes that cause email, analytics, webhooks, media work, or automation use `execution-events`. It is a PostgreSQL durable outbox; Payload Jobs remains the only queue and the separate `jobs:worker` process remains the only runner. No Phase B end-user feature is created by this foundation.

## Event envelope

Create events with `createExecutionEvent` and persist them through `recordExecutionEvent` in the same Payload transaction/request as the owning state mutation. Every event has a UUID, `siteId`, `tenantId`, actor `{ kind, id }`, dotted type, integer version, timestamp, correlation ID, optional causation ID, and an idempotency key. The key must identify the effect, not the request, for example `B03:webhook:<subscription-id>:<source-event-id>`.

Payload is reference-only: identifiers, enum values, counts, hashes, and approved public metadata. It must not contain email addresses, names, addresses, credentials, cookies, tokens, raw provider responses, or arbitrary content bodies. Events are at most 32 KiB. Store sensitive material only in the owning protected record and let a handler retrieve it under its site scope.

## Execution model

The scheduled `execution-outbox-dispatch` task scans durable `ready` and `retrying` records and queues `execution-outbox-handle`. A missed immediate queue call is therefore repaired on the next scan. The handler task has a per-event concurrency key, is idempotent, records attempts, and retains successful and failed job evidence. It invokes the one registered event-type owner.

Handlers throw `new ExecutionError(message, code, true)` for transient faults; Payload retries twice with exponential backoff (three total attempts). Use `false` for permanent errors: the outbox becomes `dead-letter` without a pointless retry. Unregistered events also become `dead-letter`. A handler must check its owned cancellation record before an irreversible side effect. Queued Payload jobs can be cancelled; running work is cooperative.

Register exactly one handler during domain startup with `registerExecutionHandler`. It must re-read the owning record, verify that its `site` and `tenant` match the envelope, use the effect idempotency key at every provider boundary, and write a minimal audit outcome. Provider adapters expose validated configuration, capabilities, health, typed safe errors, and a no-op/explicit-disabled behavior when unconfigured; existing email and social adapters are the reference implementations.

## Operations and scale trigger

`System → Payload Jobs` retains job status/logs. `System → Execution Events` exposes `ready`, `retrying`, and `dead-letter` entries with correlation, causation, attempts, and safe last error. Structured logs and support bundles pass through the central redactor.

Remain on PostgreSQL/Payload Jobs at current scale. Create an ADR before adding queue infrastructure when measurements show either: sustained runnable backlog older than 60 seconds for 15 minutes while worker CPU is below 70%, or p95 dispatch-to-start above 60 seconds for 15 minutes after increasing the configured worker concurrency. Record the workload, queue depth, handler latency, worker utilization, and failure rate with that ADR.
