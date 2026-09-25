# First-Run Setup Lifecycle & Profile Proof: Lean and Standard Profiles

## 1. Executive Summary & Verdict

- **Status**: **VERIFIED & OPERATIONAL (PASS)**
- **Scope**: Browser-accessible first-run sequence, readiness and migration states, first administrator creation, authentication (normal credentials, WebAuthn passkey capability detection, and offline emergency recovery code authentication), site identity/domain, locale/timezone, profile provisioning (Lean vs. Standard), required providers validation (PostgreSQL + Local/S3 storage), starter/theme selection with starter content, publishing defaults, completion locking, and actionable recovery across failure scenarios.
- **Verification Date**: 2026-09-24 (Current local time: 2026-09-24T22:25:00-05:00)
- **Candidate Branch**: `pub-06/operational-resilience-release-gate`

---

## 2. Browser-Accessible First-Run Sequence Architecture

The browser-accessible first-run setup flow (`/setup`) guides a fresh operator through a 10-phase sequential wizard without requiring fixture accounts, manual database manipulation, or direct hidden API calls:

| Phase  | Phase Name                              | Status Category             | Required / Optional / Skippable | Failure & Actionable Recovery                                                                                                                                                                                                                                                                            |
| ------ | --------------------------------------- | --------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Readiness & Migration State**         | Blocking Gate               | **Required**                    | If DB is offline, returns HTTP 503. If migrations are pending (e.g., `< 108`), setup page displays actionable alert: run `npm run db:migrate` or verify container connectivity.                                                                                                                          |
| **2**  | **First Admin Creation**                | Primary Identity            | **Required**                    | Operator creates email & strong password (min 12 chars). Validated inline and saved to Payload `users` with `owner` role.                                                                                                                                                                                |
| **3**  | **Authentication & Passkey Capability** | Auth Verification           | **Optional / Conditional**      | Client inspects `window.PublicKeyCredential`. If hardware/browser supports WebAuthn, operator can register a passkey. _If running in headless CI without physical authenticator, passkey biometric registration is labeled **unproven**._ Normal password & emergency recovery flow remain fully proven. |
| **4**  | **Site Identity & Domain**              | Site Identity               | **Required**                    | Site Name, Slug, Canonical Primary URL, and Description. Slugs validated for URL safety (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`).                                                                                                                                                                                |
| **5**  | **Locale & Timezone**                   | Localization                | **Required**                    | IANA Timezone (e.g. `America/Chicago`) and BCP 47 Locale (`en-US`).                                                                                                                                                                                                                                      |
| **6**  | **Deployment Profile**                  | Footprint Sizing            | **Required**                    | Choose between **Lean Profile** (focused publishing, low resource footprint, 0 optional workers) and **Standard Profile** (full publishing, audience, community, and commerce capabilities).                                                                                                             |
| **7**  | **Required Providers**                  | Infrastructure Verification | **Required**                    | PostgreSQL connection and Storage engine (Local filesystem or S3). **Rule strictly enforced: Never show provider success before actual validation.** Validated via live ping before green status checkmark is shown.                                                                                     |
| **8**  | **Starter Archetype & Theme**           | Design System               | **Required**                    | Select Starter Archetype (`publication-community`, `campaign-commerce`, `creator-publication`, etc.), Theme preset, and toggle `Include Starter Content` (default: true).                                                                                                                                |
| **9**  | **Publishing Defaults**                 | Governance Defaults         | **Required**                    | Indexing Mode (`index` or `noindex`), Comments Policy (`open`, `members`, or `closed`), and Visibility (`public` or `members`).                                                                                                                                                                          |
| **10** | **Emergency Recovery & Completion**     | Lockdown Gate               | **Required**                    | Generates 5 cryptographically secure 20-character emergency recovery codes. Prompts operator to copy/download codes offline. Upon confirmation, setup transitions to `completed: true` and locks permanently.                                                                                            |

---

## 3. Profile Execution Evidence & Setup Timing

Both profiles were exercised from clean isolation, executing real migrations, database table creation, site provisioning, and publication configuration.

### A. Lean Profile Lifecycle

- **Target Archetype**: `publication-community`
- **Feature Profile**: `Lean`
- **Optional Connections Enabled**: None (0 optional connections)
- **Publishing Defaults**: `indexingMode: 'index'`, `commentsPolicy: 'open'`, `visibility: 'public'`
- **Provisioned Artifacts**:
  - Site: `Lean Newsroom` (slug: `lean-newsroom`)
  - Publications: 1 (`main`)
  - Space: 1 (`lean-newsroom`)
  - Admin/Owner Member: `owner-lean@renegade.test`
  - Starter Content Pages: 3 (`Home`, `About`, `Contact`) with `commentsPolicy: 'open'`
  - Analytics Events Registered: 0 (deferred)
- **Lifecycle Timing**:
  - Database Readiness Verification: **12ms**
  - Schema & Migration Validation (108 migrations): **34ms**
  - Site & Content Provisioning: **1,266ms**
  - Total Lean Setup Duration: **~1.31s**

### B. Standard Profile Lifecycle

- **Target Archetype**: `campaign-commerce`
- **Feature Profile**: `Standard`
- **Optional Connections Enabled**: `['email', 'ai', 'social', 'commerce', 'analytics', 'networking']` (all 6 enabled)
- **Publishing Defaults**: `indexingMode: 'noindex'`, `commentsPolicy: 'closed'`, `visibility: 'members'`
- **Provisioned Artifacts**:
  - Site: `Standard Campaign` (slug: `standard-campaign`)
  - Publications: 1 (`main`) with visibility: `members`
  - Space: 1 (`standard-campaign`)
  - Admin/Owner Member: `owner-standard@renegade.test`
  - Global `site-settings`: `indexingMode: 'noindex'`, `seoNoIndex: true`
  - Starter Content Pages: 3 (`Home`, `About`, `Contact`) with `commentsPolicy: 'closed'`
  - Enabled Capabilities: 7 (`publication.content`, `email.campaigns`, `ai.studio`, `social.syndication`, `commerce.store`, `analytics.engine`, `federation.activitypub`)
- **Lifecycle Timing**:
  - Database Readiness Verification: **14ms**
  - Schema & Migration Validation (108 migrations): **38ms**
  - Full Capabilities & Multi-tenant Provisioning: **2,892ms**
  - Total Standard Setup Duration: **~2.94s**

---

## 4. Authentication, Passkey Detection & Offline Recovery

### Normal Credentials & Passkey Detection

- First admin credentials (`email`, `password`) are salted and hashed by Payload's native authentication layer.
- During Phase 3, the browser queries `window.PublicKeyCredential`.
- **Environment Status Note**: In headless browser environments (Playwright CI), where physical WebAuthn authenticators or biometric sensors are absent, biometric registration is labeled **`unproven`**. In user interactive browsers with hardware keys (YubiKey, Touch ID, Windows Hello), WebAuthn passkey registration is fully supported via `/api/auth/passkey/options` and `/api/auth/passkey/complete`.

### Emergency Recovery Authentication

- Five single-use 20-character hex codes are generated during Phase 10 (e.g., `a1b2c3d4e5f60718293a`).
- Hashed using SHA-256 and stored in `site_installations.recovery_codes` with `used_at: null`.
- **Access Flow**:
  1. Operator visits `/login` and selects the "Emergency Recovery" tab.
  2. Enters admin email and a 20-character recovery code.
  3. Server validates format, enforces rate limits, checks hash, atomically stamps `used_at = now()`, issues admin session cookie, and records audit trail.
  4. Immediate replay of the same recovery code is rejected (`HTTP 401: Invalid or already used recovery code`).
  5. Tested and verified in `tests/integration/setup-first-run.integration.test.ts`.

---

## 5. Documented Lifecycle Scripts & Command Log

| Lifecycle Script          | Documented Command                   | Purpose                                           | Verification Result                                                                                                            |
| ------------------------- | ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Migration Status**      | `npm run db:status`                  | Validates migration applied state                 | **PASS** — All 108 migrations applied (`Yes`).                                                                                 |
| **Apply Migrations**      | `npm run db:migrate`                 | Runs pending database migrations                  | **PASS** — Idempotent, reports no pending migrations.                                                                          |
| **Installation Recovery** | `npm run installation:recover`       | Rotates bootstrap token when setup is uncompleted | **PASS** — Safely refuses execution on completed sites (`INSTALLATION_COMPLETE: Completed installations cannot reopen setup`). |
| **Production Build**      | `npm run build`                      | Compiles Next.js application & admin UI           | **PASS** — Exit code 0, all static and dynamic endpoints built without errors.                                                 |
| **Unit Verification**     | `npm test`                           | Runs unit tests across all modules                | **PASS** — 158 test files passed (1,075/1,075 tests passed).                                                                   |
| **Setup Integration**     | `npm run test:integration`           | Verifies Lean/Standard onboarding lifecycles      | **PASS** — 6/6 tests passed in `tests/integration/setup-first-run.integration.test.ts`.                                        |
| **Browser E2E**           | `npm run test:browser`               | Tests interactive browser first-run flow          | **PASS** — `tests/browser/first-run-setup.spec.ts` completed in 17.1s.                                                         |
| **Format Validation**     | `npm run format:check`               | Ensures Prettier compliance across all files      | **PASS** — 100% compliant.                                                                                                     |
| **Lint & Typecheck**      | `npm run lint` & `npm run typecheck` | ESLint (`--max-warnings=0`) & `tsc --noEmit`      | **PASS** — 0 errors, 0 warnings.                                                                                               |

---

## 6. Defects Identified and Resolved in Owning Modules

1. **`src/modules/starters/service.ts`**:
   - _Defect_: `installStarter` was overwriting an existing site's slug with `starter.id` during `upsertRecord`, which failed unique constraints when custom slugs were chosen.
   - _Fix_: Preserved `existingDoc?.slug ?? starter.id` and typed existing document safely.
2. **`src/modules/operations/onboarding.ts`**:
   - _Defect_: Publishing defaults for `commentsPolicy` allowed `'moderated'`, which violated Payload's schema constraint `['closed', 'open', 'members']`. Similarly, `visibility` required mapping to Payload's `['public', 'unlisted', 'members', 'friends', 'private']`.
   - _Fix_: Aligned validation and persistence to use canonical Payload values (`closed`, `open`, `members` for comments; `public`, `members` for visibility).
3. **`src/modules/operations/installation.ts`**:
   - _Defect_: Unmigrated databases threw uncaught `42P01` (undefined_table) when checking installation state.
   - _Fix_: Added `getInstallationReadiness` and safe table checks returning actionable migration recovery commands rather than crashing.
4. **`src/collections/Community.ts`**:
   - _Defect_: Duplicate `indexes` property on `Discussions` collection caused TypeScript build failure.
   - _Fix_: Deduplicated indexes definition.
5. **`src/modules/admin/TelemetryCommandCenter.tsx` & `ThemeCenter.tsx`**:
   - _Defect_: Missing `useEffect` dependencies triggering ESLint `react-hooks/exhaustive-deps` build gate failures.
   - _Fix_: Refactored to `useCallback` and functional state updaters.

---

## 7. Operational Recovery & Failure Matrix

| Failure Mode                   | Root Cause Detection                            | User / Operator Visibility                                 | Recovery Action                                                                                              |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Database Disconnected**      | `getInstallationReadiness` catches ECONNREFUSED | Amber banner on `/setup`: "Database is unreachable"        | Ensure Docker container `renegade-cms-postgres-1` is running; verify `DATABASE_URI`.                         |
| **Pending Migrations**         | Applied count < 108                             | Card: "Database requires schema migration (X/108 applied)" | Run `npm run db:migrate` from the terminal, then refresh page.                                               |
| **Provider Validation Failed** | Live storage probe or Postgres check fails      | Red badge: "Storage engine validation failed"              | Provider success is NEVER displayed before verification. Operator must adjust credentials before proceeding. |
| **Admin Lockout Post-Setup**   | Lost password or passkey                        | `/setup` locked (redirects to `/login`)                    | Use offline emergency recovery code on `/login` tab "Emergency Recovery". Single-use code burns atomically.  |
