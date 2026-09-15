# ADR-0008: Canonical Discovery Document and Cross-Consumer Resolution Contract

## Status

Accepted — DISC-00, 2026-09-14.

## Context

Renegade CMoS previously suffered from fragmented SEO ownership across disparate utilities, ad-hoc metadata builders, disjoint JSON-LD schema emitters, separated sitemap generators, local search extractors, and independent Quality Center checks. This fragmentation resulted in discrepancies between public URL, `path`, and `canonicalPath`, duplicated or drifting metadata values, divergent indexability logic, and inconsistent crawler-facing signals (e.g., drafts or unlisted resources leaking into sitemaps/feeds or conflicting robots directives).

## Decision

1. **Single Source of Truth (`DiscoveryDocument`):**
   A unified, frozen `DiscoveryDocument` and resolver contract (`resolveDiscoveryDocument` in `src/modules/public/discovery.ts`) is established as the sole canonical authority for all discovery state across Renegade CMoS. All public consumers—Next.js `generateMetadata`, JSON-LD `<script type="application/ld+json">`, `sitemap.xml`, `robots.txt`, RSS 2.0 `feed.xml`, local search projections (`getAllSearchDocuments`), and Quality Center auditing—derive directly from this resolver. Shadow SEO ownership is abolished; legacy `seo.ts` re-exports canonical discovery contracts.

2. **Core Contract Elements:**
   - **Public and Canonical URLs:** Normalized URL derivation reconciling `path` vs `canonicalPath` against tenant `canonicalOrigin`.
   - **Indexability and Reason:** Explicit enum (`canonical`, `site_noindex`, `explicit_noindex`, `draft`, `archived`, `scheduled`, `redirect`, `tombstone`, `unlisted`, `private`, `not_found`). Drafts, tombstoned items, private content, and search pages strictly emit `noindex`.
   - **Resolved Title & Description with Provenance:** Tracks exact provenance tier: `explicit_override` > `content_derived` > `template_default` > `site_default`.
   - **Social Image & Media Variants:** Variant-eligible public representations (OpenGraph/Twitter) prefer optimized WebP/JPEG variant delivery URLs while tracking image alt provenance.
   - **Exact Revision Binding:** Binds exact immutable published revision IDs (`article-family-revisions`) and presentation revision IDs.
   - **Redirect & Tombstone Transparency:** Transparently conveys status code (301, 302, 307, 308) and matched rule IDs or tombstone retention status.
   - **Deterministic Audit Engine:** Rule-versioned issue evaluation (`DISC-RULE-01-TITLE` through `DISC-RULE-07-SCHEMA-VALID`) directly powering editorial Quality Center findings.

3. **Deliberately Deferred External Provider Capabilities:**
   - External search engine push notification APIs (e.g., Google Indexing API, Bing IndexNow).
   - Third-party crawler site ownership verification tag injection (e.g., Google Search Console / Bing Webmaster verification tokens).
   - Automated social platform scrapers / webhook cache bust notifications (e.g., Facebook Sharing Debugger API).
   - Cross-domain or multi-tenant federated hreflang locale synchronization.

## Consequences

- Any public surface, candidate collection, or new route must integrate with `resolveDiscoveryDocument` to participate in SEO, sitemap, feed, or search.
- Quality Center checks run deterministically on the exact same document structure that crawlers receive.
- Changes to indexability, canonical paths, or titles propagate atomically across HTML metadata, JSON-LD, sitemaps, RSS, and local search.
