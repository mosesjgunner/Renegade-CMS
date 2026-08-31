# Renegade CMS — Fourth Pass Baseline Audit

Date: 2026-08-29
Environment: Node.js 24 / Next.js 16.3.0 / Payload CMS 3.88.0 / PostgreSQL 17.6 / React 19.2.8
Repository: https://github.com/mosesjgunner/Renegade-CMS
Status: **BASELINE AUDIT COMPLETE (FEATURE FREEZE ACTIVE)**

---

## 1. Executive Summary

This document establishes the authoritative Fourth Pass (Final Implementation Pass) baseline for Renegade CMS. It inventories the actual state of the codebase as verified through direct execution, code inspection, and test runs—independent of historical handoffs or documentation claims.

### Key Verification Evidence

- **Typecheck (`npm run typecheck`)**: PASSED (0 errors, `tsc --noEmit`).
- **Linter (`npm run lint`)**: PASSED (0 warnings, 0 errors, ESLint 9 + Next.js core web vitals).
- **Code Style (`npm run format:check`)**: PASSED (Prettier 3.6.2).
- **Unit Suite (`npm test`)**: PASSED (48 test files, 190 tests passed).
- **Integration Suite (`npm run test:integration`)**: PASSED against PostgreSQL 17 (9 test files, 27 integration tests passed).
- **Production Build (`npm run build`)**: PASSED (Turbopack standalone build, 34 static and dynamic routes compiled).

---

## 2. Licensing Consistency Audit

| Asset               | Specified License                           | Notes                                                                                                             |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `LICENSE`           | GNU General Public License v3.0 (`GPL-3.0`) | Full text of GPLv3 (June 2007) present in root.                                                                   |
| `package.json`      | `AGPL-3.0-or-later`                         | Declares GNU Affero General Public License v3 or later.                                                           |
| `README.md`         | Free & self-hosted (unspecified SPDX)       | Mentions free, self-hosted, portable platform.                                                                    |
| Repository metadata | Discrepancy                                 | **Discrepancy identified**: `LICENSE` file contains GPLv3 text while `package.json` declares `AGPL-3.0-or-later`. |

> **Recommendation**: Align root `LICENSE` file with `AGPL-3.0-or-later` (or vice versa) before RC release to prevent licensing ambiguity.

---

## 3. Subsystem Classification & Implementation Inventory

Each major subsystem has been inspected and traced to real execution paths.

### 3.1 Platform Core, Config, Database & Migrations

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/core/`, `src/migrations/`, `src/payload.config.ts`
- **Details**:
  - Centralized runtime configuration (`loadConfig`) with strict production validation (rejects loopback HTTP, weak secrets, placeholder passwords).
  - PostgreSQL 17 integration via `@payloadcms/db-postgres` with UUID primary keys.
  - 24 registered sequential and reversible database migrations in `src/migrations/index.ts`.
  - Domain composition engine (`registeredPayloadDomains`) and progressive disclosure filters.

### 3.2 Operations, Diagnostics, Jobs Worker & Health

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/operations/`, `src/scripts/run-jobs-worker.ts`, `docker/worker-healthcheck.mjs`
- **Details**:
  - Standalone worker daemon executing Payload Jobs with heartbeat file emission (`/tmp/renegade-worker/heartbeat.json`), retry limits, exponential backoff, and dead-letter failure preservation.
  - Healthcheck routes (`/health/live`, `/health/ready`) validating HTTP and PostgreSQL connectivity.
  - Authenticated diagnostics (`/api/operations/diagnostics`) and support bundle generator.
  - Operational maintenance, status, upgrade, and rollback CLI commands.

### 3.3 Installation & First-Run Onboarding

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `install.sh`, `src/app/(frontend)/setup/`, `src/modules/identity/`
- **Details**:
  - `install.sh`: Supported Linux VPS installer validating CPU architecture, RAM, Docker Compose v2, generating safe cryptographic secrets and launching `compose.production.yaml`.
  - `/setup`: 5-step progressive onboarding wizard with passkey enrollment, recovery code generation, site/publication/space initialization, and permanent lock.
  - Recovery CLI `npm run installation:recover` allowing re-entry if setup token expires prior to completion.

### 3.4 Identity, Authentication & Permissions

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/identity/`, `src/modules/collaboration/`
- **Details**:
  - Staff / Owner authentication: WebAuthn passkeys (`@simplewebauthn/server`) + one-time recovery codes.
  - Member authentication: Magic links via signed JWTs (`jose`).
  - Machine authentication: Scoped API tokens with SHA-256 digests and unique prefixes.
  - Scoped team memberships across Site, Publication, and Space with granular RBAC permissions.

### 3.5 Editorial Publishing & Release Orchestration

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/editorial/`, `src/modules/releases/`, `src/collections/Publishing.ts`, `src/collections/Releases.ts`
- **Details**:
  - Article family content with immutable revision records (`revision-records`).
  - Editorial review lifecycle (draft, in_review, scheduled, published, archived) with embargo prevention.
  - Scheduled publishing via durable Payload Jobs.
  - Coordinated Content Releases (`releases` domain) for grouped multi-item publishing.
  - Lexical rich text editor + Markdown export/import.

### 3.6 Page Builder & Public Theme Rendering

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/app/(frontend)/builder/`, `src/collections/PageLayouts.ts`, `src/modules/public/`
- **Details**:
  - Page builder powered by `@puckeditor/core` with custom component catalog.
  - Portable layout rendering engine with dynamic routing (`/[...path]`, `/articles/[slug]`).
  - RSS feeds, XML sitemaps, and robots.txt generation.

### 3.7 Media Asset Management

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/media/`, `src/collections/MediaPublishing.ts`
- **Details**:
  - Local storage driver (`MEDIA_DIR=./media`) with volume isolation.
  - Derivative image generation, responsive variants, and media publication boundaries.
  - Audio/Video episode publication linking.

### 3.8 Audience & Email Publishing

- **Classification**: `VERIFIED IMPLEMENTED` (SMTP & Local) / `EXTERNAL-INTEGRATION DEPENDENT` (Third-party ESPs)
- **Location**: `src/modules/audience/`, `src/modules/email/`, `src/collections/Audience.ts`
- **Details**:
  - Subscriber lifecycle with double opt-in confirmation, cryptographic unsubscribe tokens, and preference center.
  - Email delivery queue with retry logic and bounce suppression.
  - Standard SMTP adapter via Nodemailer, development in-memory test capture, and disabled mode.

### 3.9 Social Distribution

- **Classification**: `VERIFIED IMPLEMENTED` (Bluesky / Manual) / `PARTIAL` (Other networks)
- **Location**: `src/modules/social/`, `src/collections/Social.ts`, `src/app/(frontend)/social-studio/`
- **Details**:
  - Multi-network social variants, queueing, and retry policies.
  - Live ATProto text-post distribution for Bluesky via app passwords.
  - Structured manual copy/handoff flows for X, Threads, Facebook, Instagram, LinkedIn, YouTube, TikTok.

### 3.10 ActivityPub & Federation Networking

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/network/`, `src/collections/Network.ts`, `src/app/(frontend)/ap/`, `src/app/(frontend)/.well-known/`
- **Details**:
  - WebFinger and NodeInfo 2.1 protocol discovery endpoints.
  - Opt-in publication actor (`/ap/actors/{handle}`) with HTTP Signature verification and key rotation.
  - Inbound inbox/outbox handling, replay key caching, remote actor/object caching with moderation domain blocking.
  - Public `/network` exploratory surface (hidden when `NETWORKING_ENABLED=false`).

### 3.11 Basic Commerce & Point of Sale

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/commerce/`, `src/collections/Commerce.ts`, `src/app/(frontend)/store/`, `src/app/(frontend)/pos/`
- **Details**:
  - Product catalog, cart sessions, checkout flows, order management, and variant inventory tracking.
  - Deterministic `development-*` mock payment adapter (no external secrets required for full testing).
  - Noncustodial crypto invoice quotation and observation verification.
  - In-person Point of Sale (POS) QR-code payment flow.

### 3.12 Site Quality Center

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/quality/`, `src/collections/Quality.ts`
- **Details**:
  - Automated quality policy rules, scans, issue tracking, and waiver management.
  - Release-blocking validations preventing publishing when critical issues are unresolved.

### 3.13 First-Party Analytics & Privacy Experiments

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/analytics/`, `src/modules/experiences/`, `src/collections/Analytics.ts`, `src/collections/Experiences.ts`
- **Details**:
  - First-party, consent-gated event logging with deduplication and bounded rollups (no third-party trackers or device fingerprinting).
  - Deterministic salted A/B experiment variant assignment.

### 3.14 Team Collaboration & Staff Communications

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/collaboration/`, `src/collections/Collaboration.ts`
- **Details**:
  - Editorial assignments, revision review comments with mentions, and notifications.
  - Private scoped staff conversations and direct messaging (scope-isolated).

### 3.15 Integrations, Scoped Webhooks & AI Gateway

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/integrations/`, `src/modules/ai/`, `src/collections/Integrations.ts`
- **Details**:
  - Scoped API tokens, webhook delivery with exponential retries and HMAC signatures.
  - Controlled Agent adapter requiring human confirmation for write actions.
  - AI Gateway contract for safe model invocations.

### 3.16 Data Portability & Operational Backup

- **Classification**: `VERIFIED IMPLEMENTED`
- **Location**: `src/modules/portability/`, `src/scripts/portability.ts`, `src/scripts/operational-backup.ts`, `src/scripts/operational-restore.ts`
- **Details**:
  - Encrypted JSON/ZIP export and import with resume checkpoints and dry-run validation.
  - Full PostgreSQL dump and media volume operational backup/restore toolchain.

---

## 4. Technical Environment & Baseline Parameters

### 4.1 Runtime & Engines

- **Node.js**: `>=20.9.0` (Node 24 recommended & tested in CI/build)
- **NPM**: `>=10`
- **Next.js**: `16.3.0` (Standalone output mode)
- **Payload CMS**: `3.88.0`
- **Database**: PostgreSQL 17 (`postgres:17.6-alpine`)
- **UI & CSS**: React `19.2.8`, Tailwind CSS `4.3.3` (`@tailwindcss/postcss`)
- **TypeScript**: `5.9.2` (`ES2022` target, strict mode)

### 4.2 Core Configuration & Environment Variables

| Variable             | Default / Example                   | Purpose                                            |
| -------------------- | ----------------------------------- | -------------------------------------------------- |
| `NODE_ENV`           | `development` / `production`        | Controls strict validation & security enforcement. |
| `DATABASE_URL`       | `postgresql://...`                  | PostgreSQL connection string with UUID support.    |
| `PAYLOAD_SECRET`     | 32+ (dev) / 48+ (prod) chars        | Cryptographic signing secret for Payload sessions. |
| `APP_URL`            | `http://localhost:3000`             | Canonical HTTPS public origin in production.       |
| `PROXY_MODE`         | `direct` / `trusted`                | Reverse proxy header handling.                     |
| `TRUSTED_PROXY_HOPS` | `1`                                 | Trusted proxy hop count.                           |
| `STORAGE_DRIVER`     | `local`                             | Media storage driver.                              |
| `MEDIA_DIR`          | `./media` / `/app/media`            | Path to persistent media asset storage.            |
| `EMAIL_MODE`         | `disabled` / `development` / `smtp` | Outbound email routing mode.                       |
| `NETWORKING_ENABLED` | `false`                             | ActivityPub federation toggle.                     |
| `DEPLOYMENT_PROFILE` | `Standard` / `Lean`                 | Resource footprint tuning (RAM-based).             |

---

## 5. Test Suite & Verification Matrix

| Test Suite        | Command                    | Count                | Status   | Notes                              |
| ----------------- | -------------------------- | -------------------- | -------- | ---------------------------------- |
| Typecheck         | `npm run typecheck`        | Full codebase        | **PASS** | 0 type errors                      |
| Lint              | `npm run lint`             | Full codebase        | **PASS** | 0 warnings, 0 errors               |
| Code Formatting   | `npm run format:check`     | Full codebase        | **PASS** | 100% compliant                     |
| Unit Tests        | `npm test`                 | 48 files / 190 tests | **PASS** | Fast in-memory unit contracts      |
| Integration Tests | `npm run test:integration` | 9 files / 27 tests   | **PASS** | PostgreSQL 17 container execution  |
| Production Build  | `npm run build`            | 34 routes            | **PASS** | Standalone Next.js Turbopack build |

---

## 6. Audit Findings & Categorized Issues

### 6.1 BLOCKER Issues (Must be resolved before Release Candidate)

- **None currently identified.** Core build, migrations, unit tests, integration tests, and production build pass cleanly.

### 6.2 HIGH Issues (Address early in Fourth Pass)

1. **Licensing Inconsistency**: Root `LICENSE` is `GPL-3.0` while `package.json` specifies `AGPL-3.0-or-later`. Must be reconciled across files.
2. **Setup Token Expiry UX**: When setup token expires or is interrupted, CLI recovery (`npm run installation:recover`) is required; browser UI could provide clearer instructions on the setup locked screen.

### 6.3 MEDIUM Issues (Hardening & Polish)

1. **Log Files in Repository Root**: Root contains ephemeral logs (`release-checks.err.log`, `release-checks.out.log`, `upgrade-rehearsal.log`). These should be added to `.gitignore` and removed from tracking.
2. **Root Workspace Prompt Document**: `renegade-cms-15-codex-prompts (1).md` in root directory is a historical prompt artifact; should be archived into `docs/` or cleaned up.
3. **Database Test Environment URL Safety**: `src/scripts/verify-fresh-migration.ts` enforces `_release_acceptance` suffix on database name; documentation should clearly emphasize this requirement for developer testing.

### 6.4 LOW Issues (Documentation & Minor Cleanups)

1. **README.md Expansion**: `README.md` is minimal (19 lines); can be enriched with full feature matrix, quickstart, docker instructions, and link to documentation suite.
2. **Email Provider Setup Guide**: Additional documentation for production SMTP configurations (e.g. Amazon SES, Postmark, Mailgun) in `docs/operations/`.

---

## 7. Recommended Next Work (Fourth Pass Execution Roadmap)

1. **Pass 4.1 — Clean Repository & License Standardization**:
   - Clean up untracked/ephemeral log files and standardize license declaration (`AGPL-3.0-or-later`).
2. **Pass 4.2 — Documentation & Operator Manuals**:
   - Complete `README.md` overhaul, architecture guide updates, and deployment guide verification.
3. **Pass 4.3 — Verification Script Hardening**:
   - Ensure `npm run verify:release` (the full clean-clone verification suite) runs end-to-end smoothly across Linux and Windows environments.
4. **Pass 4.4 — Comprehensive Real-World Test Scenario**:
   - Execute a multi-tenant, multi-publication, multimedia editorial publishing flow on a freshly deployed instance.
5. **Pass 4.5 — Release Candidate Packaging**:
   - Final tag, Docker image build verification, and RC release notes.
