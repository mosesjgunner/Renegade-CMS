# Milestone 01: Foundation

## Objective

Establish a reproducible, evidence-based Renegade CMS foundation: a modular-monolith application skeleton, development database and container workflow, quality gates, baseline smoke test, and the documentation that records current state and architecture decisions.

This packet was created before implementation and is now the completed M01 task record. Implemented behavior and observed results are authoritative in `PROJECT_STATE.md` and `docs/operations/verification.md`.

## Dependency state

### Confirmed repository facts (completed 2026-08-11)

- The initial checkout contained only the build plan, seven research files and this supplied planning packet; no application implementation was present.
- The directory is not a Git worktree and has no available history or remote authority.
- M01 now provides the executable app, PostgreSQL service, migration/seed, tests, CI configuration, ADRs, operations docs and canonical project state. `rg` was available and used for the implementation audit.

### Required predecessors

Milestone 01 has no completed predecessor milestone. It is the required dependency for all later milestones in `docs/BUILD_PLAN.md`.

### Resolved choices and remaining condition

The implementation uses one npm application with the exact locked versions, PostgreSQL-only local infrastructure, accepted ADRs and an indexed corpus. Repository/remote authority remains an operational prerequisite before hosted CI or collaborative release work.

## Included scope

- Evidence-based repository audit and research inventory.
- Project spine, module map, and minimum cross-system contract definitions.
- Decision records for architecture choices made in this milestone.
- Initial application and operational skeleton using the confirmed stack.
- Local PostgreSQL, Docker, environment validation, migration, and neutral seed path.
- Lint, format, type-check, test, build, CI, and an end-to-end stack smoke test.
- Canonical `PROJECT_STATE.md` handoff and a reproducible acceptance record.

## Non-goals

- Full content, publication, media, theme, visual-builder, discussion, identity, provider, AI, social, audience, commerce, analytics, import/export, or launch implementations.
- Any claim that a research recommendation is accepted architecture without an ADR or working-code evidence.
- A Renegade Party-coupled core model, theme, seed, or application package.
- Production provider credentials, production OAuth, public deployment, or a full operations dashboard.
- Introducing Redis, an external queue, microservices, a search cluster, object storage, or real-time collaboration without a measured need and documented revisit trigger.

## Proof gate

The milestone passes only when a new developer can, from documented prerequisites:

1. Configure a local environment without receiving a secret from the repository.
2. Start the supported local services, including PostgreSQL.
3. Apply migrations and install neutral demo data.
4. Open the public Next.js route and the Payload admin route.
5. Run documented formatting, lint, type-check, unit/integration tests, build, and a meaningful smoke test that uses Next.js, Payload, and PostgreSQL rather than mocks alone.
6. Read `PROJECT_STATE.md` to see exact commands/results, migrations, accepted decisions, deferred work, risks, and the next milestone.
7. Trace every Milestone 01 requirement through `docs/requirements/TRACEABILITY.md`, decisions, tasks, and test/acceptance evidence.

Failure to prove any item keeps this milestone open. Later milestones must not begin on the assumption that this gate passed.
