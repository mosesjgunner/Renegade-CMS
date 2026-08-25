# Canonical Information Architecture

This milestone introduces concrete Payload collections for the canonical publishing graph. The collections are intentionally editor-friendly domain tables, not a generic entity framework.

## Ownership Model

- Staff `users` remain the operational/admin security principal. Public people are `members`; the two are deliberately separate.
- `members` own `profiles`, `spaces`, member-owned `publications`, media, albums, content, discussions, posts and calendar entries through explicit relationship fields.
- `publications` belong to a `site`; a publication may also point to a member `owner` and `space` for member blogs. The canonical member blog base path is `/blogs/{slug}`.
- `brands` are reusable presentation/editorial identity records. Publications may reference a brand and carry constrained overrides; the brand remains canonical.
- `authors` are credited bylines. An author may point to a `member`, but guest authors are valid and have no member account.

## Scope Rules

- Site scope is explicit on taxonomy, sources, discussions, forums, media, albums, content and calendar entries.
- Publication and space scope are nullable by design so a record can be site-wide, publication-specific or space-owned without inferring scope from a singleton.
- The current product boundary is one installation with multiple publications in one database. It is not a managed multi-tenant platform boundary; isolated managed instances remain a later operations concern.
- Unique slugs are scoped where the collection requires it: publications by `site + slug`, taxonomy by site/publication/scope rules, content/albums by publication slug plus canonical paths for public routing.

## Taxonomy Paths and Redirects

- Sections are top-level grouping records. Categories form the hierarchy below sections and carry a materialized `canonicalPath`.
- Category moves reject cycles both in collection hooks and shared contract tests.
- Moves and renames create `taxonomy-redirects` with `fromPath`, `toPath`, reason and optional target category. A redirect must change the path.

## Shared Discussions

- `discussions.kind = attached` requires `attachedTo` and is used for article/media/album comment surfaces.
- `discussions.kind = thread` requires a forum and is the standalone forum-thread model.
- `discussion-posts.permalink` is stable and is not derived from mutable body text or display ordering.

## Native Events and Timelines

- `calendar-entries` remain the owner-scoped planning and operating-calendar record. A calendar entry can now point at a canonical `event` without becoming the event itself.
- `events` are the native structured-event records. They add schema-first SEO fields, structured-data source fields, import/export ownership hooks, optional Neo4j/knowledge-graph projection metadata, retention and Milestone 5/6 rendering hook boundaries.
- `timelines` and `timeline-memberships` are additive canonical tables. Timeline ordering is PostgreSQL-first through explicit memberships; the graph projection fields are only an optional downstream boundary.
- Event and timeline records carry explicit public-render, card/list and embeddable timeline block hooks so later presentation milestones can consume stable schema instead of inferring from ad hoc JSON.

## Media and Sources

- `media-assets` are reusable byte/storage records. Albums and content reference the same media asset and `media-usages` records describe use without duplicating bytes.
- `sources` are staff-readable editorial provenance records. Public projections must omit private `credibilityNotes` and `editorialNotes`.

## Retention Query Contract

Eligible public/discoverable records share `retentionMode`, `retentionExpiresAt`, `retentionHold`, `removeFromDiscovery` and optional tombstone fields.

Discovery callers must use the shared retention contract before routing, search, feeds or sitemap inclusion:

- tombstones, deleted records and manual burns are excluded;
- expired records are excluded after `retentionExpiresAt`;
- legal or moderation holds override expiry removal so staff/legal obligations can preserve discoverability decisions deliberately.

Automatic purge, cryptographic erasure and backup expiry are still future retention implementation work; this milestone establishes the collection fields and shared query behavior only.

## Site Settings Global

- site-settings is the singleton root authority for owner identity, global metadata, social/verification/robots defaults, WebSite search-action configuration and Organization/Person structured-data defaults.
- Publication, brand and page-level SEO data inherit from this global according to an explicit policy; raw structured-data overrides are owner-only.

## Acceptance Verification

The preserved milestone was re-verified on 2026-08-18: migrations applied cleanly, the neutral fixture seed was idempotent, and the full PostgreSQL integration suite passed (18 tests, including 12 canonical information-architecture checks). Static formatting, linting, TypeScript, unit tests, and Payload type generation also passed. The Next production build retains the documented unrelated `/_global-error` prerender failure.
