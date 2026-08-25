# ADR-0003: PostgreSQL-backed Payload jobs

- Status: accepted
- Date: 2026-08-11
- Scope: Milestone 02

## Context

M02 needs durable scheduling, restart recovery, bounded retry, failure visibility and a separate VPS worker without adding Redis. Payload 3.88 is installed and its current official documentation and package types provide a PostgreSQL-persisted jobs collection, task schedules, concurrency keys, retry/backoff, cancellation and CLI runners.

## Decision

Use Payload Jobs through product-owned task definitions. Run `payload jobs:run` as a dedicated process from the same image; do not use web-process `autoRun`. Retain successful and failed records, process FIFO, enable concurrency control, expose the built-in collection under the admin System group, and require authenticated requests for queue/run/cancel endpoints. Side-effecting tasks must define a stable concurrency/idempotency key and bounded retry. Running-task cancellation remains cooperative and task-specific; queued work may use Payload cancellation.

## Evidence and consequences

Migration `20260812_034055_m02_operations_jobs` adds UUID job/log/stats tables and indexes. Integration tests prove retained success, three-attempt exponential failure, and a future job completed by a fresh Node process after its queueing process exited. PostgreSQL remains the only durable service. Payload coupling stays inside the operations adapter; replacing the runner requires preserved job/task semantics and a migration ADR.
