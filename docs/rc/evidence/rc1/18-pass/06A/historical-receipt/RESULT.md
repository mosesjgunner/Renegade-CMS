# RC1 06A — Metadata, Schema and Indexing Controls

Status: **06A PASS** (2026-10-18, America/Chicago). Bounded subpass receipt, not aggregate RC1 readiness.

## Exact source and isolation

Base commit: `8df3bd8fd771144129ac4719eef85f3cc9ed7a28`.
Tested tree overlay documented in [tested-tree.json](tested-tree.json).
No git commit, push, tag, publication or deployment. Preexisting user edits, databases, media, secrets and historical evidence remain preserved in place.

Runtime: Isolated Next.js development server on `http://localhost:38980` (dist dir `.next-rc106a`). Dedicated disposable PostgreSQL 17.6 container `rc106a-20261018`, port 5446, database `rc106a_release_acceptance`.
Isolated media directory: `scratch/rc106a-20261018/media`.
`LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, email mode development, no external provider actions. All operator actions authenticated via real signed passkey session tokens inserted into `admin_sessions`.

## Actual implementation

- `src/migrations/20261018_060000_rc1_taxonomy_layout_seo_fields.ts`: added `seo_title`, `seo_description`, `seo_canonical_u_r_l`, `seo_image_alt`, `seo_keywords`, `seo_focus_keyphrase`, `seo_no_index`, and `discovery_overrides` columns to `sections`, `categories`, `topics`, `tags`, `series`, and `page_layouts`. Registered in `src/migrations/index.ts`.
- `src/globals/SiteSettings.ts`: validated `canonicalOrigin` and `canonicalOriginsBySite` for proper HTTP/HTTPS protocols, origin matching, and query/fragment prevention; bidirectionally synced `seoNoIndex` with `indexingMode`.
- `src/modules/core/site-settings.ts`: exposed `seoTitle`, `seoDescription`, `seoCanonicalURL`, `seoImageAlt`, `seoNoIndex`, and `discoveryOverrides` on `ResolvedSiteSettings`; isolated `requestTheme` in `try/catch` so site settings are preserved even when theme resolution fails outside a Next.js request context.
- `src/modules/editorial/publishing-pass.ts`: wired `assertSeoCanonicalConflictFree` enforcing site-origin boundaries, query/fragment prohibition, non-redirect target enforcement, indexable public target validation, loop/chain prevention, and preventing breaking existing inbound canonical references.
- `src/collections/Publishing.ts` & `src/collections/PageLayouts.ts`: equipped `Sections`, `Categories`, `simpleTaxonomy` (`topics`, `tags`, `series`), `Content`, and `PageLayouts` with `...seoFields()` and hook validation.
- `src/modules/public/discovery.ts`:
  - Homepage (`'/'`): supports editable SEO fields on `SiteSettings`, media OG variants, social card overrides, and `WebSite`, `WebPage`, `Organization`, and `ImageObject` Schema.org JSON-LD.
  - Taxonomies: resolves `categories` and `sections` hierarchy pages directly; resolves `topics` when published content exists.
  - Entitlement restriction: marks content with `requiredEntitlement` as `indexable = false, reason = 'private'`.
  - Layouts & generic records: supports editable SEO fields and Schema.org image/nodes.
  - `discoveryToMetadata`: strictly returns `{ robots: { index: false, follow: false } }` for `draft`, `private`, `scheduled`, `tombstone`, `not_found`, and `redirect`.
  - `getAllIndexableDiscoveryDocuments`: includes `sections`, filters out non-self-canonical records, and deduplicates by both `canonicalPath` and `canonicalUrl`.
- `src/app/(frontend)/[...path]/page.tsx`: rendered JSON-LD `<script type="application/ld+json">` for section, category, and collection hierarchy views; removed duplicate canonical tag inside `<main>`.
- Client route layouts: added `noindex, nofollow` metadata layouts on `/login`, `/enroll`, `/members/settings`, `/member-auth`, `/messages`, `/notifications`, `/preferences`.
- `next.config.ts`: added `X-Robots-Tag: noindex, nofollow` HTTP headers on `/login`, `/enroll`, `/setup`, `/guided-setup`, `/preview/:path*`, `/builder/:path*`, `/members/settings`, `/member-auth/:path*`, `/messages/:path*`, `/notifications/:path*`, `/preferences/:path*`, `/pos/:path*`, `/admin/:path*`.

## Executed path and persisted assertions

1. Provisioned isolated Sites (`siteAlpha`, `siteBeta`) and Users (`alphaOwner`, `betaStaff`) with real passkey session cookies.
2. Uploaded OG banner fixture (`1200x630`) via `/api/media/upload` generating canonical `og` and `thumbnail` variants.
3. Updated Homepage `site-settings` with custom `seoTitle`, `seoDescription`, `seoCanonicalURL`, `seoImageAlt`, and social card overrides (`discoveryOverrides`).
4. Created Category `investigations` with custom SEO fields and social overrides.
5. Created Content records:
   - Published article (`/articles/investigation-the-waterfront-deal`) with custom SEO & OG social card.
   - Draft article (`/articles/secret-draft-unreleased`).
   - Private article (`/articles/exclusive-vault-document`, `visibility: private`).
   - Explicit `seoNoIndex: true` article (`/articles/internal-notice-board`).
6. Inspected actual rendered HTML and HTTP headers:
   - Homepage (`/`): returns 200; title matches `seoTitle`; description matches `seoDescription`; `<link rel="canonical" href="http://localhost:38980/"/>`; robots `index, follow`; `og:title` and `og:description` use social overrides; `og:image` uses media variant URL; `twitter:card` is `summary_large_image`; Schema.org contains `WebSite` and `Organization` JSON-LD.
   - Article (`/articles/investigation-the-waterfront-deal`): returns 200; title matches custom `seoTitle`; description matches `seoDescription`; canonical matches custom `seoCanonicalURL`; robots `index, follow`; `og:*` use `discoveryOverrides`; Schema.org includes `Article` headline and `BreadcrumbList`.
   - Category (`/categories/investigations`): returns 200; custom `seoTitle`, `seoDescription`, canonical, and `CollectionPage` JSON-LD schema.
   - Restricted routes (`/login`, `/members/settings`): return 200; emit `X-Robots-Tag: noindex, nofollow` HTTP header and `<meta name="robots" content="noindex, nofollow"/>`; omit public canonical.
   - Draft article: returns 404 to anonymous visitors; does not leak draft title or canonical.
   - Private article: non-indexable; emits noindex or 404.
   - `seoNoIndex` article: returns 200 with `<meta name="robots" content="noindex`.
   - Sitemaps (`/sitemap.xml`, `/sitemaps/1.xml`): indexable article and category included; draft, private, and `seoNoIndex` articles excluded.
7. Negative validations:
   - Rejected cross-origin canonical URL with origin boundary violation error.
   - Rejected canonical URL containing query parameters or fragments.
   - Rejected canonical URL targeting draft/non-indexable document.
   - Cross-site operator unauthorized update rejected with HTTP 403/404.
8. Theme switch & revision persistence:
   - Switched theme from `neutral-starter` to `renegade-party` and back; verified Homepage SEO metadata and JSON-LD remain intact.
   - Created content revision; verified `seoTitle`, `seoDescription`, `seoCanonicalURL`, and `discoveryOverrides` survive.
9. Playwright UI screenshots captured:
   - [screenshot-homepage-render.png](screenshot-homepage-render.png)
   - [screenshot-article-render.png](screenshot-article-render.png)
   - [screenshot-category-render.png](screenshot-category-render.png)
10. Container restart persistence:
   - Executed `docker restart rc106a-20261018`.
   - Verified persistence of Homepage custom SEO & Schema.org, Article custom SEO & Schema.org, Category SEO, and restricted route `noindex, nofollow` headers and tags.

## Commands and counts

All commands run from repository root against isolated container `rc106a-20261018`:

| Command | Exit | Result |
|---|---|---|
| `powershell -ExecutionPolicy Bypass -File tests/rc1-06a/run-isolated.ps1 -Action start-db` | 0 | Container created on port 5446; PostgreSQL ready |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-06a/run-isolated.ps1 -Action migrate` | 0 | 120 migrations applied cleanly on empty database |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-06a/run-isolated.ps1 -Action unit` | 0 | 6 suites, 56 passed / 0 failed / 0 skipped |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-06a/run-isolated.ps1 -Action types` | 0 | 0 diagnostics in scoped 06a files |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-06a/run-isolated.ps1 -Action lint` | 0 | 0 errors / 0 warnings in scoped 06a files |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-06a/run-isolated.ps1 -Action verify` | 0 | 71 passed / 0 failed / 0 skipped (operator/API/negative/Playwright) |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-06a/run-isolated.ps1 -Action restart-check` | 0 | 4 passed / 0 failed / 0 skipped after docker restart |

Total accepted scoped assertions: **131 passed / 0 failed / 0 skipped** (56 unit + 71 verify journey + 4 restart audit).

Artifacts: [journey.json](journey.json), [restart.json](restart.json), [state.json](state.json), [tested-tree.json](tested-tree.json), screenshots.

## Remaining boundaries and handoff

No open blockers within 06A scope. Disposable test container `rc106a-20261018` stopped and removed; dev server stopped.
Aggregate RC1 remains NOT READY. No later subpass has been started.
