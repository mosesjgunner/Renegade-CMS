# UXI-09 — Complete the normal work loops

Status: NOT EXECUTED in this pass beyond the setup→first-publication spine proven live in Stage E. Publishing/media/community/commerce/social loops are owned by their subsystem passes (System 2 for design surfaces, RC3-EMAIL-01 for audience/email). No placeholder was substituted and no loop is claimed complete from this pass.

## Continuation (Nov 19, 2026) — Stage 5, workstream B

The ten work families were walked as complete journeys
(create → … → complete → recover). Where a family's loop was already
proven by an existing integration suite, that suite is the evidence
(run in the full integration pass on the fresh-DB + seed sequence).
Where the seam between surfaces was unproven, a new targeted suite was
written: `tests/integration/uxi-09-journey.integration.test.ts`
(publishing cross-surface, commerce store visibility through the real
catalog workflow API, media/videos archive visibility). Repair
regressions are pinned in `tests/unit/uxi-09-repairs.test.tsx`.

### Per-family verdicts

| Family         | Loop walked                                                                                                                                                                                                                                                                                                                                                            | Evidence                                                                                                                                                                              | Verdict                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publishing     | Draft article → not publicly discoverable → publish → discoverable via the same discovery resolver the public pages use → revise → republish shows the revision → unpublish → no longer discoverable                                                                                                                                                                   | NEW `uxi-09-journey` (publishing case); existing `pub-04-publishing-floor`, `content-release-acceptance`, `editorial-acceptance`, `flow-*` suites in the full run                     | PASS                                                                                                                                                            |
| Pages/design   | Theme lifecycle, reusable composition, legacy migration, presentation gate, page-builder acceptance                                                                                                                                                                                                                                                                    | Existing `pre-01`, `pre-04`, `pre-05`, `pre-06`, `page-builder-acceptance` suites in the full run                                                                                     | PASS                                                                                                                                                            |
| Media          | Upload sessions → variants → podcast acceptance; videos archive: empty query → published public video appears in the exact `/videos` page query → private removes it. Podcast loop re-verified inside this family (PR #106 idiot-proofing not redone)                                                                                                                  | Existing `med-01`, `med-03`, `med-04`, `med-06`, `media-acceptance`, `pod*` suites; NEW `uxi-09-journey` (media case)                                                                 | PASS                                                                                                                                                            |
| Navigation     | Canonical information architecture + starter experiences define and render site navigation; sitemap projection parity                                                                                                                                                                                                                                                  | Existing `canonical-information-architecture`, `starter-experiences`, `sitemap-projection-parity` suites in the full run                                                              | PASS                                                                                                                                                            |
| Community      | Community pass, cross-site boundaries, thread subscriptions, moderation APIs (grant-enforced)                                                                                                                                                                                                                                                                          | Existing `comm-00-community-pass`, `community-cross-site-boundaries`, `thread-subscriptions-identity`, `shared-contract-audience-community` suites; D14 gate repair below             | PASS                                                                                                                                                            |
| Audience/email | Subscribe → preferences → unsubscribe routes exist and are the ones the audience tasks generate tokenised links for; composer → segment evaluation → preview → test-send (local sink) → save/schedule, all against adapter/config states. **Live provider delivery was NOT exercised and NOT simulated** (held by the owner; Postmark machinery from PR #99 untouched) | Existing `aud-*`, `audience-dispatch-concurrency`, `aud-public-subscription-journey`, `email-rc3-email01-isolation` suites; D12 repair below                                          | PARTIAL — loop complete up to the provider boundary; the live-delivery leg is BLOCKED on the owner's own email research (held, Nov 18–19), not on an engine gap |
| Commerce       | Product draft → catalog workflow (request-review → approve → publish via the real admin catalog API) → visible in the exact public `/store` query → archive → gone. Cart/proposal/checkout + crypto verify suites cover the purchase leg in test mode only; no real charges                                                                                            | NEW `uxi-09-journey` (commerce case); existing `commerce-runtime-acceptance`, `rc05-pass2-commerce-routes`, `shop-08`, `crypto-verify-tenant`, `shared-contract-commerce-shop` suites | PASS (test mode)                                                                                                                                                |
| Social         | Connect flow states → draft/variant binding → schedule → dispatch → bounded reconcile/retry, all with fixtures/test doubles as the existing suites do                                                                                                                                                                                                                  | Existing `social-accounts-connect-tenant`, `social-drafts-variant-binding`, `social-bounded-reconcile`, `social-release-distribution-key`, `soc-sec-1-credential-hygiene` suites      | PARTIAL — loop verified up to the provider boundary; the live-provider leg is BLOCKED on real provider accounts (external), not faked                           |
| Staff          | Operator grants, tenant authorization matrix, staff invite, setup/first-run and resume journeys                                                                                                                                                                                                                                                                        | Existing `tenant-authorization-matrix`, `integrations-admin-api`, `setup-first-run`, `setup-draft`, `installation*`, `uxi-stage4-journey` suites; D14 gate repair below               | PASS                                                                                                                                                            |
| Import/export  | Portability engines + fixtures: podcast import/portability/restore-verify, indexing export site scope, upgrade migration                                                                                                                                                                                                                                               | Existing `pod19-import`, `pod19-portability`, `pod19-restore-verify`, `indexing-export-site-scope`, `upgrade-migration` suites in the full run                                        | PASS                                                                                                                                                            |

### Defects repaired in this stage

- **UXI-D10 (High) — `/pos` dead surface: REPAIRED as an honestly
  labelled preview.** No POS-specific invoice API exists (real crypto
  invoices are created only by the store checkout flow when a crypto
  capability is configured), so the dead "Products"/"Categories"
  buttons, the fake invoice button, the unsaved note/tip inputs, and
  the never-rendered QR component were removed. The page now states
  plainly that it is not a working till, cannot create an invoice or
  take a payment, and links to the real surfaces (`/store`, `/cart`,
  `/connections`). The page also gained the standard staff gate
  (non-staff → `/login`).
- **UXI-D12 (Medium) — email composer legal block: REPAIRED.** The
  fabricated postal address and the non-existent
  `/audience/preferences|unsubscribe` URLs on a hardcoded production
  domain are gone. The address starts empty with a visible
  "set your postal address" unconfigured state and a field-linked
  validation problem blocks save/schedule while it is empty; the
  preference/unsubscribe URLs default to the real routes
  (`/subscribe/preferences`, `/unsubscribe`) and are upgraded to
  absolute URLs on the site's canonical origin when it loads.
- **UXI-D14 (Medium) — `/moderation` ungated duplicate: REPAIRED.**
  The page now carries the same server-side staff gate as the
  frontend `/admin` layout (non-staff → `redirect('/login')`), and
  the moderation center's unavailable state now links to staff
  sign-in (`/login`) instead of member sign-in, which could never
  grant moderation rights. API grant enforcement is unchanged.
- **UXI-D16 (Low) — `/videos` blank archive: REPAIRED.** Zero
  published videos now renders an explicit empty state ("No videos
  have been published yet.") with a next action (the articles
  archive), matching the neighbouring archives.

### Orphaned-surface findings (for Stage 9 — no platform-wide navigation invented)

Re-checked by repo-wide link search in this stage; Stage 1 findings
stand except where noted:

| Surface            | Reachable through a legitimate path?                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/calendar`        | No inbound link outside its own month navigation. Genuinely orphaned (public, real).                                                                                                     |
| `/forums`          | No inbound link to the index; only its own child pages link back, and seeded starter content points at a child topic (`/forums/introductions/welcome-thread`). Index genuinely orphaned. |
| `/graphics-studio` | No inbound link. Genuinely orphaned; honestly labelled preview-only (UXI-D15, unchanged).                                                                                                |
| `/social-studio`   | No inbound link from outside; it links out to `/admin/collections/social-drafts`. Genuinely orphaned; honestly labelled preview-only.                                                    |
| `/pos`             | Still no inbound link (orphaned), but now staff-gated and honestly labelled as a preview (D10 above) — walkable by URL for staff.                                                        |
| `/moderation`      | Still no inbound link (nav points at `/admin/moderation`), but now staff-gated and walkable by URL for staff (D14 above).                                                                |

### Found but not repaired (with reasons)

- Live email delivery and live social-provider posting remain
  unverified **by design of the hold/external boundary** (see the
  PARTIAL verdicts above) — not engine gaps found in this walk.
- UXI-D15 (`/graphics-studio` preview-only capability gap) and
  UXI-D17 (duplicate `/checkout`, `/preferences`) were not in this
  stage's repair list; D17's `/preferences` half was already
  addressed in Stage 4 per the pass plan. No other dead,
  unexplained, or placeholder controls were found on the walked
  surfaces.
