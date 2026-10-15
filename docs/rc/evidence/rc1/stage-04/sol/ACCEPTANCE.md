# Stage 04 Sol Commerce, Audience, Community and Provider Acceptance

## Status Declaration

**STAGE 04 SOL PASS.**  
Independently verified and signed by Sol, 2026-10-15 (America/Chicago).  
**RC1 NOT READY** until Stages 05–07 pass.

---

## 1. Candidate & Source Identity

- **Repository**: `C:\Projects\RENEGADE CMS\Renegade-CMS` (Windows)
- **Branch**: `main`
- **Candidate Merge SHA**: `f0a728c03d45c284813e2e7c5ea23167394800de`
- **Reconciled Sol Repair Source**: `b5369e78faa228d7e0b4375d9a3147b164363b2c`
- **Gemini Candidate SHA**: `4177c71325c20d459aca864fb09c10356117aa68`
- **Stage 03 Sol Tested SHA**: `d311396876fabc104826e4375d26feef0b5e2b39`
- **Stage 02 Sol Tested SHA**: `f487dcb67f0649ffc1ecd09b9a47cc845d705f61`
- **Ancestry Verification**: `git merge-base --is-ancestor` returns 0 for all predecessor Sol and Gemini milestones against candidate HEAD `f0a728c03d45c284813e2e7c5ea23167394800de`.

---

## 2. Independent Quality Gates Verification

All 10 required quality gates passed on the reconciled candidate source `f0a728c03d45c284813e2e7c5ea23167394800de` with zero errors, zero warnings, and zero skipped assertions:

| Gate | Command | Exit Code | Verified Counts & Results | Duration |
| :--- | :--- | :---: | :--- | :---: |
| **01 Typecheck** | `npm.cmd run typecheck` | **0** | 0 errors (`tsc --noEmit`) | 5.8s |
| **02 Lint** | `npm.cmd run lint` | **0** | 0 errors, 0 warnings (`eslint . --max-warnings=0`) | 20.2s |
| **03 Format** | `npm.cmd run format:check` | **0** | All matched files use Prettier style | 27.5s |
| **04 Full Unit** | `npm.cmd test` | **0** | **195 test files passed, 1,290 passed tests**, 0 failed | 26.2s |
| **05 Fresh Schema** | `npm.cmd run test:migrations:fresh` | **0** | 116 migrations executed twice, schema verified | 12.1s |
| **06 Upgrade Rehearsal** | `npm.cmd run test:migrations:upgrade` | **0** | Synthetic fixture upgrade passed from baseline `20260914_110000_med_05_video_workflow` | 11.8s |
| **07 Commerce Schema** | `npm.cmd run test:migrations:commerce` | **0** | All commerce tables, relationships, and version columns verified | 6.2s |
| **08 Integration Suites** | `node scripts/run-integration.mjs tests/integration/...` | **0** | **12 Stage 04 integration files, 141 passed tests**; full suite 298 passed | 66.6s |
| **09 Production Build** | `npm.cmd run build` | **0** | 144 routes compiled (`NODE_ENV=production`, `LOCAL_E2E_TEST_MODE=false`) | 64.2s |
| **10 Presentation Bundles** | `npm.cmd run verify:presentation-bundles` | **0** | Public route excludes editor/Puck modules | 0.5s |

---

## 3. Browser Acceptance & Business Workflows Verification

All Stage 04 browser specs executed against the standalone production build on disposable database `solrc04_20261014_browser3_release_acceptance` via Playwright with production mode, real reverse proxy TLS (`dispatch.rc02.test:3129`), local SMTP sink, and zero harness mutations (`harnessUnchanged: true`):

| Spec Run Label | Target Spec & Configuration | Exit Code | Passed Cases | Duration | Evidence Receipt |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `stage04-core-c0d4` | `acceptance.spec.ts`, `commerce.spec.ts`, `subscriptions.spec.ts`, `donations.spec.mjs` | **0** | 6 / 6 | 160.7s | `scratch/sol-evidence/stage04-core-c0d4.json` |
| `orchestration-c0d4` | `orchestration.spec.ts` | **0** | 1 / 1 | 49.3s | `scratch/sol-evidence/orchestration-c0d4.json` |
| `promotions-c9d8-clean` | `promotions.spec.ts` | **0** | 1 / 1 | 68.6s | `scratch/sol-evidence/promotions-c9d8-clean.json` |
| `scoped-operators-627a-clean` | `scoped-operators.spec.mjs` | **0** | 1 / 1 | 71.5s | `scratch/sol-evidence/scoped-operators-627a-clean.json` |
| `ai-627a` | `ai.spec.mjs` | **0** | 1 / 1 | 10.7s | `scratch/sol-evidence/ai-627a.json` |
| `webhooks-dca5-clean` | `webhooks.spec.mjs` | **0** | 1 / 1 | 112.3s | `scratch/sol-evidence/webhooks-dca5-clean.json` |
| `stripe-b536-clean` | `stripe.spec.ts` | **0** | 1 / 1 | 8.9s | `scratch/sol-evidence/stripe-b536-clean.json` |

---

## 4. Key Business Capabilities & Security Invariants Proven

### A. Commerce & Checkout Authority
1. **Low-Stock Concurrency Race**: Product seeded with inventory = 1. Customer A and Customer B simultaneously attempt purchase. Customer A completes proposal checkout and settles order; inventory decrements to 0. Customer B checkout initiation is rejected with inventory unavailable error (HTTP 400).
2. **Server-Authoritative Pricing**: Client-side tampering with price, quantities, taxes, or order totals is rejected. Proposals bind cryptographically to item SKUs, prices, taxes, and cart versions; multi-tab race and tampered hashes are rejected.
3. **Cart Isolation & Authenticated Merge**: Guest cart tokens cannot be hijacked across sites. Anonymous visitor items merge cleanly into member cart upon authentication with serializable database transaction and version check.
4. **Deterministic Local Test Payment**: HMAC-signed token verification executes deterministic checkout and returns clean 303 redirect.
5. **Signed Webhook Settlement & Idempotent Replay**: Valid HMAC signature settles orders, decrements inventory, and enqueues receipt jobs. Unsigned or forged webhooks are rejected (400/401). Duplicate webhook replay is processed idempotently without double fulfillment or duplicate charges.
6. **Digital Delivery Grants & Revocation**: Paid order generates time-limited signed grant key; byte-for-byte file download verified via `GET /api/commerce/download/[grantKey]`. Tampered signatures return 401; download limits return 410. Full order refund immediately revokes digital delivery grant (HTTP 410).
7. **Subscriptions & Paywall Entitlements**: Plan published; member subscription checkout completed; `recomputeSubscriptionEntitlements` grants access to paywalled content. Unprefixed subscription IDs in database queries normalized via `beforeOperation` hook. Cancellation retains entitlement until `currentPeriodEnd`.
8. **Donations & Display Privacy**: Supporter checkout completed; display privacy enforced (name omitted from public supporter feed); `reverseDonation` restores campaign balances cleanly.
9. **Affiliate Security**: Destination URLs checked against security whitelist (`isSafeAffiliateDestinationUrl`); malicious SSRF/untrusted destinations rejected (HTTP 400); conversions imported and mapped to offer ledger.
10. **Fulfillment Resilience**: POD job submission to emulator; simulated failure transitions cleanly to `manual-fulfillment-packages`; operator acknowledges and ships package with tracking number.

### B. Audience & Community Journeys
1. **Double Opt-In Newsletter**: Visitor submits email; token generated and delivered to local SMTP sink; confirmation URL visited; subscription confirmed. Deliveries conform to RFC 5321/5322 with valid `From`, `To`, `List-Unsubscribe`, and multipart alternative HTML/plain text.
2. **Suppression & Re-Subscription**: Unsubscribe link visited; suppression record created; background worker skips suppressed address; re-subscribing with double opt-in removes suppression.
3. **Delivery Recovery & Stale Lock Cleanup**: Transient transport failures retried via authenticated `/api/admin/audience/retry` endpoint and processed by background worker with automated stale lock cleanup.
4. **Forums, Messages & Moderation**: Alice posts discussion topic; Bob replies; Alice receives notifications; member reports abusive post; moderator reviews queue at `/api/community/moderation` and hides post; audit trail verified (`auditValid: true`).
5. **Private Message Boundaries**: Mutual connection sends private message; cross-site message POST rejected (HTTP 404); cross-member data export (`/api/member-auth/export?memberId=foreign`) rejected with HTTP 403; own export contains only authorized data.
6. **Rate Limiting & Public Abuse Protection**: Repeated submissions trigger HTTP 429 Too Many Requests; deferred form endpoints return HTTP 404/410; anonymous retry rejected with HTTP 403.

---

## 5. Sol Repairs Reconciled in Candidate

The following 16 Sol repairs (originally developed and frozen in `sol-rc04-20261014` at `b5369e78faa228d7e0b4375d9a3147b164363b2c`) are fully reconciled and merged into candidate HEAD `f0a728c03d45c284813e2e7c5ea23167394800de`:

1. `b5369e78`: Added `beforeOperation` query normalizer on `Entitlements` in `src/collections/Commerce.ts` to transparently resolve unprefixed subscription IDs against database source keys (`subscription:<id>`).
2. `dca51fca`: Normalized `siteId` on execution events (`event.siteId ?? event.site`) in `src/modules/integrations/webhooks.ts` and `src/modules/operations/tasks.ts`, and released stale job locks on startup and processing cycles in `src/scripts/run-jobs-worker.ts`.
3. `1296874b`: Fixed `/api/v1/[...segments]/route.ts` `version()` function to accept standard generic HTTP headers (`*/*`, `application/json`) rather than throwing 406.
4. `627a6e22`: Scoped operator passkey enrollment and media workflow permissions in `src/modules/operations/staff-enrollment.ts` and `src/collections/MediaPublishing.ts`.
5. `3b92328e`: Media-jobs operator access and command-center site scope boundaries in `src/modules/media/command-center.ts`.
6. `c9d8108d`: Granted creator community-manager role in `src/collections/Sites.ts` `afterChange`.
7. `c0d44bb0`: Accepted confirmed preview hash and captured plan name in grant snapshot.
8. `3b54c3f5`: Reconciled confirmed refunds and bound integration writes to client scope in `src/modules/commerce/refund-execution.ts` and `src/app/(frontend)/api/admin/commerce/refunds/route.ts`.
9. `7eda5a58`: Migrated cart and worker schema (`20261014_220000_rc1_cart_and_worker_schema.ts`) and serialized authenticated cart merge in `src/app/(frontend)/api/commerce/cart/merge/route.ts`.
10. `8d40066b`: Authorized canonical workflow records and required persisted transitions.
11. `d7cd4bcc`: Timestamped signed payment events in replay and concurrency fixtures.
12. `f77c4dfc`: Bound public analytics writes and private reports to their site in `src/app/(frontend)/api/analytics/collect/route.ts`, `consent/route.ts`, `report/route.ts`.
13. `179486d4`: Enforced operator site grants and persisted truthful experiment decisions in `src/collections/Sites.ts`, `src/app/(frontend)/api/admin/telemetry/experiment/winner/route.ts`, `src/modules/experiences/public-experiment.ts`.
14. `560ba759`: Rejected malformed signed local payment events before correlation in `src/modules/commerce/payment-provider.ts`.
15. `07b42a7d`: Formatted Stage 04 matrices for release gate.
16. `7e0c589e`: Preserved shipping relationship notification preferences.

---

## 6. Provider Boundaries & Unresolved External Prerequisites

Every provider integration conforms to the provider boundary model:
- **Local Transports & Simulators**: Local SMTP sink captures 100% of emails; telecom emulator captures SMS/RCS; local payment gateway processes HMAC-signed checkout; emulator captures Printful fulfillment.
- **Unconfigured States**: Safe, non-crashing behavior confirmed when live provider keys are absent.
- **Unresolved External Prerequisites** (truthfully retained):
  1. **Stripe Live / Sandbox API**: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are unconfigured.
  2. **SendGrid / Postmark / Twilio Live API**: Live telecom and email provider credentials unconfigured.
  3. **Printful Live API**: `PRINTFUL_API_KEY` unconfigured.

Zero mock sessions, forged tokens, or bypassed locks were used.

---

## 7. Sign-Off Declaration

**STAGE 04 SOL PASS**  
Stage 04 is independently verified, reconciled, and closed.  
Proceed to Gemini Stage 05 (Production artifact and security decision).
