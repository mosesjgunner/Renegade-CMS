# Task 03: Foundation Architecture Decisions

## Exact scope

Use repository evidence to accept or document the initial decisions for repository layout, package boundaries, configuration, testing, error/logging, API boundary, and migrations. This task creates decision records before implementation makes those choices difficult to reverse.

## Likely files

- `docs/decisions/ADR-*.md`
- `docs/architecture/shared-contracts.md`
- `docs/operations/development-baseline.md`
- `PROJECT_STATE.md`
- Existing package/workspace configuration only if a confirmed implementation needs a minimal decision-aligned change.

## Inputs and outputs

**Inputs:** verified installed versions and project structure from Task 01, module map from Task 02, research conflict register.

**Outputs:** accepted ADRs with evidence, rejected alternatives, consequences, implementation owner, validation method, and revisit trigger.

## Ordered work

1. Decide whether the observed repository is a single application or monorepo; do not create a monorepo unless evidence requires it.
2. Define package/module boundaries and framework-specific containment at the smallest useful level.
3. Select configuration schema/validation approach compatible with installed libraries and deployment runtime.
4. Select test layers and isolated PostgreSQL strategy.
5. Define normalized error shape, structured logging/redaction fields, correlation IDs, and public diagnostics boundary.
6. Select migration ownership and forward-only/rollback classification convention after checking Payload/PostgreSQL support at installed versions.
7. Decide baseline API approach and versioning boundary without implementing a broad public API.
8. Record deferred choices: durable jobs, Redis, object storage, search, editor, Puck, provider adapters, public identity, and external services.

## Tests and verification commands

- Use the actual package manager to print resolved versions and lockfile state.
- Run a minimal configuration validation test/probe after Task 04 adds it.
- Review ADRs against the authority order and traceability rows.
- Confirm every deferred technology has a measurable revisit trigger rather than an assumed future adoption.

## Definition of done

- Each accepted choice has repository/version evidence or explicit user requirement.
- Each decision lists consequences and a validation plan.
- No research-only technology is installed or treated as a dependency without a separate justified task.
- Project state summarizes accepted decisions and still-open blockers.

## Non-goals

- Adding optional infrastructure, selecting provider APIs, or implementing full public API/auth/module features.

## Handoff

Task 04 receives the accepted runtime, package, configuration, database, migration, logging, and test conventions.

**Completed 2026-08-11:** ADR-0001 and ADR-0002 accept the single-app layout, framework containment, configuration, tests, errors/logging, API and migrations. Optional infrastructure remains deferred behind measurable triggers.
