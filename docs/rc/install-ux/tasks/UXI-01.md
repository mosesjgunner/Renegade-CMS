# UXI-01 — Map the actual experience

Goal: source-verified inventory of the install/setup/recovery spine and an ordered defect register.
Done: install.sh, production compose, installation service, setup routes/form, readiness API, recovery paths, and Security settings inspected at baseline 0e7a0d5. Nine defects registered (UXI-D1…D9) with severity by consequence — see RESEARCH_AND_CURRENT_STATE.md and the pass evidence log.
Boundary: the full route-by-route inventory of every shipped operator screen belongs to UXI-15 and was NOT completed in this pass; the spine above was mapped completely.

## Continuation (Nov 19, 2026)

The deferred remainder is now done: the full route-by-route inventory
promised to UXI-15 was executed as UXI-01 continuation work at base
`8e9220e` (branch `ux-install-remainder`). The complete inventory lives in
`docs/rc/install-ux/JOURNEY_AND_SURFACE_MATRIX.md` ("Continuation
(Nov 19, 2026) — complete operator-surface inventory"); method and
totals are summarised in the Stage 1 evidence notes in the RC goal
folder (`ux-remainder-evidence/stage1-inventory-notes.md`).

What was inventoried:

- Every `page.tsx` under `src/app/(frontend)/`, `src/app/(embed)/`, and
  `src/app/(payload)/admin/`: **69 page surfaces**, each read in source
  with its delegated component followed one level, and each entry point
  established by a repo-wide search of `href`s, starter/navigation
  definitions, and generated URLs (email builders, API responses,
  provider return URLs).
- Operator-relevant API routes under `src/app/(frontend)/api/`: **236
  `route.ts` files in 24 top-level groups**, listed by group in the
  matrix (largest: `admin/*` 63, `podcast-studio/*` 33, `commerce/*` 22,
  `community/*` 22, `member-auth/*` 21).
- Podcast surfaces shipped in PRs #104–#107 are included: `/studio/[showId]`,
  `/studio/guest/[token]`, `/podcasts/[slug]`, `/podcasts/episodes/[slug]`,
  and the `(embed)` episode embed route.

Counts from the inventory:

- Total surfaces inventoried: **69** page surfaces + 24 API groups.
- Surfaces with **no inbound link** from outside their own route
  subtree: **8** — `/calendar`, `/forums`, `/guided-setup`,
  `/graphics-studio`, `/social-studio`, `/pos`, `/moderation`,
  `/preferences`.
- **Dead controls found: 3**, all on `/pos`. Preview-only/placeholder
  surfaces: **3** — `/pos` (dead), `/graphics-studio` and
  `/social-studio` (honestly labelled previews with no persistence).
- Everything else inspected — including all twelve frontend `/admin/*`
  surfaces, the Builder, Connections, the Podcast Studio, and the
  commerce/community flows — is backed by real server queries or API
  calls per the code; no other stub primary actions were found.

### Re-baselined defect register (continuation)

UXI-D1…D9 (spine defects, RESEARCH_AND_CURRENT_STATE.md) are all recorded
there as Fixed or Addressed in the original pass and were not re-opened.
New defects found during this inventory continue the register:

| ID      | Severity | Surface                     | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence                                                                                                                                                                                                                                                                               |
| ------- | -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UXI-D10 | High     | `/pos`                      | Point of sale is a dead surface presented as working: the "Products" and "Categories" buttons have no handler at all, and "Generate crypto invoice" only re-sets the status state to the value it already holds (`awaiting_payment`), so no invoice, payment intent, or QR code is ever produced — despite the page copy promising "a payment-intent-bound crypto invoice". The `PosQr` QR component in the same file is never rendered. An operator at a real till would believe a customer payment was in progress when nothing exists.                                                                                                                                 | `src/app/(frontend)/pos/POS.tsx:21` (initial status), `:31-32` (handler-less buttons), `:55-57` (generate button re-setting the same status); `PosQr` defined at `:5` with no render site in the repo                                                                                  |
| UXI-D11 | High     | `/guided-setup`             | The beginner starter installer asks for a hand-typed "Target Site Slug / ID" and defaults it to the seed slug `demo-publication`, but both install APIs require the site's internal ID: the starters API rejects any `siteId` not in the operator's authorised ID list and then loads the site by ID. On any real (non-seed) install the default and any slug an operator types fail, with only a generic "confirm a site ID" message — the exact raw-ID burden the setup spine elsewhere removed.                                                                                                                                                                        | `src/app/(frontend)/guided-setup/page.tsx:21` (default), `:204` (label); `src/app/(frontend)/api/admin/starters/route.ts:135-137` (ID check + `findByID`); `src/app/(frontend)/api/layouts/route.ts:27` (site matched by ID equality)                                                  |
| UXI-D12 | Medium   | `/admin/email-composer`     | The campaign composer's mandatory legal block ships pre-filled with one production site's data: a placeholder postal address and preference/unsubscribe URLs on `renegadeparty.org` pointing at `/audience/preferences` and `/audience/unsubscribe` — paths that are not routes in this app (the real surfaces are `/subscribe/preferences` and `/unsubscribe`). Any other install (or site) that sends without editing every field ships campaign email with a wrong-domain, 404 legal footer.                                                                                                                                                                           | `src/modules/admin/EmailComposer.tsx:93` (address), `:96` and `:99` (URLs); contrast the generated links in `src/modules/audience/tasks.ts:251,262`                                                                                                                                    |
| UXI-D13 | Medium   | 8 surfaces (see matrix §7)  | Shipped surfaces no user can discover: `/calendar`, `/forums`, `/guided-setup`, `/graphics-studio`, `/social-studio`, `/pos`, `/moderation`, and `/preferences` have no inbound link from outside their own route subtree — no `href`, starter/navigation entry, or generated URL (email/API/provider) points at them. Site navigation is database-driven, so each is reachable only by typing the URL or hand-adding a nav entry. Two of them (`/graphics-studio`, `/social-studio`) are whole studios; `/moderation` is shadowed by its `/admin/moderation` twin (UXI-D14); the generated email preference link goes to `/subscribe/preferences`, never `/preferences`. | Repo-wide link search (method in matrix); `src/modules/admin/PublishingLinks.tsx:61` links `/admin/moderation` only; `src/modules/audience/tasks.ts:262` generates `/subscribe/preferences`                                                                                            |
| UXI-D14 | Medium   | `/moderation`               | Duplicate, ungated moderation surface: the frontend `/moderation` page renders the full `CommunityModerationCenter` with no server-side auth check (it only resolves a site ID), duplicating the same component registered as the Payload view at `/admin/moderation`, while every frontend `/admin/*` route is gated by the operator layout. Data APIs do enforce the moderation grant, so no data leaks, but the surface's unavailable state sends the operator to **member** sign-in (`/member-auth`) — a flow that can never grant moderation rights — instead of staff sign-in (`/login`).                                                                           | `src/app/(frontend)/moderation/page.tsx:16-24` (no auth check); `src/payload.config.ts:73` (same component as `/admin/moderation` view); `src/app/(frontend)/admin/layout.tsx:10` (gate this route lacks); `src/modules/admin/CommunityModerationCenter.tsx:179` (member sign-in link) |
| UXI-D15 | Low      | `/graphics-studio`          | Preview-only studio: template, brand-kit, and text controls render a live preview, but generation and saving do not exist — the only path onward is a link out to the Media Library. The limitation is honestly stated in a status line, so this is a capability gap, not a deception.                                                                                                                                                                                                                                                                                                                                                                                    | `src/app/(frontend)/graphics-studio/page.tsx:10` ("Local layout preview. Governed graphics generation and saving are unavailable.")                                                                                                                                                    |
| UXI-D16 | Low      | `/videos`                   | The video archive has no empty state: with zero published videos it renders the "Videos" heading over an empty list — a blank page a visitor cannot distinguish from a broken one. Neighbouring archives (`/articles`, `/store`, `/donate`, `/events`, `/calendar`) all render explicit empty copy.                                                                                                                                                                                                                                                                                                                                                                       | `src/app/(frontend)/videos/page.tsx:22-38` (list rendered with no empty branch)                                                                                                                                                                                                        |
| UXI-D17 | Low      | `/checkout`, `/preferences` | Duplicate surfaces with no distinct job: `/checkout` renders the identical `CartView` as `/cart` (its only addition is a screen-reader-only "Checkout" heading; the actual checkout proposal/payment flow lives inside `CartView`), and `/preferences` duplicates `/subscribe/preferences` against the same API and token while every generated email link uses the latter. Two URLs per job invites drift and confuses which link to share or support.                                                                                                                                                                                                                   | `src/app/(frontend)/checkout/page.tsx:1-13` vs `src/app/(frontend)/cart/page.tsx:1-8` (same component); `src/app/(frontend)/preferences/page.tsx:11` and `src/app/(frontend)/subscribe/preferences/page.tsx:9` (same `/api/subscribers/preferences`)                                   |

Disposition: all eight are registered for the UX-INSTALL remainder pass
fix stages (feeding UXI-15); none was fixed in this inventory stage,
which was documentation-only.
