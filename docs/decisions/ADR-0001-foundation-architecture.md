# ADR-0001: Foundation architecture

- Status: accepted
- Date: 2026-08-11
- Scope: Milestone 01

## Context

The checkout had documentation but no executable system or prior decisions. The core stack is an explicit requirement. Current official package metadata supports Payload 3.88.0 with Next 16.3.0 on the available Node runtime.

## Decisions

1. **Repository:** one npm-managed Next.js application, not a workspace/monorepo. Extraction requires a real independent build/deploy/versioning need.
2. **Boundaries:** `src/modules` owns product contracts; `src/app`, Payload collections and `payload.config.ts` are framework adapters/composition. Only implemented modules receive code directories.
3. **Configuration:** server environment is parsed once through a product-owned validator. Required values have no production fallback; errors name keys but redact values. `.env.example` is descriptive and non-secret.
4. **Testing:** Vitest covers unit and PostgreSQL integration tests. A Node smoke runner starts the built Next/Payload application and performs HTTP plus Payload REST persistence checks against isolated PostgreSQL. CI uses the same scripts.
5. **Errors:** internal `AppError` values carry stable code, safe message, HTTP status, correlation ID and optional redacted details. Unknown errors become a generic public error.
6. **Logging:** structured JSON to stdout/stderr with timestamp, level, event and correlation ID. Known secret fields and configured secret values are redacted. No new logging service is introduced.
7. **API:** Next route handlers and Payload REST are the initial HTTP surface. Product-owned public endpoints return explicit JSON projections. A broad versioned external API is deferred until M08; Local API stays server-side.
8. **Migrations:** Payload/Postgres owns forward migrations in `src/migrations`. Production disables schema push. Each migration records whether its data effect is reversible; `down` is not evidence that deployed data rollback is safe. Seed is idempotent and separate.
9. **Infrastructure:** PostgreSQL is the sole durable dependency in M01. Redis, graph/search databases, object storage and network services require a measured trigger and new ADR.

## Consequences and validation

The simplest deployable unit remains portable and tests exercise the actual integration. Module isolation initially relies on import conventions plus ESLint; add graph enforcement once multiple implemented domains make it valuable. Validate with format, lint, type-check, unit, integration, build and smoke commands.

## Revisit triggers

Add a package only when it needs independent publication or has at least two consumers; split a service only for measured isolation/scaling; version a public API when an external consumer exists; choose jobs/storage/search/editor/provider technologies in their owning milestone.
