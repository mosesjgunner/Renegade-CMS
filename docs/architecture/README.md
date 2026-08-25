# Architecture

This directory records the system shape Renegade CMS is expected to preserve as implementation grows. Architecture docs are intentionally evidence-based: they describe current executable boundaries, accepted contracts, and known gaps without implying that every documented module already exists in code.

## Start here

- [Project spine](project-spine.md): product promise, ownership boundary, and first production vertical slice.
- [Repository map](repository-map.md): current source layout and implementation evidence.
- [System map](system-map.md): runtime and module-level view of how the platform fits together.
- [Module map](module-map.md): modular-monolith ownership boundaries and dependency rules.
- [Shared contracts](shared-contracts.md): stable platform vocabulary and cross-module contract rules.
- [Canonical information architecture](canonical-information-architecture.md): concrete publishing graph and Payload collection ownership.
- [Capability gap analysis](gap-analysis.md): implemented, partial, stubbed, and absent capabilities.
- [Open questions](open-questions.md): unresolved architecture choices that should be closed by future milestones or ADRs.

## Decisions

Architecture decisions currently live in [../decisions](../decisions). The local [decisions](decisions/) folder is reserved for architecture-scoped decision indexes or notes if this directory later needs them.

Use ADRs when a decision changes a durable contract, module boundary, data ownership rule, deployment assumption, or portability promise. Use ordinary architecture docs for descriptive maps and current-state evidence.
