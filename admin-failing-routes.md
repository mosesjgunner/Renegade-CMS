# Failing admin routes, ordered by severity

Evidence is from the fresh-install Chromium run documented in [admin-route-matrix.md](admin-route-matrix.md).

1. **P0 — `/admin/providers` — Connections & Webhooks unavailable.** HTTP 500. Server render passes a function (`groupFor`) into `ConnectionsCenter`, producing `Functions cannot be passed directly to Client Components`; browser also reports React error #441. Smallest repair: inspect `src/app/(frontend)/connections/page.tsx` and `src/modules/extensions/ConnectionsCenter.tsx`; pass only serializable data and keep grouping/handlers inside the client component (or mark the owning boundary correctly). Re-run `/admin/providers` and the provider action APIs.

2. **P1 — `/admin` dashboard server query.** The fresh setup renders the dashboard but server logs show `enum_content_status: invalid input value ... "active"` while querying `content`. Smallest repair: in the dashboard query owner (`src/modules/admin/PublisherDashboard.tsx` or its query helper), use the canonical `content` status values (`draft`, `in_review`, `scheduled`, `published`, `updated`, `unavailable`) and add a fresh-install browser assertion.

3. **P1 — Posts/Pages create and edit journey.** `/admin/posts` and `/admin/pages` list, but their visible create links target `/admin/collections/content/create` and that route is HTTP 404. Existing edit links use `/admin/collections/content/:id` and are likewise in the dead route family. Smallest repair: add a Payload custom view for the content collection route (including create and ID views) or change `src/modules/admin/PublishingCenter.tsx` and `src/modules/admin/PublisherDashboard.tsx` links to a real registered editor route; preserve the existing Posts/Pages views.

4. **P1 — 18 direct collection/global links are dead.** HTTP 404: `/admin/collections/content`, `/sections`, `/categories`, `/topics`, `/tags`, `/media-assets`, `/podcast-shows`, `/page-layouts`, `/subscribers`, `/forums`, `/discussions`, `/products`, `/users`, `/authors`, `/members`, `/globals/site-settings`, `/sites`, `/brands`. Smallest repair: align `src/modules/admin/PublishingLinks.tsx` with actual Payload collection/global routes and registration, or register the missing custom collection views; do not add new feature families. `topics`, `tags`, and `podcast-shows` also need an explicit owning collection/API decision before linking.

5. **P1 — `/admin/navigation` save.** The page loads and shows Save Changes, but `/api/admin/navigation` returns HTTP 500 and the client then reports `Unexpected end of JSON input`. Smallest repair: inspect `src/app/(frontend)/api/admin/navigation/route.ts` and `src/modules/admin/NavigationCenter.tsx`; return a JSON error body for every failure and correct the fresh-site publication/site lookup before claiming save works.

6. **P2 — `/admin/moderation` site scope.** Page loads with `Site ID: default` after first-run setup and browser records two HTTP 403 responses. Smallest repair: pass the selected setup-created site ID from the admin shell/query into `CommunityModerationCenter` and return structured 403 diagnostics; then exercise an empty queue and a real report.

7. **P2 — `/admin/fulfillment` is a partial operator surface.** It renders sample/default POD and manual queue state. Smallest repair: keep `src/app/(frontend)/admin/fulfillment/page.tsx` hydration-safe, but make `src/modules/admin/FulfillmentCommandCenter.tsx` read/write `pod-jobs`, `manual-fulfillment-packages`, and `pod-connections` through authenticated APIs; mark unavailable provider actions explicitly.

8. **P2 — `/admin/social` provider/resource error.** Surface loads, but browser records `ERR_NAME_NOT_RESOLVED` with providers unconfigured. Smallest repair: identify the exact provider/resource request in `src/modules/admin/SocialCommandCenter.tsx`, make it fail closed with an in-app unavailable state, and verify the dispatch API separately.

9. **P2 — incomplete browser CRUD proof on otherwise rendered command centers.** Media, Navigation, Redirects, Quality, Releases, Audience, Catalog, Commerce, AI, Security, and Migration expose controls, but this fresh install had no safe fixture for every save/operate path. The next proof should use isolated records and assert persistence after reload; it should not be upgraded to “working” from the 200 response alone.

## First broken user journey

The first broken ordinary journey is: **finish first-run setup → open Dashboard → choose Publishing → Posts → Create Post → save the first draft**. Setup succeeds and `/admin/posts` renders, but the first actionable Create Post link navigates to `/admin/collections/content/create?contentType=article`, which returns HTTP 404. The operator cannot create the first post, so the publishing journey stops before save or publish. The same failure occurs for Pages.

## Smallest repair set

1. Fix the server/client serialization boundary in `src/app/(frontend)/connections/page.tsx` and `src/modules/extensions/ConnectionsCenter.tsx`.
2. Fix canonical content status filtering in `src/modules/admin/PublisherDashboard.tsx` (or the shared dashboard query helper).
3. Make content create/edit routes real, then update the create/edit links in `src/modules/admin/PublishingCenter.tsx` and `src/modules/admin/PublisherDashboard.tsx`.
4. Reconcile every direct link in `src/modules/admin/PublishingLinks.tsx` with registered Payload routes/globals and actual collection slugs; do not hide broken links as a substitute for repairing or explicitly marking unavailable capability.
5. Repair `/api/admin/navigation` error serialization and fresh-site lookup in `src/app/(frontend)/api/admin/navigation/route.ts`.
6. Pass selected site context into moderation and make its API 403 state explicit.

After these repairs, rerun the same fresh-database browser audit and add a real isolated create → edit → save → reload assertion for one representative content record, one redirect, one navigation item, and one provider-independent operational record.
