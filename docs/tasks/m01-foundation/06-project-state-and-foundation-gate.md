# Task 06: Project State and Foundation Gate

## Exact scope

Close Milestone 01 only after independently replaying its proof gate. Consolidate evidence into the canonical state handoff, update traceability, record deferred work, and explicitly leave Milestone 02 blocked until the gate is satisfied.

## Likely files

- `PROJECT_STATE.md`
- `docs/requirements/TRACEABILITY.md`
- `docs/operations/verification.md`
- `docs/operations/local-development.md`
- `docs/architecture/repository-map.md`
- `docs/decisions/ADR-*.md`
- `docs/tasks/m01-foundation/*.md` handoff sections if implementation updates are needed.

## Inputs and outputs

**Inputs:** completed Tasks 01-05, exact command results, migration/seed identity, CI evidence, clean-environment replay evidence, and unresolved risk list.

**Outputs:** truthful `PROJECT_STATE.md`, closed traceability rows, foundation acceptance record, M02 entry conditions, and explicit blockers/deferred work.

## Ordered work

1. Re-run the documented setup from a clean or isolated environment using only published prerequisites.
2. Apply migrations and seed data; verify the repeat behavior claimed by Task 04.
3. Open public application and Payload admin routes, then run full verification and smoke suites.
4. Compare observed behavior with the M01 proof gate and traceability table.
5. Record exact command invocations, versions, migrations, output summaries, and any pre-existing failures.
6. Update `PROJECT_STATE.md` with what works, accepted decisions, architecture boundaries, known risks, deferred work, and exact M02 prerequisites.
7. Mark this milestone complete only if every proof-gate item is evidenced; otherwise leave the gate open with named owner/next task.

## Tests and verification commands

- Repeat every documented setup, migration, seed, format, lint, type-check, test, integration, smoke, build, and CI-equivalent command from Tasks 04-05.
- Perform an independent public/admin/database smoke scenario.
- Validate documentation links and traceability references with available tooling.
- Review `PROJECT_STATE.md` against actual command output and git changes.

## Definition of done

- `PROJECT_STATE.md` is the canonical handoff and contains only observed evidence.
- Every M01 requirement has a traceability row ending in test/acceptance evidence or an explicit open blocker.
- A new developer can repeat the foundation proof without undocumented manual steps.
- M02 starts only after the acceptance gate is passed and its stated dependencies are available.

## Non-goals

- Implementing M02 installation, jobs, deployment, backup, operational dashboard, or any later domain feature.

## Handoff

Provide the next implementation session with the project-state file, accepted ADRs, exact baseline commands/results, migration identity, known risks, deferred architecture decisions, and the M02 dependency checklist.

**Completed 2026-08-11:** The local acceptance gate passed and evidence is consolidated in `PROJECT_STATE.md`, global traceability and verification docs. M02 is explicitly not started.
