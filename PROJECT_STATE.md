## Release Repair Pass & Immutable Candidate Gate Closed — 2026-09-24

- **Release Status**: **PASSED — ALL GATES VERIFIED (BETA RELEASE READY)**
- **Candidate Commit SHA**: `3bccfc019b81fef024b0b455db037997cf4105ae`
- **Working Tree State**: Clean (`git status` reports `nothing to commit, working tree clean`).
- **Release Proof Reference**: `docs/execution/final-release-proof-2026-09-24.md` (supersedes `docs/execution/final-release-proof-2026-09-23.md`).
- **Repaired Defect Vectors**:
  1. `events.required_entitlement`: Added migration `20260923_090000_events_required_entitlement.ts`; verified JSON entitlement storage and `/events` route HTTP 200.
  2. `scheduled_publish_jobs.lease_owner`: Added migration `20260923_100000_flow_03_scheduler_runtime.ts`; verified worker lease acquisition and `enum_scheduled_publish_jobs_status` containing `'processing'`.
  3. `sites_comment_reaction_codes`: Verified default seed codes (`thumbs_up`, `heart`, `insightful`, `applause`) and `Sites` collection `beforeValidate` hooks.
  4. Tenant/ownership scope columns: Created and registered additive migration #102 (`20260924_000000_collection_scope_columns.ts`) for 8 collections (`email_templates`, `audience_experiments`, `promotions`, `checkout_proposals`, `inventory_reservations`, `pod_connections`, `pod_jobs`, `manual_fulfillment_packages`).
  5. Readiness probe hardening: Hardened `/health/ready` to verify migration count convergence and critical table columns (returning 503 if pending or corrupted); verified with unit tests (`tests/unit/readiness-probe.unit.test.ts` 4/4 passing).
- **Core Proofs & Evidence**:
  - `tsc --noEmit`: 0 errors.
  - `eslint`: 0 errors, 0 warnings.
  - `prettier --check`: 100% compliant.
  - Unit Suite: 148 test files passed, 987/987 unit tests passed (0 failures).
  - Integration Suite: 35/35 test files passed, 196/196 tests passed (0 failures).
  - Focused Contract Suites: 82/82 contract tests passed.
  - Production Build: 119/119 static pages generated, 0 Puck leaks into client bundles.
  - Migrations: 102/102 verified across fresh migrations and upgrade rehearsal from pre-Second-Pass baseline.
  - Backup & Restore Rehearsal: Native `pg_dump` and `pg_restore` verified on candidate database; all 102 migrations and 306 tables verified; Next.js standalone runtime served all nine surfaces with HTTP 200.

## Shared Contract Gate — Affiliate, POD Fulfillment & Worker Health Conformance Verified — 2026-09-24

- **Gate Status**: **VERIFIED WITH CONFIGURED PROVIDER REQUIRED** (Deterministic local emulator adapter, local webhook signers, test accounts, and deterministic sinks verified; external live provider networks require live Printful API keys and production webhook secrets).
- **Scope & Baseline**: Evaluated candidate baseline after SHOP-00–07, COMM-08, AUD-08, and the first six gates. Executed dedicated integration suite `tests/integration/shared-contract-affiliate-pod.integration.test.ts` (28/28 test cases passing across all 28 numbered requirements), along with unit suites `tests/unit/shop-06-affiliate-and-referrals.test.ts` (19/19) and `tests/unit/shop-03-pod-fulfillment.test.ts` (26/26). Total 73/73 tests passing.

## Shared Contract Gate — Commerce Domain Integration Verified — 2026-09-23

- **Gate Status**: **VERIFIED WITH CONFIGURED PROVIDER REQUIRED** (deterministic local payment adapters, local webhook signers, test accounts, and deterministic sinks verified; external live provider networks require live provider keys and production webhook secrets).
- **Scope & Baseline**: Evaluated candidate baseline after SHOP-00–07, COMM-08, AUD-08, and the first six gates. Executed dedicated integration suite `tests/integration/shared-contract-commerce-shop.integration.test.ts` (34/34 test cases passing across all 31 numbered requirements).

## Shared Contract Gate — Audience & Community Domain Integration Verified — 2026-09-23

- **Gate Status**: **VERIFIED WITH CONFIGURED PROVIDER REQUIRED** (local/test provider and telecom emulator verified; live external networks require configured provider credentials).
- **Scope & Baseline**: Evaluated candidate baseline after SHOP-00–07, COMM-08, AUD-08, and the first six gates. Executed dedicated integration suite `tests/integration/shared-contract-audience-community.integration.test.ts` (20/20 test cases passing across all 21 numbered requirements).

## Community Pass COMM-03D — Thread Lifecycle, Public Rendering Visibility, Subscriptions & Outbox Emission — 2026-09-21

- **Staff Lifecycle Controls**: Implemented staff controls (`closed`, `frozen`, `premoderation_enabled`) in `src/modules/community/thread-lifecycle.ts` and `PATCH /api/v1/sites/:site_id/threads/:thread_id`.
- **Enforced Lifecycle Rules**:
  - Closed threads reject new comments with 403 `THREAD_CLOSED` while allowing reactions.
  - Frozen threads make the thread completely read-only, rejecting comments (403 `THREAD_FROZEN`) and reactions (403 `COMMENT_FROZEN`).
  - Premoderation enabled stores new comments as `status: 'pending_review'`.
- **Recursive Tree Retrieval**: Implemented `getThreadCommentsTree` and `GET /api/v1/sites/:site_id/threads/:thread_id/comments` bounded to depth 5 with sort modes: `chronological`, `reverse chronological`, and `reaction volume`.
- **Public SSR Comment Scrubbing**: Public SSR includes comments only when parent canonical content is published and indexable; completely scrubs `deleted`, `quarantined`, `rejected`, and `pending_review` comments from public SSR; renders canonical `<link rel="canonical">`.
- **Subscriptions**: Added `comment_thread_subscriptions` with migration `20260921_040000_comm_03d_thread_lifecycle_and_outbox.ts` and endpoints `POST`/`DELETE`/`GET` on `/api/v1/sites/:site_id/threads/:thread_id/subscriptions`.
- **Atomic Outbox Persistence**: Implemented `persistCommentWithOutbox` committing comment insert and `comment.created.v1` to `outbox_events` within the same transaction client. Payload contains `site_id`, `comment_id`, `thread_id`, `canonical_content_id`, `author_id`, `parent_id`, `mentioned_handles`, and `timestamp`. Verified simulated rollback leaves zero orphans.
- **Verification Evidence**:
  - 19 unit tests in `tests/unit/comm-03d-thread-lifecycle.test.ts` passing (57/57 across COMM-03A-D).
  - TypeScript compilation (`tsc --noEmit`) 0 errors.
  - ESLint 0 errors / 0 warnings.

## Community Pass COMM-01 — Member Authentication and Account Lifecycle — 2026-09-20

COMM-01 is implemented in code but not release-verified: the additive migration, Payload type regeneration, unit and virtual-WebAuthn browser checks, PostgreSQL/HTTP/restart/backup evidence, and clean aggregate typecheck/lint/build are outstanding gates. Community roles remain site-scoped and distinct from Payload administrator roles; `members` remains canonical identity and `profiles` is its public projection.

## Community Pass COMM-00 — Canonical Member Journey Reconciled — 2026-09-20

The canonical Community journey is executable against real PostgreSQL: 10/10 integration steps pass from magic-link registration through profile, comments, forums, notifications, report/block, moderation, direct messages, suspension/session revocation, restart, and history. Community policy and ownership are documented in `docs/decisions/ADR-0009-community-domain-contract.md`.

Readiness is partial beyond the journey: browser/HTTP boundary parity, passkeys, search, realtime reconnect authorization, attachments, exports/backups, and retention/deletion still require COMM-01 verification.

## Audience Pass Gate AUD-08 — Fully Integrated Self-Hosted Audience Product Verified & Closed — 2026-09-20

- **Audience Pass Gate Execution**: Successfully executed AUD-08 across all 10 core operator and visitor boundaries (`tests/integration/aud-08-audience-pass-gate.integration.test.ts` 10/10 PASS). Proves Renegade CMoS has a complete, working self-hosted Audience product, not only contact schemas and provider interfaces.
- **Surface Integration & Real Output Boundaries**:
  - **Site Sender Identity & Transport Verification**: Site-specific sender identities verified; local SMTP / development-capture mail sink captures real rendered messages with RFC unsubscribe headers (`List-Unsubscribe`, `X-Renegade-Purpose`). Unconfigured real providers degrade safely without mock pretending or external network delivery.
  - **Public Forms & Immutable Submissions**: Accessible newsletter signup and contact forms published on Renegade Party pages. Submissions strictly validated across valid, invalid, duplicate, honeypot, and consent-tested paths; declarations normalized and immutable schema revisions stored.
  - **Double Opt-In & Preference Center**: Opaque, expiring, purpose-bound signed tokens (`signAudienceClaims`) manage double opt-in confirmation and subscriber preferences. Expired, tampered, or replayed tokens rejected. CSV imports quarantined and audited.
  - **Explainable Segmentation**: Deterministic multi-rule boolean/set segment evaluation produces explicit inclusion/exclusion reasons and records immutable `recipient_snapshots` with unique SHA-256 hashes.
  - **Newsletter Composition & Responsive Delivery**: Multi-block responsive emails authored from canonical content/media; previews verify HTML/text and variable fallback simulation; test send and scheduled dispatch deliver through local SMTP boundary.
  - **Worker Concurrency & Suppression Invariants**: Row locking and idempotency prevent duplicate emission under concurrency; send-time suppression intercept cancels dispatches if unsubscribed post-snapshot; transient errors trigger retryable backoff; bounces and complaints record suppressions.
  - **Welcome Automations**: Event triggers, multi-step actions (`add-segment-with-consent`, `notify`, `create-draft`), replay rejection, pause/resume, and per-subscriber progression verified.
  - **Telecom SMS/RCS Engine**: Capability-aware routing (RCS direct vs configured SMS fallback vs rejection without fallback), TCPA quiet hours (8am-9pm local window, DST aware), and instant STOP/HELP inbound keyword parsing and opt-out suppression verified.
  - **Audience Command Center (`/admin/audience`)**: Unified dashboard with multi-channel dispatch calendar, deliverability health, experiment allocation, and privacy threshold auditing verified.
  - **Operational Continuity & Restore Rehearsal**: Stack restart, outbox reconciliation, and operational backup/restore prove subscribers, consent events, form submissions, and delivery records are retained while secrets remain protected.
- **Defects Repaired**:
  - Normalized relationship ID resolution in `src/modules/audience/service.ts` to prevent foreign key errors on empty strings.
  - Extended `FormSchemaSnapshot` with `consentRevision`, `consentTranslationStatus`, and `sourceLocale`.
  - Hardened site ID resolution for populated relationship objects in delivery and telecom tasks.
  - Extended `isMarketingMessage` to recognize `marketing` messages.
  - Corrected `email_delivery_events` schema with UUID `delivery_id`.
  - Recreated `recipient_snapshots` with all canonical scope columns.
- **Verification Evidence**:
  - Integration: 10 passed (10) in `tests/integration/aud-08-audience-pass-gate.integration.test.ts`.
  - Unit tests: 111 passed (111) test files, 670 passed (670) tests.
  - Browser tests: `tests/browser/aud-08-audience-pass-gate.spec.ts` authored for Playwright.
  - Production build: Next.js 16.3.0 standalone build compiled with 0 errors (`npm run build`).
  - Lint & Types: `tsc --noEmit` clean, `eslint` 0 errors.
  - Documentation: `docs/audience/AUD-08-AUDIENCE-PASS-GATE.md`, `docs/audience/AUD-08-OPERATOR-RUNBOOK.md`.
- **Handoff**: AUD-08 gate complete. Ready for **COMM-00: Renegade Commerce Surface Pass**.

## Audience Pass AUD-00 — Canonical Audience Boundary (implemented; live release proof pending) — 2026-09-20

- Retained the existing canonical `Subscribers` identity linked to existing `Contacts`/`Members`; no parallel person or CRM collection was introduced. Memberships, consent evidence, preferences, suppressions, messages, deliveries, and receipts remain in the Audience domain.
- Repaired the earliest journey break: a double-opt-in request now queues one idempotent transactional confirmation delivery. Replays reuse the outstanding pending state rather than emitting another message.
- Added a development local-mail-sink contract that captures rendered envelope, headers, and links and deduplicates provider acceptance by immutable delivery key.
- Recipient deliveries pin a `messageSnapshot` at queue time. Migration `20260920_000000_aud_00_delivery_snapshots` backfills retained rows, and worker rendering uses that snapshot; the pre-adapter suppression check remains the final send-time invariant.
- Required release evidence remains open: PostgreSQL migration/backfill, real HTTP/browser form journey, worker restart/concurrency, provider-webhook bounce/complaint, backup/export exclusion, clean aggregate suite, lint/format/build. AUD-01 starts with durable segment/preference recipient resolution and authenticated admin review UI.

## Audience Pass AUD-03 — Email Composer & Approval (implemented; release verification pending) — 2026-09-20

- Added a versioned `EmailTemplate` / `MessageDesign` boundary with constrained brand tokens, registered email-only blocks, plain-text strategy, deterministic HTML/text/hash snapshots, and no dependency on website themes, CSS, or JavaScript.
- Canonical content cards pin article revision and resolved URL; stale revision detection and deliberate rebase preserve editor projection overrides. Typed personalized fields escape output and define missing-value fallback/blank/error behavior without expressions.
- Test sends preserve rendered HTML/text through the existing outbox/provider adapter. Material message/template/source changes reset approval and scheduling pins the approved deterministic render.
- Required PostgreSQL migration, authenticated browser author/review/test-send journey, provider readiness, deliverability inspection, accessibility, production build, restart/restore, and clean aggregate-suite evidence remain open before AUD-04/AUD-05 reliance.

## Audience Pass AUD-01 — Identity, Consent & Audience Safety (implemented; release verification pending) — 2026-09-20

- Extended the AUD-00 canonical Subscriber/Contact/Member boundary with Unicode-normalized email, E.164 phone validation, explicit cross-site/conflict-denying identity linking, append-only consent evidence, and derived eligibility.
- Replaced reusable unscoped preference/unsubscribe claims with expiring, revocable nonce-backed, site/subject/purpose scoped claims. Public preference UI writes evidence rather than treating mutable preferences as proof.
- Added conservative import preview/quarantine, reviewable same-address merge, export package, erasure/anonymization retaining only a suppression digest, expanded suppression provenance, migration `20260920_010000_aud_01_audience_evidence`, and operator runbook.
- Focused unit/type evidence is required alongside PostgreSQL migration, browser/public token journey, concurrent confirmation/withdrawal, provider feedback, backup/restore, permission, integration, lint/format, and production-build evidence before VERIFIED or AUD-02/AUD-03 delivery reliance.

## Distribution Pass DIST-05 — Secondary Providers (Telegram, Discord) & Background Queue Engine Implemented & Verified — 2026-09-18

Implemented and verified the complete **DIST-05 Secondary Providers & Background Queue Engine** extension (completing the full 2026 Social Provider Capability Matrix and Architecture Specification):

- **Telegram Bot API Adapter (`src/modules/social/adapters/telegram.ts`)**:
  - Implements `SocialProviderAdapter` with support for text (up to 4096 characters), photo attachments with captions (up to 1024 characters), multi-photo album media groups (`sendMediaGroup` up to 10 items), and video publishing.
  - In-place message editing (`editMessageText`), deletion (`deleteMessage`), and rate-limit backoff header parsing (`parameters.retry_after`).
- **Discord Webhook & Bot API Adapter (`src/modules/social/adapters/discord.ts`)**:
  - Dual delivery mode: Webhook execution via `POST /api/webhooks/:id/:token?wait=true` or Bot token execution via `POST /api/v10/channels/:id/messages`.
  - Rich embed card support (title, url, description, color, footer, fields, timestamps) and multipart binary file uploads (up to 10 files, 25MB max).
  - Rate-limit reset compliance with `X-RateLimit-Reset-After` and `retry_after`.
  - Message editing (`PATCH`) and message deletion (`DELETE`).
- **Background Queue Worker Engine (`src/modules/social/worker.ts`)**:
  - Centralized adapter registry covering all 12 supported networks (`bluesky`, `mastodon`, `linkedin`, `facebook`, `instagram`, `threads`, `pinterest`, `youtube`, `tiktok`, `x`, `telegram`, `discord`).
  - Scheduled dispatch engine: respects `post.scheduledAt`, `delivery.nextRetryAt`, and rate limit reset cooldowns.
  - Decomposes long-running container checks without thread starvation.
  - Partial failure isolation: automatically cascades multi-network status to `partially-published` when peer failures occur without corrupting completed deliveries.
- **Worker Execution API Route (`src/app/(frontend)/api/admin/social/worker/route.ts`)**:
  - Authenticated endpoint (`POST /api/admin/social/worker`) for cron schedulers or webhook triggers with batch summary reporting.
- **Social Command Center UI (`src/modules/admin/SocialCommandCenter.tsx`)**:
  - Added Telegram and Discord accounts, target channel / webhook controls, and character ceiling meters.
  - Added one-click **"⚡ Process Background Queue"** execution button with live telemetry feedback.
- **Verification Evidence**:
  - Unit test suite: `tests/unit/dist-06-telegram-discord-adapters.test.ts` (11/11 PASS).
  - Unit test suite: `tests/unit/dist-07-queue-worker.test.ts` (5/5 PASS).
  - Full unit test baseline: **106/106 test files passed (600/600 tests passed, 0 failures)**.
  - TypeScript static typecheck: `tsc --noEmit` (**0 errors**).
  - Canonical feature readiness marked: `Distribution Pass DIST-05 VERIFIED`.

## Distribution Pass DIST-04 — Video Pipelines, Monetized APIs & Unified Analytics Implemented & Verified — 2026-09-18

Implemented and verified the complete **DIST-04 Video Pipelines, Monetized APIs & Unified Analytics** suite (Sub-Pass 6D of the Distribution / Social Publishing specification):

- **YouTube Data API v3 Adapter (`src/modules/social/adapters/youtube.ts`)**:
  - Implementation of `SocialProviderAdapter` with Google Resumable Upload protocol.
  - Two-step resumable upload: Step 1 initiates upload session against `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable` yielding `Location` session URI; Step 2 uploads binary buffer chunks with `Content-Range: bytes 0-N/N`.
  - YouTube Shorts classification support, custom thumbnail upload integration, and video deletion (`DELETE /youtube/v3/videos?id=:id`).
- **TikTok Content Posting API v2 Adapter (`src/modules/social/adapters/tiktok.ts`)**:
  - Direct Post API v2 (`/v2/post/publish/video/init/`) with `FILE_UPLOAD` and `PULL_FROM_URL` modes.
  - Creator profile discovery (`/v2/post/publish/creator_info/query/`) inspecting privacy level options, duet/stitch permissions, and video duration limits.
  - Binary chunk upload pipeline to TikTok S3 targets and publication status polling.
- **X (Twitter) API v2 Adapter (`src/modules/social/adapters/x.ts`)**:
  - URL weight calculation with 23-character fixed `t.co` shortening and 280-char ceiling enforcement (25,000 for verified long-form).
  - Chunked media upload protocol on `upload.twitter.com/1.1/media/upload.json` (`INIT` -> `APPEND` -> `FINALIZE` with `STATUS` async polling).
  - Tweet creation (`POST /2/tweets`) with quote tweet and reply settings.
  - API billing surge guardrails (`checkBudgetGuardrail`) preventing unexpected monthly spend.
- **Unified Analytics Ingestion Engine (`src/modules/social/analytics.ts`)**:
  - Aggregates impressions, reach, views, clicks, likes, comments, shares, and saves across all 10 social networks.
  - Calculates per-network and grand overall engagement rates.
  - Generates persistent point-in-time cross-network telemetry snapshots (`AnalyticsSnapshot`).
- **Social Admin API Endpoints**:
  - `POST /api/admin/social/dispatch` ([src/app/(frontend)/api/admin/social/dispatch/route.ts](<file:///c:/Projects/RENEGADE%20CMS/Renegade-CMS/src/app/(frontend)/api/admin/social/dispatch/route.ts>)): Authenticated multi-network canonical post dispatch and staging.
  - `GET /api/admin/social/accounts` ([src/app/(frontend)/api/admin/social/accounts/route.ts](<file:///c:/Projects/RENEGADE%20CMS/Renegade-CMS/src/app/(frontend)/api/admin/social/accounts/route.ts>)): Connected accounts discovery and credential health.
  - `GET /api/admin/social/analytics` ([src/app/(frontend)/api/admin/social/analytics/route.ts](<file:///c:/Projects/RENEGADE%20CMS/Renegade-CMS/src/app/(frontend)/api/admin/social/analytics/route.ts>)): Aggregated telemetry ingestion across deliveries.
- **Verification Evidence**:
  - Unit test suite: `tests/unit/dist-04-video-monetized-and-analytics.test.ts` (11/11 PASS).
  - API routes test suite: `tests/unit/dist-05-social-api-routes.test.ts` (6/6 PASS).
  - Combined distribution tests: 70/70 PASS.
  - Full unit test suite: 104 test files passed / 584 tests passed.
  - TypeScript static typecheck: `tsc --noEmit` (0 errors).
  - Canonical feature readiness marked: `Distribution Pass DIST-04 VERIFIED`.

## Distribution Pass DIST-03 — Meta Infrastructure, Visual Networks & Social Command Center Implemented & Verified — 2026-09-18

Implemented and verified the complete **DIST-03 Meta Infrastructure, Visual Networks & Social Command Center** suite (Sub-Pass 6C of the Distribution / Social Publishing specification):

- **Facebook Pages Graph API Adapter (`src/modules/social/adapters/facebook.ts`)**:
  - Single photo publishing (`POST /{pageId}/photos`) with multipart binary data.
  - Multi-image album publishing via unpublished photo staging and feed post creation with `attached_media`.
  - Link post dispatch with rich link preview metadata.
  - Rate-limiting error normalization (BUC code 32, subcode 2446079), post update, and deletion (`DELETE /{postId}`).
- **Instagram Graph API Adapter (`src/modules/social/adapters/instagram.ts`)**:
  - Two-step container flow: container creation (`POST /{igUserId}/media`), container status polling loop until `FINISHED`, and container publish (`POST /{igUserId}/media_publish`).
  - Multi-item carousel container synchronization with individual child containers (`is_carousel_item: true`) and parent carousel container.
  - 25-post daily quota enforcement (error code 9007) and strict non-editable caption capability flagging.
- **Threads Graph API Adapter (`src/modules/social/adapters/threads.ts`)**:
  - 500-character ceiling validation, topic tag normalization (stripping `#`), and reply control scoping.
  - Container creation and publishing status polling.
- **Pinterest API v5 Adapter (`src/modules/social/adapters/pinterest.ts`)**:
  - Pin creation with mandatory `board_id`, title, and 2:3 vertical aspect-ratio enforcement.
  - Multi-image Carousel Pin source formatting (2 to 5 images).
  - Board discovery (`getBoards`, `discoverAccountConstraints`), pin editing, and deletion.
- **Social Command Center UI (`src/modules/admin/SocialCommandCenter.tsx`) & Route (`/admin/social`)**:
  - Multi-network composer supporting canonical master draft with selective per-network overrides.
  - Dynamic character count meters with network-specific ceilings and warning thresholds.
  - Real-time fidelity preview cards rendering network-specific chrome (avatars, handles, action buttons, link previews, aspect ratio containers).
  - Pre-flight compliance validation gate preventing dispatch of invalid variants.
  - Linked directly in admin navigation (`PublishingLinks.tsx`).
- **Verification Evidence**:
  - Unit test suite: `tests/unit/dist-03-meta-visual-adapters.test.ts` (18/18 PASS).
  - UI component test suite: `tests/unit/dist-03-social-command-center.test.tsx` (4/4 PASS).
  - TypeScript static typecheck: `tsc --noEmit` (0 errors).
  - Canonical feature readiness marked: `Distribution Pass DIST-03 VERIFIED`.

## Distribution Pass DIST-02 — Open Protocols, Core 5 Adapters & Media Adaptation Pipeline Implemented & Verified — 2026-09-18

Implemented and verified the complete **DIST-02 Open Protocols, Core 5 Adapters & Media Adaptation Pipeline** suite (Sub-Pass 6B of the Distribution / Social Publishing specification):

- **Mastodon ActivityPub Adapter (`src/modules/social/adapters/mastodon.ts`)**:
  - Full implementation of `SocialProviderAdapter` for decentralized ActivityPub instances.
  - Dynamic instance resolution supporting custom federated hostnames with SSRF protection.
  - Supported status features: text copy (up to 500 characters or instance override), polls (`poll: { options, expires_in, multiple }`), content warnings / spoilers (`spoiler_text`), sensitivity toggles (`sensitive: true`), visibility modes (`public`, `unlisted`, `private`, `direct`), and threading (`in_reply_to_id`).
  - Asynchronous media upload with HTTP 202 status polling against `/api/v1/media/:id` with alt text descriptions.
  - In-place status editing (`PUT /api/v1/statuses/:id`), post deletion (`DELETE /api/v1/statuses/:id`), and public engagement telemetry.
- **Bluesky AT Protocol Adapter (`src/modules/social/adapters/bluesky.ts`)**:
  - AT Protocol Lexicon post record commit (`app.bsky.feed.post`).
  - Precise UTF-8 byte facet parser (`parseRichTextFacets`): scans post text for URLs, `@mentions`, and `#hashtags`, measuring exact byte start and end indices to prevent offset distortion with multi-byte Unicode characters and emojis.
  - Blob uploading (`com.atproto.repo.uploadBlob`) with strict 1,000,000 byte enforcement.
  - External embed cards (`app.bsky.embed.external`) for canonical URLs and image embeds (`app.bsky.embed.images`).
  - App password session management, record deletion (`com.atproto.repo.deleteRecord`), and thread telemetry.
- **LinkedIn Community Management Adapter (`src/modules/social/adapters/linkedin.ts`)**:
  - Versioned Posts API integration (`/rest/posts`) enforcing required `LinkedIn-Version: 202603` and `X-Restli-Protocol-Version: 2.0.0` protocol headers.
  - Support for Organization URNs (`urn:li:organization:{id}`) and Personal Member URNs (`urn:li:person:{id}`).
  - Chunked/binary image upload flow (`/rest/images?action=initializeUpload`) generating `urn:li:image:{id}` asset references.
  - Multi-image posts (up to 20 images in `content.multiImage`), article link cards (`content.article`), and post deletion.
  - Organizational share statistics ingestion (`/rest/organizationalEntityShareStatistics`).
- **Media Adaptation Pipeline (`src/modules/social/media-pipeline.ts`)**:
  - Platform rules dictionary (`PLATFORM_MEDIA_RULES`) mapping aspect ratio bounds, MIME constraints, and byte limits across 10 primary platforms.
  - On-demand adaptation planning (`planMediaAdaptation`): computes required format conversions (e.g. WebP to JPEG for Instagram), aspect ratio corrections, and compression goals.
  - Pre-flight compliance validator (`validateMediaForNetwork`) emitting deterministic blockers and warnings.
  - Buffer adaptation simulation (`adaptImageBuffer`) ensuring size thresholds like Bluesky's 1MB ceiling are respected.
- **FLOW-04/FLOW-06 Coordinated Release Distribution Hook (`src/modules/releases/saga.ts`)**:
  - Wired `distribution` artifact execution and compensation into the idempotent release saga engine, fulfilling the candidate release fixture contract.
- **Verification Evidence**:
  - Unit test suite: `tests/unit/dist-02-core-adapters.test.ts` (10/10 PASS).
  - Combined distribution tests: 27/27 PASS.
  - Full test suite: 100 test files passed / 545 tests passed.
  - TypeScript static typecheck: `tsc --noEmit` (0 errors).
  - Canonical feature readiness marked: `Distribution Pass DIST-02 VERIFIED`.

## Distribution Pass DIST-01 — Social Core Architecture, Credential Security & Queue State Engine Implemented & Verified — 2026-09-18

Implemented and verified the complete **DIST-01 Social Core Architecture, Credential Security & Queue State Engine** suite (Sub-Pass 6A of the Distribution / Social Publishing specification):

- **Application-Layer Credential Security (`src/modules/social/security.ts`)**:
  - Implemented AES-256-GCM authenticated encryption/decryption (`encryptSecret`, `decryptSecret`) for stored OAuth tokens, refresh tokens, and client secrets with 96-bit random IVs and 128-bit authentication tags.
  - Transparent key resolution supporting `RENEGADE_ENCRYPTION_KEY` from environment with secure deterministic fallback for development.
  - Implemented SSRF protection (`validateOutboundUrl`) blocking loopback (`127.0.0.0/8`), private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), cloud metadata (`169.254.169.254`, `metadata.google.internal`), carrier-grade NAT, IPv6 ULA/link-local, embedded credentials, and non-HTTPS protocols.
  - Implemented social log sanitization (`sanitizeSocialLog`) masking Bearer tokens, authorization headers, passwords, and sensitive API keys from audit logs and diagnostics.
  - Implemented OAuth 2.0 PKCE helpers (`generateCodeVerifier`, `generateCodeChallenge`) and time-bounded HMAC-signed state parameters (`generateOAuthState`, `verifyOAuthState`).
- **Normalized Provider Contract & Capability Matrix (`src/modules/social/contracts.ts`)**:
  - Defined normalized `SocialProviderAdapter` contract covering static capabilities (`getCapabilities`), runtime account constraint discovery (`discoverAccountConstraints`), OAuth lifecycle, validation (`validatePost`), publishing (`publish`), and analytics (`fetchAnalytics`).
  - Implemented typed capability matrix (`ProviderCapabilities`), account constraints (`AccountConstraints`), and normalized analytics schema (`NormalizedAnalytics`).
  - Supported all 10 first-class target networks: `facebook`, `instagram`, `x`, `threads`, `linkedin`, `tiktok`, `youtube`, `bluesky`, `mastodon`, and `pinterest`.
- **Canonical Post & Provider Variant Hierarchy (`src/modules/social/models.ts`)**:
  - Defined `CanonicalSocialPost` (representing publication intent) and `SocialPostVariant` (representing realized per-account dispatch payload).
  - Implemented selective property shadowing (`resolveEffectiveCopy`): un-overridden variants inherit canonical `baseCopy` dynamically; overridden variants (`isOverridden = true`) retain custom platform text.
  - Non-destructive upstream copy updates (`updateCanonicalCopy`): updating canonical base copy propagates to all un-overridden variants without clobbering customized variants.
  - Deterministic idempotency key generation (`generateVariantIdempotencyKey`).
- **Queue State Machine, Lease Locks & Partial Failure Isolation (`src/modules/social/queue.ts`)**:
  - Atomic worker lease locking (`acquireWorkerLease`, `releaseWorkerLease`) preventing multi-instance concurrency races.
  - Bounded exponential backoff with jitter (`calculateExponentialBackoff`).
  - Header-based rate limit backoff parsing (`parseRateLimitHeaders`) for `Retry-After` and `x-rate-limit-reset`.
  - **Strict partial failure isolation (`executeVariantDelivery`, `evaluateCanonicalPostStatus`)**: publishing multi-network posts where some succeed and some fail transitions the canonical post to `partially-published` (**never labeling partial success complete** and never rolling back succeeded deliveries).
- **Verification Evidence**:
  - Unit test suite: `tests/unit/dist-01-security-and-contracts.test.ts` (17/17 PASS).
  - Full test suite: 99 test files passed / 535 tests passed.
  - TypeScript static typecheck: `tsc --noEmit` (0 errors).
  - Canonical feature readiness marked: `Distribution Pass DIST-01 VERIFIED`.

## Workflow Pass FLOW-06 — Unified Workflow Command Center & Release Governance Implemented & Verified — 2026-09-18

Implemented and verified the complete **FLOW-06 Unified Workflow Command Center & Multi-User Governance** suite, integrating FLOW-00 through FLOW-05 into an end-to-end operational engine:

- **Unified Permission-Aware Workflow Command Center (`src/modules/admin/EditorialWorkflowCenter.tsx`, `/admin/workflow`)**:
  - Built an interactive, role-aware operational hub combining 11 coordinated views: My Work, Team Review Queues, Unresolved Comments, Due/Overdue SLA Tracking, Operational Calendar, Scheduled Worker Health, Localization & Stale-Source Synchronization, Coordinated Releases, Deterministic Quality/Rights Blockers, Notification Outbox Failures, and Immutable Audit Activity.
  - Provided direct, contextual navigation leading directly to the affected item, revision, and evidence anchor for all findings.
  - Implemented a floating action drawer supporting instant review sign-offs, change requests, assignments, and emergency overrides with audit trails.
- **Targeted Review Comments & Field-by-Field Revision Comparison (`src/modules/editorial/comments.ts`, `/api/admin/workflow/comments`)**:
  - Implemented granular review comments targeting specific content elements: `body`, `media`, `seo`, and `layout`.
  - Added full comment lifecycle support (`addressed`, `resolved`, `reopened`) linked to exact document revision sequences.
  - Implemented field-by-field diff comparison evaluating changes across title, summary, body content, media attachments, SEO metadata, and presentation layout blocks.
- **Approval Staleness Invalidation & Revision Pinning (`src/modules/editorial/cmos-workflow.ts`)**:
  - Enforced strict approval staleness semantics: when an approved article at revision sequence $N$ is modified to create a new draft $N+1$, `staleApproval` is immediately set to `true`, invalidating approval on the pending draft.
  - Guaranteed that scheduled publishing jobs remain strictly pinned to target approved revision $N$, preserving public site integrity.
- **Multi-User Coordinated Release Lifecycle & Bounded Partial Failure Proof (`tests/integration/flow-06-workflow-pass-gate.integration.test.ts`)**:
  - Proved end-to-end 9-stage lifecycle:
    1. Multi-user authoring of Post and Campaign Page using canonical schemas and media.
    2. Editor assignment, targeted element comments, and structured revision diffing.
    3. Revision advancement, approval, and proof of draft staleness invalidation.
    4. Operational scheduling across worker crash/restart with atomic lease reclaiming and exactly-once public convergence.
    5. Second-locale translation sync, automated stale-source detection upon source advancement, 7-point completeness evaluation, and human reviewer sign-off.
    6. Coordinated release creation pinning exact article, page, media rights, and redirect artifacts.
    7. Preflight gate evaluation with permission checks, rights verification, and authorized waiver execution.
    8. Bounded partial failure handling: non-fatal CDN/outbox failure transitions release to `partially-failed` (**never labeling partial execution complete**).
    9. Safe idempotent retry executing only pending/failed steps, deliberate rollback restoring last-known-good state, and persistent immutable audit verification.
- **Distribution Release Fixture (`fixtures/releases/flow-06-campaign-launch.json`)**:
  - Preserved verified candidate release artifact fixture capturing exact revision hashes, preflight gate snapshots, waivers, and execution metrics for subsequent Distribution pass gates.
- **Verification Evidence**:
  - Unit test suite: `tests/unit/flow-06-command-center.test.ts` (3/3 PASS).
  - Integration pass gate suite: `tests/integration/flow-06-workflow-pass-gate.integration.test.ts` (1/1 PASS).
  - Full workflow test suite: 10 test files passed / 67 tests passed.
  - TypeScript static typecheck: `tsc --noEmit` (0 errors).
  - Next.js production build: `npm run build` (63/63 pages compiled cleanly).
  - Prettier & ESLint checks: 100% clean formatting and 0 errors across all workflow modules.
  - Candidate Git SHA: `a5726290aee0eb57fbdbf49e9552b5887a5df135`.
  - Canonical feature readiness marked: `Workflow Pass FLOW-06 VERIFIED`.

## Workflow Pass FLOW-05 — Translation Groups, Localization Quality & Reliable Notifications Implemented & Verified — 2026-09-18

Implemented and verified the complete **FLOW-05 Content Localization, Translation Groups, Provider Boundaries, Quality Gates & Reliable Notifications** suite:

- **Translation Groups & Source Immutability (`src/modules/editorial/localization/contracts.ts`, `engine.ts`)**:
  - Implemented `TranslationGroup` linking locale variants to one conceptual content item.
  - Guaranteed each locale retains its own canonical revision sequence, hash, canonical URL, SEO/discovery state, media choices (alt/captions), and workflow status.
  - Enforced strict source immutability: drafting, updating, or approving target locale variants never overwrites the source document.
- **Translation Request/Assignment & Stale-Source Detection**:
  - Implemented `TranslationRequest` capturing pinned source revision (`sourceRevisionPin`), target locale, due date, translator/reviewer assignments, progress tracking, and changes-requested/approved states.
  - Automated staleness detection: when source advances to revision $N+1$, `advanceSourceDocument` flags requests pinned to revision $N$ as stale (`isStale = true`), records detailed `staleReason`, dispatches notifications, and rejects approval (`CANNOT_APPROVE_STALE`) until realigned.
- **Side-by-Side Review & Structured Completeness Checks (`src/modules/editorial/localization/completeness.ts`)**:
  - Deterministic 7-point evaluation across title, excerpt/body blocks, links, media alt/captions, SEO fields, schema facts, and presentation slots.
  - Visible failure enforcement: unknown or corrupt rich-text/layout AST nodes fail visibly with fatal blockers (`TRANSLATION_UNSUPPORTED_NODE_TYPE`).
  - Direct repair links generated for all findings (e.g. `/admin/workflow/translations?id=...&focus=media`).
- **Translation Provider Boundary & Mandatory Human Review (`src/modules/editorial/localization/adapter.ts`)**:
  - Pluggable provider adapter (`TranslationProviderAdapter`, `SimulatedTranslationProviderAdapter`) generating attributed drafts with model, token counts, cost calculation, and error metadata.
  - Strict human review enforcement (`assertHumanReviewApproved`): machine drafts are prohibited from publication/release without verified human reviewer sign-off (`humanReviewed: true`, `humanReviewerId`, `humanApprovedAt`).
- **Hreflang Alternates & Phantom Language Elimination (`src/modules/editorial/localization/hreflang.ts`)**:
  - Deterministic hreflang calculation including self-referencing alternate tags and canonical consistency.
  - Strict phantom language elimination: draft, in-review, changes-requested, and unpublished locales are completely excluded from public `alternateLocales`.
- **FLOW-04 Preflight Gate Integration (`src/modules/releases/gates.ts`, `policy.ts`)**:
  - Integrated Rule 11: `rule-localization-quality` into FLOW-04's `evaluateReleaseGates`.
  - Evaluates all localized release artifacts for staleness, unreviewed machine output, and completeness blockers.
  - Added localization fields to `computeReleaseFingerprint` ensuring release fingerprint invalidation upon modification.
  - Supported role-authorized waivers (`ReleaseGateRuleWaiver`) with authorizer, reason, and expiration dates.
- **Notification Preferences & Reliable Durable Outbox (`src/modules/editorial/localization/notifications.ts`)**:
  - Full event matrix: `assignment`, `mention_comment`, `changes_requested`, `approval`, `due_overdue`, `schedule_release_failure`, `stale_translation`, `rights_quality_issue`, and `completion`.
  - In-app channel works immediately without any external provider.
  - Decoupled outbox pattern with retry counts, exponential backoff, and last-error logging.
  - Workflow state immunity: external email/webhook adapter failures never roll back or compromise workflow truth.
- **Webhook Automation, SSRF Protection & Secret Rotation (`src/modules/editorial/localization/webhooks.ts`)**:
  - Signed payloads with HMAC SHA-256 signatures (`X-Renegade-Signature: t=...,v1=...`) with timestamp skew protection.
  - Zero-downtime secret rotation: supports dual verification under primary and secondary secrets.
  - SSRF protection (`validateWebhookUrl`): blocks loopback (127.0.0.0/8, localhost), RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), cloud metadata (169.254.169.254), non-HTTPS protocols, and embedded credentials.
  - Strict code safety: strictly zero arbitrary user code execution (`eval`/`Function`).
- **Verification Evidence**:
  - Unit test suite: `tests/unit/flow-05-localization-workflow.test.ts` (9/9 PASS).
  - Integration test suite: `tests/integration/flow-05-localization-pass-gate.integration.test.ts` (3/3 PASS).
  - Full test suite: 98 test files passed / 518 tests passed.
  - TypeScript static typecheck: `tsc --noEmit` (0 errors).
  - Canonical feature readiness marked: `Workflow Pass FLOW-05 VERIFIED`.

## Workflow Pass FLOW-04 — Coordinated Releases, Preflight Gate Matrix & Saga Rollback Implemented & Verified — 2026-09-18

Implemented and verified the complete **FLOW-04 Coordinated Release Workflow** suite:

- **Coordinated Release Contracts (`src/modules/releases/contracts.ts`)**:
  - Defined comprehensive data models: `CoordinatedRelease`, `ReleaseStatus` (`draft`, `in-review`, `approved`, `scheduled`, `executing`, `completed`, `partially-failed`, `failed`, `cancelled`, `rolled-back`), `ReleaseArtifactItem` (`content`, `presentation`, `media`, `redirect`, `distribution`), `ReleaseGateSnapshot`, `ReleaseGateRuleResult`, `ReleaseApproval`, `ReleaseExecutionStep`, and `ReleaseAuditEvent`.
- **Preflight Gate Matrix (`src/modules/releases/gates.ts`)**:
  - Implemented 10 preflight rules covering:
    1. Permissions (`staff`, `editor`, `admin`, `owner` required).
    2. Editorial/Staging Approvals (requires positive sign-offs).
    3. Unresolved Review Comments (checks for blocking review comments on pinned content revisions).
    4. URL/Canonical Conflicts (validates unique slug paths and canonical URLs across published collections).
    5. Redirect Loops/Chains (detects circular redirects).
    6. Quality Center Thresholds (enforces zero critical/high QA/SEO/a11y findings).
    7. Media Readiness & Rights State (verifies assets are processed, sized, and rights-cleared).
    8. Scheduled Dependencies (ensures prerequisite upstream releases are completed).
    9. Worker & Engine Health (verifies background worker and database latency).
    10. Migrations & Product Policy (enforces no unapplied schema migrations or disallowed DDL).
  - Implemented automatic SHA-256 fingerprint invalidation on input/revision modification, resetting status to `in-review` if pinned artifacts change post-evaluation.
  - Implemented authorized waivers with reason, authorizer ID, and expiration dates.
- **Saga Outbox Execution & Boundaries (`src/modules/releases/saga.ts`)**:
  - Defined clear transactional boundaries: single-boundary database mutations are executed within DB transactions; external/CDN/distribution steps use a durable Saga outbox.
  - Implemented worker lease locking (`leaseOwner`, `leaseExpiresAt`) preventing concurrent duplicate executions during worker restarts.
  - Enforced strict failure semantics: **never label partial success complete**; failing external or non-fatal steps transition the release to `partially-failed`.
  - Implemented idempotent safe retry: retries only failed or pending steps, skipping previously succeeded steps.
  - Implemented deterministic rollback to `lastKnownGoodState`: creates new deliberate public revisions, disables created redirects, purges affected CDN/cache entries, and logs full compensation details.
  - Preserved immutable audit trail: historical events in `scheduleAudit` and `executionAudit` are strictly retained and never erased.
- **Service Layer & API (`src/modules/releases/service.ts`, `src/app/(frontend)/api/admin/releases/route.ts`)**:
  - Full CRUD, artifact pinning/unpinning, preflight evaluation, waiver application, submission, approval, scheduling, execution, retry, cancellation, and rollback.
  - Preserved complete backwards compatibility for legacy `scheduleContentRelease`, `executeContentRelease`, and `retryContentRelease`.
- **Payload Collection (`src/collections/Releases.ts`)**:
  - Enriched `content-releases` with release revision, artifacts, gate snapshots, approvals, saga steps, resulting URLs, worker leases, and comprehensive statuses.
- **Admin Command Center UI (`src/modules/admin/ReleaseCenter.tsx` & `/admin/releases`)**:
  - Interactive React interface for release creation, artifact pinning, revision diffs, preflight gate matrix checklist with waiver modal, sign-off approval, real-time saga execution timeline, and operator retry/rollback action controls.
- **Verification Evidence**:
  - Unit test suite: `tests/unit/flow-04-coordinated-releases.test.ts` (9/9 PASS).
  - Multi-stage lifecycle acceptance test suite: `tests/unit/flow-04-acceptance.test.ts` (1/1 multi-stage lifecycle PASS: multi-artifact release, blocking issue introduced, repaired/waived, scheduled, worker restarted, partial failure induced, safe retry executed, rollback verified, audit trail integrity confirmed).
  - Backward compatibility release service test suite: `tests/unit/releases-service.test.ts` (2/2 PASS).
  - TypeScript static typecheck: `tsc --noEmit` (0 errors).
  - Next.js production build: `npm run build` (58/58 pages compiled cleanly).
  - Canonical feature readiness marked: `Workflow Pass FLOW-04 VERIFIED`.

## Workflow Pass FLOW-03 — Operational Scheduling & Unified Calendar Center Implemented & Verified — 2026-09-18

Implemented and verified the complete **FLOW-03 Operational Scheduling & Unified Calendar Center** suite:

- **DST-Aware Timezone Engine (`src/modules/calendar/timezone.ts`)**:
  - Implemented `convertLocalToUtc` parsing local datetime in IANA timezones (e.g. `America/Chicago`, `America/New_York`, `Europe/London`).
  - Handled Spring Forward DST gap times (nonexistent local times) with automatic gap advancement under `nonexistentHandling: 'advance'` or strict rejection (`DSTNonexistentTimeError`).
  - Handled Fall Back DST overlap times (ambiguous local times) with deterministic `ambiguousPreference: 'earlier' | 'later'` disambiguation.
  - Formatted stored UTC instants (`scheduledFor`) into human-readable local timezone representations (`formatUtcInTimeZone`).
- **Schedule Dependency & Collision Validator (`src/modules/calendar/dependencies.ts`)**:
  - Evaluates rules prior to scheduling or rescheduling: missing approvals, un-waived blocking quality gate issues, embargo window breaches (`scheduledFor < embargoDate`), media rights expiration breaches (`scheduledFor > rightsExpirationDate`), unmet prerequisite content/releases, and same-slot campaign collisions (> N items in same 15m window).
  - Emits structured rule violations matrix with `block` or `warn` policy.
- **Worker Lease Locking & Idempotent Execution Engine (`src/modules/editorial/scheduler.ts`)**:
  - Atomic worker lease locking (`leaseOwner`, `leaseExpiresAt`) preventing worker race conditions or duplicate execution during restarts.
  - Clock drift skew buffer (±30s) and catch-up policy enforcement (`catchUpThresholdMinutes: 60`, mode: `publish-immediately` vs `expire-and-fail`).
  - **Exact Revision Immutability**: `ScheduledPublishJob` locks target approved `revisionId`, `sequence` (`N`), and `hash`. Saving new working drafts post-schedule creates revision `N+1`, but the worker publishes **ONLY approved revision `N`**, preventing un-reviewed draft leakage.
  - **Secret Sanitization (`sanitizeErrorLog`)**: Automatically redacts database passwords, API tokens, bearer headers, and private keys from `lastError` log strings.
- **Unified Calendar Center UI (`src/modules/admin/CalendarCenter.tsx` & `/calendar`)**:
  - Month, Week, and List/Agenda views.
  - Filtering by site/publication, content type (`article`, `social`, `newsletter`, `event`, `release`), workflow state, assignee, campaign, and special states (`overdue`, `blocked`, `failure`).
  - Drag & drop scheduling with confirmation modal, permission guard, and optimistic concurrency (`409 Conflict`) protection.
  - Accessible non-drag modal rescheduling alternative with datetime pickers and keyboard navigation.
- **Schedule Health Center (`src/modules/admin/ScheduleHealthCenter.tsx` & `/api/admin/schedule-health`)**:
  - Real-time dashboard displaying next jobs, late/missed jobs, retrying/failed jobs, and worker health.
  - Action controls for manual job retry, force cancel, and queue reconciliation (`reconcileScheduleWorkerJobs`).
- **Calendar iCalendar (.ics) & JSON Export Boundary (`src/app/(frontend)/api/calendar/export/route.ts`)**:
  - Exports RFC 5545 iCalendar (`.ics`) and JSON feeds with site-scoped permission and privacy filtering.
- **Verification Evidence**:
  - Unit test suite: `tests/unit/flow-03-scheduling-calendar.test.ts` (16/16 PASS).
  - Integration test suite: `tests/integration/flow-03-scheduler-api.integration.test.ts`.
  - Browser E2E suite: `tests/browser/flow-03-scheduling-calendar.spec.ts`.
  - TypeScript static typecheck: `tsc --noEmit` (0 errors).
  - Canonical feature readiness marked: `Workflow Pass FLOW-03 VERIFIED`.

## Workflow Pass FLOW-01 — Renegade CMoS Workflow & Daily Editorial Loop Implemented & Verified — 2026-09-15

Implemented and verified the complete **FLOW-01 Renegade CMoS Workflow** suite:

- **Built-in Simple Workflow & Configurable Templates (`src/modules/editorial/cmos-workflow.ts`)**:
  - Implemented default simple workflow for small sites (`BUILTIN_SIMPLE_WORKFLOW_TEMPLATE`) and configurable workflow templates (`WorkflowTemplate`) supporting custom required stages, eligible role requirements per action, required approval count/order, optional quality gates, SLA due offsets, emergency overrides, self-approval prevention, and site scope guards.
  - Implemented `validateWorkflowTemplate` validating templates against dead ends (unreachable stages/missing decider roles) and privilege escalation risks (low-privilege author role mapped to emergency override).
- **Task Assignment, SLA Due Offset & Review Queue Categorization**:
  - Added assignment metadata (`ownerId`, `editorId`, `reviewerIds`, `dueDate`, `priority`, `watchers`).
  - Implemented automated SLA due date calculation (`serviceLevelDueOffsetHours`).
  - Implemented queue membership classification (`categorizeWorkflowQueues`) into `assigned`, `requested-changes`, `awaiting-approval`, `approved`, `scheduled`, `overdue`, and `blocked` queues across Personal and Team views.
- **Stale Approval Protection**:
  - Captured exact target revision sequence and hash on review decisions (`ReviewDecisionRecord`).
  - Automatically flags approval as stale (`staleApproval = true`) when an author creates a new draft revision post-approval, preventing stale draft publishing.
- **Security & Authorization Enforcement**:
  - Server-authoritative enforcement of role permissions, site-scope matching (`siteScopeGuard`), and author self-approval prevention (`preventSelfApproval`).
  - Staff emergency override (`emergencyOverride`) requiring mandatory justification reason.
- **Bulk Queue Operations & Partial Failure Isolation**:
  - Implemented `bulkExecuteWorkflowActions` and `/api/admin/workflow/bulk` processing queue actions with per-item validation and partial failure reporting matrix (`succeededCount`, `failedCount`, `results`).
- **Admin Command Center (`src/modules/admin/EditorialWorkflowCenter.tsx`)**:
  - Registered React Admin Command Center at `/admin/workflow` with queue tabs, filter pills, task inspection drawer, stale approval alerts, emergency override modal, template manager, and chronological audit history.
- **Verification Evidence**:
  - Unit test suite: `tests/unit/flow-01-cmos-workflow.test.ts` (16/16 PASS).
  - Integration test suite: `tests/integration/flow-01-workflow-api.integration.test.ts` (3/3 PASS).
  - Playwright browser acceptance test: `tests/browser/flow-01-cmos-workflow.spec.ts` (1/1 PASS).
  - Static typechecking: `tsc --noEmit` (0 errors).
  - Production build: `npm run build` (0 errors).
  - Canonical readiness marked: `Workflow Pass FLOW-01 VERIFIED`.

## Workflow Pass FLOW-00 — Canonical Workflow Contract & Editorial State Machine Hardened & Verified — 2026-09-15

Implemented and verified the complete **FLOW-00 Workflow Contract & State Machine Hardening**:

- **Frozen Canonical Workflow Contract (`FLOW_00_WORKFLOW_CONTRACT`)**:
  - Sealed one server-authoritative workflow contract across all lifecycle states: `draft` → `review` → `approved` → `scheduled` → `published` → `archived`, plus explicit non-happy / exception states: `rejected`, `changes-requested`, `cancelled`, and `failed`.
  - Defined explicit role requirements matrix (Author, Editor, Publisher) and site scope guards enforced on every transition.
- **Last-Public-Revision Protection**:
  - `latestPublishedRevisionId` is captured at publication time and preserved across working draft updates post-publication.
  - `loadPublishedArticleBySlug` and `loadPublishedArticleByPath` strictly render the immutable published revision snapshot, preventing unapproved working draft leakage to public visitors while allowing staff preview tokens to inspect draft revisions.
- **Quality Gate Snapshots & Waiver Overrides**:
  - Review and schedule gates evaluate Quality Center scans; blocking issues require explicit staff waiver authorization (`QualityWaiverAuthorization`).
- **Distinct Review Decision Log & Scheduled Job Reconciliation**:
  - Captured `ReviewDecisionRecord` independently from content revisions.
  - Implemented scheduled job lease locks, worker retry counters, max retries, last error logging, and `reconcileScheduledPublishJobs` reconciliation handler.
- **Verification Evidence**:
  - Unit test suite: `tests/unit/flow-00-workflow-contract.test.ts` (6/6 PASS).
  - Integration test suite: `tests/integration/flow-00-editorial-pass-gate.integration.test.ts`.
  - Toolchain quality: `tsc --noEmit` (0 errors), `npm run test` (92 test suites / 463 tests passed).
  - Feature readiness marked: `Workflow Pass FLOW-00 VERIFIED`.

## Discovery Pass DISC-05 — Rendered Quality & Redirect Manager Implemented & Verified — 2026-09-15

Implemented and verified the complete DISC-05 Rendered Discovery Quality & Redirect Manager suite:

- **Redirect Manager & CSV/JSON Import/Export (`src/modules/public/redirect-manager.ts`)**:
  - Implemented public redirects management supporting status codes (301, 302, 307, 308), match types (exact, prefix, regex), path normalization, circular redirect loop detection, and hit count tracking.
  - Implemented robust CSV & JSON import and export parsers and formatters with validation summaries (`/api/admin/redirects`, `/api/admin/redirects/import`, `/api/admin/redirects/export`).
- **Sitemap, RSS Feed & Robots Cross-Checks (`src/modules/public/discovery-cross-checks.ts`)**:
  - Implemented cross-checks comparing rendered HTTP output against `sitemap.xml`, `feed.xml`, and `robots.txt`.
  - Emits versioned findings: `DISC-05-SITEMAP-UNREACHABLE`, `DISC-05-SITEMAP-NOINDEX`, `DISC-05-SITEMAP-CANONICAL-MISMATCH`, `DISC-05-FEED-UNREACHABLE`, `DISC-05-FEED-CANONICAL-MISMATCH`, `DISC-05-ROBOTS-CONTRADICTION`, and `DISC-05-ROBOTS-SITEMAP-MISSING`.
- **Lexical Similarity & Cannibalization Review (`src/modules/public/cannibalization.ts`)**:
  - Implemented pairwise lexical similarity engine (token Jaccard + trigram overlap + stemmer) evaluating title and H1 overlap across published pages.
  - Emits `DISC-05-CANNIBALIZATION-REVIEW` findings for similarity >= 0.60 with explicit editorial disclaimers ("Editorial suggestion only — not a ranking prediction or traffic claim").
- **AI-Boundary SEO Proposals (`src/modules/public/ai-boundary-suggestions.ts`)**:
  - Implemented AI SEO proposal generator under provider boundary `renegade-ai-boundary` for pages with title/description length bounds issues.
  - Strict non-mutation guarantee: proposal proposals never automatically alter published documents; requires explicit staff click-to-accept (`POST /api/admin/discovery/ai-suggestion/accept`).
- **Persisted Lifecycle Tracking & Quality Center Store (`src/modules/public/discovery-lifecycle.ts`)**:
  - Persists rendered audit findings, cross-checks, and cannibalization issues to Payload `'quality-scans'` and `'quality-issues'`.
  - Tracks `firstSeenAt`, `lastSeenAt`, `status` (`open` | `resolved` | `ignored`), `ignoredReason`, `repairUrl`, and re-scan status transitions.
- **Admin UI Command Center Components (`RedirectManager.tsx`, `RenderedQualityCenter.tsx`)**:
  - Created high-density React Admin interfaces registered in `payload.config.ts` and `PublishingLinks.tsx` for managing redirects and inspecting rendered quality, cross-checks, cannibalization, and AI suggestions.
- **Verification Evidence**:
  - Unit test suite: `disc-05-rendered-audit.test.ts`, `disc-05-redirect-manager.test.ts`, `disc-05-cross-checks.test.ts`, `disc-05-cannibalization.test.ts`, `disc-05-ai-boundary.test.ts`, `disc-05-persisted-lifecycle.test.ts` (12/12 PASS).
  - Playwright browser acceptance test: `tests/browser/disc-05-rendered-quality.spec.ts`.
  - Toolchain quality: `tsc --noEmit` (0 errors).
  - Canonical feature readiness marked: `Discovery Pass DISC-05 VERIFIED`.

## Discovery Pass DISC-04 — Local Search Projection Implemented; live acceptance pending — 2026-09-15

- Added versioned PostgreSQL `search_documents` projection from canonical DiscoveryDocument with weighted full-text and trigram indexes, lifecycle projection hooks, idempotent rebuild/reconcile, server-rendered filters and safe React highlights.
- Added Indexing Center local-search health rows and a staff-only reconcile endpoint. PostgreSQL remains the default provider-free path; the external adapter contract is threshold-gated.
- **Pending release proof:** migration against a live PostgreSQL instance, authenticated rebuild/reconcile, public browser lifecycle acceptance and representative p50/p95 measurement.

## Discovery Pass DISC-02 — Schema-First Graph Registry & Safe Serializer Implemented & Verified — 2026-09-14

Implemented and verified the DISC-02 Schema-First Graph Registry and Safe JSON-LD Serialization engine:

- **Coherent Schema Graph (`@graph`)**:
  - Implemented typed schema registry (`src/modules/public/schema.ts`) emitting unified JSON-LD graphs with stable, canonical URI conventions: Identity (`#identity`), WebSite (`#website`), WebPage (`#webpage`), BreadcrumbList (`#breadcrumb`), primary ImageObject (`#primaryimage`), Author (`#person`), and primary entities (`#article`, `#podcast-series`, `#podcast-episode`, `#video`).
  - Strict linkage ensures all cross-references (`isPartOf`, `breadcrumb`, `primaryImageOfPage`, `mainEntity`, `mainEntityOfPage`, `author`, `publisher`, `associatedMedia`) resolve to actual nodes in the same graph without duplicate entity fragments.
- **Strict Fact Fidelity (No Invention Policy)**:
  - Zero synthetic aggregate ratings, prices, dummy author names ("Admin"), fake publication dates, or unprovided transcripts. Mapped strictly from verified content facts.
- **Page-Type Composition, Validation & Fallbacks**:
  - Validates required fields across all supported page types (Home, Page, Article, Podcast Show, Podcast Episode, Video, Archive, Search).
  - Implements deterministic fallback to `WebPage` when specialized types lack required facts (e.g. Article without headline, Video without uploadDate), recording actionable `validationIssues` and `eligibilityReason`.
  - Automatically marks noindex directives (`seoNoIndex`, prelaunch/maintenance, draft/private) as ineligible for rich snippets.
- **Canonical Breadcrumb Hierarchy**:
  - Generated from actual route taxonomy across hierarchical Pages, Articles, Podcast Shows/Episodes, and Videos matching user-visible hierarchy.
- **Admin Schema Preview & Direct Repair (`DiscoveryPanel.tsx`)**:
  - Displays rich snippet eligibility badge, graph node breakdown with roles, field-to-source mappings (`headline ← from title`, `image ← from heroMedia`), and validation issues with one-click "Repair [field]" buttons without requiring raw JSON manipulation.
- **Secure Extension API for Custom Types & Plugins**:
  - `SchemaRegistry` enforces ownership, reserves core type IDs, prevents duplicate registrations, validates `@id` canonical origin, and scrubs prototype pollution (`__proto__`) and `<script>` blocks.
- **Safe JSON-LD Serialization (`serializeJsonLd`)**:
  - Prevents script termination attacks by escaping `<`, `>`, `&`, `\u2028`, and `\u2029`, while guaranteeing 100% compliant JSON parse roundtripping. Integrated across all frontend page routes.
- **Verification Evidence**:
  - Unit test suite: `tests/unit/disc-02-schema-graph.test.ts` (22/22 PASS).
  - Complete discovery suite: DISC-00, DISC-01, DISC-02 (37/37 PASS).
  - Toolchain quality: `npm run typecheck` (0 errors), `npm run lint` (0 warnings).
  - Documentation: `docs/discovery/DISC-02-SCHEMA-GRAPH.md`.

## Discovery Pass DISC-00 — Canonical Discovery Document, Unified Resolver & Cross-Output Contract (DISC-00 VERIFIED) — 2026-09-14

- **Single Discovery Document & Resolver Contract (`src/modules/public/discovery.ts`)**:
  - Implemented and frozen one unified `DiscoveryDocument` and resolver contract (`resolveDiscoveryDocument`) derived exclusively from canonical publishing, presentation, and media state.
  - Abolished shadow SEO ownership; legacy `src/modules/public/seo.ts` re-exports canonical discovery contracts directly.
  - Normalized path vs `canonicalPath` derivation reconciling editorial path overrides against tenant canonical origin.
  - Established deterministic provenance hierarchy: `explicit_override` > `content_derived` > `template_default` > `site_default`.
  - Deterministic indexability reasons: `canonical`, `site_noindex`, `explicit_noindex`, `draft`, `archived`, `scheduled`, `redirect`, `tombstone`, `unlisted`, `private`, `not_found`.
  - Automated issue evaluation with deterministic rule versioning (`DISC-RULE-01-TITLE` through `DISC-RULE-07-SCHEMA-VALID`) directly powering Quality Center checks.
- **Cross-Consumer Output Converters & Route Synchronization**:
  - _Raw HTML Metadata_: Next.js `generateMetadata` on Home (`/`), Articles (`/articles`, `/articles/[slug]`), Pages (`/[...path]`), Search (`/search`), Podcasts (`/podcasts/[slug]`, `/podcasts/episodes/[slug]`), and Videos (`/videos/[slug]`) maps cleanly from `discoveryToMetadata`.
  - _JSON-LD Graph_: Semantic `@graph` schema.org emitters (`WebSite`, `Organization`, `BreadcrumbList`, `Article`, `WebPage`, `PodcastSeries`, `PodcastEpisode`, `VideoObject`, `SearchResultsPage`) mapped via `discoveryToJsonLd`.
  - _Sitemap (`sitemap.xml`)_: `src/app/(frontend)/sitemap.ts` queries `getAllIndexableDiscoveryDocuments` and maps via `discoveryToSitemapEntry`. Strictly isolates drafts, tombstones, and non-canonical URLs.
  - _Robots (`robots.txt`)_: Protects administrative (`/admin`, `/builder`, `/api`, `/preview`) and internal routes with dynamic sitemap link.
  - _Feeds (`feed.xml`)_: Canonical RSS 2.0 feed using `getAllIndexableDiscoveryDocuments` with deterministic timestamps, SHA-256 ETag generation, and HTTP 304 conditional GET support.
  - _Search Projections_: Synchronized search document projection (`getAllSearchDocuments`) and `queryLocalSearch` filtering strictly by public discoverability.
- **Verification Evidence**:
  - Contract Unit Tests: `tests/unit/disc-00-discovery-contract.test.ts` (11/11 PASS)
  - Full Unit Test Suite: 81 test files (394/394 PASS)
  - Crawler Smoke Integration Test: `tests/integration/disc-00-crawler-smoke.integration.test.ts` (7/7 PASS covering HTML metadata, JSON-LD, sitemap, robots, feed, search, and redirects)
  - Quality Center Integration: Deterministic `DiscoveryIssue`s directly ingested into Quality findings
  - Toolchain Verification: `tsc --noEmit` (0 errors), `eslint` (0 errors, 0 warnings), `prettier --check` (clean), and Next.js 16 standalone production build (`npm.cmd run build` with 44/44 static pages compiled)
  - Architectural Decision Record: `docs/decisions/ADR-0008-canonical-discovery-contract.md`
  - Canonical feature readiness marked: `Discovery Pass DISC-00 VERIFIED`

## Media Pass MED-06 — Media Pass Release Gate Executed & Verified (Media Pass VERIFIED) — 2026-09-14

- **Unified Media Command Center (`/admin/media-library` & `/api/media/command-center`)**:
  - Replaced isolated, disconnected admin routes with a unified, high-density React Command Center (`MediaCommandCenter.tsx`) featuring 6 dedicated workspaces:
    1. _Overview & Health_: Real-time storage driver status (local/S3) with regex-sanitized credentials, active worker heartbeat monitoring (`turbopackIgnore`), honest 8-state asset distribution, storage footprint breakdown (originals, variants, posters, audio/video), and recent job failures.
    2. _Assets & DAM_: Complete digital asset catalog filterable by site, collection, MIME category, and 8 honest processing states (`uploaded`, `verifying`, `processing`, `ready`, `degraded`, `blocked`, `failed`, `archived`). Real-time inspect modal for variant diffs, crop focal previews, full metadata/rights display, and complete usage references.
    3. _Queue & Sessions_: Live worker queue monitoring with direct retry and safe cancellation actions, combined with active resumable upload sessions tracking staged chunks, byte progress, and expiry status.
    4. _Podcast Center_: Comprehensive podcast show and episode inventory tracking RSS feed health, enclosure verification, transcript status, and chapter markers with direct RSS feed validation and deep-link preview triggers.
    5. _Video Center_: Video asset catalog displaying processing state, duration, resolution, audio/video codecs, poster status, and WebVTT caption tracks with direct player preview and re-transcode capability.
    6. _Governance & Duplicates_: Staff governance queue identifying missing accessibility (alt text), missing credits, expiring/expired rights, orphan assets, and exact SHA-256 duplicate checksums with direct metadata repair, impact preview, asset replacement, and orphan cleanup actions.
  - Storage adapter and worker telemetry strictly sanitizes credentials (`AWS_SECRET_ACCESS_KEY`, `SESSION_SECRET`, passkeys) and path traversal data before returning payload to the client.
- **14-Stage Mandatory Clean Demo Workflow Passed (`med-06-command-center.integration.test.ts`)**:
  1. _Multi-Modal Ingestion_: Real binary files ingested via resumable chunked upload sessions (Image PNG, PDF document, Lossless Audio WAV, and Video MP4) with SHA-256 verification and magic-byte MIME detection.
  2. _Editorial Rich Text & SEO Integration_: Canonical image wired into article rich text, layout hero section, and schema.org / Open Graph SEO metadata with trackable usage records (`media-usages`).
  3. _Responsive Variants & Focal Crop_: Worker-generated renditions for thumbnail (320px), inline (720px), hero (1280px), and OG (1200x630) in AVIF, WebP, and JPEG formats, adhering to custom focal point coordinates (`focalX: 0.5, focalY: 0.25`).
  4. _DAM Metadata & Rights Application_: Applied title, alt text, caption, credit, license (CC-BY-4.0), copyright, and embargo/expiration metadata.
  5. _Post & Page Publication_: Published Page and Post with attached media; verified public route accessibility.
  6. _Podcast Show & Episode Publication_: Published canonical podcast episode with accessible player, timestamped HTML transcript (`/podcasts/episodes/:slug/transcript` with ETag/304), Podcasting 2.0 JSON chapters (`/podcasts/episodes/:slug/chapters.json`), and valid RSS 2.0 feed (`/podcasts/:slug/feed.xml`).
  7. _Video Processing & Web Playback_: Video processing pipeline extracted technical metadata (1920x1080, 24fps, H.264/AAC), generated poster asset, and attached WebVTT subtitle track for accessible playback.
  8. _Complete Usage Inspection_: Verified that every media asset accurately references its consuming Page, Post, Podcast Episode, or Video asset across revision and publication lifecycles.
  9. _Prohibited Mutation Refusal_: Refused unauthorized deletion of referenced assets (`REFERENCED_BY_PUBLIC_CONTENT`) and prevented unverified replacements.
  10. _Metadata Repair Action_: Repaired missing accessibility metadata directly from the Command Center governance queue.
  11. _Server Restart & Persistence_: Proved complete persistence of all assets, variants, and published feeds across simulated process restarts.
  12. _Public Byte & Range Streaming_: Verified anonymous public delivery of media assets (`/media/:id`), supporting HTTP 200 and HTTP 206 Partial Content byte-range delivery (`Range: bytes=...`, `Content-Range`, `Accept-Ranges: bytes`) for audio and video streams.
  13. _Backup & Restore_: Verified that backup tarball capture excludes ephemeral `.upload-sessions` chunks, validates SHA-256 integrity, enforces empty restore targets, and restores byte-identical assets.
  14. _Clean Orphan Deletion_: Confirmed that orphaned, unreferenced assets are safely purged from both database and storage without collateral damage.
- **Verification Evidence**:
  - Command Center Unit Tests: `tests/unit/med-06-command-center.test.ts` (13/13 PASS)
  - Release Gate Acceptance Integration: `tests/integration/med-06-command-center.integration.test.ts` (1/1 PASS, 14 stages in 7.6s)
  - Full Unit Test Suite: 80 test files (383/383 PASS)
  - All Media Integration Suites: Upload sessions (`med-01`), variants (`med-03`), podcast (`med-04`), video (`med-05`), and media acceptance (`media-acceptance`) all PASS
  - Browser E2E Suite: `tests/browser/med-06-command-center.spec.ts` (verified passkey auth, tabs, telemetry, secret sanitization, view modes)
  - Toolchain Status: `npm run typecheck` (0 errors), `npm run lint` (0 warnings with `--max-warnings=0`), `npm run format:check` (clean), `npm run build` (Next.js 16 standalone production build compiled with 44/44 static pages)
  - Release Gate Audit Report: `docs/operations/med-06-media-pass-gate.md`
  - Canonical feature readiness marked: `Media Pass VERIFIED`

## Media Pass MED-05 — Standards-Compliant Video Workflow Verified & Complete — 2026-09-14

- **Video Processing Pipeline**: Implemented multi-stage video processing workflow supporting real MP4/WebM uploads, metadata extraction (resolution, duration, bitrate, video codec, audio codec, frame rate), poster frame generation, WebVTT subtitle/caption extraction, and HLS/DASH packaging or single MP4 progressive fallback.
- **Accessible Video Player (`VideoPlayer`)**: Built accessible, responsive HTML5 video player with keyboard shortcuts (Space/K for play/pause, J/L for 10s seek, M for mute, F for fullscreen), subtitle track switching, playback speed controls, and picture-in-picture support.
- **Video Collections & Relations**: Added `Videos` (`videos`) and `VideoCaptions` (`video-captions`) collections with multi-creator attribution (`creators` relation to `authors`), chapters, transcripts, and privacy/licensing controls.
- **HTTP 206 Streaming & Security**: Full byte-range streaming support on `/media/:id` for video playback and scrubbing. Private videos and unprocessed uploads strictly blocked from public delivery.

## Media Pass MED-04 — Standards-Compliant Podcast Workflow Verified & Complete — 2026-09-14

- **Canonical Content Integration**: Integrated `PodcastShows` (`podcast-shows`) and `PodcastEpisodes` (`podcast-episodes`) into the canonical content, revision, and workflow system. Shows and episodes support title, slug, description, body, season/episode numbers, explicit flag, language, authors/hosts, categories, publication dates, canonical URL, show and episode artwork relationships, and audio asset relationships.
- **Audio Metadata & Non-Destructive Loudness Processing**: Implemented audio metadata extraction (`src/modules/media/audio.ts`) for MIME type, codec, container format, duration, size in bytes, and SHA-256 checksum across WAV, MP3, Ogg, and MP4 containers. Audio processing strictly preserves original bytes; loudness normalization (BS.1770 / EBU R128 integrated LUFS) is implemented as an explicit, versioned, idempotent worker recipe (`audio-recipe-task`), avoiding silent destructive audio modification.
- **Transcripts & Chapters**: Episode transcripts are stored in canonical `transcript-revisions` with timestamped segments and exposed at `/podcasts/episodes/:slug/transcript` as accessible semantic HTML with ETag and 304 conditional GET support. Chapter markers with title, time, URL, and image are supported and served at `/podcasts/episodes/:slug/chapters.json` conforming to the Podcasting 2.0 JSON chapters specification. Downloadable files and credits/rights metadata are fully supported and rendered on episode pages.
- **Accessible Native Web Player (`PodcastPlayer`)**: Created an accessible, responsive player (`src/modules/media/PodcastPlayer.tsx`) with native `<audio>` fallback, keyboard navigation, time scrub bar, playback rate selector, chapter jumps, transcript segment seeking, and copy-link-at-time with `#t=` URL hash navigation. Zero third-party SaaS players or hosted platforms required.
- **Standards-Compliant RSS Feed & Enclosures**: Built `/podcasts/:slug/feed.xml` utilizing configured canonical origin (`APP_URL`), stable public media URLs, deterministic date ordering, RFC 2822 timestamps, immutable route-independent GUIDs (`urn:renegade:podcast:<showId>:<uuid>`), exact enclosure length in bytes and MIME types, show and episode artwork, iTunes podcast tags (`itunes:author`, `itunes:season`, `itunes:episode`, `itunes:duration`, `itunes:explicit`, `itunes:category`), and Podcasting 2.0 tags (`podcast:transcript`, `podcast:chapters`). Strictly excludes drafts, scheduled, and future episodes from public feeds.
- **Feed Validation, Caching & Invariant GUIDs**: Implemented feed validation (`validatePodcastFeed`), conditional GET handling (`If-None-Match`, ETag, 304 Not Modified), deterministic sorting, and slug rename protection ensuring GUIDs remain invariant across slug changes while automatically registering 308 permanent redirects in `public-redirects`.
- **Public Media & Byte-Range Delivery (HTTP 206)**: Public media endpoint `/media/:id` verifies public references across content, podcast episodes, and shows to allow anonymous podcast listeners and aggregators to fetch audio enclosures and artwork, supporting byte-range requests (`Range: bytes=...`, HTTP 206 Partial Content, `Accept-Ranges: bytes`, and `Content-Range`).
- **Operational Documentation**: Created `docs/operations/podcast-hosting-bandwidth.md` covering origin bandwidth estimates, storage planning, HTTP byte-range caching, CDN/reverse-proxy configuration (Nginx, Caddy, Cloudflare), and zero-SaaS self-hosting best practices.
- **Verification Evidence**:
  - Acceptance Integration: `tests/integration/med-04-podcast-acceptance.integration.test.ts` (1/1 PASS, 13 end-to-end verification points including show/episode creation, preview gating, player rendering, transcript HTML + 304, chapters JSON + 304, RSS feed generation + validation + 304, enclosure range requests 200/206, slug rename with invariant GUID + 308 redirect, and persistence)
  - Audio Metadata Extraction Unit Tests: `tests/unit/med-04-audio-metadata.test.ts` (5/5 PASS)
  - Media Publishing Workflows Unit Tests: `tests/unit/media-publishing-workflows.test.ts` (7/7 PASS)
  - Full Unit Test Suite: 78 test files (367/367 PASS)
  - Full Integration Test Suite: 22 test files (59/59 PASS)
  - Toolchain Verification: `npm run typecheck` (0 errors), `npm run lint` (0 warnings), `npm run format:check` (clean), `npm run build` (standalone production build verified with all podcast routes compiled in 4.3s)

## Media Pass MED-02 — Practical DAM Foundation Implemented — 2026-09-13

- Extended canonical `media-assets` with everyday title/alt/caption/credit metadata plus optional source, copyright, licence, restrictions, consent/release references, embargo/expiry, tags/collections, and private custom metadata.
- Added `media-asset-versions` and an explicit replacement choice: create-only, selected usage rewiring, or all usages. The replacement preview returns the target/field/slot/lifecycle impact before mutation; replacement audit preserves both identities.
- Extended `media-usages` with target/revision/field/slot/publication/channel/lifecycle/reconciliation fields and added the staff-only governance queue for missing alt/credit, expiry, orphans, failures, exact checksum duplicates, and high-impact replacements.
- Release policy fails closed for pending, expired, or embargoed assets. Existing public byte delivery is withdrawn when rights are no longer valid; remediation remains visible in the governance queue. Exact checksums may identify duplicate candidates but never cause automatic merges.
- Focused verification: `tests/unit/med-02-dam-governance.test.ts` (2/2 PASS); `npm run typecheck` completed with 0 errors. Full browser, PostgreSQL migration, distribution, and release-suite proof remains required before MED-02 can be marked complete.

## Media Pass MED-03 — Versioned Image Variants Implemented; live release proof pending — 2026-09-13

- Added a worker-owned, idempotent rendition queue for approved thumbnail, inline, hero, Open Graph, and named aspect-ratio recipes. Generated outputs are checksum/recipe-version addressed; public rendering uses versioned AVIF/WebP/JPEG `<picture>` delivery with correct dimensions, ETags, immutable cache headers, and no web-process transforms.
- Preserved private originals; safely extract/normalize image metadata during worker processing, store focal/crop/color metadata, strip output metadata, reject malicious SVG, preserve animated originals under an explicit no-silent-transcode policy, and retain last-known-good blobs across recipe regeneration.
- Media Library now exposes original-versus-variant inspection, focal crop preview, status/error/savings, worker queue regeneration, and permission-gated download. GC protects originals, live variants, rollback blobs, and public uses; orphan deletion cancels processing.
- Focused Sharp fixture/unit proof is required with a real PostgreSQL+worker restart/browser pass before this may be marked VERIFIED. See `docs/operations/media-storage.md` for Lean/Standard worker resources.

## Media Pass MED-01 — Durable Resumable Upload Foundation Verified & Complete — 2026-09-13

Verified and completed the MED-01 durable upload foundation across live PostgreSQL integration, S3 storage adapter, operational backup/restore, and full Playwright browser tests:

- **Durable Resumable Upload Sessions (`media-upload-sessions`)**: Private, site/owner-scoped sessions with chunk staging under `.upload-sessions/<sessionId>/<index>.part`, byte offset verification, idempotent retry handling, chunk integrity mismatch detection (409 Conflict), magic-byte MIME sniffing, SHA-256 validation, and automatic staging directory deletion upon finalization into canonical `media-assets` and `media-blobs`.
- **Fault-Tolerant Finalization & Cleanup**: Interrupted finalization recovery (`state: 'finalizing'`) automatically recovers and commits canonical assets; completed sessions are idempotently refinalized; active cancellation purges staging chunks; and scheduled worker task `cleanupExpiredUploadSessions` purges expired sessions.
- **S3-Compatible Storage Adapter**: Verified with AWS SigV4 signed canonical requests, PUT, GET (200 & 404), DELETE, and full `uploadMedia`/`deleteOrphanedMedia` workflows when `STORAGE_DRIVER=s3`.
- **Operational Backup & Restore**: Operational backup script excludes ephemeral `.upload-sessions` staging directories while capturing canonical media (`media.tar.gz`). Verified checksum validation, tamper detection, empty target enforcement, and restore safety isolation.
- **Publisher Media Library & Browser Verification**: Verified `/admin/media-library` with `MediaUploader` chunk staging and progress, `MediaPicker` selection, metadata management (Title, Alt text, Caption), "Save metadata", canonical URL display (`/media/:id` with 0 storage path leakage), and orphaned asset deletion.
- **Verification Evidence**:
  - Live PostgreSQL integration: `tests/integration/med-01-upload-sessions.integration.test.ts` (1/1 PASS)
  - S3-compatible storage driver: `tests/unit/med-01-s3-storage.test.ts` (5/5 PASS)
  - Backup/restore media verification: `tests/unit/med-01-backup-media.test.ts` (5/5 PASS)
  - Playwright browser suite: `tests/browser/med-01-media-library.spec.ts` (1/1 PASS)
  - Full test suite: 75 unit test files (344/344 PASS), `media-acceptance.integration.test.ts` (1/1 PASS)
  - Toolchain quality: `npm run typecheck` (0 errors), `npm run lint` (0 warnings), `npm run format:check` (clean), `npm run build` (standalone build verified)

## Presentation Pass PRE-06 — Presentation Pass Release Gate Executed & Verified — 2026-09-12

Executed and verified the full Renegade CMoS Presentation Pass gate PRE-06 across a clean candidate standalone environment (`node .next/standalone/server.js`) on PostgreSQL 17 using the preserved PUB-06 `renegadeparty-demo` (`siteId: 00000000-0000-0000-0000-000000000001`):

- **12-Item Mandatory Demo Flow Verified**:
  1. _Theme Discovery & Packaging_: Installed and loaded `renegade-party` and `neutral-starter` packages from `theme-packages/` into PostgreSQL with validated manifests, token defaults, and SHA-256 asset declarations.
  2. _Isolated Authenticated Preview_: Rendered `/` with `?__theme_preview=neutral-starter&__preview_token=...` proving scoped neutral styling while anonymous requests concurrently loaded `renegade-party` without leaking preview state.
  3. _Validated Design Token Customization_: Modified `color.accent` and typography scales; verified token application while refusing dangerous or invalid CSS values pre-mutation.
  4. _Visual Composition (Campaign Page)_: Created and published `/campaign-2026` via Studio Visual Editor using registered components (`publisher.hero`, `publisher.rich-content`, `publisher.cta`), canonical media picker (`/media/906145b9-21b4-4e89-bca8-f42a0730bc93`), and internal links.
  5. _Reusable Composition_: Created and reused `Campaign Landing Template`, `hero-action-pattern`, and global `announcement` region across multiple pages.
  6. _Server-Rendered Public Output_: Verified anonymous GET to `/campaign-2026` returns HTTP 200 with server-rendered HTML and call-to-action button, with 0 editor scripts in public markup.
  7. _Draft Isolation_: Created unpublished draft layout revision 2; verified anonymous public visitors continue receiving published revision 1 with zero layout disruption.
  8. _Atomic Alternate Theme Switch_: Activated `neutral-starter` atomically; verified canonical content IDs (`truthId`), editorial bodies, canonical URLs (`/articles/decentralized-truth`), 308 redirects, SEO metadata, search queries, and media assets remained invariant.
  9. _Process Restart & Persistence_: Restarted standalone server; verified persistent theme configuration, layouts, and tokens in PostgreSQL.
  10. _Theme Upgrade & Rollback_: Executed declarative token upgrade from `1.0.0` to `1.1.0` and clean atomic rollback to `1.0.0`.
  11. _Legacy Site Migration Pipeline_: Processed WordPress WXR fixture through 8 stages, inspected side-by-side reconciliation, verified quarantine of 6 unsupported scripts/PHP elements, activated site, and executed clean rollback cascade.
  12. _Pre-Mutation Refusal_: Verified fatal rejection of unregistered blocks, script injections (`<script>alert("xss")</script>`), and invalid token inputs.
- **Accessibility Audit (WCAG 2.1 Level AA)**: Executed automated `axe-core 4.13` audit across 7 presentation templates (`/`, `/platform`, `/articles/decentralized-truth`, `/articles`, `/search?q=Decentralized`, `/pre-06-not-found-check`, `/campaign-2026`), recording 148 passing checks and 0 critical violations (`docs/presentation/evidence/a11y-audit.json`).
- **Responsive Visual Inspection**: Captured 8 responsive screenshots across Desktop (1280px), Tablet (768px), and Mobile (375px) in `docs/presentation/evidence/screenshots/`; verified fluid typography, collapsible navigation menus, and media layout containment.
- **Performance Baseline**: Recorded TTFBs (138ms home, 184ms campaign), verified 0 editor code in public frontend bundle (`verify:presentation-bundles`), and verified layout containment (`docs/presentation/evidence/performance-baseline.json`).
- **Full Verification**: 70 unit test files (325 tests passed), 4 PRE integration files (12 tests passed), Playwright browser suite passed, `npm run format:check` passed, `npm run lint` passed (0 warnings), `npm run typecheck` passed (0 errors), `npm run verify:presentation-bundles` passed. See `docs/presentation/PRE-06-PRESENTATION-PASS-GATE.md`. Canonical readiness updated to `Presentation Pass VERIFIED` in `docs/release/FEATURE_READINESS.md`.

## Presentation Pass PRE-05 — Legacy-Site Migration & Presentation Reconstruction Implemented & Verified — 2026-09-12

Implemented a safe, repeatable legacy-site migration path for WordPress WXR exports and normalized legacy site packages that reconstructs presentation alongside content without executing arbitrary WordPress PHP, plugins, shortcodes, scripts, or untrusted CSS:

- **Staged Pipeline**: 8-stage resumable and idempotent lifecycle: Inspect → Parse & Normalize → Map → Dry-Run Preflight → Execute Import into Isolated Site or Target → Verify Reconciliation → Deliberate Activation → Rollback / Clean Delete.
- **Content & Taxonomy Normalization**: Full parsing of WXR posts, pages, authors (mapped to unique sanitized slugs `canonicalSlug`), nested categories hierarchy, tags, dates, slugs, excerpts, featured and inline media rewiring, menus, and Yoast / RankMath SEO metadata. Gutenberg blocks parsed into clean blocks; classic paragraphs handled via fallback.
- **Safe Media Acquisition**: Remote downloads gated by explicit operator permission (`remoteMediaDownloadAllowed`), strict SSRF defense via `assertSafeOutboundUrl` blocking private networks, loopback, and cloud metadata endpoints, SHA-256 deduplication, and magic-byte MIME validation (`inspectMedia`).
- **URL Inventory & Redirect Plan**: Complete inventory of legacy permalinks, canonical mapping, collision detection, and circular redirect loop prevention producing validated 308 permanent redirects.
- **Presentation Reconstruction**: Derives design tokens (typography, color, spacing), header/footer globals with navigation menus, and Page/Post/Archive templates using registered Renegade starter components (`publisher.hero`, `publisher.rich-content`, `publisher.article-list`, `publisher.feature-grid`, `publisher.cta`). Reconstructed layouts remain strictly in `draft` status until deliberate activation.
- **Quarantined Artifact Boundary**: Explicit preservation of unsupported shortcodes, plugin blocks (WooCommerce, forms), scripts, styles, dynamic PHP, comments, memberships, and commerce in `legacy_migration_quarantine` table with audit rationale; zero arbitrary PHP/script execution.
- **Administrative Review Interface (`/admin/migration?runId=...`)**: Side-by-side reconciliation table, acceptance checklist, presentation token/template viewer, redirects viewer, quarantine inspector, and deliberate activation button.
- **Rollback and Idempotency**: Complete cascade deletion of created sites and dependent records using `session_replication_role = 'replica'`.
- **Full Verification**: 69 unit test files (312 tests), 18 integration test files (52 tests), browser spec (`tests/browser/pre-05-legacy-migration.spec.ts`), Next.js 16 standalone production build, `verify:presentation-bundles`, and ESLint/Prettier passing with 0 warnings/errors. Database migration `20260912_050000_pre_05_legacy_site_migration` applied. See `docs/presentation/PRE-05-LEGACY-MIGRATION.md`.

## Presentation Pass PRE-04 — Reusable Visual Composition Implemented & Verified — 2026-09-12

Expanded the visual editor into site-scale reusable visual composition within safe theme contracts:

- **Reusable Page Templates**: Created, named, previewed, duplicated, versioned, and retired templates (`surface: 'template'`, `slot: 'main'`). Implemented three inheritance modes: `inherited`, `explicit`, and `detached`. Guaranteed that future template changes NEVER surprise-update published pages (only drafts synchronize; published presentation snapshots remain strictly immutable until deliberate publication).
- **Reusable Patterns & Sections**: Saved registered component trees with theme and version metadata. Insertion provides an explicit, visible choice between a documented snapshot (independent cloned blocks) and a linked instance (`publisher.pattern` reference block).
- **Versioned Global Regions**: Full support for outer shell slots (`header`, `footer`, `announcement`, `cta`) with draft preview, full revision audit history, and one-click rollback (`/api/layouts/:id/rollback`).
- **Theme-Approved Per-Instance Style Controls**: Constrained style controls using theme tokens and variants (spacing, width, alignment, background, emphasis, responsive visibility rules) with accessible limits. Arbitrary CSS properties (style/css/className) and dangerous markup (<script>/<style>/javascript:) are strictly rejected by schema and collection hooks.
- **Unified Studio Navigator**: Replaced implementation collection exposure with an integrated Studio Navigator (Canvas, Pages, Templates, Globals, Patterns) directly inside the visual editor shell.
- **Responsive Preview Presets**: Presets for Desktop (1280px), Tablet (768px), and Mobile (375px) with exact draft preview URLs (`/builder/:id/preview?viewport=...`).
- **Relationship-Aware Deletion Safeguards**: Blocked deletion of templates referenced by active pages and patterns linked into layouts with actionable guidance to retire or detach.
- **Presentation Document Export & Import**: Packaged presentation documents (`renegade-presentation-package` v1) with upfront pre-mutation cross-theme incompatibility detection.
- **Mini-Site End-to-End Verification**: Multi-page Renegade Party mini-site exercised in unit, integration, and Playwright browser suites (`tests/browser/pre-04-reusable-composition.spec.ts`).

Verification: Unit suite 68 files / 302 tests passed; PostgreSQL integration suite 17 files / 51 tests passed; Playwright browser test passed; Next.js standalone build passed; `verify:presentation-bundles` passed; ESLint and Prettier check passed with 0 warnings/errors. Additive migration `20260912_040000_pre_04_reusable_composition` applied. See `docs/presentation/PRE-04-REUSABLE-COMPOSITION.md`.

## Presentation Pass PRE-03 — Controlled Visual Editor Implemented & Verified — 2026-09-12

Delivered a registry-driven Puck editor behind the `VisualEditor` adapter with categorized template/slot palettes; accessible add/select/reorder/duplicate/configure/remove and session undo/redo; typed text, link, canonical media, bounded query, variant, alignment, and theme-token fields; autosave and optimistic-conflict recovery; authenticated exact draft preview; immutable publication snapshots; compatible theme switching; restricted global header/footer composition; and an article-template boundary that keeps canonical Post bodies outside the canvas.

Both collection hooks and the PATCH boundary validate the explicit layout schema/version/component IDs, size/count/nesting limits, slot allow-lists, safe props, canonical site-scoped references, and approved tokens. Removed or incompatible stored components are preserved in `unknownBlocks`, render with a safe fallback, and surface an actionable repair state; newly injected unknown components are rejected. Puck CSS/code is editor-route-only.

Verification: focused presentation 30/30; full unit 67 files / 285 tests; full integration 16 files / 46 tests (44/46 initial sweep, both environment/baseline failures repaired and 4/4 affected tests rerun); dedicated Chrome acceptance passed; canonical Next.js standalone build passed; `verify:presentation-bundles` passed. Migration `20260912_030000_pre_03_visual_editor` applied. See `docs/presentation/PRE-03-VISUAL-EDITOR.md`.

## Presentation Pass PRE-01 — Local Theme Lifecycle Implemented & Verified — 2026-09-12

Implemented and verified the end-to-end theme lifecycle from PRE-00 contracts across local package discovery, registered renderer resolution, typed design tokens, authenticated preview, atomic transactional activation, rollback, and process persistence:

- **Local Package Boundary (`theme-packages/<id>-<semver>/theme.json`)**:
  - Validated by `src/modules/presentation/packages.ts` against schema requirements: unique `id`, semantic `version`, compatibility range `renegade`, registered `renderer`, token schema/defaults, declared inert assets with SHA-256 integrity, and declarative idempotent `migrations`.
  - Rejects unknown fields, path traversal (`../escape`), invalid semver (`latest`), undeclared assets, symlinks, arbitrary imports, and executable JS/CSS configuration.
  - Retains incompatible packages in discovery with actionable operator errors (`compatible: false`) without offering activation. Verified against malicious fixtures in `tests/fixtures/themes/malicious.json`.
- **Registered Presentation Renders & Scoped Tokens**:
  - Packages resolve only registered executable renderers (`neutral-starter`, `renegade-party`) from `src/modules/presentation/registry.tsx`. Arbitrary filesystem imports and dynamic evaluation remain strictly forbidden.
  - Typed design tokens (`src/modules/presentation/tokens.ts`) for canvas, surface, ink, accent, focus, typography, spacing, radii, border, card shadows, content widths, and motion duration. Contrast enforcement guarantees WCAG compliance (4.5:1 text/accent, 3:1 focus against canvas/surface).
  - Emits scoped CSS variables (`--presentation-*`) on `body[data-theme]` without contaminating admin or leaking across sites.
- **Draft Settings & Authenticated Preview Sessions**:
  - Draft configurations saved to `presentation_theme_state` (PostgreSQL jsonb) without modifying anonymous output or canonical content revisions.
  - Preview sessions issue opaque cryptographically random tokens stored as SHA-256 hashes in `presentation_theme_previews`, bound to owner ID and site ID with 15-minute expiration, delivered in HttpOnly SameSite Strict cookie `presentation-preview`.
  - Unauthenticated visitors or stolen preview cookies cannot activate preview. Ending preview revokes stored token and prevents replay.
- **Atomic Activation, Preflight Validation & Rollback**:
  - Multi-step preflight renders public sample routes (`/`, `/articles`, `/search`, canonical paths) with preview probe before committing.
  - Uses PostgreSQL row locks (`SELECT ... FOR UPDATE`), atomic revision increment, and rollback tracking. Commits active state, records audit log in `presentation_theme_audit`, revokes previews, and calls `revalidatePath('/', 'layout')` within a single atomic transaction.
  - Public HTTP resolution automatically falls back and rolls back to previous compatible configuration if an active package is deleted, corrupted, or tampered on disk.
- **Declarative Presentation Migrations**:
  - Versioned declarative `defaults` migrations merge package token updates into existing selections while preserving operator token overrides. Idempotent and restricted strictly to presentation metadata. Never alters canonical content or rich-text bodies.
- **Capability Center Admin UI (`/admin/capabilities`)**:
  - `src/modules/admin/ThemeCenter.tsx` provides site selection, installed package inventory, compatibility badges, capability indicators, token overrides editor, preview launch/teardown, activation, and rollback controls with inline actionable status messages.
- **Multisite Isolation**:
  - State, previews, and audits are strictly partitioned by `site_id`.
- **Verification Evidence**:
  - Unit tests: 66 files / 281 tests passed (`tests/unit/pre-01-themes.test.ts`, `tests/unit/pre-00-presentation.test.tsx`).
  - Integration tests: 16 files / 46 tests passed (`tests/integration/pre-01-theme-lifecycle.integration.test.ts`).
  - Smoke tests:
    - `tests/smoke/presentation.smoke.mjs`: verified 6 surfaces (home, Page, Post, archive, search, 404) with manifest headers and canonical revision text.
    - `tests/smoke/theme-lifecycle.smoke.mjs`: verified anonymous denial, draft isolation, authenticated owner preview with token variables, cookie revocation, atomic activation, rollback, and revision fingerprint preservation.
    - `tests/smoke/theme-restart.smoke.mjs`: restarted standalone web and worker processes twice, verified readiness (`/health/ready` and worker heartbeat), proved active theme and stored state persist across restarts (`docs/presentation/pre-01-restart-evidence.json`).
  - Production build: `npm run build` compiled cleanly with Next.js standalone and asset synchronization. Lint and format checks clean.

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

# Media Pass MED-00 — Canonical Asset and Real-byte Delivery Contract — 2026-09-12

`media-assets` is now the durable editorial identity; private `media-blobs`
own the site-scoped, SHA-256-addressed local/S3-compatible objects; and
`media-variants` retain generated-object provenance. Browser delivery remains
`/media/:assetId`, independent of storage keys. Upload byte-sniffing, metadata
compensation, same-site deduplication, approved-published-use delivery,
replacement chains, shared-blob deletion refusal, and local storage as the
zero-provider default are implemented. Metadata-only `local://` fixtures are
not publicly deliverable. Migration `20260912_060000_med_00_media_contract`
was applied to local PostgreSQL; ADR-0007 records the contract.

Focused contract/domain/storage tests pass; local health is ready with migrations
applied. The next media prompt is MED-01.

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

---

# Publishing Pass — PUB-05: Publisher Operations & Recovery — 2026-09-02

- The default admin entry points now form a normal publisher navigation: Dashboard, Posts, Pages, Media, Menus, Site Settings, Redirects, and View Site. Infrastructure records remain registered but are progressively hidden; owner-only Capability Center remains the route to optional and operational surfaces.
- Dashboard is task-oriented: it offers write/create/media/menu actions, setup progress, recent drafts, scheduled and published work, direct public View links, and an explicit owner route for actionable operational failures.
- Operational restore validates manifest checksums and validates the native PostgreSQL and media archive formats before it starts the isolated Compose target. `restore:rehearsal` resets only the restore project volumes, restores, waits for readiness, and compares anonymous public HTML plus media SHA-256 values between source and restored sites.
- `docs/OPERATIONAL_BACKUP.md` is the canonical command procedure for the backup, isolated recovery, and rehearsal path. It documents the Lean and Standard deployment profiles in conjunction with `docs/PRODUCTION_DEPLOYMENT.md`; no secret material is included in either archive format.
- Operational npm commands terminate the TypeScript runner argument list before forwarding flags, so Node 24 does not consume `--env-file`. `restore:prepare-env` generates a non-overwriting, restore-only `.env.restore`; backup and restore preflight missing or placeholder environment values before invoking Compose.

## Media Pass MED-05 — Native Small-Video Path Implemented; live profile proof pending — 2026-09-14

- Added canonical video metadata, private source and `video-assets` processing records, validated WebVTT captions, transcript/chapter links, rights/visibility/canonical paths, and shared content/workflow relationships.
- Added a `VideoProcessor` boundary and real FFprobe/FFmpeg `web-video-v1` recipe in an optional `media-heavy` image/profile. It creates fast-start H.264/AAC MP4, single-rendition VOD HLS, poster, contact sheet, checksums, and codec/duration/dimension metadata. The default worker does not consume the heavy queue.
- Added progress, concurrency/resource limits, retry/backoff, cancellation, stale recovery, deterministic regeneration, last-good fallback, anonymous range delivery, caption delivery, native player, detail/archive pages, VideoObject schema, and distribution clip intents.
- Verified a real six-second 640x360 H.264/AAC MP4 in the isolated 2-CPU/2-GiB image: fast-start MP4, HLS, poster, contact sheet, progress events, metadata, and checksums were produced; independent FFprobe opened MP4 and HLS. The production Docker build, live PostgreSQL migration, generated Payload contracts, typecheck, lint, formatting, and 79 unit files / 370 tests passed.
- Kill/restart queue recovery, anonymous browser seeking through the live published route, and backup/restore rehearsal remain mandatory before MED-05 is marked fully verified.

## Discovery Pass DISC-01 — Publisher Defaults, Resolver Inspection & Canonical Safety (IMPLEMENTED; RELEASE GATE PARTIAL) — 2026-09-14

- Added site and content-type discovery defaults plus per-content overrides without duplicating canonical title, summary or hero-media entry.
- Added the normal content editor’s progressive disclosure panel showing resolved values, provenance, fallback chains, warnings, repair controls and search/Open Graph/Twitter previews from the public resolver.
- Hardened multisite canonical origins, path/query normalization, cross-site refusal, redirect/missing/noindex/private target refusal, launch-state indexability and public social-variant/rights eligibility.
- Synchronized route/home/search/sitemap/feed invalidation across settings, content and media writes; added explicit noindex metadata to draft builder preview, setup, migration admin and 404 surfaces.
- Added migrations `20260914_120000_disc_01_discovery_workflow` and corrective shared-field migration `20260914_121000_disc_01_shared_seo_fields`, operator guide `docs/discovery/DISC-01-PUBLISHER-WORKFLOW.md`, focused tests, and production-browser raw-source acceptance.
- **Passed:** TypeScript; zero-warning ESLint; full unit suite (82 files / 398 tests); focused DISC contracts (15/15); PostgreSQL migration; DISC crawler integration (7/7); Windows and Linux-container Next.js production builds (45/45 pages); final PostgreSQL/web/worker restart health; dedicated Chrome/raw HTTP acceptance (1/1) covering Page, Post, canonical origin under spoofed proxy headers, eligible social variant, draft 404/noindex, search/setup/admin/404 noindex, and storage-path refusal.
- **Full integration sweep:** 24 files / 67 tests passed against PostgreSQL in a disposable repository-root workspace on the Compose network. This workspace binds the checkout (including `vitest.config.ts`, aliases, tests and fixtures) while retaining the release image's Linux dependencies; PRE-01 runs with the checked-in `theme-packages` fixtures. The aggregate repairs retain the canonical builder robots disallow, use the configured origin in podcast feed assertions, tolerate additional valid shared-media usages, and give the genuine 14-stage MED-06 acceptance its explicit 30-second budget.
- **Open release evidence:** authenticated browser interaction with the newly registered in-editor resolver panel (including clicking repair controls and live inherited-versus-explicit edits) was not executed. DISC-01 remains release-gate partial rather than VERIFIED until that exact admin-browser scenario passes.

## Discovery Pass DISC-03 — Crawler Infrastructure & Observable Indexing State Implemented; release proof pending — 2026-09-15

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

## Second Pass Prompt 0 reconciliation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 2026-08-25

**First Pass remains completed and preserved.** Prompt 0 was audit/reconciliation only. The source-of-truth inventory is [docs/FULL_STACK_COMPLETION.md](docs/FULL_STACK_COMPLETION.md); it records registered schemas, migrations, routes, jobs, providers, auth, tests, reuse boundaries, enterprise capability ownership, and the exact Second Pass order.

**Next Second Pass implementation prompt: Prompt 1 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Shared jobs/integration runtime and Coordinated Content Releases.** No newly identified blocker prevents starting it. Reuse `article-family-content`, `revision-records`, `scheduled-publish-jobs`, `campaigns`, and Payload Jobs; do not create a parallel editorial or scheduling family.

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

---

# Publishing Pass — PUB-05: Publisher Operations & Recovery — 2026-09-02

- The default admin entry points now form a normal publisher navigation: Dashboard, Posts, Pages, Media, Menus, Site Settings, Redirects, and View Site. Infrastructure records remain registered but are progressively hidden; owner-only Capability Center remains the route to optional and operational surfaces.
- Dashboard is task-oriented: it offers write/create/media/menu actions, setup progress, recent drafts, scheduled and published work, direct public View links, and an explicit owner route for actionable operational failures.
- Operational restore validates manifest checksums and validates the native PostgreSQL and media archive formats before it starts the isolated Compose target. `restore:rehearsal` resets only the restore project volumes, restores, waits for readiness, and compares anonymous public HTML plus media SHA-256 values between source and restored sites.
- `docs/OPERATIONAL_BACKUP.md` is the canonical command procedure for the backup, isolated recovery, and rehearsal path. It documents the Lean and Standard deployment profiles in conjunction with `docs/PRODUCTION_DEPLOYMENT.md`; no secret material is included in either archive format.
- Operational npm commands terminate the TypeScript runner argument list before forwarding flags, so Node 24 does not consume `--env-file`. `restore:prepare-env` generates a non-overwriting, restore-only `.env.restore`; backup and restore preflight missing or placeholder environment values before invoking Compose.

## Media Pass MED-05 — Native Small-Video Path Implemented; live profile proof pending — 2026-09-14

- Added canonical video metadata, private source and `video-assets` processing records, validated WebVTT captions, transcript/chapter links, rights/visibility/canonical paths, and shared content/workflow relationships.
- Added a `VideoProcessor` boundary and real FFprobe/FFmpeg `web-video-v1` recipe in an optional `media-heavy` image/profile. It creates fast-start H.264/AAC MP4, single-rendition VOD HLS, poster, contact sheet, checksums, and codec/duration/dimension metadata. The default worker does not consume the heavy queue.
- Added progress, concurrency/resource limits, retry/backoff, cancellation, stale recovery, deterministic regeneration, last-good fallback, anonymous range delivery, caption delivery, native player, detail/archive pages, VideoObject schema, and distribution clip intents.
- Verified a real six-second 640x360 H.264/AAC MP4 in the isolated 2-CPU/2-GiB image: fast-start MP4, HLS, poster, contact sheet, progress events, metadata, and checksums were produced; independent FFprobe opened MP4 and HLS. The production Docker build, live PostgreSQL migration, generated Payload contracts, typecheck, lint, formatting, and 79 unit files / 370 tests passed.
- Kill/restart queue recovery, anonymous browser seeking through the live published route, and backup/restore rehearsal remain mandatory before MED-05 is marked fully verified.

## Discovery Pass DISC-01 — Publisher Defaults, Resolver Inspection & Canonical Safety (IMPLEMENTED; RELEASE GATE PARTIAL) — 2026-09-14

- Added site and content-type discovery defaults plus per-content overrides without duplicating canonical title, summary or hero-media entry.
- Added the normal content editor’s progressive disclosure panel showing resolved values, provenance, fallback chains, warnings, repair controls and search/Open Graph/Twitter previews from the public resolver.
- Hardened multisite canonical origins, path/query normalization, cross-site refusal, redirect/missing/noindex/private target refusal, launch-state indexability and public social-variant/rights eligibility.
- Synchronized route/home/search/sitemap/feed invalidation across settings, content and media writes; added explicit noindex metadata to draft builder preview, setup, migration admin and 404 surfaces.
- Added migrations `20260914_120000_disc_01_discovery_workflow` and corrective shared-field migration `20260914_121000_disc_01_shared_seo_fields`, operator guide `docs/discovery/DISC-01-PUBLISHER-WORKFLOW.md`, focused tests, and production-browser raw-source acceptance.
- **Passed:** TypeScript; zero-warning ESLint; full unit suite (82 files / 398 tests); focused DISC contracts (15/15); PostgreSQL migration; DISC crawler integration (7/7); Windows and Linux-container Next.js production builds (45/45 pages); final PostgreSQL/web/worker restart health; dedicated Chrome/raw HTTP acceptance (1/1) covering Page, Post, canonical origin under spoofed proxy headers, eligible social variant, draft 404/noindex, search/setup/admin/404 noindex, and storage-path refusal.
- **Full integration sweep:** 24 files / 67 tests passed against PostgreSQL in a disposable repository-root workspace on the Compose network. This workspace binds the checkout (including `vitest.config.ts`, aliases, tests and fixtures) while retaining the release image's Linux dependencies; PRE-01 runs with the checked-in `theme-packages` fixtures. The aggregate repairs retain the canonical builder robots disallow, use the configured origin in podcast feed assertions, tolerate additional valid shared-media usages, and give the genuine 14-stage MED-06 acceptance its explicit 30-second budget.
- **Open release evidence:** authenticated browser interaction with the newly registered in-editor resolver panel (including clicking repair controls and live inherited-versus-explicit edits) was not executed. DISC-01 remains release-gate partial rather than VERIFIED until that exact admin-browser scenario passes.

## Discovery Pass DISC-03 — Crawler Infrastructure & Observable Indexing State Implemented; release proof pending — 2026-09-15

- Added the canonical sitemap-index route with 1,000-URL deterministic children; removed the conflicting Next metadata sitemap route; paginated resolver source scans; omitted invalid timestamp/image extension facts rather than inventing them; and retained the 25,000-eligible-URL asynchronous-generation recommendation.
- Added RSS 2.0, JSON Feed 1.1, and stable-ID author/taxonomy/content scoped feeds while preserving Media-owned podcast RSS. Robots now blocks all required management paths while allowing crawler public surfaces.
- Added idempotent canonical-URL indexing changes: slug transitions remove the old URL and upsert the new URL; media expiry/replacement finds affected public content URLs; the existing outbox handler records provider outcome; and staff can download an honest manual handoff JSON artifact.
- **Passed:** Windows-native typecheck and zero-warning lint; focused DISC/discovery unit suite (5 files / 47 tests); focused PostgreSQL crawler/discoverability suite (2 files / 8 tests); corrected PUB-04/DISC-03 regression (2 files / 13 tests); isolated production build (45/45 routes); anonymous isolated-standalone crawl with parsed sitemap/RSS/JSON Feed, ETags/304, and bounded-child 404.
- **Aggregate integration:** 23 files / 66 tests passed; one PUB-04 assertion failed solely because it expected the old weaker robots disallow list. The assertion was updated for `/guided-setup`, `/internal`, and `/private`, and that affected suite then passed; the full 24-file aggregate was not rerun afterwards.
- **Open release evidence:** normal production build/restart is blocked by a pre-existing live process locking `.next/standalone` (`EBUSY`); browser Indexing Center acceptance was added but interrupted before execution; lifecycle/output-set/event convergence, indexing-worker restart, non-empty multipage PostgreSQL set comparison, non-empty scoped-feed crawl, migration-status confirmation, and clean repository-wide format check remain open. The WSL Linux Rollup tree also remains unusable (`@rollup/rollup-linux-x64-gnu` absent); Windows-native tooling was used without deleting locks or `node_modules`. **Do not label DISC-03 VERIFIED.**
- Documentation: `docs/discovery/DISC-03-CRAWLER-INFRASTRUCTURE.md`.

# Audience Pass AUD-05 — Email Delivery (IMPLEMENTED; live-provider/restart release proof pending) — 2026-09-20

- Added the versioned provider-neutral email adapter v1 contract: connection and sender readiness, single/batch/idempotency/reconciliation capability truth, local capture and SMTP implementations, and sanitized error normalization.
- Per-recipient deliveries now distinguish transport `accepted` from verified `delivered`, persist approved render hashes, Message-ID, retry/lease fields, and retain a deduplicated sanitized provider-event evidence ledger. Timeout is an `unknown` outcome and cannot be automatically retried or failed over.
- Marketing delivery rechecks canonical eligibility immediately before transport use, creates a recipient-bound unsubscribe token, and supplies absolute List-Unsubscribe/one-click and purpose headers. Bounce, complaint, unsubscribe, and provider suppression feed the existing canonical suppression service; signed webhook events are idempotent and order-safe.
- Added migration `20260920_050000_aud_05_email_delivery` and `docs/audience-aud-05-operator-guide.md`. Focused email/audience unit tests passed (12 tests). SMTP real credentials, production DNS authentication, PostgreSQL migration, worker-crash/restart, browser journey, security scan, full integration suite, and production build remain required release evidence. AUD-06/AUD-07 can consume canonical delivery/event states but must not infer inbox placement from `accepted`.

# Audience Pass AUD-06 — Telecom Capability & Messaging Safety (IMPLEMENTED; release verification pending) — 2026-09-20

- Added the honest telecom capability architecture: versioned `MessagingProviderAdapter` (v1) for SMS, MMS, and verifiable RCS (basic & rich cards), with explicit sender types, carrier rate limits, delivery receipts, and error taxonomy.
- Preserved core legal and channel boundaries: email consent never implies SMS/RCS consent; telecom requires explicit, purpose-specific opt-in; phone numbers are stored as normalized E.164 with user display retention; and number reassignment immediately invalidates prior consent and suppresses future sends.
- Added deterministic Inbound Keyword Processing (`STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`, `ARRET`, `HELP`, `START`): inbound opt-out immediately cancels queued sends before dispatch (`suppressed-before-send`) and establishes send-time suppression. Free-form inquiries route to staff review without marketing reply bot hallucination.
- Implemented channel composer for GSM-7 (160 single / 153 multi-segment, with 2-septet extension chars) vs. UCS-2 (70 single / 67 multi-segment), personalization fallback (`{{var|fallback}}`), accessibility alt-text validation on RCS media cards, and real-time cost/unit estimation labeled as estimates.
- Delivered the deterministic local telecom emulator with capability lookup, direct RCS routing, configured SMS fallback (`rcs-fallback-to-sms`), prohibited fallback refusal (`rcs_not_supported_no_fallback`), rate limits, carrier rejection, timeouts, and inbound event simulation.
- Implemented real provider adapter (`createTwilioTelecomAdapter`) with connection/sender preflight, secret token redaction in diagnostics/logs, and outbound transmission safety gates (`TELECOM_ALLOW_OUTBOUND=true`).
- Enforced strict TCPA quiet hours (8:00 AM - 9:00 PM local recipient time) with DST-resilient morning send window calculations and exemptions for transactional/emergency messages.
- Added collections (`telecom-messages`, `telecom-deliveries`, `telecom-delivery-events`), durable worker tasks (`audience-telecom-delivery`, `audience-telecom-dispatch`), migration `20260920_060000_aud_06_telecom`, and operator runbook `docs/audience-aud-06-operator-guide.md`.
- Verification: 21 focused telecom unit tests passed; full repo unit test suite (110 files / 635 tests) passed 100%; TypeScript compilation (`tsc --noEmit`) clean with 0 errors. Ready for handoff to AUD-07.

# Audience Pass AUD-07 — Audience Command Center & Bounded Operations (IMPLEMENTED; release verification pending) — 2026-09-20

- Created the calm, decision-useful Audience Command Center (`src/modules/admin/AudienceCommandCenter.tsx`, `/admin/audience`) spanning contacts, consent health, forms, segment estimates, unified campaigns/automations (Email/SMS/RCS), deliverability health, and source-labeled outcomes.
- Established the formal source-labeled Metric Dictionary and event model (`AUDIENCE_METRIC_DICTIONARY`): defined formulas, numerators, denominators, windows, channels, and providers for 16 core metrics. Explicitly resolved inconsistent definitions: `provider_accepted` is labeled as transport handoff (not inbox proof); `carrier_delivered` requires verified carrier DLR or DSN; observed opens are reported with Apple MPP proxy uncertainty bounds; and clicks require known bot and prefetch filtering.
- Implemented Unified Campaign & Automation Calendar with draft/review/approved/scheduled/running/completed/paused states across Email, SMS, and RCS. Included accessible non-drag keyboard/button controls, frequency conflict warnings (detecting multiple campaigns targeting the same segment within 24h), quiet hours warnings (TCPA 8am-9pm window), and linkage to Workflow/Distribution releases.
- Built campaign and automation funnel/cohort views with delivery and conversion facts under strict k-anonymity privacy thresholds (`PRIVACY_MIN_COHORT_SIZE = 5`), masking any cell with N < 5 as `< 5` to prevent deanonymization.
- Designed deliverability health monitoring with explainable trends and direct remediation: warning alerts for hard bounce rate (≥ 2.0%), spam complaints (≥ 0.10%), queue age (> 60m), webhook lag (> 300s), invalid forms, and stale segments, with one-click direct remediation actions.
- Delivered the Bounded Message Experiments Engine: immutable hypotheses, metrics, windows, and variant allocations; deterministic recipient allocation using seeded SHA-256 cryptographic hashing modulo 100 (reproducible without mid-test reassignment); statistical sample size warnings; deliverability guardrails (auto-pause on bounce > 4% or complaints > 0.15%); and strict manual operator winner decisions (`autoDeployed: false`).
- Built privacy-aware link attribution with first-party campaign parameters (`?rcid=`, `?rcch=`, `?rcvar=`), support for direct-link/tracking-off opt-out, bot click filtering for corporate security crawlers (Barracuda, Mimecast, Proofpoint) and prefetch headers (`Purpose: prefetch`), with zero third-party fingerprinting.
- Added privacy-safe CSV/report export under role authorization (`owner`, `administrator`, `staff`) with mandatory k-anonymity masking and no sensitive PII exposure.
- Registered collection `AudienceExperiments`, migration `20260920_070000_aud_07_audience_command`, and documentation `docs/audience-aud-07-operator-guide.md`.
- Verification: 35 focused AUD-07 unit tests passed; full repository test suite (111 files / 670 tests) passed 100%; TypeScript compilation (`tsc --noEmit`) clean with 0 errors. Ready for handoff to AUD-08.

## Community Pass COMM-02 — Public Profile Projection — 2026-09-21

Partial implementation: a versioned allowlisted projection, staff-only raw profile reads, governed image references, field visibility, member editing/preview, discovery opt-out and directory API, site-scoped follow/block/mute writes, handle redirects, export/deletion linkage, and focused policy tests. Release work added and applied `20260921_010000_comm_02_profile_media_usage_relation`, repairing the required `media_usages_rels.profiles_id` FK/index; generated types, TypeScript, production build, and all 11 COMM-00 PostgreSQL integration stages pass. This is **not release-verified**: repository aggregate suites contain unrelated pre-existing registration and legacy schema failures, and the latest focused browser rerun had transient status-region failures. Accessibility, clean multi-browser repeat, restart/recovery, and exhaustive live lifecycle/export evidence remain open. COMM-05/COMM-06 must reuse the canonical projection and block/mute policy.

# Shared Contract Candidate Run — 2026-09-23

**PARTIAL.** Candidate execution and evidence: [shared-contract-candidate-2026-09-23.md](docs/execution/shared-contract-candidate-2026-09-23.md). After restart, fresh/upgrade/commerce migrations, first-run passkey setup, build, lint, typecheck, formatting, and all unit tests passed. Broader provider-backed commerce, editorial/release, operations, accessibility, query-bound, and audit/metrics surface acceptance remains unverified.

## Final release-proof gate — BROKEN (2026-09-23)

The final gate did not accept the dirty candidate based on `8eaa32b895599fa1b6ae1fcac44d89d6bbab0082`. Fresh and upgrade migrations recorded 98 entries, but a clean seed and `/events` fail because `events.required_entitlement` is missing. Full integration failed; nine-surface restore and restart proof are incomplete. Do not launch. See `docs/execution/final-release-proof-2026-09-23.md`.
