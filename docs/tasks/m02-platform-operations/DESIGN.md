# M02 design

## Boundaries

`modules/core/config` parses and redacts environment configuration. `modules/operations` owns installation state, job definitions, diagnostics and backup metadata. Payload collections/globals and Next routes adapt those contracts. Operator scripts use the same configuration.

## Invariants

- Production requires HTTPS canonical origin, non-placeholder secrets and credentials, disabled test routes, explicit proxy policy, and persistent storage paths.
- Setup is available only while no owner exists and installation is incomplete; completion is persisted. Recovery is a local operator command, not a public bypass.
- Jobs use stable task slugs, PostgreSQL persistence, bounded retry, concurrency/idempotency keys where side effects could duplicate, structured logs, and explicit terminal state.
- Public health reveals only liveness/readiness. Rich diagnostics require an authenticated owner.
- Backup claims require a logical dump plus a disposable restore and verification query. Secret values never enter manifests.

## Failure and rollback

Partial setup remains recoverable by the local operator command. A failed job remains inspectable. Backup failure never deletes the prior successful artifact. Startup refuses unsafe production configuration and incompatible/pending migrations according to the documented policy. Code rollback is distinct from data rollback.
