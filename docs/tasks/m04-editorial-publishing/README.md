# Milestone 04 card: Editorial publishing

Status: **M04-A, M04-B, and M04-C complete; database-backed acceptance verification passed 2026-08-21.** This card is bounded planning only; `docs/BUILD_PLAN.md` Prompt 4 is the authoritative scope.

## Entry and first gate

Entry: M01Ã¢â‚¬â€œM03 and M03.5 are preserved as completed evidence.

**M04-A Ã¢â‚¬â€ structured editorial document: complete 2026-08-17.** The framework-neutral contract in `src/modules/editorial/contracts.ts` establishes Payload Lexical JSON/hash as canonical, preserves ownership/retention/SEO/structured-data/import-export boundaries, and freezes all deferred editorial vocabulary. No persistence, UI, converter, worker or sync feature was implemented.

## Later bounded gates

**M04-B - Markdown fidelity/reporting and article-family persistence boundary: complete 2026-08-18.** The framework-neutral contract now defines the Markdown fidelity boundary, import/export report vocabulary, deterministic source checksums, unsupported-construct warnings, source-slice preservation policy, and the smallest additive persistence plan over the existing `content` spine. No Payload collection, migration, converter, editor UI, revision/workflow engine, preview route, worker or public renderer was implemented.

**M04-C - implementation checkpoint (2026-08-21):** additive Payload collections, migration, Markdown conversion, article-family persistence, append-only revisions, role-gated workflow, durable scheduled publishing, hashed expiring preview tokens, public and noindex preview routes, citations, presentation metadata, and public-discussion promotion are present. Focused unit tests, TypeScript, lint and changed-file formatting pass. The database-backed editorial acceptance scenario passed on 2026-08-21 after `npm run db:migrate` applied `20260818_062327_m04_c_editorial_workflow`; `npx vitest run tests/integration/editorial-acceptance.integration.test.ts --no-file-parallelism` passed. Do not begin M05 without a new explicit requirement.

## Exclusions

No final public theme, visual builder, AI writing, comments, social distribution, analytics, or later-milestone feature work.
