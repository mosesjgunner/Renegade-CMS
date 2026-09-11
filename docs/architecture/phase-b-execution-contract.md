# Phase B execution contract (B01–B06)

Use the existing PostgreSQL `execution-events` outbox, Payload Jobs, and dedicated `jobs:worker`. This foundation does not introduce end-user workflows or another broker.

## Existing mechanisms and ownership

`operations/tasks.ts` owns outbox dispatch/consumption and heartbeat schedules. Existing audience delivery, social distribution, analytics retention, editorial/release scheduling, media publishing, and webhook delivery remain domain-owned. Reuse their adapters and effect ledgers; do not add another scheduler or provider registry. Extension connection/runtime contracts own connected-provider credentials and capability discovery. `execution/providers.ts` supplies lightweight validation/health/error/mode preflight for domain adapters, not a replacement connection registry. Central redaction is in `core/logging.ts`; extension diagnostics and worker errors reuse it through `safeExecutionError`.

## Envelope and transaction

The envelope contains a stable UUID, site/tenant IDs, actor `{ kind, id }`, dotted type, positive integer version, occurrence time, correlation ID, optional causation ID, privacy class, and effect idempotency key. Payload is reference-only: identifiers, enum values, counts, hashes, and approved public metadata. Never include credentials, personal data, bodies, or raw provider responses. The validator rejects sensitive keys, recognizable email/secret values, and payloads above 32 KiB; this is defense in depth, not a substitute for each event owner's field allowlist.

Authorize the owning mutation first. Pass the same Payload request to both operations:

```ts
// Inside an existing transaction/hook, req.transactionID belongs to the caller.
await payload.update({ collection: owningCollection, id, data, req })
await recordExecutionEvent(payload, eventInput, req)
// The caller commits/rolls back. Neither handler nor dispatcher sees uncommitted events.
```

Outside a hook, begin a database transaction, create a local request with that transaction ID, execute both calls, and commit; roll back on any failure. Without `req`, publication is independently durable but cannot be atomic with a separate business mutation. Do not use that form for a state change requiring transactional publication.

The effect key identifies the effect/revision, not the HTTP request. Storage namespaces it by site and tenant using SHA-256 and retains the existing unique index. Concurrent producers may receive a unique-constraint conflict: roll back and retry the entire owning transaction, then read the existing event. Do not catch a constraint error and continue inside an aborted PostgreSQL transaction. Legacy unscoped keys are not automatically rewritten; reconcile pending legacy effects before replaying them through the new producer. Payload stores `site` as a relationship; `executionEventFromRecord` restores the transport `siteId`.

## Dispatch and handler contract

The scheduled dispatcher scans at most 100 `ready` rows, oldest first. It creates the job and updates the outbox to `dispatched` in one database transaction. Failed dispatch rolls both back. Payload concurrency keys serialize dispatcher work and jobs for each event. Keep the current single worker deployment; qualify concurrency with multi-process load/failure tests before scaling worker replicas.

Register a handler with `registerExecutionHandler(type, handler, version = 1)` during startup in every worker process. Each type/version has one owner. Internal events without a registered handler become `dead-letter`; public events can be consumed solely by the existing webhook fan-out. Public does not mean safe to publish arbitrary fields: the event owner must approve its public payload.

Before protected reads, handlers must validate both site and tenant with `assertExecutionScope`, then use scoped queries. Treat actor/correlation IDs as references, never names or email addresses. Supply the stored effect key to the existing provider/effect ledger. Delivery is **at least once**: a crash after a remote side effect and before marking completion may repeat the call. Provider idempotency or domain reconciliation is mandatory; queue concurrency is not an exactly-once guarantee.

Throw `ExecutionError(message, code, true)` for transient faults. The original Payload job owns exponential backoff (250 ms base) and at most three attempts; the dispatcher never requeues `retrying` rows. Permanent errors, missing internal handlers, and exhausted attempts become `dead-letter`. Successful duplicate deliveries, cancelled events, and dead letters are no-ops. Only sanitized errors enter the retained Payload job log. The final dead-letter transition completes the job; **outbox state is the authoritative domain failure status**, even if that final job invocation succeeds.

Cancellation is cooperative: authorized domain code sets the outbox to `cancelled` and cancels the queued job. A handler checks its owning cancellation record immediately before irreversible work. Cancelling a Payload job alone does not change outbox state. Never force-replay a running effect; first reconcile provider state.

## Provider and audit conventions

Use existing email development capture/disabled adapters, social manual/unavailable adapters, and extension connection runtime. Adapters validate configuration, discover capabilities, return health (`healthy`, `degraded`, `disabled`), and normalize errors with retryability. `executeProvider` fails closed when configuration/capability is missing or mode differs. Its explicit `live`, `sandbox`, or `test` request must match the adapter; sandbox/test implementations must use isolated credentials/endpoints or an in-memory transport. The helper cannot make a live transport safe merely by labeling it `test`.

Retained outbox rows are the minimal execution audit: scope, actor reference, type/version, correlation/causation, state, attempts, job reference, safe error, and timestamps. Domain effect ledgers retain their existing outcome auditing. Do not log the whole envelope or provider response. Application logs use central redaction; errors crossing worker/provider boundaries use `safeExecutionError`.

## Operator visibility and recovery

Owners can inspect **System → Execution Events** (or `/admin/collections/execution-events`) and filter state/site/tenant/correlation/job ID. Other roles cannot read this global audit surface; public API writes are denied. Existing Payload Jobs records remain available at `/admin/collections/payload-jobs` (navigation remains hidden by existing configuration). Access overrides are for trusted, already-authorized server code only.

For a dead letter, inspect the safe error and provider ledger, fix configuration/handler, and reconcile whether the effect already happened. A reviewed trusted-server replay can reset attempts and state to `ready` after ensuring the original job is terminal. For a cancelled or lost job linked to `dispatched`/`retrying`, reconcile before resetting; no automatic replay of operator-cancelled jobs. The dispatcher then publishes normally. Never delete failure evidence to hide an incident.

## Measured external-queue trigger

Remain on PostgreSQL/Payload Jobs. Open an ADR only when monitoring shows either sustained runnable backlog age above 60 seconds for 15 minutes with worker CPU below 70%, or p95 dispatch-to-start above 60 seconds for 15 minutes after tuning the current worker batch/concurrency. Exclude future `waitUntil`, cancelled, dead-letter, and processing jobs from runnable backlog. Sample every ten seconds: queue depth, oldest runnable job age, dispatch/start latency from job creation and retained task-log start times, handler duration, failure rate, database contention, and worker CPU. Compare a representative 15-minute window before/after tuning; record workload and query plans in the ADR. These are proposed measured thresholds, not a claim that current production load has crossed them. Synthetic correctness tests are not queue-capacity benchmarks.

See `docs/evidence/execution-foundation.md` for executable proof and validation results.
