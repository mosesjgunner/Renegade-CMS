# Task 04: Local Runtime, Database, and Bootstrap

## Exact scope

Create the smallest reproducible implementation skeleton using the decisions from Tasks 01-03. It must start the confirmed application stack, validate configuration safely, connect to PostgreSQL, expose the selected public/admin paths, and support deterministic migration/seed operations.

## Likely files

- Confirmed package manifest and lockfile.
- Next.js, TypeScript, Tailwind, and Payload configuration files at locations dictated by chosen versions.
- `src/` or audited equivalent: application host, configuration, CMS adapter, health/readiness route, logging/redaction utility, neutral public route.
- Database/migration/seed directories selected by the ADR.
- `.env.example`
- `compose.yaml` or audited equivalent; Dockerfiles and ignore files as required.
- `docs/operations/local-development.md`

## Inputs and outputs

**Inputs:** accepted ADRs, exact framework versions, local platform choice, test/seed convention, and clean environment requirements.

**Outputs:** runnable local stack, validated configuration, PostgreSQL service, versioned migration path, neutral seed, documented setup, and safe health/readiness behavior.

## Ordered work

1. Initialize or adapt the application only after confirming no working implementation is being overwritten.
2. Add the package/lockfile and exact scripts using the selected package manager.
3. Configure Next.js, TypeScript, Tailwind, and Payload using installed-version-compatible patterns.
4. Implement centralized typed configuration validation with production safety rules and redaction.
5. Add local PostgreSQL container topology and environment example without secrets.
6. Establish migration tracking and a neutral deterministic seed strategy.
7. Mount the minimal public route, Payload admin route, and bounded liveness/readiness endpoints selected by the ADR.
8. Document supported local setup, reset, migration, seed, and troubleshooting commands.
9. Start the clean local environment and record only observed results.

## Tests and verification commands

- The selected package manager install command with lockfile enforcement.
- Compose/config validation command for the chosen Docker tooling.
- Configuration unit tests: missing required value, malformed URL/secret policy, production unsafe value, redacted error output.
- Migration apply and repeat/no-op test against an isolated database.
- Seed apply and repeat/no-op or documented-reset test.
- HTTP checks for public route, admin mounting route, liveness, and readiness with PostgreSQL connected/disconnected.

## Definition of done

- A clean local machine can start the baseline without checked-in secrets.
- Required configuration fails early and safely; optional values have documented defaults.
- PostgreSQL is persistent across local app restart; migrations and seeds have defined repeat behavior.
- The CMS/admin route is backed by the actual selected framework, not a static placeholder.
- Neutral fixture data and naming contain no Renegade Party-specific core dependency.

## Non-goals

- First-run installation UX, durable jobs, backups, production deployment hardening, full health dashboard, content model, or public identity.

## Handoff

Task 05 receives exact startup/migration/seed commands, a running baseline, test database strategy, route paths, and any observed environment defects.

**Completed 2026-08-11:** Locked Next/Payload/PostgreSQL runtime, Compose service, validated environment, committed initial migration, idempotent neutral seed, public/admin routes and health endpoints are operational.
