# DISC-01 Publisher discovery workflow

DISC-01 extends the frozen DISC-00 `DiscoveryDocument`; it does not create a second SEO store or resolver. Public metadata, the editor inspection panel, previews, sitemap, feed and local search all consume `resolveDiscoveryDocument`.

## Publisher workflow

1. Set Site Settings → Canonical Origin, locale, site identity and default social image. Multisite operators may map exact site IDs in `canonicalOriginsBySite`.
2. Put shared rules in `discoveryDefaults`. Use `default` plus content-type keys such as `page`, `post`, `article`, `podcast`, `video`, `author`, `taxonomy` or `search`. Supported values are `titleTemplate`, `description`, `socialTitle`, `socialDescription`, `socialImage`, `locale`, `alternates`, `index` and `follow`. Templates support `{title}` and `{site}`.
3. Write the canonical title, summary and hero media normally. Leave SEO fields blank to inherit them. Use SEO fields or `discoveryOverrides` only for genuine exceptions.
4. In the content editor’s SEO tab, inspect every resolved value, its source and fallback chain. Search and social previews use the same saved resolver output as public metadata. Each warning links back to its repair field.
5. Publish through the normal content workflow. Content, settings and media changes revalidate the route plus home, search, sitemap and feed outputs together.

## Canonical and indexing safety

- Canonical paths collapse duplicate slashes, remove query/fragment variants, normalize encoding and remove non-root trailing slashes.
- Canonical overrides may not leave the configured site origin. Content-to-content canonicals are accepted only when the target exists on the same site, is public/indexable and is not a redirect source.
- `prelaunch` and `maintenance` launch states noindex all public discovery documents and empty sitemap/feed discovery projections. Transitioning explicitly back to `live` records `launchedAt`; operators should treat any non-live status as prominent release state.
- Search, preview, builder preview, setup, admin and 404 surfaces are noindex. Draft, scheduled, archived, private, unlisted and tombstone records remain excluded by the DISC-00 public-state contract.
- Social metadata uses only canonical `/media/:id` delivery and an eligible generated `og` variant. Failed, quarantined, archived or rights-expired assets are refused; storage keys and draft bytes are never emitted.

## Proxy and multisite operations

The configured canonical origin is authoritative. Forwarded host/protocol headers never rewrite canonical output, so an untrusted proxy header cannot move a site’s canonical domain. Set the externally visible HTTPS origin explicitly for each site ID and verify raw HTML through the production proxy before launch.

After a domain, slug, canonical, publication, settings or media-rights change, inspect raw HTTP for `<link rel="canonical">`, robots, Open Graph and Twitter tags; then compare `/sitemap.xml`, `/feed.xml` and `/search`. DOM-only inspection is insufficient because Next metadata may be streamed or server-rendered.

## Release gates

Run `npm run db:migrate`, focused DISC tests, full unit/integration suites, lint, typecheck and the production build. Browser acceptance must cover inherited and explicit values, noindex and launch modes, slug redirect plus canonical change, social replacement/expiry, authenticated draft preview, untrusted forwarded origin and Page/Post/podcast/video/archive/search/404/admin/setup raw response bodies.
