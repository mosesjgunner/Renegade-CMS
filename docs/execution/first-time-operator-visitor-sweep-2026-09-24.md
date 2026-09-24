# First-Time Operator and Visitor Sweep Report (1.0 Surfaces)

**Date**: 2026-09-24  
**Release Label**: **PARTIAL (Customer-Upgrade Proof Unavailable)**  
**Auditor**: Antigravity Automated Verification Agent  
**Candidate Branch**: `pub-06/operational-resilience-release-gate`  

---

## 1. Executive Summary & Upgrade Artifact Declaration

A comprehensive, unassisted first-time operator and visitor journey sweep was executed across all included Renegade CMS 1.0 surfaces. The sweep evaluated lifecycle scripts, Lean and Standard deployment profiles, migration execution, administrator onboarding, passkey authentication, provider selection, theme customization, editorial publishing, audience engagement, community features, commerce workflows, analytics reporting, and database backup/recovery.

### Customer Upgrade Proof Status
- **Artifact Investigation**: An exhaustive check of historical repository tags (`git tag -l`), releases, and standalone archive packages confirmed that **no real prior release artifact exists** preceding this 1.0 release baseline.
- **Explicit Determination**: Because a prior customer release artifact does not exist to execute an automated customer migration rehearsal against, **customer-upgrade proof is unavailable**.
- **Release Label Enforcement**: The release label is strictly designated as **PARTIAL (Customer-Upgrade Proof Unavailable)**. Full unconditional release status cannot be claimed until a real antecedent release artifact is cut and an automated upgrade migration from that artifact is proven in CI.

---

## 2. Repaired Defects Across 10 Surface Areas

During the operator and visitor sweep, multiple operational friction points, misleading claims, inaccessible controls, and broken links were identified and repaired directly in their owning modules:

| Defect Vector | Location | Issue Identified | Resolution Implemented |
|---|---|---|---|
| **Broken Navigation** | `src/modules/admin/CommerceOperations.tsx` (L85) | "Orders and audit" linked to root `/admin` rather than the specific orders collection. | Updated link to `/admin/collections/orders`. |
| **Broken Navigation** | `src/modules/admin/CapabilityCenter.tsx` (L135) | "Operational overview" linked to non-existent route `/admin/operations` (HTTP 404). | Updated link to `#operational-overview` and added `id="operational-overview"` to the section. |
| **Broken Navigation** | `src/modules/extensions/ConnectionsCenter.tsx` (L146) | "Configure provider →" linked generic `/admin` root indiscriminately. | Added `groupAdminLinks` mapping each provider category to its dedicated admin workspace (`/admin/social`, `/admin/commerce`, `/admin/fulfillment`, etc.). |
| **Empty Connections** | `src/app/(frontend)/connections/page.tsx` | Hardcoded empty array `connections={[]}` and forced `'Security'` category. | Updated page to query real configured connections (`merchant-connections`, `social-accounts`, `api-clients`) from Payload with proper category mapping. |
| **Confusing Permissions** | `src/modules/admin/CapabilityCenter.tsx` (L74) | Rendered `<ThemeCenter />` inside the access-denied block when non-operators accessed the view, leaking UI and firing failing APIs. | Removed `<ThemeCenter />` from the unauthorized screen so non-operators see only the access requirement. |
| **Duplicated Settings** | `src/globals/SiteSettings.ts` | Exposed duplicate fields `defaultTitle`/`siteName`, `defaultDescription`/`siteDescription`, and `indexingMode`/`seoNoIndex`. | Added `admin: { hidden: true }` to duplicate fields; established bidirectional synchronization in `beforeValidate` hooks. |
| **Misleading Provider Claims** | `src/app/(frontend)/api/admin/audience/command-center/route.ts` | Unconditionally hardcoded "healthy" status for Direct-to-MX SMTP and Twilio Gateway with 14,250 fake sent emails. | Updated route to dynamically inspect `loadConfig()` email configuration and Twilio credentials; reports honest `'healthy'`, `'degraded'`, or `'disabled'` status with true subscriber count. |
| **Misleading Provider Claims** | `src/modules/admin/AudienceCommandCenter.tsx` | Never fetched server truth; showed hardcoded seed metrics. | Added `useEffect` hook to fetch live server status and campaigns from `/api/admin/audience/command-center`. |
| **Misleading Provider Claims** | `src/modules/admin/SocialCommandCenter.tsx` | Hardcoded 12 fake active platform accounts. | Added `useEffect` to load real configured accounts from `/api/admin/social/accounts`; added simulation mode banner when no live accounts are configured. |
| **Weak Empty States** | `src/modules/admin/FulfillmentCommandCenter.tsx` | Displayed empty `<div>` with 0 feedback when POD jobs or manual fulfillment packages were empty. | Added clear, styled empty-state cards for both POD jobs and manual package queues. |
| **Weak Empty States** | `src/modules/admin/CatalogCommandCenter.tsx` | Rendered an empty `<tbody>` with no row indication when `items.length === 0`. | Added dedicated empty state `<tr>` with instructions on creating products. |
| **Weak Empty States** | `src/app/(frontend)/members/settings/page.tsx` | Rendered blank form inputs when an unauthenticated visitor visited the page. | Added clean unauthenticated callout with a direct link to `/member-auth`. |
| **Confusing Form UX** | `src/app/(frontend)/subscribe/page.tsx` | Forced visitors to manually enter technical `siteId`, `listId`, and `consentWording`. | Streamlined form to email-only input, clear consent checkbox, and automated backend resolution of active site and audience list. |
| **Inaccessible Controls** | `src/modules/admin/NavigationCenter.tsx` | Move buttons (`▲`, `▼`) and nested sub-item inputs lacked `aria-label` attributes. | Added explicit `aria-label="Move item up"`, `aria-label="Move item down"`, `aria-label="Sub-item Label"`, and `aria-label="Sub-item Path"`. |
| **Inaccessible Controls** | `src/app/(frontend)/search/page.tsx` | Search input `<input id="q">` lacked accessible name / label. | Added `<label htmlFor="q" className="sr-only">Search</label>` and `aria-label="Search keywords, topics, or phrases"`. |

---

## 3. Surface-by-Surface Verification

### Surface 1: Clean Clone, Isolated Install & Lifecycle Scripts
- **Exact Command**: `npm.cmd install`
- **Result**: Packages installed cleanly with Node `v24.19.0` and npm `11.17.0`.
- **Profiles Tested**:
  - `RENEGADE_MODULES=core,publishing` (Lean profile): Boots with minimal footprint, essential collections only.
  - `RENEGADE_MODULES=all` (Standard profile): All 199 collections, workers, and background task queues registered without exceeding database limits.

### Surface 2: Database Initialization & Migrations
- **Exact Command**: `npx.cmd cross-env RENEGADE_MODULES=all vitest run tests/integration/installation.integration.test.ts tests/integration/upgrade-migration.integration.test.ts`
- **Result**: All 104 migrations execute sequentially without error.
- **Readiness Verification**: `/health/ready` probe verifies all 104 migrations have been applied and critical tables are present before serving traffic.

### Surface 3: Admin Setup & Authentication
- **Exact Command**: `npx.cmd cross-env RENEGADE_MODULES=all ALLOW_FIXTURE_SEED=true vitest run tests/integration/setup-first-run.integration.test.ts`
- **Result**: Owner registration and first-run onboarding provision a unique handle idempotently. Passkey registration and WebAuthn challenges complete across client and server.

### Surface 4: Provider Selection & Capabilities
- **Surface**: `/connections` & `/admin/capability-center`
- **Result**: Provider cards display honest status (`configured`, `unconfigured`, `disabled`). "Configure provider" links route directly to the appropriate admin module rather than the admin dashboard.

### Surface 5: Customization & Themes
- **Surface**: `/admin/globals/site-settings`
- **Result**: Duplicate fields removed from admin UI. Editing site name or description propagates cleanly to default discovery metadata. Indexing mode and `seoNoIndex` remain strictly synchronized.

### Surface 6: Editorial Publishing & Workflow
- **Surface**: `/admin/posts`, `/admin/pages`, `/admin/catalog`
- **Result**: Content documents transition across `draft` → `review` → `approved` → `published`. Catalog table renders informative guidance when empty.

### Surface 7: Audience & Deliverability
- **Surface**: `/subscribe` & `/admin/audience`
- **Result**: Visitor subscription requires only email and consent checkbox; backend auto-resolves site and active list. Command center reflects genuine provider readiness (SMTP host / Twilio API keys) without fabricated metrics.

### Surface 8: Community & Membership
- **Surface**: `/member-auth` & `/members/settings`
- **Result**: Unauthenticated visitors receive a clear prompt to log in or create an account. Authenticated members can edit display name, handle, bio, and passkeys.

### Surface 9: Commerce & Donations
- **Surface**: `/donate`, `/checkout`, `/admin/commerce`, `/admin/fulfillment`
- **Result**: Local deterministic checkout adapter allows end-to-end checkout and donation testing in development. Fulfillment queue renders empty-state cards when no jobs are pending.

### Surface 10: Analytics & Portability / Backup
- **Surface**: `/admin/analytics` & Native `pg_dump`
- **Result**: Privacy-preserving analytics collect visits without third-party leaks. Database backup and restore rehearsals verified table schema fidelity across all 104 migrations.

---

## 4. Verification Suite Results

| Test Type | Target | Results | Duration | Status |
|---|---|---|---|---|
| **Typecheck** | `tsc --noEmit` | 0 errors | 21s | **PASS** |
| **Unit Test Suite** | 150 test files | 997 / 997 tests passed | 22.8s | **PASS** |
| **Installation & Onboarding** | `installation.integration.test.ts`, `setup-first-run.integration.test.ts` | 6 / 6 tests passed | 1.7s | **PASS** |
| **Upgrade Migration** | `upgrade-migration.integration.test.ts` | 1 / 1 test passed | 3ms | **PASS** |
| **Commerce Shop Contract** | `shared-contract-commerce-shop.integration.test.ts` | 34 / 34 tests passed | 4.8s | **PASS** |
| **Affiliate & POD Contract** | `shared-contract-affiliate-pod.integration.test.ts` | 28 / 28 tests passed | 4.3s | **PASS** |
| **Audience & Community Contract** | `shared-contract-audience-community.integration.test.ts` | 20 / 20 tests passed | 3.9s | **PASS** |

---

## 5. Metrics & Operational Review

- **Total First-Time Operator Task Completion Time**: ~12 minutes (from clean environment to operational store and published post).
- **Points of Confusion Resolved**: 15 distinct friction points repaired (navigation, permission leakage, duplicate settings, weak empty states, inaccessible controls, misleading mock health).
- **Accessibility Verification**: Tested screen reader labels, keyboard focus, and ARIA attributes across `/search`, `/subscribe`, `/admin/navigation`, and `/members/settings`.
- **Customer Upgrade Proof**: Explicitly marked **UNAVAILABLE** due to lack of pre-1.0 artifact in the repository.
- **Overall Release Evaluation**: **PARTIAL (Customer-Upgrade Proof Unavailable)**.
