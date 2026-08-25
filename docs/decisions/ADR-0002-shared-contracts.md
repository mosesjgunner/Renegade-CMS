# ADR-0002: Minimum shared contracts

- Status: accepted
- Date: 2026-08-11

The contracts in [shared-contracts.md](../architecture/shared-contracts.md) and `src/modules/core/contracts.ts` are frozen as vocabulary, not as a universal persistence base class. Modules own their state machines and schemas while sharing opaque IDs, explicit tenant/site/brand scope, UTC time, actor/audit metadata, deletion semantics, provider/capability/job identity and allowlisted public projections.

This prevents single-site assumptions, vendor identity leakage and accidental private serialization without forcing empty repositories or generic entity services. Schema refinements require a migration and an ADR update when they change cross-system meaning.
