# Task 03: Durable jobs

Scope: installed Payload Jobs with a harmless schedule, bounded forced-failure retry, stable queues, worker command, structured events, cancellation policy and admin visibility.

Tests: queue/run success, scheduled persistence across process restart, retry terminal evidence, authorization.

Done when PostgreSQL owns job state and operators can inspect failed jobs.

## Handoff

Completed 2026-08-11. ADR-0003 selects installed Payload Jobs on PostgreSQL with a dedicated CLI worker. Migration 20260812_034055_m02_operations_jobs is applied. Integration evidence proves retained heartbeat success, bounded three-attempt exponential failure, concurrency keys, and execution by a fresh process after the queueing process exits. Admin visibility is under System; authenticated queue/run/cancel access is configured. Task-specific cooperative cancellation remains a later job responsibility.
