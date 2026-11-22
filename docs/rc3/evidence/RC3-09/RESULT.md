# RC3-09 — SEO and site quality — Result

Date: 2026-11-21. Branch: `rc3-09` (local only; nothing pushed).
Base: `refs/gh/main` at `82b5c6c`, which already contains the salvaged
Codex partial for this pass (`80eae7b`). Per Matthew's decision the
partial stays on main; this branch verifies it where it sits and
completes the pass on top. This document replaces the earlier draft,
whose claims were unproven.

## Phase 1 — salvage verdicts (commit `80eae7b`, verified on main)

| Salvaged piece                                                                                                                               | Verdict                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orphan rule `DISC-05-NO-AUDITED-INBOUND-LINK` in `discovery-audit.ts` (complete crawl + all-2xx only, self-links excluded, `/` exempt)       | **Sound.** Its two unit files pass 18/18 on the main tree, and the rule fires correctly inside the Phase 2 journey below.                           |
| Lifecycle guard: the orphan finding cannot auto-resolve without complete link-graph evidence (`discovery-lifecycle.ts`, admin audit route)   | **Sound.** Unit proof in `disc-05-persisted-lifecycle.test.ts` (part of the 18/18) and exercised end-to-end by the journey's resolution assertions. |
| Quality Center label for the new rule                                                                                                        | **Sound** (string present; no behavior attached).                                                                                                   |
| `sitemap-scale.mjs` measurement (25,001 entries, 26 pages, boundary 01000/01001, SHA-256 `85ffcfac…9919`)                                    | **Sound as a function-level measurement only.** Reproduced exactly on the main tree. It is not a database or production performance claim.          |
| Everything else in the pass brief (issue → fix → re-audit journey, rendered metadata/JSON-LD, sitemap/robots outputs, second-site isolation) | **Absent from the salvage (E0).** Built in Phase 2 below.                                                                                           |
| The draft RESULT.md that shipped with the salvage                                                                                            | **Replaced** by this document. Its Windows baseline numbers are not comparable to the Linux CI baselines used here.                                 |

Baselines recorded on `refs/gh/main` (`82b5c6c`) before any branch
change, database `rc309_release_acceptance`: unit 348 files / 2,822
tests pass; integration 98 files (96 pass, 2 skipped) / 576 tests
(570 pass, 6 skipped); fresh migrations and fixture seed pass.

## Phase 2 — the operator journey (new proof)

Suite: `tests/integration/rc309-seo-journey.integration.test.ts`
(5 tests, all passing). Two sites on one database: the seeded site A
and a created satellite site B with its own publication and canonical
origin. Each site gets the same five planted defects: a broken internal
link, an orphan page, a canonical/robots contradiction (self-canonical

- `noindex`), a schema gap (article with no author), and a canonical
  path shadowed by a redirect rule.

Harness note (named substitution): the rendered audit consumes HTTP
responses. The harness fetcher answers from live database state —
redirects resolve through the product's own `resolveRedirectForSite`
(the request path), and page HTML is composed from the product's own
discovery projection (`discoveryToMetadata` / `discoveryToJsonLd`)
plus the anchors stored in each document's Lexical body. Everything
else is product code against real Postgres: the audit engine, the
persisted quality-issue lifecycle, the sitemap projection, the
sitemap/robots route handlers, and the redirect resolver. Fixes are
applied through the same Payload write paths the admin UI uses.

| Leg                                                                              | Level | Proof                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue → source row → operator fix → publish → re-audit (all five defect classes) | E2    | Journey tests 1, 2 and 4: findings detected, persisted as open `quality-issues` rows with site + dedupe key; after fixes the re-audit is clean and the re-audited rows are `resolved`.                                                                                    |
| Redirect finding closure                                                         | E2    | The old address keeps redirecting by design, so its row closes by operator confirmation after the canonical move is verified (journey test 4) — matching how the Quality Center queue works.                                                                              |
| Orphan rule (salvaged)                                                           | E2    | Verified-on-main unit proof (18/18) plus journey detection and resolution on both sites.                                                                                                                                                                                  |
| Rendered metadata, JSON-LD, canonical agreement                                  | E2    | Journey test 3: audit page record equals the discovery projection; JSON-LD graph carries the WebPage node; the Article author node appears only after the schema fix.                                                                                                     |
| Sitemap index/child routes, draft + noindex exclusion, robots advertisement      | E2    | Journey test 3: route handlers render the projection for the site host; entries are canonical-URL sorted; the index summary is consistent with the entries; robots advertises the site sitemap.                                                                           |
| Second-site isolation                                                            | E2    | Journey test 5: site B detects independently; site A's resolved rows are untouched by site B's audit.                                                                                                                                                                     |
| Sitemap scale                                                                    | E1    | Function-level measurement reproduced exactly (25,001 entries / 26 pages). Database-backed pagination across the 1,000-entry page boundary was not measured; the projection's page size is 1,000 and summary consistency is asserted at database scale in journey test 3. |
| Search Console, content decay, cannibalization, external monitoring              | E0    | Not proven. These legs need external provider accounts/authorization; no claim is made.                                                                                                                                                                                   |

## Gauntlet (branch tree, CI order, database `rc309_release_acceptance`)

| Step             | Result                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh migrations | Pass                                                                                                                                                     |
| Fixture seed     | Pass                                                                                                                                                     |
| Format check     | Pass (repo-wide, pinned Prettier 3.6.2)                                                                                                                  |
| Lint             | Pass                                                                                                                                                     |
| Typecheck        | Pass                                                                                                                                                     |
| Unit             | 348 files / 2,822 tests pass — identical to the main baseline                                                                                            |
| Integration      | 99 files (97 pass, 2 skipped) / 581 tests (575 pass, 6 skipped) — baseline plus the 5 journey tests, no regressions                                      |
| Production build | Pass (reduced-memory recipe; the first attempt died silently in the TypeScript phase — a VM memory kill, not a code failure — and the retry built clean) |
| Smoke            | Pass                                                                                                                                                     |

## Open items (at their true level)

- No live-HTTP or browser leg: page HTML is composed from the
  discovery projection rather than served by a booted Next server, so
  the journey legs are E2, not E3.
- Sitemap pagination across a database-backed 25,001-entry site is
  unmeasured (E1 function-level proof only).
- Search Console / decay / cannibalization / external monitoring
  remain E0 pending external authorization.
