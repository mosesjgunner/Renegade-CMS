# DISC-02 Schema-First Graph Registry & Engine

DISC-02 delivers a typed, coherent JSON-LD graph registry rather than isolated template snippets. All schemas are emitted as a unified graph (`@graph`) rooted at canonical site identity, referencing interconnected nodes with stable `@id` URIs.

## 1. Supported Schema Types & Node Vocabulary

| Schema Type | Node `@id` Convention | Role | Notes / Required Facts |
| :--- | :--- | :--- | :--- |
| **Organization / Person** | `${base}/#identity` | Site Identity | Derived from `site-settings.ownerKind`. Includes `legalName`, `logo`, `sameAs`. |
| **WebSite** | `${base}/#website` | Top-Level Site | References Identity via `publisher`. Includes `SearchAction` when enabled. |
| **WebPage** | `${canonicalUrl}#webpage` | Page Context | Linked via `isPartOf` (`#website`), `breadcrumb`, and `mainEntity`. |
| **Article / BlogPosting** | `${canonicalUrl}#article` | Primary Entity | Requires `headline`. Linked via `author` (`#person`), `publisher` (`#identity`), `image` (`#primaryimage`). |
| **Person** | `${authorUrl}#person` or `${base}/authors/${slug}#person` | Author Identity | Created only when visible author facts are present. |
| **BreadcrumbList** | `${canonicalUrl}#breadcrumb` | Navigational Hierarchy | Emits 1-indexed `ListItem` elements matching canonical URL taxonomy. |
| **ImageObject** | `${canonicalUrl}#primaryimage` | Primary Visual Asset | Emitted only when public, rights-cleared hero/social media exists. |
| **PodcastSeries** | `${canonicalUrl}#podcast-series` | Podcast Show | References Identity via `publisher`. Includes `webFeed` if RSS is enabled. |
| **PodcastEpisode** | `${canonicalUrl}#podcast-episode` | Podcast Episode | Requires `name`. Linked via `associatedMedia` (`AudioObject`), `partOfSeries`, `transcript`. |
| **VideoObject** | `${canonicalUrl}#video` | Video Entity | Requires `name` and `uploadDate`. Emits `contentUrl`, `thumbnailUrl`, `duration`. |
| **AudioObject** | `${canonicalUrl}#audio` | Audio Asset | Encapsulates audio enclosure URL and MIME type. |
| **CollectionPage** | `${canonicalUrl}#webpage` | Archive / Hub | Emitted for archive directories (`/articles`), tags, categories, or collections. |
| **SearchResultsPage** | `${canonicalUrl}#webpage` | Search View | Emitted for `/search` routes with query context. |

## 2. Explicit Content Fact Mapping (No Invention Policy)

Renegade CMS enforces strict fidelity to visible facts. The schema generator will never synthesize:
- Aggregate ratings, review counts, or star ratings when no reviews exist.
- Prices, currencies, or purchase offers on non-commercial content.
- Dummy authors (e.g. "Admin") when content is published anonymously.
- Fake published or modified dates when content is undated.
- Unprovided transcripts on podcast episodes or videos.
- Speculative publisher identities not configured in Site Settings.

## 3. Validation, Eligibility & Deterministic Fallbacks

Each content type is validated against strict structural rules before publication:
- **Article**: Must contain a non-empty `headline` (derived from `title` or `seoTitle`). If missing, falls back to `WebPage` with `eligibilityReason: 'fallback_to_webpage'`.
- **PodcastEpisode**: Must contain a non-empty `name`. Missing audio enclosure triggers a non-blocking warning with `repairField: 'audio'`.
- **VideoObject**: Must contain a non-empty `name` and valid ISO `uploadDate`. If `uploadDate` is missing, falls back to `WebPage` with `repairField: 'publishedAt'`.
- **Noindex / Private Exclusions**: When `indexable` is false (drafts, scheduled, private, explicit `seoNoIndex: true`, site in `prelaunch`/`maintenance` mode), the schema engine marks `eligible: false` with `eligibilityReason: 'noindex_directive'`.
- **Redirects & 404s**: Emits an empty `@graph: []` with `eligible: false` and reason `'redirect'` or `'not_found'`.

## 4. Canonical Breadcrumb Hierarchy

Breadcrumbs are generated deterministically from canonical routes:
- **Home**: `Home (/)`
- **Hierarchical Pages**: `Home (/)` → `[Parent Segments]` → `Page Title`
- **Articles**: `Home (/)` → `Articles (/articles)` → `Article Headline`
- **Podcast Shows**: `Home (/)` → `Podcasts (/podcasts)` → `Show Title`
- **Podcast Episodes**: `Home (/)` → `Show Title (/podcasts/:showSlug)` → `Episode Title`
- **Videos**: `Home (/)` → `Videos (/videos)` → `Video Title`

## 5. Admin Schema Preview & Normal Repair

The Content Editor's SEO tab provides an interactive inspection UI (`DiscoveryPanel.tsx`) without requiring editors to read or write raw JSON-LD:
- **Rich Snippet Eligibility Badge**: Green ("Eligible") or Red/Amber ("Ineligible" / "Fallback").
- **Eligibility Reason**: Explains why a type was selected or downgraded.
- **Coherent Graph Nodes**: Lists all emitted `@graph` nodes with roles (`primary`, `identity`, `website`, `webpage`, `breadcrumb`, `author`, `media`, `extension`).
- **Source Field Mapping**: Displays where each schema field originated (e.g., `headline ← from title`, `image ← from heroMedia`).
- **Direct Field Repair Buttons**: Validation errors and warnings include one-click "Repair [field]" buttons that scroll to and focus the affected input.

## 6. Extension API for Custom Content Types & Plugins

Third-party plugins and future content types register with `globalSchemaRegistry`:

```ts
import { globalSchemaRegistry, type SchemaTypeExtension } from '@/modules/public/schema'

const eventExtension: SchemaTypeExtension = {
  id: 'renegade-community-events',
  targetContentType: 'event',
  primarySchemaType: 'Event',
  requiredFields: ['name', 'startDate'],
  buildNodes: (ctx) => [
    {
      '@type': 'Event',
      '@id': `${ctx.base}/events/${ctx.record.slug}#event`,
      name: String(ctx.record.title),
      startDate: String(ctx.record.startDate),
      url: ctx.canonicalUrl,
    },
  ],
}

globalSchemaRegistry.register(eventExtension)
```

### Extension Safety & Security Constraints
1. **Reserved Type Ownership**: Third-party plugins cannot override core types (`home`, `page`, `article`, `podcast-show`, `podcast-episode`, `video`) without `core:` ID prefix.
2. **Conflict Prevention**: Registering conflicting extensions for an already registered content type throws an immediate registration error.
3. **Canonical Origin Enforcement**: Extension node `@id` values must belong to the canonical base origin (`new URL(id).origin === baseOrigin`). Foreign domain IDs are rejected.
4. **Reserved ID Immutability**: Extensions cannot hijack `${base}/#identity`, `${base}/#website`, or `${canonicalUrl}#webpage`.
5. **Script & Pollution Sanitization**: Object keys `__proto__`, `constructor`, and `prototype` are stripped; strings containing `<script>...</script>` blocks or `javascript:` URLs are sanitized.

## 7. Safe JSON-LD Serialization

Serialized with `serializeJsonLd(graph)`:
- Replaces `<` with `\u003c`, `>` with `\u003e`, and `&` with `\u0026` to prevent script closing tag injection (`</script>`).
- Replaces Unicode line separators `\u2028` and `\u2029` to avoid JavaScript parser crashes in older browsers.
- Guarantees valid JSON roundtripping (`JSON.parse` restores the exact intended structure).
