# Discoverability contract evidence — 2026-08-30

Implemented one local discovery path over canonical Payload records: `/search` queries the normal installation without a separate search dependency, always applies `canDiscoverPublic`, and scopes results to the active publication site. The deterministic adapter ranks exact title matches above title prefixes and body matches, paginates at a bounded page size, and produces highlighted excerpts.

`public-redirects` is a site-scoped migrated collection. Its resolver supports exact, prefix, and regex matching; same-site paths only; 301/302/307/308; query preservation; loop detection; and an eight-hop ceiling. It resolves before public content lookup. Redirect records retain `hitCount` and `lastHitAt` fields for future request-observation wiring.

When an editor changes a content record's canonical path (including a slug-driven URL change), the content hook creates a site-scoped permanent exact redirect unless that source path is already explicitly governed by a redirect. This preserves a deliberate admin override.

Public canonical and article pages use the existing metadata builder for canonical URL, robots, Open Graph, and Twitter fields. Search is noindex; sitemap filtering now applies public-discovery and noindex policy across canonical collections; `robots.txt` retains administrative exclusions. JSON-LD remains typed and deterministic.

Observed validation:

- `npm run typecheck` passed.
- `npx vitest run tests/unit/discovery-contracts.test.ts tests/unit/public-contracts.test.ts` passed: 2 files, 6 tests.
- `npm run db:migrate` applied `20260830_100000_media_storage_workflow`, `20260830_110000_discoverability`, and the Payload lock-relation correction `20260830_120000_discoverability_lock_relation`.
- `npx vitest run tests/integration/discoverability-acceptance.integration.test.ts --no-file-parallelism` passed: 1 file, 1 test. It persists representative publication, search, unpublish, delete, redirect, query-policy, and cleanup behavior.

Not yet claimed as verified: an HTTP/browser crawler run against deployed representative routes. The database-backed publish → search → unpublish/delete convergence run is now exercised.

Dedicated search service trigger: introduce one only when public documents exceed 10,000 or p95 local query latency exceeds 250 ms for seven consecutive days.
