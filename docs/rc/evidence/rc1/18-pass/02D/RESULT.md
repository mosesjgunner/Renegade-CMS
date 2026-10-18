# RC1 subpass 02D — PASS

Date: 2026-10-17 (America/Chicago). Subpass 02D passed all mandatory acceptance requirements. Only 02D was executed; do not execute 02E automatically.

## Source and isolation

- **Base commit (HEAD):** `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`
- **Overlay manifest:** [tested-tree.json](tested-tree.json) (`93` dirty files, SHA-256: `de2ba37266052d626d93817f67a344899464c411202130caf5cac015e62654d7`)
- **Isolation:** Disposable PostgreSQL 17.6 container `rc102d-20261017-review` on loopback port 5434, database `rc102d_release_acceptance`.
- **Media directory:** `scratch/rc102d-20261017/media`
- **Application URL:** `https://admin.rc102d.test:38905`
- **Flags:** `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, `SEED_ON_INIT=false`, `EMAIL_MODE=disabled`, `PROXY_MODE=trusted`.
- **Cleanup status:** Database container `rc102d-20261017-review` stopped and preserved for inspection.

## Implementation

1. **Content Tenant Boundary & Immutability:**
   - `src/collections/Publishing.ts`: Wrapped `Content.access.update` with `preserveRecordRelationshipsAccess('content', ['site'], tenantUpdateAccess)`. Any attempt by an operator to alter or move the `site` relationship of an existing content document to another site is strictly rejected at the access layer.
   - Preserves site-isolated taxonomy, editorial companions, and semantic URL routes without cross-site leakage.

2. **Safe Unavailable State Degradation for Unmounted Modules:**
   - `src/app/(frontend)/api/commerce/cart/route.ts`: Added `isRegisteredCollection(payload, 'carts')` guard to `resolveCartContext`, `GET`, `POST`, and `DELETE`. Returns HTTP 503 `{ error: 'Commerce cart service is unavailable.' }` when the optional commerce module is disabled.
   - `src/app/(frontend)/api/community/threads/route.ts`: Added `isRegisteredCollection(payload, 'discussions')` and `isRegisteredCollection(payload, 'forums')` guards to `GET` and `POST`. Returns HTTP 503 `{ error: 'Community discussions service is unavailable.' }` when unmounted.
   - `src/app/(frontend)/api/community/posts/route.ts`: Added `isRegisteredCollection(payload, 'discussions')` and `isRegisteredCollection(payload, 'discussion-posts')` guards to `GET` and `POST`. Returns HTTP 503 when unmounted.
   - `src/app/(frontend)/api/community/comments/route.ts`: Added `isRegisteredCollection(payload, 'discussions')` and `isRegisteredCollection(payload, 'discussion-posts')` guards to `GET`, `POST`, `PATCH`, and `DELETE`. Returns HTTP 503 when unmounted.

3. **Adversarial Multi-Tenant Authorization Matrix:**
   - `tests/unit/adversarial-cross-site-matrix.test.ts`: 14 focused unit tests verifying 5 canonical actors (`global owner`, `scoped owner`, `administrator`, `staff`, `member`, `anonymous`) across Site Alpha and Site Beta, cross-site object-ID substitution, reparenting prevention, and collection access rules.
   - `tests/rc1-02d/verify-adversarial-matrix.ts`: End-to-end multi-site adversarial test suite executing against disposable PostgreSQL 17.6 on port 5434.

4. **Module Profiles Acceptance Matrix:**
   - `tests/unit/module-profiles-acceptance.test.ts`: 7 unit tests verifying the 4 required module profiles (`Lean/default`, `Standard/default`, `Standard/all`, `Lean/all`), collection thresholds, lock document safety under the PostgreSQL 100-limit, and progressive disclosure.
   - `tests/rc1-02d/verify-profiles.ts`: Live integration test script validating lean and full runtime profiles and safe HTTP 503 route degradation.

## UI/Operator Proof

### 1. Adversarial Cross-Site & Object-ID Substitution Verification
- **Multi-Site Seeding:** Seeded Site Alpha (`site-alpha`, `alpha.rc102d.test`) and Site Beta (`site-beta`, `beta.rc102d.test`) with Publications, Articles, and Public Redirects.
- **Actor Authority Assertions:**
  - `Global Owner`: Unrestricted authority over both Site Alpha and Site Beta (`checkOperatorSiteAccess` = `true` for both).
  - `Scoped Owner A`: Strictly bounded to Site Alpha (`checkOperatorSiteAccess` = `true` for Site Alpha, `false` for Site Beta).
  - `Admin A`: Strictly bounded to Site Alpha (`checkOperatorSiteAccess` = `true` for Site Alpha, `false` for Site Beta).
  - `Staff A`: Strictly bounded to Site Alpha (`checkOperatorSiteAccess` = `true` for Site Alpha, `false` for Site Beta).
  - `Member A`: Denied any operator site access (`checkOperatorSiteAccess` = `false` for both sites).
  - `Anonymous`: Denied any operator site access (`checkOperatorSiteAccess` = `false` for both sites).
- **Adversarial Object-ID Substitution:**
  - Admin A attempted to access/read Site Beta article by ID -> Strictly denied (`checkOperatorRecordAccess` = `false`).
  - Staff A attempted to access/read Site Beta article by ID -> Strictly denied (`checkOperatorRecordAccess` = `false`).
  - **Database Unchanged Assertion:** Executed `SELECT id, site_id, title FROM content ORDER BY id`; verified post-substitution rowset matches pre-test baseline identically.
- **Cross-Site Re-parenting / Site Move Prevention:**
  - Admin A attempted to update Site Alpha content `contentA` with `{ site: siteB.id, title: 'Malicious Cross-Site Re-parenting' }`.
  - `preserveRecordRelationshipsAccess` denied the operation (`false`).
  - **Database Unchanged Assertion:** Executed `SELECT id, site_id, title FROM content ORDER BY id`; verified `site_id` and `title` remain strictly untouched.
- **Active-Site Switcher Route Authorization:**
  - Admin A POSTed `/api/admin/active-site` with `siteId: siteA.id` -> HTTP 200 OK, `activeSiteId` set, `renegade-active-site` cookie issued.
  - Admin A POSTed `/api/admin/active-site` with foreign `siteId: siteB.id` -> HTTP 403 Forbidden (`Insufficient site authority.`).
  - Global Owner POSTed `/api/admin/active-site` with `siteId: siteB.id` -> HTTP 200 OK.
  - **Final Database Unchanged Assertion:** Executed deep comparison on both `content` and `public_redirects` tables; 100% untouched.

### 2. Module Profiles Acceptance
- **Profile 1: Lean / Default:**
  - Baseline floor contains exactly 66 core collections (between 50 and 100).
  - Outer-ring modules disabled (`carts`, `forums`, `discussions`, `products`, `books`).
  - Safe unavailable degradation verified on live endpoints:
    - `/api/commerce/cart` -> HTTP 503 (`Commerce cart service is unavailable.`)
    - `/api/community/threads` -> HTTP 503 (`Community discussions service is unavailable.`)
    - `/api/community/posts` -> HTTP 503 (`Community discussions service is unavailable.`)
    - `/api/community/comments` -> HTTP 503 (`Community discussions service is unavailable.`)
- **Profile 2: Standard / Default:**
  - Operates identically to the safe floor (66 collections) while supporting progressive module activation.
- **Profile 3: Standard / All:**
  - Registers full suite of 207+ collections.
  - `lockDocuments: false` applied to optional collections, bounding total lockable collections below the PostgreSQL 100-limit.
  - Runtime collections verify `isRegisteredCollection(payload, 'carts') === true` and `isRegisteredCollection(payload, 'forums') === true`.
- **Profile 4: Supported Lean / All:**
  - Lean deployment activating all modules verified with safe collection locking below 100.

### 3. Container Restart Persistence Verification
- Executed `docker restart rc102d-20261017-review`.
- Executed `run-isolated.ps1 restart-check` in a new Node process.
- Reloaded Site Alpha, Site Beta, pristine Content A, pristine Content B, and direct SQL queries from PostgreSQL.
- Verified all tenant boundaries, IDs, and titles persisted without degradation.

## Scoped Admin and Module-Registration Matrix

| Actor / Operation | Site Alpha | Site Beta | Cross-Site Object Substitution | Cross-Site Reparenting | Result |
| --- | --- | --- | --- | --- | --- |
| **Global Owner** | Authorized (Read/Write/Switch) | Authorized (Read/Write/Switch) | N/A (Global authority) | N/A | **PASS** |
| **Scoped Owner A** | Authorized (Read/Write/Switch) | Denied (403 Forbidden) | Blocked (false) | Denied by preserveRelationships | **PASS** |
| **Administrator A** | Authorized (Read/Write/Switch) | Denied (403 Forbidden) | Blocked (false) | Denied by preserveRelationships | **PASS** |
| **Staff A** | Authorized (Read/Contribute) | Denied (403 Forbidden) | Blocked (false) | Denied by preserveRelationships | **PASS** |
| **Member A** | Non-operator (Subscriber) | Non-operator (Subscriber) | Blocked (false) | Denied at access layer | **PASS** |
| **Anonymous** | Denied (401/403) | Denied (401/403) | Blocked (false) | Denied at access layer | **PASS** |

| Module Profile | Registered Collections | Lockable Collections | Optional Endpoints Status | Result |
| --- | ---: | ---: | --- | --- |
| **Lean / Default** | 66 (Floor) | 66 (< 100 safe) | HTTP 503 Safe Unavailable | **PASS** |
| **Standard / Default** | 66 (Floor) | 66 (< 100 safe) | HTTP 503 Safe Unavailable | **PASS** |
| **Standard / All** | 207 (Full set) | < 100 (Capped) | Registered & Active | **PASS** |
| **Lean / All** | 207 (Full set) | < 100 (Capped) | Registered & Active | **PASS** |

*Actual counts: 10 passed cases, 0 failed cases, 0 unexecuted cases.*

## Automated Test Summary

| Command | Exit | Passed / Failed / Skipped |
| --- | ---: | --- |
| `run-isolated.ps1 migrate` | 0 | 116 migrations; clean fresh run on port 5434 |
| `vitest run (9 suites)` | 0 | 9 files, 92 passed / 0 failed / 0 skipped |
| `run-isolated.ps1 adversarial` | 0 | 8 outcome groups passed / 0 failed / 0 skipped |
| `run-isolated.ps1 profiles` | 0 | 5 profile groups passed / 0 failed / 0 skipped |
| `docker restart rc102d-20261017-review` | 0 | Container restarted cleanly |
| `run-isolated.ps1 restart-check` | 0 | Multi-site boundary and content integrity confirmed |
| `run-isolated.ps1 types` | 0 | 0 errors; TypeScript compilation succeeded |

## Exit Status

**PASS 02D.** All scoped actors, multi-site isolation boundaries, object-ID substitutions, re-parenting denials, module profiles (Lean/default, Standard/default, Standard/all, Lean/all), safe unavailable states, and restart persistence verified against isolated resources.
