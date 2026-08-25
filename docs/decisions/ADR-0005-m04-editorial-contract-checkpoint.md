# ADR-0005: M04-A editorial contract checkpoint

- Status: accepted
- Date: 2026-08-17
- Scope: Milestone 04 gate A only

## Decision

Editorial work has a framework-neutral contract in `src/modules/editorial/contracts.ts`. `RichTextDocument` uses Payload Lexical structured JSON as canonical data, preserves unknown nodes, carries a deterministic SHA-256 canonical hash and a plain-text projection; rendered HTML is deliberately absent from the contract.

`ArticleFamilyContent` wraps the existing `content` spine rather than replacing its collection. It preserves tenant/site/brand scope and requires publication ownership, with optional Space and Member ownership. It references the shared retention, SEO, structured-data and import/export contracts. Editorial persistence is owned by `editorial.m04`; rollback requires review and exports retain that owner.

The checkpoint freezes revision, review, citation/source, Markdown-report, grammar/style, offline draft/client mutation, preview token and scheduled-publish job vocabulary. These are contracts only. No Payload collection, migration, editor UI, Markdown converter, workflow engine, background worker, preview route, grammar provider, branching UI or offline synchronization is implemented by this decision.

## Consequences

A future M04 persistence change must be additive, owned by `editorial.m04`, and include a migration plus contract/integration evidence. Immutable revisions always retain the structured document and its matching hash. Preview tokens store a hash only; scheduled publishing carries an idempotency key but does not yet queue a job.
