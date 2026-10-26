# 08 — Nine-Surface Product Acceptance Feature Matrix

- **Baseline Commit (HEAD SHA):** `05f58a570ee51b0a6154d71db9d9322340c2f59f`
- **Triage Date:** 2026-10-25
- **Triage Stance:** Skeptical Product Acceptance & User Job Completion Review
- **Standard of Proof:** Real operator and ordinary visitor completing actual jobs end-to-end, not merely schema presence or HTTP 200 health checks.

---

## 1. Nine Product Surfaces Status & Evidence Matrix

| Surface | Status | Operator Journey Completion | Visitor Journey Completion | Missing First-User / Visitor Evidence | Release Impact |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **1. Editorial & Authoring** | `PARTIAL` | Operator authors Lexical draft, requests review, locks operation, derives canonical path. | Visitor reads published article, navigates sections and categories. | **Critical Defect:** Staff user can create content on foreign site via forged `renegade-active-site` cookie (`ISSUE-01`). Missing automated test for cross-site category linking. | Blocks multi-tenant production launch. |
| **2. Page Builder & Themes** | `PARTIAL` | Operator edits layouts in isolated Puck builder route; styles adapt via CSS token variables. | Visitor renders server-side dynamic layout without client-side Puck editor payload leakage. | **Critical Defect:** Multi-site configuration causes complete blackout of publications and layouts on `localhost` (`ISSUE-02`). | Blocks multi-site local evaluation. |
| **3. Media / DAM** | `EXISTS AND WORKS END-TO-END` | Operator uploads image/video, selects focal points, tracks tombstone retention. | Visitor fetches responsive WebP/AVIF variants; fast-start MP4 streams directly. | Video transcoding queue (`media-heavy`) unverified in lean deployment profile without ffmpeg container. | Nonblocking for lean profile; ready for standard profile. |
| **4. Discovery & Distribution** | `EXISTS BUT PARTIAL/BROKEN` | Operator configures SEO canonical URLs, previews RSS/JSON feeds and sitemaps. | Search engines ingest coherent sitemap; social crawlers read OpenGraph meta cards. | **Unit Regression:** Bluesky AT Protocol adapter test fails due to preflight `readRecord` mismatch on generic test mocks (`ISSUE-04`). | Blocks CI release gate. |
| **5. Workflow & Release Scheduler** | `EXISTS BUT PARTIAL/BROKEN` | Publisher bundles content into release saga, approves preflight gates, triggers publish. | Visitor immediately views published release bundle across all content endpoints. | **Unit Regression:** Preflight gate ordering mismatch in `flow-04-acceptance.test.ts:370` (`ISSUE-05`). | Blocks CI release gate. |
| **6. Audience & Telecom** | `EXISTS BUT PARTIAL/BROKEN` | Operator uses 13-tab Command Center, drafts newsletter, exports k-anonymity CRM cohorts. | Subscriber double-opts-in, manages consent preferences, sends inbound STOP. | **Unit Regressions:** Unhandled logger TypeError (`ISSUE-03`) and Command Center default tab text drift (`ISSUE-07`). Real carrier SMS/RCS dispatch is simulated only (`ISSUE-14`). | Blocks CI release gate; carrier delivery virtual-only. |
| **7. Community & Auth** | `EXISTS BUT PARTIAL/BROKEN` | Operator enrolls passkey, receives recovery codes, logs into admin session. | Member signs up, authenticates via passkey or magic link, views profile directory. | **Defect:** Staff passkey completion route drops emergency recovery codes (`ISSUE-10`). Real hardware WebAuthn ceremony unverified in automated CI (`ISSUE-14`). | Account recovery risk for staff; virtual auth only. |
| **8. Commerce & Fulfillment** | `EXISTS AND WORKS END-TO-END` | Operator inspects orders, sets up payment connections, tracks reconciliation cases. | Customer adds products to cart, completes server-side checkout, receives receipt email. | Worker crash during payment webhook processing leaves event in `processing` indefinitely post-restore (`ISSUE-11`). | High data integrity risk during disaster recovery. |
| **9. Operations, Install & Backup** | `EXISTS BUT PARTIAL/BROKEN` | Operator runs `install.sh`, completes `/setup` wizard, executes quiesced backup/restore. | Visitor receives 503 during maintenance window; recovers seamlessly post-restore. | **Upgrade Gap:** Upgrade migration test uses synthetic fixtures rather than authentic historical database dump (`ISSUE-13`). 17 migrations lack down rollback (`ISSUE-12`). | Unverified predecessor upgrade proof; restore-only rollbacks. |

---

## 2. Missing First-User & Visitor Acceptance Journeys

### Journey 1: Multi-Site Visitor Navigation
- **Claimed:** Sovereign multi-site routing works seamlessly across custom domains and local test environments.
- **Observed Reality:** Visiting `http://localhost:3000` with more than 1 active site in the database returns an empty shell with zero navigation or articles because `publicSiteForHost` lacks a fallback for local unmapped hostnames.
- **Required Acceptance Proof:** An automated browser test creating Site Alpha and Site Beta in one PostgreSQL database, navigating to `localhost:3000`, and asserting that Site Alpha's navigation and hero banner render correctly.

---

### Journey 2: Staff Passkey Emergency Disaster Recovery
- **Claimed:** Staff operators receive single-use emergency recovery codes upon passkey enrollment.
- **Observed Reality:** `/api/auth/passkey/complete` drops `recoveryCodes` before responding. Staff members are never presented with recovery codes.
- **Required Acceptance Proof:** An automated test calling staff passkey completion, extracting `recoveryCodes`, invalidating the passkey, and successfully authenticating using a recovery code.

---

### Journey 3: Authentic Predecessor Production Upgrade
- **Claimed:** Sovereign instances running September 2026 baseline can upgrade cleanly to current HEAD.
- **Observed Reality:** `verify-upgrade-migration.ts` inserts synthetic rows via raw SQL `INSERT` into an empty database. Real upgrade from an authentic predecessor database `.dump` is unverified.
- **Required Acceptance Proof:** An automated rehearsal importing a real sanitized PostgreSQL dump from migration 67 (`20260914_110000_med_05_video_workflow`), running `payload migrate`, and asserting 100% data and schema preservation.

---

### Journey 4: Disaster Recovery with Interrupted In-Flight Transactions
- **Claimed:** Operational restore guarantees complete business recovery without data loss or stuck queues.
- **Observed Reality:** If `renegade-worker` is killed while processing a payment event, the event remains in `processingState: 'processing'` forever after database restore.
- **Required Acceptance Proof:** An automated test inserting a `payment-webhook-events` row in `processingState: 'processing'` with an old timestamp, starting the worker, and asserting that the stale job reaper re-queues and successfully processes the event.
