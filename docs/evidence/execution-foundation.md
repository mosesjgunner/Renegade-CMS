# Phase B execution foundation evidence

Validation date: 2026-09-11. Scope: shared execution infrastructure only; no B01–B06 end-user feature implementation and no external queue service.

## Inspection and consolidation

Inspected the existing execution envelope/service/provider helpers, `ExecutionEvents` collection and migration, Payload Jobs configuration/local implementation, separate worker, operations diagnostics, domain schedulers, webhook fan-out/delivery, email and social adapters, extension connection/provider registry, central redaction, and existing execution/operations tests.

Reused the PostgreSQL outbox and its unique index, Payload queue/concurrency/backoff, retained job/outbox audit records, domain effect ledgers, and existing adapter boundaries. No schema migration is required. The new producer scopes effect keys by site/tenant; legacy-key replay requires reconciliation as described in the contract.

## Executable proof

`tests/integration/execution-foundation.integration.test.ts` uses real PostgreSQL and Payload Local API, rather than a mock store. It demonstrates:

- Owning state update and outbox insertion both roll back; committed state/event survive.
- The scheduled dispatcher creates the retained job and records its reference; the worker executes the synthetic registered handler.
- A repeated producer key returns the same event; a separately queued duplicate delivery does not repeat the completed handler.
- The same input key under a different tenant creates a separate event; handler scope checks reject cross-tenant work into a dead letter.
- A transient failure records a redacted error and delayed retry on the same job, then succeeds on attempt two. Re-running dispatch does not bypass backoff.
- Repeated transient failures stop at three attempts, remain visible as `dead-letter`, and are not republished by the dispatcher.
- Cancelled events are not executed. Owners can read terminal evidence; staff cannot access the global execution audit collection.
- Raw synthetic secret text is absent from the retained Payload job error record.

`tests/unit/execution-foundation.test.ts` also covers transaction request propagation, site/tenant key separation, unknown-handler failure, bounded retries, privacy/version rejection, safe health failures, unconfigured providers, and prevention of sandbox-to-live fallback. Existing webhook tests preserve public-only fan-out behavior.

## Validation results

- Full unit suite: **64 files, 261 tests passed**.
- Focused execution/extension regression after final outcome logging: **15 tests passed**.
- TypeScript typecheck: **passed**.
- Repository ESLint: **passed**.
- Changed-file Prettier check and `git diff --check`: **passed**.
- PostgreSQL execution proof: **passed** (initial successful run: 1.86 seconds for the scenario, excluding application startup).
- PostgreSQL operations regression: **3 tests passed**, including producer exit and completion in a separate worker process (181.73 seconds including two cold application startups).
- Final combined PostgreSQL run: **2 files, 4 tests passed** in 243.92 seconds. Final execution scenario: 1.82 seconds excluding startup.
- Retained final-run operator references: success event `d2530abf-7c18-4fd9-8657-2173745ea074`; transient/recovered event `2d403840-75dd-46e5-b054-bcfb070be579`; exhausted event `6574bdb4-35b9-47da-9b1f-1bb8ca897212`; site `68c3c4e4-2ae3-4f21-949a-4fbda622d9ac`. These are local test-database records, not production observations.

The first sandboxed database attempt was denied loopback access; the authorized retry connected successfully. The initial broader jobs run passed heartbeat/retry checks but timed out in its synchronous child-process restart fixture. The fixture now uses asynchronous child execution so Vitest RPC remains responsive and allows up to 120 seconds for a cold Payload process.

## Limits

This is correctness proof at current scale, not a production load test. No remote provider calls are made. Existing one-worker deployment and per-event concurrency are retained; multi-worker qualification is required before adding worker replicas. Handlers must still supply provider idempotency and cooperative cancellation checks. Production queue thresholds and collection/recovery instructions are in `docs/architecture/phase-b-execution-contract.md`.
