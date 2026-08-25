# Task 02: Project Spine, Module Map, and Contracts

## Exact scope

Define the product spine, modular-monolith boundaries, and minimum shared contract vocabulary. Freeze only cross-system contracts that prevent expensive rework. Align terminology with the audited repository and record unresolved terminology differences rather than forcing a wholesale rename.

## Likely files

- `docs/architecture/project-spine.md`
- `docs/architecture/module-map.md`
- `docs/architecture/shared-contracts.md`
- `docs/architecture/data-classification.md`
- `docs/decisions/ADR-*.md`
- Application module/type locations discovered in Task 01, only if a narrow contract declaration is required.

## Inputs and outputs

**Inputs:** Task 01 repository map, research index/conflicts, installed stack evidence, and explicit Prompt 1 requirements.

**Outputs:** product promise and first vertical slice; module ownership map; minimum contract definitions; public/private data classification; candidate ADRs with unresolved decisions called out.

## Ordered work

1. Write the target users, product promise, core publishing loop, portability promise, Renegade Party boundary, and first production vertical slice.
2. Define module ownership for platform/core, publications, content, discussions/forums, editorial, presentation, identity, comments, providers/connections, AI, media, social, audience/email, payments/supporters, commerce, analytics, security, imports/exports, and operations.
3. Define dependency rules and forbidden imports; keep the map at the actual repository/package granularity found in Task 01.
4. Freeze only stable cross-cutting vocabulary: opaque IDs, scoped ownership, timestamps, lifecycle ownership, authorship/audit metadata, soft-deletion decision points, provider connection identity, capability identifiers, background-job identity, and public/private serialization.
5. Map each proposed contract to implementation phase and acceptance tests; do not create empty domain abstractions.
6. Record decision candidates and explicitly defer unresolved schema/framework choices to Task 03.

## Tests and verification commands

- Validate architecture documentation links and diagrams with the repository’s documentation tooling when available.
- Add dependency-boundary checks only after actual module tooling is known.
- Review every named future module against a single owning boundary and a stated dependency direction.
- Verify no accepted contract names Renegade Party as a core dependency.

## Definition of done

- The project spine is concise enough to guide implementation and specific enough to reject out-of-scope work.
- The module map identifies ownership, incoming/outgoing dependencies, deferred modules, and framework containment.
- Shared contracts distinguish hard invariants from future data-model proposals.
- Contract choices are traceable to evidence and do not silently settle report conflicts.

## Non-goals

- Implementing full domain collections, creating a generic entity system, choosing the rich-text engine, or building themes/plugins/providers.

## Handoff

Task 03 receives the module map, contract vocabulary, known constraints, and a list of decisions that require ADRs before bootstrap code starts.

**Completed 2026-08-11:** Project spine, all required module ownership boundaries, data classification and minimum shared TypeScript contracts are recorded. Only core and the narrow publications proof path received code.
