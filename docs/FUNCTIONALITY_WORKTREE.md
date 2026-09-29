# Functionality work tree

This is the persistent stabilization queue, not a capability inventory. Status is current only when backed by the concise evidence named on the leaf. Historical evidence is retained as a reference, not silently promoted to current acceptance.

Leaf format: **State** — acceptance criterion. **Failure/blocker:** … **Subsystem:** … **Evidence:** …

## 0. Foundation

- **0.1 Runtime and setup — UNPROVEN** — Standard startup, readiness, and first-site setup complete without altering existing data. **Failure/blocker:** no current run for this stabilization sequence. **Subsystem:** setup/readiness and standalone server. **Evidence:** `docs/CURRENT_STATE.md` configuration note.
- **0.2 Tenant and authorization boundary — PARTIAL** — Site-scoped reads/writes reject cross-site targets. **Failure/blocker:** ADMIN-00 focused evidence exists; live authenticated session matrix remains open. **Subsystem:** `src/modules/admin/access-policy.ts`. **Evidence:** `docs/execution/admin-00-role-route-evidence.md`.

## 1. Publishing


- **1.1 Editorial lifecycle — PARTIAL** — Isolated Chromium accepted Posts and Pages through draft, review, approval, preview, publish, public rendering/metadata, and durable exact `308` redirects (1 test, 20.6s). **Failure/blocker:** browser-shutdown `destination stream closed early` errors leave clean-console evidence open; media, workflow, logout/re-login, navigation, and administrator/staff boundaries remain unrun. **Evidence:** `tests/browser/editorial-admin-workflow.spec.ts`; isolated `prompt6_pages_20260929_release_acceptance`; dirty `HEAD` `8ea0e248412252b230d1b3a5b76d6791798c449d`.

## 2. Presentation

- **2.1 Public rendering and theme selection — UNPROVEN** — Published content renders correctly for its site and theme. **Failure/blocker:** not exercised in this sequence. **Subsystem:** presentation themes. **Evidence:** `docs/presentation/` historical evidence.

## 3. Media

- **3.1 Media Library composed route — PARTIAL** — `/admin/media-library` loads, lists scoped assets, opens metadata management, and has legible core-library controls. **Failure/blocker:** in the standard profile the optional Media Command Center cannot run because `media-jobs` is not registered; it is replaced by a truthful unavailable explanation. Upload/create and metadata save/reload remain unaccepted without an isolated write-capable fixture. **Subsystem:** `MediaLibrary`, `MediaCommandCenter`, `MediaLibraryClient`, `MediaLibraryClient.module.css`. **Evidence:** `docs/stabilization/media-library-2026-09-28.md`.

- **3.1 Media Library composed route — UNPROVEN** — `/admin/media-library` loads and its upload, picker, metadata, management form, and nested controls are usable with legible contrast. **Failure/blocker:** exact current composed-route browser acceptance has not been recorded. **Subsystem:** `MediaCommandCenter`, `MediaLibraryClient`, `MediaLibraryClient.module.css`. **Evidence:** `docs/evidence/media-publishing-workflows.md`; stabilization index.
- **3.2 Asset storage and delivery — PARTIAL** — Upload/delivery boundaries work without cross-site or private-byte leakage. **Failure/blocker:** historical MED evidence exists; current provider/browser/restart boundaries are not accepted. **Subsystem:** media assets, blobs, variants. **Evidence:** `docs/operations/media-storage.md`; `docs/operations/med-06-media-pass-gate.md`.

## 4. Discovery

- **4.1 Resolver and indexing UI — PARTIAL** — Admin resolver controls and indexing state work in an authenticated browser. **Failure/blocker:** recorded browser acceptance remains open. **Subsystem:** discovery resolver/indexing. **Evidence:** `docs/execution/discoverability-contract-evidence.md`; `docs/PROJECT_STATE.md` DISC-01/DISC-03 notes.

## 5. Workflow

- **5.1 Workflow command center — PARTIAL** — Current workflow contracts and unit coverage pass, and the mounted command-center/API implementation remains type- and lint-clean. **Failure/blocker:** queues, approvals, assignments, and scheduled work have not been re-exercised through an authenticated browser session in this standard-profile pass. **Subsystem:** workflow/admin workflow center. **Evidence:** `docs/stabilization/five-area-pass-2026-09-28.md`.
- **5.2 Releases — PARTIAL** — Current release contracts and unit coverage pass, and the mounted command-center/API implementation remains type- and lint-clean. **Failure/blocker:** coordinated preflight, execution, retry, and rollback have not been re-exercised through the normal UI/API against an isolated write-capable fixture. This does not satisfy the separate frozen-candidate release gate. **Subsystem:** `src/modules/releases/`, release admin/API. **Evidence:** `docs/stabilization/five-area-pass-2026-09-28.md`.

## 6. Distribution

- **6.1 Social distribution — DEFERRED** — Fixture-backed adapter and queue contracts are test-clean, but the documented Social Studio is only a preview surface. **Failure/blocker:** authenticated persistence, media export, queue-slot configuration, OAuth callbacks, live federation inboxes, and two-way calendar adapters are explicitly follow-up work. **Subsystem:** social distribution. **Evidence:** `docs/stabilization/five-area-pass-5b-2026-09-28.md`; `docs/architecture/social-distribution.md`.

## 7. Audience

- **7.1 Consent and campaigns — PARTIAL** — Audience contracts and unit coverage pass, and the mounted command-center/API implementation remains type- and lint-clean. **Failure/blocker:** no current normal-surface consent/campaign acceptance; the command center still contains seeded demonstration funnel, suppression, and experiment data, so it cannot be treated as a live operational dashboard. **Subsystem:** audience campaigns/preferences. **Evidence:** `docs/stabilization/five-area-pass-2026-09-28.md`.

## 8. Community

- **8.1 Member/community operations — PARTIAL** — Messaging, moderation, notifications, and privacy maintain member/site isolation. **Failure/blocker:** cross-site browser/HTTP, restart, and restore proof remain open. **Subsystem:** community policy and messaging. **Evidence:** `docs/execution/community-completion-2026-09-24.md`; `docs/operations/community-conversation-security.md`.

## 9. Commerce

- **9.1 Checkout and payment operations — PARTIAL** — One canonical order/payment/receipt is created and operational transitions are authorized. **Failure/blocker:** current normal-surface and live-provider proof open. **Subsystem:** commerce payment/order operations. **Evidence:** `docs/execution/commerce-admin-state-transitions-proof.md`.
- **9.2 Fulfillment — PARTIAL** — POD/manual fulfillment reflects provider/job state and supports safe recovery. **Failure/blocker:** external provider configuration and current end-to-end acceptance open. **Subsystem:** fulfillment plan/jobs/command center. **Evidence:** `docs/commerce/SHOP-03-PRINT-ON-DEMAND-FULFILLMENT.md`.

## 10. Cross-cutting systems

- **10.1 Navigation — PARTIAL** — The 16-area admin map presents usable, authorized routes without dead ends. **Failure/blocker:** live role/session browser matrix open. **Subsystem:** `PublishingLinks`, `NavigationCenter`, access policy. **Evidence:** `docs/execution/admin-00-role-route-evidence.md`.
- **10.2 Analytics — PARTIAL** — Privacy/consent, attribution, experiment, and telemetry contracts are current-test and lint clean. **Failure/blocker:** current real-browser consent, collection, withdrawal, and operator-reporting acceptance has not been rerun in an isolated browser environment. **Subsystem:** analytics/telemetry. **Evidence:** `docs/stabilization/five-area-pass-5b-2026-09-28.md`; `docs/evidence/analytics-privacy-runtime.md`.
- **10.3 Providers — PARTIAL** — Connection inventory and provider destinations truthfully report unavailable/configured/local-emulator states without exposing credential values or claiming a remote test. **Failure/blocker:** no current configured-provider acceptance or external provider mutation was performed. **Subsystem:** provider diagnostics/connections. **Evidence:** Prompt 5 focused verification (3 provider-inventory tests); `tests/unit/admin-navigation-and-surfaces.test.ts`.
- **10.4 Intelligence — PARTIAL** — Governed AI proposals, adapters, budgets, review boundaries, and intelligence workflows are current-test clean. **Failure/blocker:** no configured AI-provider or authenticated browser proposal/apply acceptance was performed. **Subsystem:** AI gateway/admin and content intelligence. **Evidence:** Prompt 5 focused verification (98 AI/intelligence tests); `tests/unit/admin-navigation-and-surfaces.test.ts`.
- **10.5 Migration — PARTIAL** — Migration administration, readiness failure states, and legacy-migration contracts are current-test clean. **Failure/blocker:** this bounded pass did not rerun fresh/upgrade migrations; a frozen-candidate physical-schema rehearsal remains required, especially given conflicting historical results. **Subsystem:** migrations and migration admin. **Evidence:** Prompt 5 focused verification (22 maintenance/migration/readiness tests); `docs/execution/final-release-proof-2026-09-23.md`; `docs/execution/final-release-proof-2026-09-24.md`.
- **10.6 Settings — PARTIAL** — Settings ownership, onboarding/global registration, and the disabled-unmounted nav treatment are current-test clean. **Failure/blocker:** no isolated authenticated write/save/reload acceptance was performed; selected-site persistence remains open. **Subsystem:** site settings/admin. **Evidence:** Prompt 5 focused verification (19 settings/navigation-domain tests).
- **10.7 Users/security — PARTIAL** — Supported staff roles, server route guards, site grants, member-read scope, and identity-write refusal are current-test clean. **Failure/blocker:** live authenticated-session/passkey acceptance remains open. **Subsystem:** Users, Security Center, and `access-policy.ts`. **Evidence:** Prompt 5 focused verification (68 navigation/access/member tests); `docs/execution/admin-00-role-route-evidence.md`.

### Prompt 5 gate — PASS (bounded evidence and navigation check, 2026-09-28)

The requested Providers, Intelligence, Migration, Settings, and Users/security capability pass completed with 19 focused unit files / 207 tests and targeted ESLint over their mounted surfaces and guards. This is not configured-provider, browser, write/save, or frozen-candidate proof; the individual leaf states above retain those limits.

The one bounded navigation check reviewed every item in `ADMIN_SECTIONS` and the public-site link. Every enabled destination is represented by current Prompt 5 evidence or the named prior evidence: Providers/AI/Intelligence/Migration/Security/Capability Center by this Prompt 5 verification; Community, Commerce, Fulfillment, Social, Analytics by Prompt 5B; Media, Presentation, Discovery, Workflow, Releases, Audience, and Navigation by the preceding five-area pass; and Dashboard/Publishing/public-site routes by prior ADMIN-00 evidence. The 18 collection/global entries intentionally render as unavailable text (`aria-disabled`) rather than links because their views are not mounted; they therefore present no dead-end interaction. The navigation test also confirms unique destinations, the complete 16-section map, and authenticated route guards. No full workflow for previously-PASS areas was rerun for this check.

| Visible items reviewed | Destination/evidence status |
| --- | --- |
| Overview; Posts; Pages; Media Library; Menus & Navigation; Themes & Starters; Search & Indexing; URL Redirects; Quality Center; Editorial Workflow; Content Releases; Audience Center; Email Composer; View Public Site | Previously verified evidence: ADMIN-00 and the prior five-area stabilization pass. |
| Content Intelligence; Connections & Webhooks; AI Studio; Passkeys & Account Security; Capability Center; Legacy Migration | Current Prompt 5 focused tests and lint; all are mounted or registered destinations with role guards. |
| Social Distribution; Moderation Queue; Product Catalog; Operations & Ledger; POD & Fulfillment; Telemetry & Tests | Prompt 5B focused evidence (with their recorded capability limits). |
| All Content; Sections; Categories; Topics; Tags; Assets; Podcasts; Page Layouts; Subscribers; Forums; Discussions; Products; Staff Users; Authors; Community Members; General Settings; Sites; Brands | Explicitly unavailable, `aria-disabled` text only; no clickable destination and no dead-end interaction. |

## 11. Release proof

- **11.1 Frozen candidate and clean lifecycle — BLOCKED** — A clean SHA must pass the agreed migration, boot, workflow, and restore gates. **Failure/blocker:** no frozen candidate; current tree is dirty. Historical documents conflict: root `PROJECT_STATE.md` says candidate `3bccfc019b81fef024b0b455db037997cf4105ae` was beta-ready, while `docs/PROJECT_STATE.md` records a broken/partial final gate and schema mismatch. **Subsystem:** release verification. **Evidence:** `docs/stabilization/EVIDENCE_INDEX.md`; both `final-release-proof` reports.
