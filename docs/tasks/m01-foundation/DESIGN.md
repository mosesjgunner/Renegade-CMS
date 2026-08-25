# Design

## Status and design boundary

This design is a proposed Milestone 01 foundation contract. It is not a description of implemented code. Task 01 must replace placeholders with repository evidence before implementation; Task 02 must record accepted choices in ADRs.

## Component boundaries

| Boundary          | Responsibility in M01                                                                                                        | Explicitly excluded now                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Application host  | Next.js application bootstrap, public route, admin mounting point, configuration startup checks.                             | Product features and final route taxonomy.                         |
| CMS integration   | Payload configuration, admin entry point, typed collection/config boundary, migration registration.                          | Full content, identity, media, or publication schemas.             |
| Persistence       | PostgreSQL connection, migration runner, transactional test path, seed/reset strategy.                                       | Production data model beyond installation/fixture metadata.        |
| Configuration     | Typed server-only configuration parsing, production safety checks, redacted validation failures, `.env.example`.             | Vendor-specific provider configuration UI.                         |
| Operations        | Compose topology, service health/readiness boundary, logs, version/build identity, local backup/restore documentation.       | Backup implementation and full System Center, which belong to M02. |
| Quality           | Formatting, lint, type-check, unit/integration tests, smoke test, CI orchestration.                                          | Broad coverage targets or downstream feature test suites.          |
| Foundation domain | Stable IDs, timestamps, lifecycle/audit metadata, site/publication/brand scoping vocabulary, capability and job identifiers. | Complete collections and UI; those arrive in M03 and later.        |

No theme, plugin, provider adapter, public API consumer, or domain module may directly depend on another module’s internal persistence representation. Framework-specific access is confined to the host/CMS integration boundary.

## Initial data model

M01 should create only the smallest persisted records needed to prove the stack. It may instead use framework metadata where an explicit custom record adds no value. The following are **contract shapes**, not a mandate to create all tables now.

| Concept                | Minimum fields/invariants                                                                                                                             | First use                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `SystemMetadata`       | schema/app version, build revision, applied migration identity, created/updated UTC timestamps.                                                       | Health/readiness and project-state evidence.                                 |
| `AuditEvent` contract  | immutable ID, UTC occurrence time, actor reference or system actor, action, target type/id, redacted detail reference, request/correlation ID.        | Define now; first material use arrives with authenticated/mutating features. |
| `JobIdentity` contract | stable job ID, job kind, idempotency key when applicable, schedule/execution state, attempt count, lease/correlation ID.                              | Contract now; durable implementation is M02.                                 |
| Scope identifiers      | opaque stable IDs for Site, Publication, Brand/Profile, and future owner/member references.                                                           | Naming and field conventions only; collections are M03.                      |
| Lifecycle metadata     | `createdAt`, `updatedAt`, optional `deletedAt`, actor references where meaningful, lifecycle/status value owned by the relevant domain state machine. | Shared migration/schema convention.                                          |

### Data invariants

1. PostgreSQL is the authoritative durable store for foundation metadata, migration evidence, and later transactional domain state.
2. Database identity is immutable and opaque; slugs, paths, hostnames, and remote IDs are not primary keys.
3. Every persisted timestamp is UTC. User-local intent, when needed later, stores an IANA timezone and original local value separately.
4. JSON/JSONB may store versioned structured payloads; relational fields/constraints own scope, identity, lifecycle, uniqueness, and foreign-key integrity.
5. Soft deletion, audit retention, and public visibility require an explicit domain policy; M01 must not add a universal `deletedAt` behavior that bypasses later requirements.
6. Secrets and raw credentials are never in ordinary records, client payloads, test snapshots, logs, or diagnostics.

## Public and private interfaces

### Public interfaces to establish

- Documented developer commands: install, configure, start, migrate, seed, test, build, and smoke.
- A minimal public application route that proves the Next.js runtime path.
- A documented health/readiness contract with a minimal public-safe response only if a route is implemented.
- A versioned `.env.example` with variable purpose and non-secret example values.

### Private interfaces to establish

- A configuration module that returns validated, typed server configuration and redacts sensitive values from errors.
- A migration/seed runner contract that is deterministic, repeatable, and safe for an empty local database.
- A test-fixture/reset interface that isolates integration tests from developer data.
- A structured logging/correlation contract with a redaction utility.
- A narrow framework adapter boundary for Payload and PostgreSQL setup.

The M01 smoke test may call private application setup through test helpers, but it must validate observable behavior through the actual HTTP/CMS/database path.

## State machines

### Environment boot

`unconfigured -> validating -> invalid | ready -> starting -> healthy | degraded | failed`

- `unconfigured`: required variables are absent.
- `validating`: configuration schema is being evaluated before serving traffic.
- `invalid`: startup stops with actionable, redacted diagnostics.
- `ready`: configuration and dependencies are valid enough to start.
- `starting`: web/CMS/database integration initializes.
- `healthy`: app can perform its defined liveness/readiness checks.
- `degraded`: optional capability is unavailable but the explicitly supported base route may remain available; M01 must define this only for real optional dependencies.
- `failed`: mandatory dependency or migration state prevents safe service.

### Migration lifecycle

`unapplied -> applying -> applied | failed`

An applied migration has immutable identity and recorded execution time. Re-running a known applied migration is a no-op. Failed migrations stop the process and preserve actionable diagnostics. Down migrations are not assumed: each migration must classify rollback as reversible, forward-fix only, or restore-required.

### Smoke-test lifecycle

`environment-prepared -> migrated -> seeded -> web-ready -> admin-ready -> database-verified -> passed | failed -> cleaned`

The test must capture its failing phase and redact configuration values. Cleanup runs regardless of success where the selected test database strategy permits it.

## Permission matrix

M01 establishes roles as future contract vocabulary only. It must not imply that unavailable identity features are secure or complete.

| Actor                         | Foundation capability       | Allowed                                                                                      | Denied / deferred                                      |
| ----------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Unauthenticated reader        | Public smoke route          | Read a deliberately public minimal route.                                                    | Admin, diagnostics with sensitive data, mutations.     |
| Local developer               | Bootstrap and test commands | Configure local services, migrate/seed isolated development data.                            | Production-secret access through source control.       |
| Bootstrap owner/staff fixture | Admin smoke path            | Authenticate only if Payload’s actual first-user/bootstrap mechanism is selected and tested. | Any claim of M07-grade identity/MFA/security controls. |
| CI runner                     | Non-secret validation       | Build, test, use isolated test services/credentials.                                         | Production database, provider tokens, user data.       |
| Worker/system actor           | Not implemented in M01      | N/A; reserve audit/correlation conventions.                                                  | Executing background/domain jobs.                      |

## Background jobs and idempotency

M01 does not implement a durable job system. It establishes these requirements for M02:

- Job identity is stable, jobs have a kind and correlation ID, and scheduled attempts must be observable.
- Domain mutations and external side effects own idempotency keys; a queue alone cannot promise exactly-once external publication.
- A worker must use a bounded lease/claim protocol and append attempt evidence.
- An ambiguous external outcome enters reconciliation rather than blind retry.
- The job backend is selected after checking installed Payload version and its documented behavior against operational needs.

Foundation seed/migration operations must be idempotent or explicitly one-time with a safe guard. The smoke test must prove the chosen behavior.

## Failure modes and observability

| Failure                         | Required M01 behavior                                                                             | Evidence                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Missing/invalid required config | Refuse unsafe startup; name the variable/category without revealing values.                       | Configuration unit test and manual startup check. |
| PostgreSQL unavailable          | Readiness fails predictably; app does not falsely report ready.                                   | Integration/smoke failure scenario.               |
| Pending/failed migration        | Service policy is explicit; no silent schema drift.                                               | Migration command output and test.                |
| Seed collision                  | Deterministic no-op, explicit reset requirement, or clear failure according to documented policy. | Re-run test.                                      |
| Payload/admin mounting failure  | Smoke test fails at the actual admin route.                                                       | HTTP/browser-level smoke evidence.                |
| Log/diagnostic secret leak      | Structured redaction is exercised by tests/inspection.                                            | Redaction test and fixture review.                |
| CI environment mismatch         | CI uses the documented command sequence and reports versions.                                     | CI configuration and run evidence.                |

Log fields should include timestamp, level, event, service/module, correlation/request ID when available, error class, and redacted context. Health endpoints may expose only bounded status and build identity publicly; richer diagnostics require a later authenticated policy.

## Migration and rollback boundaries

- Migrations are versioned source artifacts, applied in order, and tracked in the database.
- A release declares the migrations it requires. Code rollback is distinct from data rollback.
- Destructive or data-rewriting changes require a backup/restore plan and a forward-fix path before merge; M01 documents this convention, M02 proves restore behavior.
- Seed data is neutral, deterministic, and separated from migrations. It must not embed Renegade Party names, provider credentials, or assumed production hosts.
- The chosen framework migration mechanism, schema generator, and database role model are unresolved until stack inspection. Record the selection in an ADR and reflect it in `PROJECT_STATE.md`.
