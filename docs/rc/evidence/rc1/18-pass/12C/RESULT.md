# RC1 Subpass 12C/70 — One-Time and Recurring Donations

## Result: PASS

- **Date:** 2026-10-29
- **Base Commit:** `63d7799f8afcfcc69b6042c6c6932c6e7ad14869`
- **Source Containment Tree Hash:** `b7e4b395dbf78dd9ec3e66f664bc01a85f7e4ac698d7c4c3848ea732f42b7d9f` (1,506 files verified)
- **Database:** Isolated PostgreSQL 17.6 container `rc112c-20261028` on `127.0.0.1:5466`, database `rc112c_release_acceptance`
- **Application Server:** Next.js 15 dev on `127.0.0.1:39022` (multi-host test with Site Alpha `http://localhost:39022` and Site Beta `http://127.0.0.1:39022`)

---

## 1. Scope & Implementation

### Canonical Enhancements
1. **Public Campaign Donation Route (`src/app/(frontend)/donate/[campaignId]/page.tsx`)**:
   - Enabled frequency selection rendering by allowing both `'one-time'` and `'recurring'` selections when permitted by the campaign's recurrence configuration.
2. **Donation Intent API (`src/app/(frontend)/api/commerce/donations/intent/route.ts`)**:
   - Replaced temporary 503 blocking with capability-based check: verifies active payment connection has `recurring: true` for the campaign currency and site. Fails closed with 503 if recurring capability is missing.
   - Attached authenticated member session (`readMemberSession` + `currentMember`) to `donorSnapshot.memberId`, `cart.member`, and `payment.owner`.
   - Propagated `recurrence: input.recurrence` through initial 201 response and replay 200 responses.
   - Set hosted checkout description and recurrence metadata (`renegade_donation_recurrence`).
3. **Supporter Privacy PATCH Route (`src/app/(frontend)/api/commerce/donations/privacy/route.ts`)**:
   - Resolved member identity via canonical `readMemberSession(request.headers)` and `currentMember(payload, token)` as well as admin passkey user fallback, updating the caller's linked `supporters` record `visibilityPreference`.
4. **Command Center Admin Donations Route (`src/app/(frontend)/api/admin/commerce/donations/route.ts`)**:
   - Scoped multi-site operator access via `resolveOperatorGrantContext` and `checkOperatorSiteAccess`.
   - Accurate currency-separated metrics (`metricsByCurrency`) and progress tracking factoring partial refunds.
   - Preserved donor privacy by labeling non-public donations as `'Anonymous'` or `'Private'`, with CSV export escaping.
   - Implemented `action: 'mask-retention'` for supporter GDPR/CCPA anonymization while preserving immutable financial audit rows.

---

## 2. Evidence & Automated Verification

### Test Execution Counts
- **Unit Suites:** 35 passed, 0 failed across 6 test files:
  - `tests/unit/rc1-12c-donations-acceptance.test.ts` (8 passed)
  - `tests/unit/donation-ingestion.test.ts` (9 passed)
  - `tests/unit/shop-07-donation-checkout-route.test.ts` (7 passed)
  - `tests/unit/shop-07-donations-contract.test.ts` (4 passed)
  - `tests/unit/donation-admin-scope.test.ts` (4 passed)
  - `tests/unit/donation-ui-accessibility.test.ts` (3 passed)
- **Journey Suite (`tests/rc1-12c/journey.ts`):** 47 passed, 0 failed, 0 skipped.
- **Restart Suite (`tests/rc1-12c/journey.ts restart`):** 5 passed, 0 failed, 0 skipped.
- **Migrations:** 127 fresh migrations passed (`npm run test:migrations:fresh`).
- **TypeScript:** `npx tsc --noEmit` passed with 0 errors across entire workspace.
- **Source Containment:** `node --import tsx tests/rc1-12c/provenance.ts --check` PASS (1,506 files, SHA-256 `b7e4b395dbf78dd9ec3e66f664bc01a85f7e4ac698d7c4c3848ea732f42b7d9f`).

---

## 3. Journey & Acceptance Trace

1. **Negative & Security Bounds:**
   - Cross-site campaign isolation: Site Beta access to Site Alpha campaign returns 404.
   - Unconfigured/disabled merchant connection fails closed with 503.
   - Zero and negative donation amounts rejected with 422.
   - Direct REST mutations to `donations` and `donation-intents` collections rejected with 403.
   - Forged webhook signatures rejected with 401.
   - Anonymous access to `/api/admin/commerce/donations` rejected with 403.
   - Foreign-site staff access to Site Alpha reconciliation rejected with 403.
   - Missing or truncated `Idempotency-Key` rejected with 400.
2. **One-Time Donation Flows:**
   - Guest completes public donation (2500 USD minor + 102 fee cover) via deterministic test provider.
   - Finalized `orders` record with `state: 'issued'`, `receiptNumber`, and tax disclosures.
   - Idempotent replay of donation intent returns 200 with `replay: true`.
   - Webhook reprocessing deduplicates cleanly without extra donation rows or double crediting.
   - Member completes anonymous donation (1000 USD minor): suppressed from public donor wall, grants 365-day supporter entitlement `tree-planter-badge`.
   - Guest completes private donation (5000 USD minor) with donor message: suppressed from donor wall.
3. **Recurring Donation Flows:**
   - Member completes recurring gift (2500 USD minor, `recurrence: 'recurring'`): persists with `receiptSnapshot.recurrence: 'recurring'`.
4. **Multi-Site & Multi-Currency:**
   - Site Beta guest donates 2000 EUR minor: verified in EUR without contaminating Site Alpha USD totals.
5. **Privacy Controls & Consent:**
   - Member privacy PATCH dynamically hides previously public donation from the donor wall.
   - Operator `mask-retention` action masks supporter personal info while preserving financial audit records.
6. **Refund & Reversal Lifecycle:**
   - Partial refund of 500 USD minor transitions donation to `partially-refunded` and subtracts from campaign progress.
   - Full refund of 1000 USD minor transitions donation to `refunded` and immediately revokes supporter entitlement (`revokedAt` populated).
   - Duplicate reversal events deduplicated idempotently.
7. **Command Center & UI Verification:**
   - Admin reconciliation returns separated currency totals: USD net 9500 minor (2500 - 500 + 5000 + 2500), 3 settled gifts.
   - CSV export returns 200 with text/csv header and attachment filename.
   - Playwright UI assertions verify `/donate` list, `/donate/[campaignId]` form, frequency fieldset, and recognition selector.
8. **Restart Verification:**
   - PostgreSQL and Next.js restarted.
   - Verified guest donation (`partially-refunded`, 2500 base, 102 fee), recurring donation (`recurring`), Site Beta donation (2000 EUR), full refund entitlement revocation, and admin campaign progress survived restart identically.

---

## 4. Operational Boundaries

- **Provider Mode:** Local `deterministic-test` provider with signed webhooks and local test checkout contract. No live charges, real cards, or external network requests.
- **Authentication:** Authentic guest sessions, canonical member sessions via `issueMagicLink` / `consumeMagicLink`, operator sessions via passkey `admin_sessions`.
- **Environment Isolation:** Disposable container `rc112c-20261028` on port 5466; web dev on port 39022. No shared states with other subpass containers. Container stopped; database preserved.
