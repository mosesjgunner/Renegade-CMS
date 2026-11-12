# RC2-C-02 — Result

**Prompt:** Search indexing and consistent discovery (RC2 execution pack, section C)

**Executed:** 2026-11-12
**Base commit:** `1aae616` (main after PR #52)
**Journey:** `tests/rc2-c02/journey.mjs` — **PASS 10/10** (single run). Seed:
`tests/rc2-c02/seed-articles.spec.ts` (four token-bearing articles; only the
public published one is projected — verified in the seed's projection dump).
**Production code changed:** none. No stale-index or orphaning seam was
exposed, so the pack's conditional fix clause did not trigger.

## The canonical searchable projection

`search_documents` (PostgreSQL, tsvector full-text) is the single canonical
projection. It is **derived data only** — canonical state remains in
Payload. One writer path exists: collection hooks
(`searchProjectionHooks` → `projectSearchDocument` / `removeSearchDocument`)
run **inside the write transaction**, resolving the discovery document and
upserting or deleting the row. Queries (`querySearchProjection`) are
site-scoped, `visibility = 'public'`, version-pinned
(`index_version = SEARCH_INDEX_VERSION`), ranked by `ts_rank_cd`, and —
critically — **every hit is re-authorized against the live canonical
record before display**, so a stale row cannot leak withdrawn content.
No duplicate projection writer for content was found in this pass.

## What the journey proves

1. **Findability.** The seeded article is found on the public `/search`
   page by a title-only token and by a body-only token, exactly once each.
2. **Filters.** `topic` (taxonomy substring) and `author` (byline display
   name) each narrow correctly: matching value keeps the hit, foreign
   value removes it.
3. **Exclusions.** A draft, an embargoed article (published status, future
   `publishedAt`), and a members-visibility article never appear. The
   seed's projection dump shows the stronger fact: none of the three is
   projected at all. Site B's search returns nothing for Site A's token.
4. **Update propagation + lag.** Renaming the article (REST PATCH) makes
   the new title token findable and the old token dead, with exactly one
   result row and the body token still resolving. **Measured lag: 1,199 ms**
   from PATCH response to first poll hit — that figure is an upper bound
   dominated by the journey's 2 s poll cadence against a hook that runs
   synchronously inside the write transaction; there is no asynchronous
   indexing queue to fall behind.
5. **Restart durability.** After killing and restarting the server, the
   article is still findable — the projection is durable database state,
   not an in-memory index.
6. **Failure behavior + operator recovery.** The journey deletes the
   article's projection row directly in SQL: search correctly returns
   nothing (no phantom results). The operator reconcile
   (`POST /api/admin/indexing/search/reconcile?site=<id>`, staff-only)
   rebuilds the row and returns per-site health; search recovers with
   exactly one hit.
7. **Removal.** Unpublishing (direct write back to draft) removes the
   article from search and its public page answers 404.

## Notes

- The embargo case deserves a line: future-dated "published" content is
  excluded at projection time by the discovery eligibility rules, not
  merely filtered at query time.
- Failure behavior recorded per the prompt: projection loss degrades to
  honest empty results (never phantom hits), and reconcile is the
  documented recovery; reconcile on an unauthorized principal is refused
  by the route's staff check (route contract read, not separately
  journeyed).

## Exit assessment

**Discovery can find the right content and exclude the wrong content** —
the C-section's discovery half is E2-proven alongside C-01's media half.
