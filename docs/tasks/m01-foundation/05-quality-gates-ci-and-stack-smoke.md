# Task 05: Quality Gates, CI, and Stack Smoke

## Exact scope

Make the baseline verifiable with formatting, linting, type-checking, unit/integration tests, build, CI, and one meaningful smoke test through the actual application, Payload, and PostgreSQL path.

## Likely files

- Package scripts and test configuration discovered from the selected stack.
- Unit/integration/smoke test directories.
- Test environment configuration and fixtures.
- CI workflow under `.github/workflows/` or the confirmed CI provider location.
- `docs/operations/verification.md`
- `PROJECT_STATE.md`

## Inputs and outputs

**Inputs:** operational baseline from Task 04, actual command names, test database strategy, configuration/redaction contract.

**Outputs:** executable verification commands, CI workflow, real-stack smoke test, recorded baseline results, and documented pre-existing failures if any.

## Ordered work

1. Add formatting, lint, type-check, test, integration-test, smoke-test, and build scripts appropriate to the installed stack.
2. Configure isolated test services/data so local developer data is never consumed by CI.
3. Add unit tests for configuration validation and redaction behavior.
4. Add migration and seed repeat-behavior integration tests.
5. Add a smoke test that boots the actual topology, applies migrations/seeds, reaches public and Payload admin paths, and verifies a database-backed operation.
6. Add CI using the documented command sequence and non-secret test configuration.
7. Execute every command and record exact output/result in verification docs and project state.

## Tests and verification commands

The final command names depend on the selected package manager, but the completed task must expose and run equivalents of:

```text
<package-manager> run format:check
<package-manager> run lint
<package-manager> run typecheck
<package-manager> run test
<package-manager> run test:integration
<package-manager> run test:smoke
<package-manager> run build
```

Also run the CI workflow’s exact local-equivalent command set and the Docker/service startup command selected in Task 04.

## Definition of done

- Each command is documented, executes against the intended environment, and has a recorded result.
- The smoke test proves Next.js, Payload, and PostgreSQL rather than mocks alone.
- Test logs, fixtures, snapshots, and CI configuration do not expose secrets.
- Failures are either fixed in scope or documented as pre-existing with ownership; success is never inferred from files merely existing.

## Non-goals

- Comprehensive downstream feature coverage, performance tuning, full accessibility suite, or production monitoring.

## Handoff

Task 06 receives the exact verification evidence, known failures, command prerequisites, test-data cleanup behavior, and CI status.

**Completed 2026-08-11:** Format, lint, type-check, unit, integration, build and real-stack smoke commands pass locally. CI is configured but cannot have a hosted result without a Git repository/remote.
