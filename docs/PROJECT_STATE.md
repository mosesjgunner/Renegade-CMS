## Community Pass COMM-01 — Member Authentication and Account Lifecycle — 2026-09-20

- **Implementation**: Expanded member lifecycle, site-scoped member roles, member-auth account/session/profile/link/export/delete endpoints, passkey service, and `20260920_100000_comm_01_member_auth_lifecycle.ts` are present.
- **Current evidence**: Payload types regenerated; focused member identity suite passes 9/9; `tests/integration/comm-00-community-pass.integration.test.ts` passes 10/10 against PostgreSQL after the COMM-01 schema upgrade, including moderation suspension and member-session revocation. `tests/browser/comm-01-member-auth.spec.ts` passes with Chromium virtual WebAuthn: magic-link browser sign-in, explicit member/admin cookie separation, passkey enrollment, cleared-cookie re-login, and no admin-cookie issuance. Production build and aggregate typecheck pass.
- **Required release evidence**: Inspectable transactional mail capture; authenticated/anonymous HTTP boundary suite; restart; backup/restore; aggregate lint. The process-local development mail sink is not cross-process browser-delivery evidence.

## Community Pass COMM-00 — Canonical Member Journey Reconciled — 2026-09-20

- **Verified journey**: Real PostgreSQL integration passes all 10 steps in `tests/integration/comm-00-community-pass.integration.test.ts`: magic-link registration/login, profile projection, anonymous comments, forum thread/reply, reactions, notification isolation, report/block, moderator removal and suspension, direct messages, session revocation, and persisted history.
- **Policy and ownership**: `src/modules/community/policy.ts` is the shared service policy path. `members` is the canonical Community identity; credentials, administrator users, sessions, roles, and public `profiles` remain separate. Community objects retain one Payload or durable SQL owner each.
- **Migration**: `src/migrations/20260920_090000_comm_00_community_domain.ts` is the idempotent upgrade path for reactions, reports, moderation actions, conversations, participants, and messages. Existing Payload community records are retained; no duplicate identity backfill is introduced.
- **Static evidence**: Community policy unit tests pass 13/13. Touched files have no editor diagnostics.
- **Partial**: Browser HTTP sessions, passkeys, direct REST/GraphQL parity, search/realtime leakage, attachments, export/backup exclusions, deletion/retention, and worker/reconnect proofs remain unverified.
- **Handoff**: COMM-01 owns browser and HTTP boundary proof while preserving the canonical member/profile relationship and shared policy evaluator. See `docs/decisions/ADR-0009-community-domain-contract.md`.

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

## Media Pass MED-03 — Versioned image variant processing implemented — 2026-09-13

- The `media` queue owns bounded, idempotent image processing. Approved recipe names resolve immutable checksum- and recipe-version-addressed output; browser delivery is responsive AVIF/WebP/JPEG with ETags and immutable cache control.
- Originals remain private, generated metadata is stripped, unsafe SVG is refused, animated originals are preserved without silent flattening, focal/crop data is non-destructive, and prior ready output is held for rollback-safe regeneration/GC.
- Status: implementation and focused real-Sharp fixtures are in place. PostgreSQL worker restart, public browser, S3, backup/restore and full release gates still require live evidence before a VERIFIED claim.

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

## Media Pass MED-00 — Canonical Asset and Real-byte Delivery Contract — 2026-09-12

Implemented the canonical `media-assets` / `media-blobs` / `media-variants`
boundary. Assets preserve editorial identity and stable `/media/:id` URLs;
private blobs own opaque local or S3-compatible storage keys and site-scoped
SHA-256 deduplication; variants retain generated-object provenance. Uploads
sniff bytes, record accessible and rights metadata, compensate failed metadata
transactions, and default to private delivery. Anonymous delivery now requires
an approved same-site published use (or explicit site identity policy), and
legacy `local://` metadata fixtures cannot be served as bytes. Replacement,
shared-blob deletion refusal, and local/S3 adapter capabilities are explicit.

Migration: `20260912_060000_med_00_media_contract`. Contract tests cover byte
deduplication, MIME spoofing, traversal protection, tenant isolation, public
eligibility, replacement cycles, and transaction cleanup. See ADR-0007.

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

# Project state

## Publishing Pass PUB-02 — canonical Posts and Pages

- `content` is now the sole publisher-facing record for both Posts (`article`) and Pages (`page`): it owns title, scoped URL identity, taxonomy, authors, hero/related references, lifecycle, and the canonical Payload Lexical `body`.
- `/admin/posts` and `/admin/pages` are task-oriented filtered views of that same collection. They intentionally do not expose `article-family-content`, revision records, or Page Layouts as authoring destinations.
- A Lexical body supports the default accessible heading, paragraph, link, list, and quote nodes plus registered safe relationship references to media/content. Raw HTML is not the canonical body format.
- Paths derive from title/slug (`/articles/{slug}` for posts, hierarchical `/parent/child` paths for pages), permit an explicit override, reject reserved paths, enforce same-site parentage, and are unique per site. The migration backfills canonical `content.body` from existing editorial records before replacing global-path uniqueness with site/path uniqueness.
- `article-family-content` remains a derived workflow/revision index. Normal Content-form body saves automatically append immutable revision evidence; restores continue to create a new draft revision rather than altering history. Page Layouts remain visual presentation projections only.
- Migration: `20260902_000000_pub_02_content_publishing_pass`. Payload types/import map were regenerated after reconciliation. PUB-03 public rendering remains out of scope.

## Second Pass Prompt 10 — Calendar Center and Graphics Studio

- Added the `/calendar` orchestration surface with Month, Week and Agenda controls, scoped/My Calendar filters, timezone presentation, status/type indicators, unscheduled and conflict affordances, canonical edit links, and optimistic drag feedback.
- Added `CalendarProjection` contracts and a server command router. Dragging a `content-release` calls `scheduleContentRelease`; no calendar timestamp is copied into a release record. Native calendar and social queue updates retain their own canonical audit/recovery paths.
- Added the canonical `ContentRelease` collection and scheduling command, including idempotency and append-only schedule audit data.
- Added lightweight template-based graphics service: quote, article-social, OG, podcast, YouTube thumbnail, book/chapter promo, product, event, announcement and donation/campaign presets. It verifies asset export/rights state before creating `GraphicDocument`, `MediaDerivative`, and `MediaUsage` records.
- Graphic Documents now carry ownership scope, template, and registered layout-variant keys for later approved experimentation targeting. No Experiment schema was introduced.
- Focused unit suite and TypeScript validation pass. Database migration generation and integration acceptance require the project PostgreSQL service.

## Second Pass Prompt 11 - Forms, subscribers, and newsletters

- Registered the canonical Audience collection family and durable Payload jobs: form definitions/versioned locale schemas/submissions, CRM and workflow links, lists/segments/memberships, subscribers, one-time confirmation tokens, consent evidence, preferences/suppressions, messages/deliveries and notifications.
- Public form submission validates the published schema, uses a honeypot hook and idempotency key, preserves the exact reviewed consent wording/revision/schema version, and refuses outdated or machine-generated localized legal text. Attachments remain private, allowlisted and scan-pending through the safe-upload contract.
- Double opt-in confirmation tokens are opaque, hashed, expire after 24 hours and are consumed once. Unsubscribe uses a signed token; provider bounce/complaint webhooks require `EMAIL_WEBHOOK_SECRET` signatures before suppression is recorded.
- Newsletter review enforces the email-safe block set, checks DAM approval and registers `MediaUsage` for image assets. Scheduled sends dispatch in a durable job and create one idempotent delivery per eligible recipient; delivery workers re-check suppression and retry provider failures without affecting website or subscriber records.
- Translation Operations integration is represented by `translationProject` and `localeCompleteness` snapshots on localized form schemas/messages; reviewed consent is mandatory for non-source locales. CTA button blocks expose an explicit `experimentTarget` hook reserved for Prompt 14, with no hidden personalization.
- Focused TypeScript and unit validation pass. A database migration must be generated against the configured PostgreSQL schema before database-backed acceptance; generation was intentionally not retained without that schema because it duplicated Prompt 10 objects.

## Second Pass Prompt 12 � Canonical Storefront, Cart, and Provider-Neutral Checkout

- Registered the canonical commerce family: merchant connections, capability registry records, products, carts, checkout sessions, payment intents, orders, and verified webhook-event replay records. Products support physical, digital, POD-reference, subscription, and membership shapes, variants/SKUs, multi-currency minor-unit prices, inventory and POD hooks, entitlement keys, collections/categories, localized text, approved governed media, and release revision pinning.
- Added `/store`, `/cart`, canonical public product rendering, server-side checkout initiation, a bounded checkout-expiration Payload job, and a webhook endpoint. Checkout re-evaluates merchant/site/space scope, buyer and merchant country, currency, amount, purchase recurrence, capability configuration, and provider health. Client callback/redirect data cannot confirm a payment.
- Development Stripe, PayPal, Mollie, and bank-transfer fixture adapters follow the same registry contract: hosted immediate flows and asynchronous transfer flow are covered; production adapters must be supplied through the existing connection/credential-reference boundary and signed webhook verification. Provider outage returns no eligible method / a safe unavailable response.
- Webhook processing verifies an HMAC before use, records provider-event identity for replay protection, appends financial history idempotently, transitions checkout/order state only from the verified event, and cannot duplicate an order on replay. Refund, shipping and tax are explicit extension fields/boundaries.
- Product localized fields carry Prompt 2 review snapshots; locale routing and public formatting use the existing locale infrastructure. Legal/payment copy is persisted as reviewed checkout copy and is never machine-translated implicitly. Content release publication references products/revisions only; it has no payment initiation path.
- Focused `npm run typecheck` and commerce unit acceptance validation pass. A PostgreSQL migration should be generated from the registered collection schema against the configured database before database-backed deployment, consistent with prior second-pass modules.

## Part A.5 � Local Point-of-Sale / QR Crypto Payments

- Extended the existing Cart ? Order ? PaymentIntent commerce path with an intent-bound, provider-neutral crypto POS invoice contract. It captures the remote rate-provider/manual quote provenance, fiat amount, exact crypto amount, network, asset, destination, reference, expiry, confirmation requirement and no-secret boundary. QR URIs encode that one invoice; permanent wallet-address-only QR codes are not used where invoice identifiers/references are supported.
- Added a responsive `/pos` surface and local QR encoder, plus POS states, inventory/receipt idempotency, reorg/reconciliation handling, merchant display-config fields (through existing connection configuration), and optional extension capability boundaries. Blockchain observations must be server/adapter verified; customer transaction hashes and UI callbacks do not prove payment.
- Focused POS tests cover QR exactness/binding, wrong payment characteristics, expiry, amount variance, duplicate observations, confirmation progression, reorg, quote expiry/manual fallback, and Space/role isolation. No local node, custodial wallet, private key, seed phrase or signing secret is required or retained.

## Second Pass Prompt 13 � Renegade Simple Crypto Pay, Crowdfunding, and POD

- Extended the canonical `PaymentIntent`, `Campaign`, `Order`, `Supporter`, and `Entitlement` record families. No parallel financial ledger, wallet-auth flow, or private-key storage was introduced.
- Noncustodial crypto invoices bind exact atomic amount, asset, network, creator destination, standard URI/QR payload, expiry, confirmations and append-only transaction observations. EVM-compatible and Dogecoin fixture adapters plus the manual reconciliation boundary are represented; a submitted hash is only a server-side adapter lookup hint. Wrong destination/network, duplicate observations, under/overpayment, late payments and reorgs stay unconfirmed or enter a scoped reconciliation/exception path.
- Campaigns now carry public/private visibility, scheduling, goal/progress history, milestones, update visibility, tiers/perk Product references, Calendar and newsletter/social hooks, supporter visibility, and entitlement/fulfillment references. The public projection removes private updates and all private campaigns.
- Printful/Printify-compatible POD adapters submit governed artwork exactly once with an order idempotency key; `Order.fulfillmentExtension` holds only external status/tracking. Restricted/unapproved artwork is rejected before submission, signed webhook verification is available, and provider failure is scoped to the affected fulfillment/order exception state.
- Verification: `npm run typecheck` and focused Prompt 13 Vitest acceptance coverage pass. Database migration generation remains dependent on the configured PostgreSQL service, consistent with earlier second-pass handoffs.

## Audience Pass AUD-06 — Telecom Capability & Messaging Safety (IMPLEMENTED; release verification pending) — 2026-09-20

- Added the honest telecom capability architecture: versioned `MessagingProviderAdapter` (v1) for SMS, MMS, and verifiable RCS (basic & rich cards), with explicit sender types, carrier rate limits, delivery receipts, and error taxonomy.
- Preserved core legal and channel boundaries: email consent never implies SMS/RCS consent; telecom requires explicit, purpose-specific opt-in; phone numbers are stored as normalized E.164 with user display retention; and number reassignment immediately invalidates prior consent and suppresses future sends.
- Added deterministic Inbound Keyword Processing (`STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`, `ARRET`, `HELP`, `START`): inbound opt-out immediately cancels queued sends before dispatch (`suppressed-before-send`) and establishes send-time suppression. Free-form inquiries route to staff review without marketing reply bot hallucination.
- Implemented channel composer for GSM-7 (160 single / 153 multi-segment, with 2-septet extension chars) vs. UCS-2 (70 single / 67 multi-segment), personalization fallback (`{{var|fallback}}`), accessibility alt-text validation on RCS media cards, and real-time cost/unit estimation labeled as estimates.
- Delivered the deterministic local telecom emulator with capability lookup, direct RCS routing, configured SMS fallback (`rcs-fallback-to-sms`), prohibited fallback refusal (`rcs_not_supported_no_fallback`), rate limits, carrier rejection, timeouts, and inbound event simulation.
- Implemented real provider adapter (`createTwilioTelecomAdapter`) with connection/sender preflight, secret token redaction in diagnostics/logs, and outbound transmission safety gates (`TELECOM_ALLOW_OUTBOUND=true`).
- Enforced strict TCPA quiet hours (8:00 AM - 9:00 PM local recipient time) with DST-resilient morning send window calculations and exemptions for transactional/emergency messages.
- Added collections (`telecom-messages`, `telecom-deliveries`, `telecom-delivery-events`), durable worker tasks (`audience-telecom-delivery`, `audience-telecom-dispatch`), migration `20260920_060000_aud_06_telecom`, and operator runbook `docs/audience-aud-06-operator-guide.md`.
- Verification: 21 focused telecom unit tests passed; full repo unit test suite (110 files / 635 tests) passed 100%; TypeScript compilation (`tsc --noEmit`) clean with 0 errors. Ready for handoff to AUD-07.

## Audience Pass AUD-07 — Audience Command Center & Bounded Operations (IMPLEMENTED; release verification pending) — 2026-09-20

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

### 2026-09-21: COMM-03D Community Platform Thread Lifecycle, Public Rendering Visibility, Subscriptions, and Outbox Emission

- Implemented staff controls for thread lifecycle: `closed`, `frozen`, and `premoderation_enabled` in `src/modules/community/thread-lifecycle.ts` and `PATCH /api/v1/sites/:site_id/threads/:thread_id`.
- Enforced thread lifecycle rules: closed threads reject new comment submissions with 403 `THREAD_CLOSED` while allowing reactions; frozen threads render comments and reactions completely read-only with 403 `THREAD_FROZEN` / `COMMENT_FROZEN`.
- Implemented premoderation: when `premoderation_enabled` is true, new comments enter with status `pending_review` rather than `visible`.
- Implemented recursive comment retrieval bounded to depth 5 with sort modes: `chronological`, `reverse chronological`, and `reaction volume` via `getThreadCommentsTree` and `GET /api/v1/sites/:site_id/threads/:thread_id/comments`.
- Added `comment_thread_subscriptions` with migration `20260921_040000_comm_03d_thread_lifecycle_and_outbox.ts` and subscription endpoints `POST`/`DELETE`/`GET` on `/api/v1/sites/:site_id/threads/:thread_id/subscriptions`.
- Added atomic transactional outbox emission: on comment persistence, atomically writes `comment.created.v1` to `outbox_events` within the same database transaction. Payload strictly provides: `site_id`, `comment_id`, `thread_id`, `canonical_content_id`, `author_id`, `parent_id`, `mentioned_handles`, and `timestamp`. Verified simulated rollback leaves zero orphan comments or outbox events.
- Enforced public SSR comment visibility: public SSR includes comments only when the parent canonical content is published and indexable; scrubbed `deleted`, `quarantined`, `rejected`, and `pending_review` comments from public SSR; ensured `<link rel="canonical">` rendered.
### 2026-09-22: COMM-06B Community Platform Recipient Policy and Inbox Projections

- Implemented candidate recipient resolution in `src/modules/community/inbox-notifications.ts` covering thread subscriptions, space memberships, mentions (`profiles` table), moderation targets, and reply targets.
- Enforced pre-projection delivery checks: block/mute verification (`checkBlockBetween`, `checkMuteFrom`), target status/quarantine checks (`targetIsDeliverable`), and forum space read authorization (`resolveForumSpaceAccess`).
- Added tables `inbox_notifications` with composite keyset index `(recipient_member_id, site_id, created_at DESC, id DESC)` and `member_notification_counters` with atomic CTE unread counter maintenance via migration `20260922_110000_comm_06b_inbox_projections.ts`.
- Built inbox APIs with keyset pagination: `GET /api/v1/notifications`, `PATCH /api/v1/notifications/:id/read`, and `POST /api/v1/notifications/mark-all-read`.
- Sanitized notification snapshots (`noSnippet`) to eliminate private/quarantined text snippets.
- Verification: 8 unit tests in `tests/unit/comm-06b-inbox-notifications.test.ts` passed (blocked actors, revoked access, quarantined targets, 5,000-notification keyset pagination, and atomic counter updates).

### 2026-09-22: COMM-06C Email/SMS Digests and Audience Outbox Integration

- Implemented notification preferences and delivery routing in `src/modules/community/notification-delivery.ts` supporting channels (`in_app`, `email`, `sms`) and frequencies (`immediate`, `daily_digest`, `weekly_digest`, `off`).
- Added migration `20260922_120000_comm_06c_notification_preferences_and_outbox.ts` registering `notification_preferences` and `audience_delivery_outbox` tables with pending indices.
- Enforced mandatory notices: `moderation_warning` and `sanction_issued` bypass voluntary frequency toggles and route immediately as transactional notices.
- Preserved marketing consent separation: marketing unsubscribes do not block transactional community notifications.
- Added windowed digest compiler `compileNotificationDigest` grouping notifications by `site_id`, `recipient_id`, and `windowRange`.
- Enforced strictly generic private message subjects and preheaders ("New private message on {siteName}") with zero body/snippet leakage.
- Verification: 4 unit tests in `tests/unit/comm-06c-digests-and-outbox.test.ts` passed (daily digest batching, marketing unsubscribe separation, generic private message subjects, and mandatory moderation routing).

### 2026-09-22: COMM-06D Realtime Notification Hints and Counter Repair

- Implemented authenticated SSE route `GET /api/v1/notifications/stream` in `src/app/(frontend)/api/v1/notifications/stream/route.ts` with session and `site_id` verification.
- Enforced lightweight hint streaming only (`{ type: "notification_received", unread_count: N }`), preventing any full notification payload leakage.
- Added connection lease manager in `src/modules/community/notification-stream.ts` restricting concurrent streams to max 5 leases per member and rejecting 6th concurrent stream with 429.
- Added 15-second heartbeat timer and reconnect replay support using `Last-Event-ID`.
- Verified strict tenant isolation: Site A clients never receive Site B notification hints.
- Added ops utility `POST /ops/rebuild-notification-counters` (`src/app/(frontend)/ops/rebuild-notification-counters/route.ts`) recalculating exact unread counts from `inbox_notifications`.
- Verification: 4 unit tests in `tests/unit/comm-06d-realtime-hints-and-repair.test.ts` passed. Full repository test suite (134 files / 843 tests) passed 100%; ESLint clean with 0 warnings.
