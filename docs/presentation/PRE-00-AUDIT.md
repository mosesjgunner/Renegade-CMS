# PRE-00 presentation audit and implementation

Date: 2026-09-12. Prerequisite: `docs/release/FEATURE_READINESS.md` records PUB-06 PASSED / VERIFIED on 2026-09-11, including the 21-step publisher journey, PostgreSQL checks, standalone build, and recovery rehearsal. This pass inspected that evidence and exercised the retained publication path; it does not claim another complete backup/restore release gate.

## Reconciled first gap

The existing `public/contracts.ts` manifest declared descriptive variants and component names, but public HTML bypassed it. `resolveTheme`, PublicLayout, BuilderShell, onboarding validation, and setup choices encoded the two theme identities in core. The builder resolved all components from a mutable process-global registry. The public root owned the starter shell and palette, and ArticleView directly owned starter markup.

The running starter now loads from a validated, immutable registry. Its shell regions, canonical article component, compatible Page/Post/home/archive/search/404 templates, layout components, tokens, and CSS belong to the presentation package. Site Settings selects the deployed theme; onboarding and layout options enumerate the registry. Routes retain their existing data, visibility, URL, redirect, and metadata logic. Site identity, recovery identity, and member sign-in subject use configuration. Article dates no longer depend on the host locale/timezone.

## Ownership and inventory findings

| Boundary                         | Existing state and final disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical Page/Post              | `content.body` is canonical structured prose; `article-family-content.latestPublishedRevision` selects immutable `revision-records.document` for public body rendering. Retained. Title, taxonomy, hero and other facts still come from canonical Content, not a newly invented theme copy.                                                                                                                                                                                                                                                                         |
| Public shell                     | Frontend root still loads settings/navigation/consent. StarterShell and starter CSS moved to `presentation/themes`; registry resolves the shell. The shell receives the current year as an input.                                                                                                                                                                                                                                                                                                                                                                   |
| Page/Post HTML                   | EditorialArticleView now dispatches through the registered canonical editorial component and compatible template. SafeRichText remains the content sanitizer/parser.                                                                                                                                                                                                                                                                                                                                                                                                |
| Home/archive/search/404          | Existing route queries and markup remain; PresentationSurface invokes the manifest template. All inherit the active public shell. The framework's 404 response uses a client payload; final DOM was checked in Chrome as well as HTTP 404 status.                                                                                                                                                                                                                                                                                                                   |
| Other public renderers           | Books/chapters, events/ICS, audio/video, member profiles, forms/subscriptions, commerce and network routes retain their specialized renderers and inherit the shell. No claim that PRE-00 extracts every specialized component into a theme. The complete route inventory follows below.                                                                                                                                                                                                                                                                            |
| Persisted page layouts           | `PageLayouts` stores site/path, themeId, layoutVersion, blocks/unknownBlocks, revision/publishedRevision and revisionHistory. Every current record is inventoried in `page-layout-inventory.json`; no record body was rewritten. PublicLayout adapts the record and preserves its actual version.                                                                                                                                                                                                                                                                   |
| Legacy publication snapshots     | PublicLayout previously used current blocks, not a complete immutable published presentation snapshot. RevisionHistory only captures partial state. PRE-00 does not call this atomic document publication; durable complete snapshots belong to PRE-01.                                                                                                                                                                                                                                                                                                             |
| Layout IR                        | PageLayout v1 remains storage-compatible. PresentationDocument v1 adds explicit theme/template versions, surface compatibility and typed slots as a separate envelope. Legacy layouts adapt to this renderer. Unknown components stay in source JSON and render placeholders in place. Future layout versions are refused instead of silently relabeled.                                                                                                                                                                                                            |
| Component registry               | Former mutable global block definitions are now starter-package definitions copied into frozen per-theme registries. The public renderer enforces template allowlists and exact component versions. The canonical editorial component cannot be inserted in an arbitrary layout slot. Developer registration returns a new registry; it cannot mutate a live theme. Most legacy “grid”, media and query blocks still render title/body placeholders, not real queries.                                                                                              |
| Puck                             | `PuckPageEditor` uses `puckVisualEditor`, implementing VisualEditor. Main-slot editing preserves other slots and opaque metadata; unknown components and old component versions are not discarded/upgraded. Puck CSS stays an application import. Puck remains an experimental editor, not canonical persistence.                                                                                                                                                                                                                                                   |
| Tokens                           | Core previously owned light/dark palette, typefaces, many red/stone utility classes. Starter CSS now owns that palette; manifest colors apply per shell in light mode, and typography/spacing variables are exposed. Existing dark palette and semantic utility styles remain bundled starter styling. This is not a finished token-editor UI or exhaustive utility-class replacement.                                                                                                                                                                              |
| Theme settings                   | New additive `site_settings.theme_id` supplies the installed default. Existing `brands.colors/typography`, `Identity.layoutTheme`, `themePreset`, onboarding typography theme reference, and recipe theme preferences are legacy projections, not additional active selectors. They require deliberate mapping in later migrations.                                                                                                                                                                                                                                 |
| Template references              | `content.pageTemplate` (`standard/landing/about/contact/legal`) stores legacy presentation intent in canonical Content; it was not driving the old public renderer. It is identified for migration to PresentationDocument, not silently reinterpreted. Research template reports are design references, not installed executable packages or licensed imported assets.                                                                                                                                                                                             |
| Presentational markup in content | Canonical editorial contracts reject HTML as canonical and preserve raw import source separately. SafeRichText allowlists nodes and protocols. Builder `props.body` fields labeled rich-text are currently string display props, safely escaped, not canonical article bodies. No bulk rewrite of prose or source artifacts occurred. Layout/theme preferences embedded in canonical Content/profile/brand records are the presentation coupling to retire.                                                                                                         |
| Identity audit                   | Removed runtime CMS-name fallbacks and catch-all structured-data publisher literal. Configured Renegade Party fixture branding remains customer data. Product setup copy, NodeInfo software identity, ICS PRODID and API/header identifiers identify the software/protocol and remain. Social Studio now loads its simulated publisher identity from Site Settings and starts with empty draft text; its simulated card remains an authoring preview, not canonical published content.                                                                              |
| Cache paths                      | Frontend root, home, Page/Post, archive and search are force-dynamic; theme activation cannot leave a persistent public full-route cache on these paths. Added SiteSettings root-layout invalidation, including branding/theme changes. Existing navigation API also invalidates `/` layout. Editorial persistence revalidates canonical path, featured home and topics; legacy cacheTagsFor declares theme/pages but is not an implemented distributed theme cache. Page-layout API writes still lack full published-snapshot invalidation and remain PRE-01 work. |

## Live canonical traces

Page `/principles`: Content `04a33656-4e73-4c00-905e-eb4d6194f568` → article-family companion → latest published revision `43736824-e6fe-4f76-9585-4bcb04c9a96d` → `loadPublishedArticleByPath` → `buildArticlePresentation` → manifest `neutral-starter@1.0.0` → compatible `page@1.0.0` → registered editorial renderer → SafeRichText → public HTML. The smoke checks canonical title and actual text from that revision.

Post `/articles/decentralized-truth`: Content `5657eaf8-cf68-47b3-9f86-bc20cc909cf1` → published revision `dcc71170-7e31-48bf-9dc0-d3144377e30a` → `loadPublishedArticleBySlug` → `buildArticlePresentation` → `article@1.0.0` → the registered editorial renderer → SafeRichText → public HTML. Route-generated JSON-LD and metadata resolution are retained.

## Contract limits and next prompt

ThemeManifest, ThemeSelection, Template, PresentationDocument and VisualEditor are implemented types with executable validation/rendering/selection/migration/adapter logic. ThemeSelection has tested draft isolation, permitted overrides, scope enforcement, and compare-and-swap activation. Its durable store adapter and authenticated theme-preview/admin activation flow are not yet deployed. The installed default uses the existing singleton Site Settings architecture; PRE-00 does not claim a new host-to-site resolver or multi-tenant settings global.

Next: **PRE-01 — persist version-pinned ThemeSelection and complete PresentationDocument snapshots**, wire authenticated preview and transactional activation to those contracts, migrate legacy pageTemplate/layoutTheme preferences explicitly, and preserve published presentation while editing drafts. Keep canonical content/routing/SEO ownership unchanged. No package marketplace, remote executable themes, template importer, or visual-editor rewrite was added.

## Verification

- TypeScript and ESLint checks; complete unit suite: 65 files / 266 tests.
- PostgreSQL integration suite: 42/44 initially passed; the two failures asserted the obsolete renderer array shape and old migration head. Both updated suites subsequently passed (4/4); other 13 suites remained unchanged.
- Additive migration `20260912_000000_pre_00_theme_selection` applied to local PostgreSQL. Complete types generated; retained only the new SiteSettings fields to avoid unrelated generated schema drift. The build refreshed the existing admin import map.
- Next.js 16 standalone production build passed. Final build/format and running URLs are recorded in project state.
- `tests/smoke/presentation.smoke.mjs`: read-only six-surface HTTP/Chrome check plus full page-layout metadata inventory. Page/Post checks compare real published revision text with returned HTML, rather than mock content.
- The existing integration seed rewrites shared demo settings and creates active test publications. Restored branding/media from `fixtures/renegadeparty-demo/manifest.json` and made exactly this run's four new test publications drafts before the final smoke. This is fixture cleanup, not a content migration.

## Complete frontend route/rendering inventory

All current frontend page, layout, not-found and route files were enumerated. API endpoints retain authorization/protocol ownership; specialized output routes retain their module renderer.

- `src/app/(frontend)/.well-known/nodeinfo/route.ts`
- `src/app/(frontend)/.well-known/webfinger/route.ts`
- `src/app/(frontend)/[...path]/page.tsx`
- `src/app/(frontend)/ap/actors/[handle]/followers/route.ts`
- `src/app/(frontend)/ap/actors/[handle]/following/route.ts`
- `src/app/(frontend)/ap/actors/[handle]/inbox/route.ts`
- `src/app/(frontend)/ap/actors/[handle]/outbox/route.ts`
- `src/app/(frontend)/ap/actors/[handle]/route.ts`
- `src/app/(frontend)/api/admin/navigation/route.ts`
- `src/app/(frontend)/api/analytics/collect/route.ts`
- `src/app/(frontend)/api/analytics/consent/route.ts`
- `src/app/(frontend)/api/analytics/report/route.ts`
- `src/app/(frontend)/api/auth/logout/route.ts`
- `src/app/(frontend)/api/auth/passkey/complete/route.ts`
- `src/app/(frontend)/api/auth/passkey/options/route.ts`
- `src/app/(frontend)/api/auth/passkeys/route.ts`
- `src/app/(frontend)/api/commerce/checkout/initiate/route.ts`
- `src/app/(frontend)/api/commerce/crypto/verify/route.ts`
- `src/app/(frontend)/api/commerce/webhooks/[provider]/route.ts`
- `src/app/(frontend)/api/email/webhook/route.ts`
- `src/app/(frontend)/api/forms/[formId]/route.ts`
- `src/app/(frontend)/api/foundation-smoke/route.ts`
- `src/app/(frontend)/api/layouts/[id]/route.ts`
- `src/app/(frontend)/api/layouts/route.ts`
- `src/app/(frontend)/api/media/[id]/route.ts`
- `src/app/(frontend)/api/media/attach/route.ts`
- `src/app/(frontend)/api/media/upload/route.ts`
- `src/app/(frontend)/api/member-auth/deactivate/route.ts`
- `src/app/(frontend)/api/member-auth/logout/route.ts`
- `src/app/(frontend)/api/member-auth/magic-link/complete/route.ts`
- `src/app/(frontend)/api/member-auth/magic-link/request/route.ts`
- `src/app/(frontend)/api/member-auth/me/route.ts`
- `src/app/(frontend)/api/member-auth/profile/route.ts`
- `src/app/(frontend)/api/operations/diagnostics/route.ts`
- `src/app/(frontend)/api/operations/support-bundle/route.ts`
- `src/app/(frontend)/api/realtime/drafts/[articleId]/checkpoint/route.ts`
- `src/app/(frontend)/api/realtime/presence/route.ts`
- `src/app/(frontend)/api/realtime/stream/route.ts`
- `src/app/(frontend)/api/setup/complete/route.ts`
- `src/app/(frontend)/api/setup/options/route.ts`
- `src/app/(frontend)/api/subscribers/confirm/route.ts`
- `src/app/(frontend)/api/subscribers/preferences/route.ts`
- `src/app/(frontend)/api/subscribers/subscribe/route.ts`
- `src/app/(frontend)/api/subscribers/unsubscribe/route.ts`
- `src/app/(frontend)/api/v1/[...segments]/route.ts`
- `src/app/(frontend)/articles/[slug]/page.tsx`
- `src/app/(frontend)/articles/page.tsx`
- `src/app/(frontend)/builder/[id]/page.tsx`
- `src/app/(frontend)/calendar/page.tsx`
- `src/app/(frontend)/cart/page.tsx`
- `src/app/(frontend)/connections/page.tsx`
- `src/app/(frontend)/events/[slug]/ics/route.ts`
- `src/app/(frontend)/events/feed.ics/route.ts`
- `src/app/(frontend)/events/page.tsx`
- `src/app/(frontend)/graphics-studio/page.tsx`
- `src/app/(frontend)/guided-setup/page.tsx`
- `src/app/(frontend)/health/live/route.ts`
- `src/app/(frontend)/health/ready/route.ts`
- `src/app/(frontend)/layout.tsx`
- `src/app/(frontend)/login/page.tsx`
- `src/app/(frontend)/media/[id]/route.ts`
- `src/app/(frontend)/member-auth/verify/page.tsx`
- `src/app/(frontend)/members/[handle]/page.tsx`
- `src/app/(frontend)/members/settings/page.tsx`
- `src/app/(frontend)/network/page.tsx`
- `src/app/(frontend)/nodeinfo/2.1/route.ts`
- `src/app/(frontend)/not-found.tsx`
- `src/app/(frontend)/page.tsx`
- `src/app/(frontend)/podcasts/[slug]/feed.xml/route.ts`
- `src/app/(frontend)/podcasts/[slug]/page.tsx`
- `src/app/(frontend)/podcasts/episodes/[slug]/page.tsx`
- `src/app/(frontend)/pos/page.tsx`
- `src/app/(frontend)/preferences/page.tsx`
- `src/app/(frontend)/preview/article/[token]/page.tsx`
- `src/app/(frontend)/search/page.tsx`
- `src/app/(frontend)/setup/page.tsx`
- `src/app/(frontend)/social-studio/page.tsx`
- `src/app/(frontend)/store/page.tsx`
- `src/app/(frontend)/subscribe/confirm/page.tsx`
- `src/app/(frontend)/subscribe/page.tsx`
- `src/app/(frontend)/unsubscribe/page.tsx`
- `src/app/(frontend)/videos/[slug]/page.tsx`

## Additional inspected contract and template sources

- `src/collections/Publishing.ts`
- `src/collections/PageLayouts.ts`
- `src/collections/Identity.ts`
- `src/collections/Sites.ts`
- `src/globals/SiteSettings.ts`
- `src/modules/public/contracts.ts`
- `src/modules/public/page-builder.tsx`
- `src/modules/public/BuilderShell.tsx`
- `src/modules/public/PuckPageEditor.tsx`
- `src/modules/public/PublicNavigation.tsx`
- `src/modules/public/navigation.ts`
- `src/modules/public/revalidation.ts`
- `src/modules/public/seo.ts`
- `src/modules/public/discovery.ts`
- `src/modules/editorial/contracts.ts`
- `src/modules/editorial/persistence.ts`
- `src/modules/editorial/RichText.tsx`
- `src/modules/operations/onboarding.ts`
- `src/modules/extensions/contracts.ts`
- `src/modules/graphics/service.ts`
- `src/modules/experiences/contracts.ts`
- `docs/research/Template-System-Architecture-Report.md`
- `docs/research/source/Template-System-Architecture-Report.md`

## Final verification handoff

Final source typecheck and lint passed. Final formatting was repaired and rechecked. The last successful six-surface run preceded integration fixture cleanup. The existing integration seed subsequently changed active publication precedence; the subsequent smoke correctly detected a Page 404. Checked-in Renegade Party branding/media were restored and exactly the four publications created by this run were made drafts. Automatic approval review then rejected the final Windows smoke/build rerun because account usage was exhausted. That rerun remains pending; earlier successful output is not represented as final post-cleanup proof. Development server was left running at localhost:3120; the earlier standalone build is at 127.0.0.1:3121.
