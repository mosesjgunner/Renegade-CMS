## Shared Contract Gate — Affiliate, POD Fulfillment & Worker Health Conformance Verified — 2026-09-24

- **Gate Status**: **VERIFIED WITH CONFIGURED PROVIDER REQUIRED** (Deterministic local emulator adapter, local webhook signers, test accounts, and deterministic sinks verified; external live provider networks require live Printful API keys and production webhook secrets).
- **Scope & Baseline**: Evaluated candidate baseline after SHOP-00–07, COMM-08, AUD-08, and the first six gates. Executed dedicated integration suite `tests/integration/shared-contract-affiliate-pod.integration.test.ts` (28/28 test cases passing across all 28 numbered requirements), along with unit suites `tests/unit/shop-06-affiliate-and-referrals.test.ts` (19/19) and `tests/unit/shop-03-pod-fulfillment.test.ts` (26/26). Total 73/73 tests passing.
- **First Failure Named (Honest Disclosure)**:
  - **First Failure**: Initial integration run threw `AssertionError` in Test 1 (`AffiliateLink` rendered `rel="sponsored nofollow noopener"` vs test expecting `rel="sponsored noopener noreferrer"`), and `TypeError: input.items is not iterable` in Test 4 due to calling `importConversionEvidence` with positional arguments instead of options object, followed by `TypeError: Cannot read properties of undefined (reading 'costMinor')` in Test 13 because `sampleMapping` fixture lacked `snapshot` and `buildFulfillmentPlan` had not been executed prior to `createPodJobAfterPaidAcceptance`.
  - **Root Cause & Resolution**:
    1. Standardized `AffiliateLink` assertion to match FTC/ASA compliant `rel="sponsored nofollow noopener"`.
    2. Corrected `importConversionEvidence` invocation to supply `{ siteId, source, network, rawPayload, items, existingEvidence, existingClicks, existingOffers }`.
    3. Replaced ad-hoc string rejection codes in Test 5 and Test 11 with canonical domain union literals (`SELF_REFERRAL_SAME_MEMBER`, `SELF_REFERRAL_SAME_EMAIL`, `CONSENT_REQUIRED`).
    4. Updated `reverseCommissionEntry` in Test 7 to pass `{ entry: accrual, reason: 'order_refunded', refundReference }` and assert on `reversalResult.updatedEntry` and `reversalResult.reversalEntry`.
    5. Added defensive optional-chaining (`item.podMapping?.snapshot?.costMinor ?? '1200'`) in `src/modules/commerce/fulfillment-plan.ts`.
    6. Updated Test 13 to construct a valid `FulfillmentPlan` via `buildFulfillmentPlan` before invoking `createPodJobAfterPaidAcceptance({ plan, packageIndex: 0, orderPaymentState: 'paid' })`.
    7. Hardened `FulfillmentCommandCenter.tsx` with `React.FC<FulfillmentCommandCenterProps>`, guarded `lastHealthStatus.toUpperCase()` against undefined, and guarded `job.state.toUpperCase()`.
    8. Resolved all TypeScript diagnostics with `tsc --noEmit` clean (0 errors).
- **Core Proofs (28 / 28)**:
  1. **Affiliate (1–11)**:
     - 1. _Tracking enabled_: Verified subId token interpolation (`tok_...`), click record persistence, and normal UI output (`AffiliateLink` rendering accessible sponsored anchor with screen-reader disclosure badge).
     - 2. _Tracking disabled_: Verified privacy signals (`DNT: 1`, `Sec-GPC: 1`, and `trackingConsent = false`) completely suppress click record generation and scrub subId tokens from outbound redirects.
     - 3. _Redirect allow/deny behavior_: Strict URL validator blocks open redirect attacks (e.g. `evil-site.internal`, malicious javascript protocols) and unapproved tracking query parameters while preserving authorized UTM tags.
     - 4. _Conversion import_: Ingests raw external network evidence idempotently, calculates deterministic SHA-256 payload hash, matches to click and offer records, and flags duplicates.
     - 5. _Referral attribution_: Enforces program configuration rules, participant role eligibility, maximum commission caps ($50 cap on $60 order), and defeats self-referral attacks (identical member ID `SELF_REFERRAL_SAME_MEMBER` and identical email `SELF_REFERRAL_SAME_EMAIL`).
     - 6. _Commission hold_: Holds referral commissions in `pending` state during configured hold period (14 days); matures to `eligible` only after hold expires.
     - 7. _Refund/reversal_: Compensating `reversal` entry generated upon order refund, linked via `compensatesLedgerId`, restoring clean zero-eligible liability state.
     - 8. _Settlement calculation_: Liabilities strictly separated by currency (USD vs EUR) without cross-currency contamination; excluded held referrers from payout batches.
     - 9. _Settlement export_: Operator approval gates tamper-evident SHA-256 hashed CSV export generation for banking/payout execution.
     - 10. _Do not execute real payout_: Safe simulated gateway failure rolls back ledgers to `eligible` with zero funds transferred; reconciliation transitions batch to `completed` and ledgers to `settled` without executing real money movement.
     - 11. _Privacy choices & Prohibited attribution_: User refusal of tracking consent strictly prevents attribution (`CONSENT_REQUIRED`); rendered full `AffiliateReferralDashboard` UI demonstrating currency-separated liability breakdown.
  2. **POD Fulfillment (12–23)**:
     - 12. _Product/preflight validation_: Validates minimum 150 DPI requirement (rejecting low 72 DPI artwork), supported print areas (`front`, `back`), mime types, and print placement bounds.
     - 13. _Hold_: Paid order creates POD job in `on_hold` state with 2-hour hold window (`holdExpiresAt`), blocking dispatch during customer cancellation/edit window (`isPodJobEligibleForSubmission === false`).
     - 14. _Release_: Early customer or operator release transitions job to `created` and records `hold_released` audit event, enabling worker submission.
     - 15. _Duplicate provider event_: Normalized webhook events deduplicated via `details.providerEventId` without redundant state changes or duplicate audit trail entries.
     - 16. _Unknown provider event_: Unrecognized webhook event kinds recorded safely in audit trail without crashing worker processes or corrupting state.
     - 17. _Reconciliation_: Actively polls provider adapter via `reconcilePodJobWithProvider`, synchronizes remote state and tracking, and updates `lastReconciledAt` timestamp.
     - 18. _Shipping state_: Shipped webhook event applies carrier, tracking number, and tracking URL to order line fulfillments.
     - 19. _Tracking state_: Sanitizes tracking URLs, strips `javascript:` and insecure protocols, and preserves official carrier portal deep-links (USPS, FedEx, UPS).
     - 20. _Provider failure_: Transient 503 errors trigger exponential backoff and retry (`retryable: true`); exhaustion of 3 attempts marks job `failed` and triggers manual handoff requirement.
     - 21. _Manual recovery path_: Hands off failed POD job to `ManualFulfillmentPackage` queue with explicit disclaimer (`MANUAL_FULFILLMENT_DISCLAIMER`) and signed private artwork URLs (`/api/commerce/pod/assets/...`). Operator acknowledges and ships manually.
     - 22. _Restart while work in progress_: Worker crash and restart during submission resumes safely using deterministic idempotency key (`pod_job:site:order:pkg:hash`), reusing external order without duplicate creation.
     - 23. _Concurrency invariant_: Proves zero duplicate orders, fulfillments, shipments, notifications, or provider submissions under 5 concurrent submission attempts.
  3. **Provider / Worker Health (24–28)**:
     - 24. _Provider degradation and recovery_: Adapter health check reflects `unavailable`/`degraded` on maintenance windows and recovers to `healthy` upon resolution.
     - 25. _Failed worker/job visibility_: `FulfillmentCommandCenter` UI prominently displays failed worker jobs with retry counts, last error messages, and direct links to the manual queue.
     - 26. _Reconciliation-age reporting_: Tracks timestamp of last sync (`lastReconciledAt`) and displays sync age in the Command Center.
     - 27. _Command Center drilldown_: Provider health alert banner provides one-click drilldown filtering directly to affected provider jobs, hiding unaffected provider jobs.
     - 28. _Unsupported capabilities labeled_: Capabilities matrix explicitly labels unsupported features (`Unsupported — Requires manual operator review (Not simulated or silently claimed)` and `Unsupported — Strict address guard blocks PO boxes`). Engine rejects automated reprints when unsupported, and address validation rejects PO boxes.
- **Verification Evidence**:
  - `tests/integration/shared-contract-affiliate-pod.integration.test.ts`: 28 passed (28).
  - `tests/unit/shop-06-affiliate-and-referrals.test.ts`: 19 passed (19).
  - `tests/unit/shop-03-pod-fulfillment.test.ts`: 26 passed (26).
  - `tests/integration/shared-contract-commerce-shop.integration.test.ts`: 34 passed (34).
  - Aggregate: 107 tests passing across all commerce, affiliate, POD, and shared contract suites.
  - Toolchain quality: `tsc --noEmit` clean (0 errors).

## Shared Contract Gate — Commerce Domain Integration Verified — 2026-09-23

- **Gate Status**: **VERIFIED WITH CONFIGURED PROVIDER REQUIRED** (deterministic local payment adapters, local webhook signers, test accounts, and deterministic sinks verified; external live provider networks require live provider keys and production webhook secrets).
- **Scope & Baseline**: Evaluated candidate baseline after SHOP-00–07, COMM-08, AUD-08, and the first six gates. Executed dedicated integration suite `tests/integration/shared-contract-commerce-shop.integration.test.ts` (34/34 test cases passing across all 31 numbered requirements).
- **Core Proofs**:
  1. **Checkout / Order (1–11)**: Guest cart initialization with secure cookie hashing, anti-tampering rejection of client-provided prices/currency/totals, guest cart recovery via signed token, deterministic tax (jurisdiction-bounded) and shipping rate calculation, checkout proposal binding with integrity hash, signed payment event validation, deduplication of duplicate, delayed, and out-of-order webhook events, worker restart resilience during reconciliation, exactly one canonical Order and one correct receipt generated under concurrent delivery, partial and full refunds and dispute ledger adjustments, and immutable line-item snapshotting ensuring catalog modifications post-purchase never corrupt historical order facts.
  2. **Member / Subscription (12–20)**: Secure guest-to-member cart merging upon authentication without line loss, subscription lifecycle creation, gated entitlement provisioning, failed renewal transitions (`past_due` with dunning schedule), grace period enforcement, deterministic recovery vs expiry, plan upgrade/downgrade and cancellation flow, immutable invoice records and billing history retention, and worker restart resilience during recurring renewal proving zero duplicate charges, invoices, entitlement grants, or notices.
  3. **Donations (21–30)**: One-time donation flow with fee coverage, recurring donation with deduplicated supporter entity reuse, privacy selection (`public`, `name-only`, `anonymous`, `private`) correctly respected on donor walls, campaign goal progress calculation strictly in campaign currency excluding non-succeeded gifts, supporter perk entitlement grant and revocation on refund, recurring donation cancellation, replay/duplicate payment evidence deduplication, and GDPR/privacy anonymization clearing personal PII while preserving required financial audit facts.
  4. **Attacks & Boundary Security (31)**: Defeated totals manipulation (negative values, floating-point numbers, non-integer minor units), checkout proposal tampering and expiration attacks, forged webhook signatures and payload tampering, expired/invalid coupon stacking attacks, inventory overselling attacks, digital media HMAC download token forging, malicious/open checkout redirect URLs, and illegal money-state transition attacks (reverting refunded/cancelled transactions).
- **Verification Evidence**:
  - `tests/integration/shared-contract-commerce-shop.integration.test.ts`: 34 passed (34).
  - Focused Shop/Commerce unit test suites:
    - `shop-` suites: 7 files / 103 passed.
    - `commerce-`, `donation-`, `subscription-` suites: 10 files / 78 passed.
    - Total commerce tests executed: 17 test files, 181/181 passed.
  - Toolchain quality: `tsc --noEmit` clean (0 errors), `eslint` clean (0 warnings).

## Shared Contract Gate — Audience & Community Domain Integration Verified — 2026-09-23

- **Gate Status**: **VERIFIED WITH CONFIGURED PROVIDER REQUIRED** (local/test provider and telecom emulator verified; live external networks require configured provider credentials).
- **Scope & Baseline**: Evaluated candidate baseline after SHOP-00–07, COMM-08, AUD-08, and the first six gates. Executed dedicated integration suite `tests/integration/shared-contract-audience-community.integration.test.ts` (20/20 test cases passing across all 21 numbered requirements).
- **Core Proofs**:
  1. **Audience Lifecycle (1–7)**: Visitor signup, purpose-specific preferences and double opt-in consent state, deterministic multi-rule segmentation, newsletter delivery via development/test provider, telecom SMS/RCS emulator delivery with quiet-hours and STOP keyword opt-out suppression, scheduled follow-up suppression, and proof that post-scheduling suppression halts dispatch at send time.
  2. **Community Lifecycle (8–15)**: Member profile privacy controls with mutual block isolation and PII projection boundaries, comment lifecycle with anti-XSS and 15-minute edit windows, forum space access control and idempotent thread/reply participation, notification isolation with unread counter tracking, end-to-end member messaging, block/report abuse triage workflows, moderator post-removal and member suspension with active session revocation, and recovery/appeal audit workflows.
  3. **Permissions & Privacy (16–18)**: Cross-user and cross-site object attacks rejected with strict tenant/space isolation; unauthorized access to private files, member profiles, messages, notifications, and staff surfaces blocked (401/403/404); privacy settings verified consistent across UI, APIs, workers, notifications, exports, and retained history.
  4. **Resilience & Idempotency (19–21)**: Simulated worker crash and restart during audience dispatch and community workflows; zero duplicate deliveries, messages, notifications, segment memberships, or moderation actions under concurrent execution.
- **Verification Evidence**:
  - `tests/integration/shared-contract-audience-community.integration.test.ts`: 20/20 passed.
  - `tests/integration/comm-00-community-pass.integration.test.ts`: 11/11 passed.
  - `tests/integration/aud-08-audience-pass-gate.integration.test.ts`: 10/10 passed.
  - Focused AUD unit test suites: 7 files / 72 tests passed.
  - Focused COMM unit test suites: 28 files / 189 tests passed.
  - Toolchain quality: `tsc --noEmit` clean (0 errors), `eslint` clean (0 warnings), `prettier --check` clean.

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

## Shared Contract Commerce & Shop Verification Gate (SHOP-00–07, COMM-08, AUD-08) — 2026-09-23

- Verification Status: **VERIFIED WITH CONFIGURED PROVIDER REQUIRED**
- Scope: Applied the canonical shared contract across Storefront, Carts, Bounded Jurisdiction Tax & Shipping, Checkout Proposals, Signed Payment Events, Replay/Delayed/Out-of-order Delivery, Dual-Control Refunds & Disputes, Catalog Immutability, Member/Subscription Entitlements, Dunning & Grace Periods, Donation Campaigns & Anonymization, and Anti-Tampering Financial Attack Suites.
- Invariants & Proofs Delivered (34/34 passing integration checks across all 31 proof requirements):
  1. **Guest Cart**: Canonical anonymous cart persistence and signed guest order claims (`signGuestOrderToken`, `verifyGuestOrderToken`).
  2. **Tampering Defense**: Price/total tampering detected via deterministic HMAC-SHA256 proposal integrity hashing; mutated amounts rejected.
  3. **Cart Recovery**: Session recovery reconstructs unquoted/tampered items with reconciliation notes and live catalog pricing.
  4. **Tax & Shipping**: Deterministic integer allocation (standard ground $8.00; US:TX 6.25% jurisdiction tax: subtotal $90.00 + shipping $8.00 = $98.00 \* 0.0625 = $6.12 -> grand total $104.12).
  5. **Checkout**: Cryptographically bound checkout proposals with version matching and TTL enforcement.
  6. **Signed Payment Event**: Idempotent provider verification (`createDeterministicPaymentAdapter`, `createStripeTestAdapter`).
  7. **Duplicate, Delayed & Out-of-Order Deliveries**: Webhook replay protection via event ledger; subsequent duplicates acknowledge without duplicate financial transition.
  8. **Worker Restart During Reconciliation**: Safe idempotent re-execution leaves exact state without duplicate side-effects.
  9. **Canonical Order & Receipt**: Exactly one immutable Order and one transactional receipt (`receiptMessageSnapshot`) issued.
  10. **Refunds & Disputes**: Dual-control approval boundaries (`previewRefund`, `executeRefund`); over-refund prevention; chargeback state tracking.
  11. **Catalog Immutability**: Historical order lines snapshot name, SKU, price, and media; subsequent product mutations or deletions do not corrupt historical order records.
  12. **Member/Guest Cart Identity Merge**: Clean identity merge on member sign-in; strict prohibition of cross-site guest cart theft.
      13–14. **Subscription & Gated Entitlements**: Active subscription provisions immediate member entitlement grant (`insiders-lounge`).
      15–16. **Failed Renewal & Grace Period**: Transition to `past_due` preserves grace access until deterministic dunning window expiry.
  13. **Recovery vs Deterministic Expiry**: Successful invoice recovers active state; exhausted dunning terminates subscription and revokes entitlements.
  14. **Plan Change & Cancellation Flow**: Scheduled `cancel_at_period_end` allows mid-cycle resumption without double billing.
  15. **Segregated Billing Metrics**: Segregated MRR/currency reporting (`USD` $15.00, `EUR` $14.00) without currency conversion bleed.
  16. **Renewal Restart Safety**: Simulated crash during renewal processing proves zero duplicate charges, invoices, or entitlement grants.
      21–22. **Donation Ingestion**: One-time gifts with fee-cover calculation and recurring donor installment tracking linked to canonical supporter identity.
      23–24. **Recognition & Donor Wall**: Distinct recognition levels (`public`, `anonymous`, `pseudonym`); public wall projections filter anonymous gifts.
  17. **Goal & Progress**: Progress strictly calculated in campaign currency; refunded/failed gifts excluded from milestone totals.
      26–27. **Supporter Entitlement & Revocation**: Entitlements granted on settlement and deterministically revoked upon refund.
  18. **Recurring Donation Cancellation**: Subscription cancellation preserves historical donor contributions without altering ledger facts.
  19. **Evidence Reconciliation**: Delayed/duplicate donation payment events deduplicated via ledger.
  20. **Retention vs Anonymization**: Donor privacy erasure scrubs personal PII while retaining required tax/accounting records.
      31a–h. **Financial Attack Suite**: Defeated totals attack (negative/floating numbers), expired proposal replay, forged webhook HMAC, expired/stacked coupons, inventory stock overflow, forged digital download HMAC tokens, malicious return URL schemes, and illegal state transitions (refunded -> succeeded).
- Quality Metrics:
  - `npm run typecheck`: Clean (0 errors).
  - `npm run lint`: Clean (0 errors).
  - `npm run format:check`: Clean (All matched files use Prettier code style).
  - Integration Test Suite: `shared-contract-commerce-shop.integration.test.ts` (34 passed / 34 tests, 0 failed).

## Final Release-Proof Gate — BROKEN — 2026-09-23

The final release-proof gate did not accept the candidate. Base SHA `8eaa32b895599fa1b6ae1fcac44d89d6bbab0082` does not identify the dirty tested tree. Clean install, format, lint, typecheck, production build, 970 unit tests, 82 focused shared-contract tests, and fresh/supported-upgrade migrations passed. Full integration failed (17 files; 6 tests), and the freshly migrated database cannot seed or render `/events` because `events.required_entitlement` is absent despite 98 applied migration records. An isolated database dump restored successfully, but nine-surface/media restore and actual restart/provider proof remain open. **First launch blocker: fresh-install schema mismatch. Do not launch.** Full evidence and limits: `docs/execution/final-release-proof-2026-09-23.md`.
