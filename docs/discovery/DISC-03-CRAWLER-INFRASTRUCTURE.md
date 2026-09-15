# DISC-03 Crawler Infrastructure and Indexing State

## Public contracts

- `/sitemap.xml` is a conditional, deterministic sitemap index. Child documents are `/sitemaps/{n}.xml`, bounded to 1,000 URLs. Entries come only from the canonical discovery resolver, are deduplicated and URL-sorted, and use the published discovery document's revision modification date.
- `/feed.xml` remains RSS 2.0, `/feed.json` implements JSON Feed 1.1, and `/feeds/author/{stable-id}`, `/feeds/taxonomy/{stable-id}`, and `/feeds/content/{stable-id}` provide scoped RSS streams. Podcast RSS remains owned by `/podcasts/{slug}/feed.xml` and the Media pass.
- Feed IDs use immutable entity IDs, not slugs. Summaries are escaped/plain text; only public resolver documents and public media URLs are emitted.
- `robots.txt` is generated from canonical site settings. Noindex mode blocks all crawling. Index mode blocks admin, API, setup, guided setup, preview, builder, internal, and private paths without blocking public `/media`, feeds, robots, or sitemaps.

All crawler documents send content-derived ETags and support `If-None-Match`. Request generation is the measured current-volume strategy. Sitemaps partition at 1,000 URLs; at 25,000 eligible URLs the Indexing Center reports `asynchronous-recommended`, which is the explicit trigger to materialize crawler artifacts in background storage.

## Indexing semantics

Publishing lifecycle changes write an idempotent `discovery.indexing.changed` record to the existing durable execution outbox. The idempotency key includes site, action, canonical URL, and revision version. Cache invalidation and enqueue are best effort after the content mutation: neither an unavailable queue nor a remote webmaster provider can roll back publication.

`WebmasterAdapter` is provider-neutral and separates submission from status ingestion. This installation has no supported credentialed provider, so the only enabled adapter is `manual`. A manual item is explicitly `manual`, never `submitted` or `acknowledged`. JSON can be handed to an operator or provider-specific extension later. Provider contract behavior distinguishes authentication failures (not retryable), rate limits and remote failures (retryable with delay), and bounded remote timeout.

The authenticated `/admin/indexing` view reports eligible counts, partition/generation health, crawler links, provider health, recent changes, and queued/submitted/acknowledged/failed/manual counts with direct URL links.

## Release evidence

DISC-03 is not VERIFIED unless the focused contract suite, complete discovery suite, anonymous production HTTP crawl/XML+JSON parsing, PostgreSQL lifecycle convergence, worker/outbox restart, and production build all pass. A missing provider credential is not a failure, but manual handoff must not be presented as remote submission.

## 2026-09-15 implementation audit evidence

- Implemented correction audit: removed the conflicting Next metadata sitemap route; `/sitemap.xml` is now only a route-handler sitemap index, with deterministic `/sitemaps/{n}.xml` children. Canonical URLs are URL-sorted and deduplicated; invalid timestamps are omitted rather than invented. Image extensions are emitted only for resolver-proven public hero/eligible variant URLs, and the image namespace is omitted when no image entry exists.
- Resolver collection scans now paginate in 250-record pages rather than relying on former 500/1,000-record caps. The measured materialization trigger remains 25,000 eligible URLs; child documents remain bounded at 1,000 URLs.
- Scoped feeds now match author and taxonomy entity IDs, never display-name slugs. Site RSS descriptions are converted to plain text before CDATA; JSON Feed includes an image only when the resolver establishes a public hero or eligible variant.
- Lifecycle correction audit: slug transitions emit a remove for the former canonical URL and an upsert for the new one. Event URLs use the site's configured canonical origin. Rights expiry and replacement resolve public `media-usages` to affected public content URLs. The existing execution-outbox handler records manual-provider state without blocking publication; `/api/admin/indexing/export` is a staff-authenticated manual-handoff artifact.
- Windows-native checks passed: `npm run typecheck`; `npm run lint`; focused DISC-00/01/02/03 and discovery-contract tests, 47 tests across 5 files; focused PostgreSQL DISC crawler/discoverability tests, 8 tests across 2 files; and the corrected publishing-floor plus DISC-03 regression run, 13 tests across 2 files.
- The all-integration sweep ran against PostgreSQL: 23 files / 66 tests passed, with one then-stale PUB-04 robots expectation failing because it lacked the newly required `/guided-setup`, `/internal`, and `/private` disallows. That expectation was updated to the strengthened contract and its suite subsequently passed. The entire aggregate sweep was not rerun after that single assertion correction.
- A production build using an isolated `RENEGADE_NEXT_DIST_DIR=.next-disc03` completed 45/45 routes. This isolated directory was necessary because an unrelated live `C:\Projects\RENEGADE CMS\Renegade-CMS\.next\standalone\server.js` process held the normal standalone directory open. The normal `npm run build` therefore remains unclean (`EBUSY` on `.next/standalone`).
- The isolated standalone app was started and anonymously returned 200 for `/health/ready`, `/robots.txt`, `/sitemap.xml`, `/sitemaps/1.xml`, `/feed.xml`, and `/feed.json`; PowerShell parsed sitemap index, child sitemap, RSS XML, and JSON Feed. Each of sitemap index, child sitemap, RSS, and JSON Feed returned 304 with its supplied ETag; `/sitemaps/2.xml` returned 404.
- Remaining mandatory gates: clean normal production-build/restart evidence; authenticated visible-browser Indexing Center acceptance (the dedicated spec was added but was interrupted before a persistent isolated server could run it); a dedicated PostgreSQL lifecycle proof for publish/unpublish/slug/noindex/media expiry/replacement with output-set and event convergence; execution-worker restart/outbox proof for indexing changes; canonical PostgreSQL URL-set comparison at a non-empty multi-page scale; anonymous scoped-feed validation against non-empty author/taxonomy/content fixtures; migration status confirmation (no DISC-03 schema migration was added); and a clean repository-wide format check. Do not mark DISC-03 VERIFIED.
