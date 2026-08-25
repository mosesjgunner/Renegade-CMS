# Public rendering contract v1

`src/modules/public` is the boundary between canonical Payload records and public presentation. A theme receives normalized visible data and may select slots, templates, component variants and token values; it must not create, mutate or become the source of content, taxonomy, ownership, visibility or SEO data.

The v1 manifest defines its id, compatible contract range, tokens, header/footer/layout variants, templates, registry, defaults and child/custom extension points. `neutral-starter` and `renegade-party` are separate manifests over that same contract. No core contract imports the Renegade manifest.

`canRenderPublic` and `canDiscoverPublic` are mandatory gates for direct public views and discovery surfaces. They reject non-public visibility, non-published lifecycle states, moderation holds, suspension, burns, tombstones and expired retention. Unlisted content is deliberately not discoverable.

SEO is derived from typed `SEOFields`: manual title/description/canonical controls take precedence over generated values. JSON-LD is deterministic and produces a WebSite, organization/person identity and breadcrumbs followed only by schema types supported by visible typed data. Raw JSON-LD is not consumed.

The localization helpers define locale-prefixed route policy, alternates, RTL direction and `Intl` date formatting without changing canonical ownership. Revalidation tags enumerate the route/discovery surfaces invalidated by publishing, discussion, taxonomy, navigation, redirect and theme changes.

Initial discovery endpoints are `robots.txt` and a content sitemap. Pagination, feeds, search alerts, forum move/merge redirects, database-backed public route projections and runtime invalidation adapters must be completed before the Milestone 5 acceptance gate is claimed.
