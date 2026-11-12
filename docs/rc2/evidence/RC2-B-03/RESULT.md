# RC2-B-03 — Publication identity, archives and reusable content surfaces: RESULT

**Verdict: PASS — 13/13 journey stages (run 2; run 1 was 12/13 with the
single failure in the journey's own assertion, disclosed below).**

Tested against main `b965b5c` (the serving build is the same production
code as B-01/B-02 — those merges changed only tests and docs), on the
RC2 two-site world rebuilt after a sandbox replacement (run 2 world
suffix `0d9b7092`).

## What was exercised

A dedicated, fully-attributed article (seed:
`tests/rc2-b03/seed-article.spec.ts` — author record, category, tag,
related-content link to the world's seeded article) followed into
every reader surface, mutated twice, and checked for propagation,
redirects, empty states, site specificity and a denied edit.
Journey: `tests/rc2-b03/journey.mjs`.

**Surfaces (all 200, all carrying the article):**

- The article page itself at its semantic URL — byline ("By Ada
  Field"), taxonomy badges (Category / #tag) and a **Related
  reporting** nav linking the related article.
- Homepage and the `/articles` archive.
- The category archive at `/categories/<slug>`.
- The RSS feed (`/feed.xml` — item link is the canonical URL, guid is
  a stable `urn:renegade:content:<id>`) and the sitemap (the index at
  `/sitemap.xml` delegates to `/sitemaps/1.xml`, which carries the
  canonical URL).

**Propagation:** a title rename via the admin REST API reached the
article page, homepage, archive, category archive and the feed, with
the old title surviving on none of them — no orphaned copies.

**Slug rename:** renaming the slug returned the article at the new
canonical URL and the old URL answers **308** redirecting to it; the
feed and sitemap then carry the new URL only.

**Edges:** a missing slug is a clean 404; an empty category renders a
real empty state ("Browse sections, categories and collections. No
hierarchy entries yet."); Site B's archive carries none of Site A's
article and Site A's category path 404s on Site B's host; an edit
attempt by the denied principal (Site B admin) is refused 403 and the
article is unchanged.

## Findings

1. **Author identity is display-only (proof gap, RC3 candidate).**
   The byline renders author names as chips — not links — and no
   author archive route exists (`/authors/<slug>` is 404, probed
   during staging). A reader can see who wrote something but cannot
   browse an author's work. The pack directs deep advanced-publishing
   items outside the E2 journey to RC3; **author archives are named
   here as an RC3 item**.
2. **Taxonomy badges are likewise display-only on the article** —
   categories/tags render as badges; the browsable category surface
   exists at `/categories/<slug>` but the article does not link to
   it. Same RC3 polish family as (1).
3. **Observation, not a stage:** the member space's stored canonical
   path (`/spaces/<handle>`) answers 404 publicly — consistent with
   RC2-A-04's space findings and owned by the H-03 profile/space
   work, recorded here so the surface inventory is honest.
4. **Localization / multi-locale surfaces were not exercised** (the
   fixture world is single-locale); per the prompt they are named
   RC3 items rather than claimed here.

## Run history, honestly

Run 1 (world `dcf284c2`) scored 12/13: the rename stage's "old URL is
gone" check used a plain substring test, and the old path is a string
prefix of the renamed path, so the check tripped over the new URL
itself. Manual inspection showed the feed item and sitemap were
already correct (new URL only). The assertion was fixed to match
whole URLs and run 2 passed 13/13 on a rebuilt world. The failure was
in the test, not the product; both runs are recorded.

## Artifacts

- Journey: `tests/rc2-b03/journey.mjs`; seed:
  `tests/rc2-b03/seed-article.spec.ts`.
- Screenshots: captured locally (article page, category archive);
  binary files cannot ride the connector push, same disclosure as
  B-01/B-02.

**Next prompt: RC2-C-01.**
