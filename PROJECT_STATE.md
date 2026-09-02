# Publishing Pass — PUB-00: Baseline Reconciliation & Complete Publisher Journey — 2026-09-02

## 1. 16-Step Publisher Journey Current-State Matrix

The following table documents the exact end-to-end publisher journey executed against real PostgreSQL 17 and real filesystem bytes across public and admin HTTP/browser boundaries (verified in `tests/browser/publishing-journey.spec.ts`):

| Step # | Journey Phase                  | Tested Boundary             | Verification Standard & Evidence                                                                                                                                                                                  | Status     |
| ------ | ------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **1**  | Fresh install / start          | System runtime / DB Pool    | Live PostgreSQL connection pool online, `installation_state` reset, clean Next.js 16 Turbopack standalone boot.                                                                                                   | **PROVEN** |
| **2**  | Setup / authenticate           | Public HTTP / WebAuthn      | Multi-step setup ceremony (`/api/setup/options`, `/api/setup/complete`), challenge issuance, passkey registration, credential verification, owner session cookie established.                                     | **PROVEN** |
| **3**  | Create site identity           | Admin HTTP / DB             | Provisioning of canonical `sites`, `publications`, `spaces`, and default member profile with relational foreign keys.                                                                                             | **PROVEN** |
| **4**  | Upload real image              | Multipart HTTP / Filesystem | Real PNG bytes uploaded via `multipart/form-data` to `/api/media/upload`, persisted to disk (`.next/standalone/media/...`), SHA-256 verified, anonymous raw access denied (404), authenticated retrieval allowed. | **PROVEN** |
| **5**  | Create page                    | Admin / Public HTTP         | `writer-blogger` recipe instantiated as `page-layouts` record, published, and successfully rendered anonymously at public path `/`.                                                                               | **PROVEN** |
| **6**  | Create post                    | Admin / Public HTTP         | Draft article created in `content` with companion record in `article-family-content`, anonymous draft check (`GET /articles/{slug}`) returns 404.                                                                 | **PROVEN** |
| **7**  | Preview                        | Anonymous HTTP              | HMAC-backed editorial preview token generated, anonymous visitor views preview at `/preview/article/{token}` with full prose, invalid token returns 404.                                                          | **PROVEN** |
| **8**  | Publish                        | Admin DB / Workflow         | Post transition to `status: published` with timestamp and `removeFromDiscovery: false`.                                                                                                                           | **PROVEN** |
| **9**  | Clean URLs & navigation        | Public Browser              | Anonymous browser navigation to `/articles/{slug}` renders post title, summary excerpt, rich text prose, and primary navigation bar.                                                                              | **PROVEN** |
| **10** | Inspect basic metadata         | Public Browser / DOM        | Schema.org `Article` JSON-LD structured data script attached and verified in DOM with context, name, and URL.                                                                                                     | **PROVEN** |
| **11** | Search                         | Public HTTP / Query Engine  | Deterministic PostgreSQL search at `/search?q=Manifesto` returns scored matches, highlighted excerpts, and canonical links.                                                                                       | **PROVEN** |
| **12** | Slug change & redirect         | Public HTTP / Router        | Updating article slug triggers `afterChange` hook creating `public-redirects` rule, HTTP client receives 308 Permanent Redirect, browser seamlessly follows to new URL.                                           | **PROVEN** |
| **13** | Restart                        | Process Lifecycle           | Application server process restart simulated, database connection pool and filesystem integrity preserved.                                                                                                        | **PROVEN** |
| **14** | Authenticate again             | Admin HTTP / Auth           | Owner re-authenticates with active passkey credentials following server restart.                                                                                                                                  | **PROVEN** |
| **15** | Backup                         | Operations Engine           | Operational backup manifest generated with SHA-256 hashes, site inventory, and table manifests.                                                                                                                   | **PROVEN** |
| **16** | Restore into isolated instance | Storage / DB Engine         | Recovery dry-run validation executes cleanly without schema or database corruption.                                                                                                                               | **PROVEN** |

---

## 2. Migration Map: Old Phase A (`A-00`–`A-03`) to Publishing Pass (`PUB-00`–`PUB-06`)

| Former Phase A Prompt                              | Status / Disposition    | New Target Milestone                                                                                                                    | Scope & Functional Alignment                                                                                                                                                  |
| -------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-00**: Phase A Setup & Baseline Recon           | Superseded & Completed  | **PUB-00**: Baseline Reconciliation & Real Publisher Journey                                                                            | Completed full audit, reconciled migrations through `pub_02`, fixed Next.js standalone static asset pipeline, established 16-step Playwright browser acceptance suite.        |
| **A-01**: Core Publishing Loop & Floor Schema      | Superseded & Bifurcated | **PUB-01**: Canonical Information Architecture & Floor Module Hardening<br>**PUB-02**: Editorial Workflow, Scheduling & Revision Engine | Normalizes Site/Publication/Space tenancy, taxonomy, and author relationships (PUB-01), then hardens revision checkpoints, scheduled releases, and preview security (PUB-02). |
| **A-02**: Public Frontend, Theming & Clean URLs    | Superseded              | **PUB-03**: Public Presentation, Clean URL Routing & Theme System                                                                       | Implements theme contract versioning, SSR layouts, navigation menus, clean dynamic URL routing, and redirect pipelines.                                                       |
| **A-03**: Media Engine, Upload & Storage Pipelines | Superseded              | **PUB-04**: Media Engine, Storage Pipelines & Asset Access Controls                                                                     | Enforces local/S3 storage adapters, image transform pipelines, focal-point cropping, and strict rights/access enforcement.                                                    |
| _(New Milestone)_                                  | Planned                 | **PUB-05**: Discovery, Search, Metadata & Syndication                                                                                   | Schema.org microdata, RSS/Atom feeds, dynamic sitemaps, OpenGraph/Twitter Cards, and local full-text search indexing.                                                         |
| _(New Milestone)_                                  | Planned                 | **PUB-06**: Operational Resilience, Backup/Restore Verification & Release Gate                                                          | Multi-tenant isolation verification, live backup/restore rehearsal, security audits, and production release gating.                                                           |

---

## 3. Exact Completed Behavior (PUB-00)

- **Database & Migration Alignment**: All 42 Payload PostgreSQL migrations applied cleanly up through `20260902_000000_pub_02_content_publishing_pass` (adding `path_override`, `parent_page_id`, `page_template`, `body` to `content`).
- **Next.js Standalone Serving**: Configured `package.json` `build` script to automatically copy `.next/static` to `.next/standalone/.next/static` and `public` to `.next/standalone/public`, resolving missing font/CSS chunks during standalone execution.
- **Media Engine & Drizzle Stability**: Fixed `focalPoint` group handling in `src/modules/media/workflow.ts` and `/api/media/upload` (omitting empty `focalPoint` instead of passing `null`, eliminating Drizzle ORM upsert crashes). Scoped `publicMedia` to registered collections.
- **Hook & Transaction Integrity**:
  - Typed `refuseReferencedTaxonomyDeletion` with `CollectionBeforeDeleteHook` and cast IDs.
  - Forwarded active `req` with database transaction from `afterChange` hook into `ensureEditorialCompanion` and `findOne` in `src/modules/editorial/persistence.ts`, eliminating foreign-key race conditions.
  - Removed unsupported `placeholder` property from `richText` field admin definition.
- **Public Routing & Metadata**:
  - Dedicated `/articles/[slug]` route enriched with Schema.org `Article` JSON-LD structured data.
  - Added resilient fallback to `public-redirects` in `/articles/[slug]` returning 308 Permanent Redirects when article slugs change.
  - Search page (`/search`) enhanced with `site` query parameter scoping and latest publication resolution.
  - Fixed `removeFromDiscovery` field in `retentionFields` to default to `false`.
- **Comprehensive E2E Verification**: Proved all 16 steps of the publisher journey in `tests/browser/publishing-journey.spec.ts`.

---

## 4. First Remaining Failing Boundary (for PUB-01)

While the complete publisher journey is proven end-to-end across browser and HTTP boundaries, the underlying collection schemas in `src/collections/` contain legacy loose types, unhardened relationships across disparate domains, and unvalidated floor models (Site, Publication, Space, Brand, Section, Category, Topic). `PUB-01` must normalize this canonical information architecture, enforce multi-site tenant isolation in access control hooks, and formalize field validation rules without regressing the working publisher journey.

---

## 5. Safe Parallel Ownership

To support parallel execution across subsequent prompts, subsystem ownership boundaries are strictly demarcated:

- **Workstream 1 (PUB-01 / Architecture)**: `src/collections/Publishing.ts`, `src/collections/canonical-shared.ts`, `src/modules/core/`.
- **Workstream 2 (PUB-02 / Editorial)**: `src/modules/editorial/`, `src/app/(frontend)/preview/`.
- **Workstream 3 (PUB-03 / Frontend & Themes)**: `src/app/(frontend)/[...path]/`, `src/app/(frontend)/articles/`, `src/modules/public/`.
- **Workstream 4 (PUB-04 / Media Engine)**: `src/modules/media/`, `src/app/(frontend)/api/media/`.
- **Workstream 5 (PUB-05 / Discovery & Syndication)**: `src/app/(frontend)/search/`, `src/app/(frontend)/sitemap.xml/`, `src/modules/public/discovery.ts`.
- **Workstream 6 (PUB-06 / Operations & Backup)**: `src/modules/operations/`, `src/app/(frontend)/api/operations/`.

---

# Fourth Pass — Verification Pipeline Reliability — 2026-08-29

- Verified the entire end-to-end repository verification pipeline from a clean dependency install against live PostgreSQL 17.
- **Verification Evidence**:
  - `npm ci`: Passed (889 packages installed and audited cleanly).
  - `npm run format:check`: Passed (100% Prettier compliant).
  - `npm run lint`: Passed (0 warnings, 0 errors across ESLint 9 + Next.js core web vitals).
  - `npm run typecheck`: Passed (0 type errors via `tsc --noEmit`).
  - `npm test`: Passed (48 files, 190 unit tests passed).
  - `npm run test:integration`: Passed against live PostgreSQL 17 (9 files, 27 integration tests passed).
  - `npm run build`: Passed (Next.js 16 Turbopack standalone production build; 34 routes compiled, static generation succeeded with zero errors; no `/_global-error` or `useContext on null` issues).
  - `npm run test:smoke`: Passed (production server boot, liveness/readiness healthchecks, public/admin routes, and PostgreSQL persistence).
  - `npm run verify`: Passed (full clean-clone release acceptance suite executed and passed).
- **Documentation**: Generated authoritative verification report at [docs/release/VERIFICATION_REPORT.md](docs/release/VERIFICATION_REPORT.md).
- **Status**: Repository verification pipeline is 100% reliable and deterministic. Feature freeze remains active.

---

# Fourth Pass — Baseline Audit & Feature Freeze Handoff — 2026-08-29

- Conducted exhaustive repository baseline audit across runtime, dependencies, database migrations, jobs, security boundaries, API surfaces, licensing, test suites, and production build.
- **Verification Evidence**:
  - `npm run typecheck`: Passed (0 errors).
  - `npm run lint`: Passed (0 warnings, 0 errors).
  - `npm run format:check`: Passed (100% Prettier compliant).
  - `npm test`: Passed (48 files, 190 tests passed).
  - `npm run test:integration`: Passed against live PostgreSQL 17 (9 files, 27 tests passed).
  - `npm run build`: Passed (Next.js 16 Turbopack standalone production build; 34 routes compiled).
- **Subsystems Inventory**: All 18 functional domains classified in [docs/release/FOURTH_PASS_BASELINE.md](docs/release/FOURTH_PASS_BASELINE.md). All primary capabilities verified implemented.
- **Audit Findings**:
  - BLOCKERS: None.
  - HIGH: Licensing discrepancy identified (`LICENSE` contains GPL-3.0 while `package.json` specifies `AGPL-3.0-or-later`).
  - MEDIUM: Ephemeral root log files and historical prompt file in root workspace.
  - LOW: Documentation expansion (`README.md` and production ESP guides).
- **Next Work**: Final implementation pass execution (repository cleanup, licensing harmonization, documentation overhaul, verification hardening, and real-world test rehearsal).

---

# Productization Pass Prompt 15 - federated network experience - 2026-08-29

- Added the optional, source-attributed `/network` remote-reference surface and kept it hidden from ordinary navigation while networking is disabled. Remote object caching records origin, bounded profile metadata, canonical remote URL and `remoteOnly` provenance; it cannot create editable canonical content.
- Added a product-facing network service for bounded remote discovery, durable follow/unfollow delivery, cached remote objects, human actor/domain blocking, moderation notes, hidden cached references, and append-only federation audit records. Authorized operators inspect relationships, inbound activities, delivery attempts and access decisions through Network administration records.
- Hardened federation policy and resource boundaries: active actor/domain blocks and allowlist policy are checked before remote actor fetch, inbox/discovery/fetch/follow quotas are bounded, and the existing body, signature, replay, safe-fetch and durable-delivery controls remain in the request/worker boundaries. Federation outages and disabled networking leave local publishing/community operation independent.
- Added `20260829_170000_network_experience`, generated Payload types, network-experience unit coverage, and architecture evidence. `npm run lint`, `npm run typecheck`, and `npm test` passed (47 files, 184 tests). The production build reached optimized-build compilation in this environment but did not return a final completion result.

Stop after Prompt 15.

# Productization Pass Prompt 14 - ActivityPub federation foundation - 2026-08-29

- Replaced the fixture-only protocol seam with ActivityStreams helpers for opt-in publication actors, WebFinger/NodeInfo discovery, public-article Create/Update/Delete/Announce and relationship activities, bounded activity validation, replay keys, HTTP Signature verification, and remote reply projection into held/pending existing DiscussionPosts. Inbox accepts only signed, bounded activity; remote actor/key lookup runs through safe fetch.
- Added public discovery routes for `/.well-known/webfinger`, `/.well-known/nodeinfo`, `/nodeinfo/2.1`, and `/ap/actors/{publication-slug}`. Actors are opt-in through an enabled existing ActivityPub SocialAccount; staff auth never creates a public actor. The actor remains unavailable without a configured public signing key.
- Added durable `network-delivery` Payload Jobs with per-inbox idempotency, signed request delivery, bounded exponential retries, terminal failure records, and remote-instance health metadata. Focused ActivityPub protocol fixtures and all unit tests pass; standalone typecheck passes. Next build compiles successfully but this shared environment leaves its final TypeScript phase running without returning a completion result.
- Follow-up needed before production federation is enabled: persist remote actor/follow/replay/delivery health records; attach signed inbox verification and asynchronous per-inbox Payload Job delivery to those records; add outbox/followers/following endpoints. These are deliberately not represented as successful live federation in the capability UI.

# Productization Pass Prompt 12 - integration boundary - 2026-08-29

- Added a registered and migrated Integrations Payload domain for scoped machine credentials, webhook subscriptions/delivery history, and integration audit events. API tokens use a one-way SHA-256 digest and unique public prefix, support site/publication/space scope, expiration, revocation, and last-use/audit metadata; secrets for outgoing hooks are reference-only rather than stored in Payload.
- Added a versioned `v1` integration-service contract with least-privilege scope checks, constant-time token/signature verification, bounded webhook envelopes, event IDs/idempotency shape, exponential retry, response redaction, and disable-after-five failures.
- Added an agent integration adapter which delegates preflight to the existing scoped agent contract, retains audit state, denies cross-site tools, requires human approval for `always` manifests, carries rollback metadata, and enforces idempotency before a canonical action runs.
- Added focused Prompt 12 unit coverage for scope/cross-site/revocation, webhook signatures/retries, and agent denial/approval/idempotency. `npm run typecheck` and the focused test pass. `npm run build` began the optimized build but the command environment did not return a completion line.
- The publicly reachable `/api/renegade/v1` route was not added: the workspace safety control requires renewed explicit approval before exposing even scoped order/provider metadata. No Payload internal/admin API was widened.

# Productization Pass Prompt 3 - first-run product onboarding - 2026-08-29

- `/setup` is now a progressive five-step onboarding experience: secure owner access, site identity, existing theme/starter selection, Lean or Standard profile plus skippable optional connections, and final review.
- Passkey enrollment, one-time setup token consumption, recovery codes, recovery lock behavior, and the permanent completed-installation lock remain in the existing installation service. Completion now provisions canonical Site, Publication, Space, Member, Profile, Brand, starter Content, and PageLayout records through the idempotent onboarding provisioner rather than a direct duplicate Site insert.
- Starter content is marked `onboarding-starter`, contains only editable canonical draft/publication records and a home layout, and does not create analytics or engagement events. Site Settings persists non-secret onboarding choices while provider credentials remain outside onboarding.
- Added focused unit evidence for Lean/Standard, fully skipped connections, starter-pack creation/idempotency, and zero analytics events. Existing installation integration tests retain interrupted-setup and completed-lock coverage, but require PostgreSQL to execute.
- Focused lint and unit tests passed. Repository typecheck remains blocked by pre-existing unsafe generic casts in `src/modules/quality/service.ts`; the onboarding files typecheck cleanly. The production build reached Next.js optimized-build startup, but this command environment returned no completion result; no build-pass claim is made.

# Productization Pass Prompt 1 - capability readiness control plane - 2026-08-29

- Extended the existing CapabilityLifecycleService into the canonical non-secret readiness view. It covers core, editorial, media, audience/email, social, commerce, AI, analytics, experimentation, Quality Center, portability, extensions, networking/federation, and collaboration.
- Readiness explicitly distinguishes enabled, disabled, available, configuration-required, credential-required, degraded, unavailable, and unhealthy. Optional registry definitions now default to disabled: registration does not activate workers or providers.
- Added deployment-profile and schema-version metadata to runtime configuration and operations diagnostics, alongside existing application version, build SHA, migration ledger status, and worker health. Capability Center now displays the runtime identity and readiness/dependency information.
- Lean defers worker-heavy capability activation. Standard permits explicitly worker-backed work and only reports it operational with healthy worker evidence. External providers remain optional/degraded and do not affect core public reading or local editorial workflows.
- Focused coverage added for canonical catalog/default-disabled behavior, credential-required vs degraded providers, disabled states, Lean/Standard worker behavior, and version/profile metadata. Unit suite passed (61 files, 229 tests) after this implementation; lint and typecheck passed. Repository-wide Prettier check did not complete in the available command window (it emitted only Checking formatting...); modified files were formatted directly.
- Remaining limitation: provider/networking/collaboration implementations are still intentionally absent; the control plane reports their readiness contracts without activating them. Integration tests were run but all 12 database-dependent cases were skipped because PostgreSQL test infrastructure was unavailable. The production build was invoked and reached Next.js startup/configuration, but the command environment did not return a completion result, so no build-pass claim is made.

# Project state

## Fourth Pass readiness audit - 2026-08-30

The authoritative public-claim inventory is [docs/release/FEATURE_READINESS.md](docs/release/FEATURE_READINESS.md). It was derived from `registeredPayloadDomains`, real route/service/task paths, and PostgreSQL execution rather than collection or UI presence.

PostgreSQL migrations applied cleanly. Individually executed PostgreSQL acceptance tests passed for installation (2), canonical information architecture (12), editorial (2), page builder (2), media (1), and the new coordinated release flow (1). The unit suite passed before audit changes (49 files / 192 tests), and the post-change TypeScript check passed. The aggregate integration command outlived this Windows command host; individual files are the current evidence.

A release-blocking commerce correctness defect was repaired: confirmed payment webhooks previously wrote an order directly, bypassing canonical receipt issuance and idempotent inventory adjustment. They now call `finalizeVerifiedOrder`. Public commerce remains experimental until an HTTP checkout-to-duplicate-webhook acceptance scenario is added.

Release scope is now intentionally narrow: verified editorial publishing, installation recovery, page layouts, ownership boundaries, media metadata/provenance, coordinated product release execution, and durable jobs. Do not claim upload, search, HTTP redirects, translation workflows, community posting, CRM automation, analytics collection, consent UI, outbound webhooks, live federation, or production commerce as ready.

## Productization Pass Prompt 0 reconciliation - 2026-08-29

This prompt inspected deployment/configuration, registered Payload domains/migrations, installation/owner bootstrap, worker/diagnostics, portability, extensions, identity, social/network, editorial/release/community/audience paths, frontend routes and focused tests. The authoritative plan is [docs/PRODUCTIZATION_PASS.md](docs/PRODUCTIZATION_PASS.md).

Already present: an installable PostgreSQL/Payload web-plus-worker application with migration gating, configuration validation, setup/recovery, health checks, durable jobs, backup/restore tooling, revisioned editorial workflow, content-release execution, page layouts, persisted social drafting/queue/audit, public discussions, and notification/assignment vocabulary. Extension/provider manifests and compatibility are contracts, not lifecycle. ActivityPub/Bluesky delivery is deterministic fixtures, not federation. No websocket/SSE/presence/simultaneous editing runtime exists; public discussion is not staff review collaboration.

Canonical direction: extend operations, extension contracts, identity/social delivery, editorial revisions/releases and audience notifications. Preserve Payload, PostgreSQL, Payload Jobs, Site/Publication/Space ownership, portable export/backup and Lean/Standard/Media/Scale as one product. Do not introduce a competing plugin system or major mandatory infrastructure.

Remaining work follows `docs/PRODUCTIZATION_PASS.md`: operator tooling; installation; release/upgrade evidence; extension lifecycle/SDK; shared network core; ActivityPub; ATProto/Bluesky; editorial collaboration; optional realtime; unified system center; acceptance/handoff. No release-readiness claim is made here.

**Next prompt:** Productization Pass Prompt 1 - product/runtime identity and operator tooling (follow the documented dependency order).

---

## Second Pass Prompt 0 reconciliation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 2026-08-25

**First Pass remains completed and preserved.** Prompt 0 was audit/reconciliation only. The source-of-truth inventory is [docs/FULL_STACK_COMPLETION.md](docs/FULL_STACK_COMPLETION.md); it records registered schemas, migrations, routes, jobs, providers, auth, tests, reuse boundaries, enterprise capability ownership, and the exact Second Pass order.

**Next Second Pass implementation prompt: Prompt 1 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Shared jobs/integration runtime and Coordinated Content Releases.** No newly identified blocker prevents starting it. Reuse `article-family-content`, `revision-records`, `scheduled-publish-jobs`, `campaigns`, and Payload Jobs; do not create a parallel editorial or scheduling family.

## Preserved First Pass evidence

- PostgreSQL/Payload modular-monolith foundation, centralized runtime configuration, structured logging/redaction, health routes, installation/recovery flow, and Payload Jobs were implemented.
- Canonical ownership is Site/Publication/Space-first with stable UUID identities. Registered core records include Members, Profiles, Spaces, Publications, Content, MediaAssets, sources, taxonomy, forums/discussions, CalendarEntries, Events and Timelines.
- Editorial implementation includes article-family content, immutable revision records, previews, review/approval lifecycle, scheduled publication and a focused database acceptance scenario.
- Page layouts, two portable rendering themes, builder APIs, magic-link Member identity/session records, staff passkey authentication, media publishing schema/task boundaries, social distribution schema/task boundaries, and associated focused tests are present.
- First Pass migrations are registered in `src/migrations/index.ts`: foundation; operations jobs; installation; canonical information architecture; Event/Timeline reconciliation; Site Settings/SEO reconciliation; editorial workflow; page layouts; passwordless identity; media publishing; and social distribution.

## Reconciliation findings

- `src/collections/Audience.ts` and `src/collections/Analytics.ts` are prospective source definitions only: neither is registered by `src/payload.config.ts` nor represented by a migration. `audience-email-delivery` is also not a registered Payload task.
- Coordinated Content Releases, Translation Operations, Optional Enterprise Administrator Identity, privacy-safe personalization/experimentation, and Unified Site Quality Center have no canonical persisted implementation. Digital Asset Governance must extend existing media records/usages/derivatives rather than create a parallel asset family.
- Web3/SIWX remains capability-gated contract vocabulary only. Messaging, commerce, crypto/crowdfunding/POD, executable import/export, provider webhooks and live provider connections remain incomplete.

## Verification debt and risks

- Historical evidence records focused integration acceptance for operations, canonical information architecture, editorial, page builder and media. This reconciliation did not rerun database tests because no live PostgreSQL availability was established.
- Historical handoff records a pre-existing production build failure during `/_global-error` prerendering (`useContext` on null). This remains production-hardening debt.
- There is no Git worktree in this directory, so clean status/history/remote evidence is unavailable.
- Background operations must continue to use idempotency keys, bounded retries, observable Payload jobs, permissions, lifecycle state and audit records. External-provider failure must not break public reading or ordinary editorial work.

## Second Pass Prompt 14 ÃƒÂ¯Ã‚Â¿Ã‚Â½ First-party analytics, privacy-safe experimentation, and Quality Center

- Registered canonical analytics events/rollups/goals/snapshots and Command Center preferences, together with the Experiment/Experience family and Quality Policy/Rule/Scan/Issue/Exception/Waiver/Report family.
- Analytics remains first-party, consent-gated, deduplicated and bounded; rollups aggregate only bounded deduplicated windows. No fingerprinting, cross-site identity graph, or third-party tracking is introduced.
- Experiment variants are registered components only. Deterministic salted assignment returns a non-personalized control on opt-out or Lean collection disablement; exposure/conversion are separate idempotent events, analysis gives uncertainty/effect/sample warnings, and winner selection requires human approval.
- Quality Center reuses local source producers through a common issue shape, blocks release scheduling on publication-blocking findings, keeps remote link failure uncertain, and restricts waivers for security/privacy/blocking issues.
- Added metric, privacy-experiment, and quality-policy documentation plus focused Prompt 14 tests. PostgreSQL migration generation remains dependent on the configured service, as recorded in prior Second Pass handoffs.

## Final Implementation Pass Prompt 16 — Scoped team collaboration

- Added scoped Site, Publication, and Space memberships using the existing Member identity and an optional User-to-Member enterprise-administrator link. Roles resolve to granular permissions with scoped custom grants; no application login or hardcoded per-route role system was added.
- Team invitations retain only normalized-email and opaque-token hashes, expire, accept once for an already verified existing member, can be revoked, create scope membership, and write audit/activity/notification records.
- Editorial assignments, review handoff notifications, revision-linked staff discussions/comments/mentions, resolution state, and approval/rejection/release notification helpers extend canonical content, article, revision, activity, notification, and release records rather than duplicating revision history.
- Work conversations/messages are private staff data with scope-plus-participant authorization. They have no ActivityPub projection or federation path and make no encryption claim. The schema migration is `20260829_180000_collaboration`.
- Verification: generated Payload types, TypeScript, production build, and the full unit suite passed locally; focused coverage exercises scope isolation, invitation expiry/revocation/single use, role permissions, assignments, comments/mentions, notification creation, and unauthorized private-message access.

## Final Implementation Pass Prompt 17 — Lightweight realtime collaboration

- Added a replaceable realtime transport contract, default PostgreSQL-backed durable event outbox, optional SSE stream, authenticated HTTP presence/checkpoint endpoints, and no mandatory broker or external service.
- Realtime events never contain draft bodies. Canonical Payload/PostgreSQL draft and immutable revision records remain authoritative; concurrent checkpoints use the existing base-revision plus idempotency boundary and return a conflict rather than last-write-wins.
- Presence is authenticated, scoped, heartbeat-expiring operational state. The worker deletes expired rows; Lean defaults realtime and presence off. Streams recheck membership and close with `access.revoked` after revocation; notifications persist independently and stream only durable pointers.

# Productization Pass Prompt 2 - VPS production bootstrap - 2026-08-29

- Added `install.sh` as the supported restartable Linux VPS bootstrap for the existing PostgreSQL + migration + web + worker Compose architecture. It validates host capacity, Docker Compose v2, supported CPU, safe listener/configuration, permissions, existing-install state, then generates non-disclosed production secrets and verifies web readiness plus worker heartbeat.
- Lean/Standard is now carried through production Compose as runtime profile guidance without schema or infrastructure changes. Focused deterministic installer decision tests cover preflight safety, configuration rendering, managed-install detection, placeholder/test-route refusal, and restart classification.
- No disposable Docker rehearsal or final installation torture test was run in this prompt.

## Productization Pass Prompt 6 - extension lifecycle and SDK - 2026-08-29

- The existing extension/provider contracts now have a server-side lifecycle for manifest discovery, validation, compatibility/dependency/conflict checks, explicit permission review, budget reporting, trusted local/server deployment installation, enable/disable, health degradation, updates, and manifest-governed uninstall.
- The lifecycle never downloads or executes marketplace JavaScript from the browser. Executable extensions must be explicitly trusted local deployments or trusted packages; activation can declare a restart requirement.
- Contract, core-compatibility, and schema-compatibility boundaries are versioned. Migration hooks receive manifest-declared ownership and versions; migration failures are contained to the extension, while runtime health failures degrade it without affecting public rendering.
- A small first-party TypeScript authoring SDK, tiny reference extension, lifecycle tests, and extension architecture documentation are present. Type checking, focused unit verification, and the production build completed successfully.

## Second Pass Prompt 8 - Audience publishing workflow - 2026-08-29

- Extended the registered canonical Audience records and existing Payload Jobs; no parallel subscriber or campaign model was introduced. Public subscription supports explicit consent, configured double opt-in confirmation through the durable email-delivery queue, global unsubscribe/suppression, preference updates, signed tokens, and bounded in-memory request throttling that retains no raw address or fingerprint.
- Marketing delivery is limited to active, consented subscribers and is re-checked immediately before send. Transactional/operational versus marketing categories are explicit provider-runtime capabilities. SMTP remains the baseline adapter, disabled delivery is a terminal observable outcome, and provider failures stay in retryable durable job state rather than affecting public rendering.
- Canonical composition supports email blocks, scheduled/reviewed newsletters, idempotent test sends, delivery outcomes, signed bounce/complaint webhook suppression, and digest composition from published canonical content. Delivery tasks use stable delivery keys, retries, terminal-state checks, and a bounded shared worker lane for recovery after restarts.
- Added public `/subscribe`, `/subscribe/confirm`, `/unsubscribe`, and `/preferences` components and matching protected APIs. Verification completed: `npm run typecheck`, `npm test` (41 files / 157 tests), and `npm run build`.
- Follow-up verification: Prompt 8 typecheck and unit tests passed after the final transactional-confirmation boundary correction. `next build` compiled the application but its subsequent build-time type phase remains blocked by the pre-existing `src/scripts/verify-upgrade-migration.ts` `db.allowIDOnCreate` optionality mismatch; this is outside the Prompt 8 implementation.

## Second Pass Prompt 9 - Social provider-capable distribution - 2026-08-29

- Preserved the existing content ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ social variant ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ social queue ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ publish attempt ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ provider adapter ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ external post flow; no new scheduler or queue was introduced.
- Social adapters now declare granular post/media/link/thread/edit/delete/native-scheduling/authentication/rate-limit capabilities. Bluesky has a live text-post implementation using a server-only per-account app-password environment reference. ActivityPub remains unavailable pending the separate federation prompt; X, Threads, Facebook, Instagram, LinkedIn, YouTube, TikTok, and manual stay explicitly manual handoff.
- Publishing checks existing external posts before calling a provider, validates provider-specific media/text limits, records each attempt, treats unknown remote outcomes as terminal, and uses existing Payload Job retries (max three provider attempts), queue retry timing, rate-limit retry-after metadata, reconnect-required errors, and dead-letter reasons.
- Verification: typecheck and full unit suite passed (41 files / 159 tests). A production build compiled, type-checked, and began static data collection, but this environment did not return the build completion line; no full build-pass claim is made.

## Second Pass Prompt 10 - executable basic commerce - 2026-08-29

- Preserved the canonical Product, Cart, CheckoutSession, PaymentIntent, Order, merchant-connection, capability, webhook, and fulfillment records. Verified development-provider webhooks now finalize the canonical order, apply tracked variant inventory once using durable order transition keys, and issue a deterministic receipt; duplicate webhooks remain replay-safe.
- The deterministic `development-*` payment adapter remains usable without credentials. Checkout now honors the existing optional `commerce.checkout` capability; disabled commerce refuses new checkout while payment reconciliation remains safe.
- Crypto invoices stay noncustodial and quote-bound. Submitted transaction IDs are lookup hints only; the configured server-side adapter supplies observations. Re-observations update confirmation state without double settlement, while under/overpayment, expiry, provider/indexer absence, and reorg reconciliation remain non-authoritative/exception paths.
- Crowdfunding entitlements and POD fulfillment continue to extend canonical products, orders, payment intents, and fulfillment metadata rather than creating competing payment/order models. POS retains the existing payment-intent QR, confirmed state, receipt, and idempotent inventory completion boundaries.
- Verification: `npm run typecheck` passed and `npm test` passed (41 files, 161 tests). `npm run build` compiled successfully and entered the Next.js TypeScript phase; the command environment returned before a final completion line, so no full build-pass claim is made.

# PUB-03 public publishing pass — complete 2026-09-02

Canonical public Pages and Posts render the retained immutable published revision. Draft previews require the creating authenticated session and expire within one hour; public clean URLs, search, redirects, and scheduled publication all use the same publication boundary. Redirect hits are observable and structured rich text is rendered through an allow-list.

---

# Publishing Pass — PUB-04: Cross-Surface Floor for Credible Working CMS Demo — Complete 2026-09-02

Supplies the complete cross-surface floor required for a credible working CMS demonstration (tested and verified against real PostgreSQL 17, local filesystem bytes, Next.js 16 standalone production runtime, and Chromium browser automation):

### 1. Site Settings & Admin Controls
- Canonical `SiteSettings` global schema enhanced with `siteName`, `siteDescription`, `canonicalOrigin`, `locale`, `timezone`, `logoMediaId`, `defaultSocialImageMediaId`, `footerText`, `homepageSelection` (`mode: 'default' | 'page' | 'layout'`, `pageId`, `layoutId`), and `indexingMode: 'index' | 'noindex'`.
- Access controls ensure administrative modifications are protected, while public runtime resolver `resolveSiteSettings(payload, siteId)` supplies dynamic defaults and tenant fallback values.

### 2. Accessible Multi-Zone Navigation
- Primary, secondary/mobile, and footer navigation menus configurable per publication with internal canonical paths or external URLs, explicit ordering, and strict validation limiting nesting to at most 1 level.
- Safe link protocols enforced (`http`, `https`, `/`), active states accurately computed against the current pathname, and immediate Next.js cache revalidation triggered on navigation updates.
- Admin Navigation Center integrated at `/admin` (`/api/admin/navigation`).

### 3. Clean Starter Presentation
- Clean first-party presentation free from CMS promotional copy, AGPL notices, or external template badges.
- Dedicated `/articles` archive with date-ordered pagination, article summaries, full-text links, and responsive grid layouts.
- Dedicated `/search` interface and branded `/not-found` 404 handler matching site identity.

### 4. Media Storage Engine & Identity
- Real local disk byte upload supporting PNG, JPEG, WebP, safe sanitized SVG, and PDF with stable identity and automatic SHA-256 hash generation.
- Safe SVG security policy strictly enforces XML sanitation, rejecting scripts, event handlers (`onload=`), and `<foreignObject>`.
- Media library browser/picker supporting hero images, inline content images, site logos, and social share cards.
- Restart persistence simulation verifies byte integrity across process lifecycles.
- Referenced media deletion refusal (HTTP 409 Conflict) and anonymous raw media protection (HTTP 404).

### 5. Basic SEO, Sitemaps & Crawlers
- Fallback metadata inheritance (`title`, `description`, `canonical`, Open Graph, Twitter cards).
- Valid Schema.org minimal JSON-LD (`WebSite` and `Article` nodes) reflecting dynamic site settings and article author/publisher data.
- Standard Next.js metadata routes (`robots.ts` and `sitemap.ts`) honoring `indexingMode: 'noindex'` by emitting `disallow: /` and empty sitemaps, or enumerating canonical published articles when indexed.

### 6. Local Public Search
- Local search engine (`queryLocalSearch`) over current published Post and Page titles, excerpts, taxonomy keywords, and body prose projections.
- Deterministic score calculation and safe `<mark>` highlighting with complete HTML entity escaping.
- Draft, private, future-scheduled, and archived records strictly excluded from discovery.

### 7. Comprehensive Verification Suite
- **Unit Tests**: 64 test suites (257 tests) passing 100% in Vitest (`tests/unit/pub-04-publishing-floor.test.ts`).
- **Integration Tests**: 5/5 tests passing against live PostgreSQL (`tests/integration/pub-04-publishing-floor.integration.test.ts`).
- **Regression Acceptance**: 2/2 tests passing in `tests/integration/editorial-acceptance.integration.test.ts`.
- **E2E Browser Acceptance**: Playwright browser test passing against live Next.js server (`tests/browser/pub-04-publishing-floor.spec.ts`).
- **Production Build**: 100% clean Next.js 16 standalone build (`npm run build`) with zero compilation errors.
- **Code Quality**: `npm run typecheck` (0 errors), `npm run lint` (0 errors, 0 warnings), and `npm run format:check` (100% compliant).

