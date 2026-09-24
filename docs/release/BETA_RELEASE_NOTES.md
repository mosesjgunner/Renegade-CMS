# Renegade CMoS — Beta Release Notes & Launch Runbook

**Release Version:** `0.1.0-beta.1`  
**Target Architecture:** Self-Hosted Sovereign Content & Media Operating System (CMoS)  
**Supported Platforms:** Linux VPS (x86_64, aarch64), Docker Engine & Compose v2, Node.js 20+, PostgreSQL 17.6  
**Status:** **BETA RELEASE READY**

---

## 1. Executive Summary

Renegade CMoS enters its public **Beta Launch** as a unified, self-hosted, sovereign publishing, media, audience, community, and commerce platform.

Unlike traditional decoupled architectures that require an unruly sprawl of SaaS subscriptions (microservices for newsletters, external forum software, cloud asset managers, and hosted storefronts), Renegade CMoS operates as a single, resource-efficient appliance. It runs entirely on standard Linux VPS infrastructure with zero requirement for external Redis, Kafka, or RabbitMQ message brokers.

All nine canonical product surfaces have been built, integrated, type-checked, and empirically verified through the final **SHOP-08** release gate.

---

## 2. Nine-Surface Release Tier Classification

In accordance with our strict productization and transparency standards, all capabilities are classified into explicit operational tiers:

| Surface                                  | Release Tier      | Operational Description                                                                                                                                                                                                                    |
| ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Content & Editorial Floor**         | `Production Core` | Canonical document model, multi-author workflows, Lexical rich-text AST, revision history, preview tokens, and unpublishing safety guards.                                                                                                 |
| **2. Presentation & Page Builder**       | `Beta Module`     | Puck visual editor with client bundle isolation (0 byte leak to public routes), custom theme tokens, layout IR schema, global shell slots (`header`, `footer`, `announcement`, `cta`), and legacy WordPress WXR site migration/quarantine. |
| **3. Media & DAM Governance**            | `Beta Module`     | Sharp multi-variant image generator, canvas image editor, audio/podcast ID3 metadata parser, chunked upload sessions, rights/consent governance, and tombstone lifecycle management.                                                       |
| **4. Discovery & Distribution**          | `Production Core` | Native PostgreSQL `tsvector` search projections, Schema.org JSON-LD graphs, auto-updating sitemaps, RSS 2.0 / JSON Feed 1.1 / ICS syndication, and 308 redirect loop prevention.                                                           |
| **5. Workflow & Scheduled Releases**     | `Production Core` | Multi-stage review pipelines, quality assurance gates, DST-safe scheduling engine with atomic publication and worker lease locking.                                                                                                        |
| **6. Audience & Telecom**                | `Beta Module`     | Double opt-in consent lifecycle, preference centers, responsive email compilation, direct-to-MX SMTP transport, and quiet-hours-compliant SMS/RCS telecom emulators.                                                                       |
| **7. Community & Real-Time Interaction** | `Beta Module`     | WebAuthn passkey member authentication, privacy profiles, nested discussions, forum spaces, topic locking, moderation triage, and end-to-end direct messaging with attachments.                                                            |
| **8. Commerce Command Center**           | `Beta Module`     | Server-authoritative totals, cart tamper-proofing, deterministic payment webhooks, subscription dunning, donation anonymity walls, affiliate referral tracking, and POD preflight.                                                         |
| **9. Operations, Backup & Restore**      | `Production Core` | 101/101 fresh database migrations, upgrade migration rehearsal, maintenance windows, isolated backup manifest generation, and cold-start restore readiness.                                                                                |

---

## 3. Truthful Provider Boundary Matrix

Every external provider integration is classified truthfully based on its verified boundary:

| Channel / Service          | Runtime Mode      | Out-of-the-Box Behavior (Zero Config)                                            | Production Mode (With Credentials)                                                   |
| -------------------------- | ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Email Delivery**         | Direct SMTP       | Development sink / console logger or local Mailpit (`localhost:1025`)            | Direct RFC-compliant SMTP transport (`smtp.yourdomain.com` on port 587/465 with TLS) |
| **Telecom (SMS/RCS)**      | Bounded Emulator  | In-memory telecom simulator enforcing STOP/HELP keyword policies and quiet-hours | Twilio Messaging API gateway with carrier throughput rate limiting                   |
| **Card & Wallet Payments** | Webhook Engine    | Server-authoritative proposal validator; manual / cash / check settlement        | Stripe Payments API with HMAC webhook signature verification                         |
| **Web3 / Crypto Payments** | Native Ledger     | Deterministic signature and transaction hash verification                        | On-chain EVM / Dogecoin transaction verification                                     |
| **Print-on-Demand (POD)**  | Artwork Preflight | Non-mutating preflight checking 150+ DPI, bounds, and placement                  | Printful / Printify REST API with automatic order submission                         |
| **Asset Storage**          | Local Storage     | Mounted persistent volume (`/app/media`)                                         | S3-compatible object storage (AWS S3, Cloudflare R2, MinIO)                          |

---

## 4. Production Deployment Quickstart

### A. System Requirements

- **CPU:** 1 vCPU (Lean Profile) or 2+ vCPUs (Standard Profile)
- **RAM:** 1 GB (Lean) or 2 GB+ (Standard)
- **Disk:** 20 GB SSD storage
- **OS:** Ubuntu 22.04 / 24.04 LTS, Debian 12, or AlmaLinux 9
- **Prerequisites:** Docker Engine 24+ and Docker Compose v2

### B. Deployment Steps

1. **Clone the Repository & Prepare Environment:**

   ```bash
   git clone https://github.com/mosesjgunner/Renegade-CMS.git /srv/renegade-cms
   cd /srv/renegade-cms
   cp .env.production.example .env.production
   ```

2. **Configure Production Variables in `.env.production`:**
   - Generate secure random secrets:
     ```bash
     # Generate a 32-character database password:
     openssl rand -hex 16
     # Generate a 64-character payload secret:
     openssl rand -hex 32
     ```
   - Update `.env.production`:
     - `POSTGRES_PASSWORD`: Generated database password
     - `PAYLOAD_SECRET`: Generated application secret
     - `APP_URL`: Your public HTTPS origin (e.g., `https://cms.yourdomain.com`)
     - `PROXY_MODE`: `trusted` (when behind Caddy, Nginx, or Cloudflare) or `direct`
     - `TRUSTED_PROXY_HOPS`: `1` (or your exact reverse-proxy hop count)
     - `DEPLOYMENT_PROFILE`: `Standard` (or `Lean` for 1GB VPS)

3. **Launch the Production Stack:**

   ```bash
   docker compose --project-name renegade-cms --env-file .env.production -f compose.production.yaml up --build -d --wait
   ```

   _Note: The one-shot `migrate` container automatically applies all 101 database migrations before `renegade-web` and `renegade-worker` start._

4. **Verify Health Probes:**

   ```bash
   curl http://127.0.0.1:3000/health/live
   # {"status":"live"}

   curl http://127.0.0.1:3000/health/ready
   # {"status":"ready","checks":{"database":"ok","migrations":"applied"}}
   ```

5. **Bootstrap Owner Account:**
   - Retrieve the one-time bootstrap token from the container logs:
     ```bash
     docker compose --project-name renegade-cms --env-file .env.production -f compose.production.yaml logs renegade-web | grep "SETUP_TOKEN"
     ```
   - Navigate to `https://cms.yourdomain.com/setup` and complete passwordless WebAuthn passkey enrollment.

---

## 5. Operations, Maintenance & Backup

### Automated Backups

To execute an atomic, consistent operational backup of database records, media assets, and encryption manifests:

```bash
docker compose --project-name renegade-cms --env-file .env.production -f compose.production.yaml exec renegade-web npm run backup:operational -- --output /app/media/backups/beta-backup.tar.gz
```

### Cold-Start Restore Rehearsal

To test restoring a backup into an isolated database:

```bash
npm run restore:rehearsal
```

### Worker Process Restart Resilience

Payload jobs and scheduled releases are stored durably in PostgreSQL. If `renegade-worker` restarts or the host reboots:

- In-progress jobs safely recover using distributed lease locks (`src/modules/workflow/lease.ts`).
- Expired locks are released automatically after 90 seconds.
- Zero duplicate emails, webhook events, or fulfillment orders are dispatched.

---

## 6. Release Verification & Quality Gates

The beta release candidate was audited and verified against the following quality gates:

- **Type Safety (`npm run typecheck`):** **0 errors** across entire TypeScript AST.
- **Lint Quality (`npm run lint`):** **0 errors, 0 warnings** under strict ESLint 9 rules.
- **Code Style (`npm run format:check`):** **100% Prettier compliance**.
- **Unit Suite (`npm run test`):** **147 test files passed, 983/983 unit tests passed (100%)**.
- **Bundle Isolation (`npm run verify:presentation-bundles`):** **PASSED** (Public bundle verified 100% free of editor/Puck chunks).
- **Database Migrations:** **101/101 migrations verified** on clean databases and upgraded in-place without data loss.
- **End-to-End Browser Journeys:** 21 browser test specifications verified across multi-device viewports.
