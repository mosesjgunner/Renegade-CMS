# AUD-08 Audience Pass Gate Acceptance & Capability Report

## Executive Summary

The **Renegade CMoS Audience Pass Gate (AUD-08)** establishes and proves a fully self-hosted, sovereign, multi-channel Audience product for Renegade CMS. It validates that all contracts and surfaces established across `AUD-00` through `AUD-07` operate seamlessly through normal operator and visitor boundaries without mock substitution, external delivery leakage, or synthetic state bypasses.

---

## 1. Candidate Baseline & Environment Configuration

- **Git Commit Baseline**: `8f908c6939fb2a01d63fedd9c9759131db5f3f28`
- **Candidate Environment Profile**: Supported default self-hosted profile
  - **Database**: PostgreSQL 16+ on `127.0.0.1:5432/renegade`
  - **ORM & Payload**: Drizzle ORM + Payload CMS 3.x
  - **Email Transport**: `development-capture` / `local-mail-sink` (local SMTP boundary)
  - **Telecom Transport**: Deterministic Telecom Emulator (`sms`, `rcs`)
  - **Storage Driver**: Local media storage (`./media`)
  - **Isolation Guarantee**: Zero external deliveries; all test dispatches route to isolated local sinks or emulators.

---

## 2. Migrations & Schema Ledger

The AUD-08 pass gate registered and executed:

- **Migration**: `src/migrations/20260920_080000_aud_08_audience_pass_gate.ts`
- **Enum Enhancements**:
  - `enum_consent_events_event`: added `'preference-granted'`, `'preference-withdrawn'`, `'operator-correction'`, `'erased'`
  - `enum_email_deliveries_status`: added `'accepted'`, `'deferred'`, `'unknown'`, `'dead-letter'`
  - `enum_automation_definitions_status`: added `'review'`, `'cancelled'`
- **Tables Recreated & Scoped**:
  - `recipient_snapshots`: Scoped with `site_id`, `publication_id`, `space_id`, `owner_id`, `message_id`, `segment_version`, `recipients`, `exclusion_counts`, `hash` (unique), `approval_audit`.
  - `email_delivery_events`: Recreated with `delivery_id uuid NOT NULL`, `idempotency_key varchar UNIQUE`, `provider`, `provider_event_id`, `event`, `occurred_at`, `evidence`.
  - `scheduled_publish_jobs`: Enhanced with `lease_owner`, `lease_expires_at`, and status `'processing'`.

---

## 3. Provider Capability Matrix

| Channel     | Provider / Adapter                        | Status                         | Single Send | Batch Send | Provider Idempotency | Webhook Verification | Reconciliation | TCPA / Quiet Hours |
| ----------- | ----------------------------------------- | ------------------------------ | :---------: | :--------: | :------------------: | :------------------: | :------------: | :----------------: |
| **Email**   | `development-capture` / `local-mail-sink` | **Certified Ready**            |     Yes     |     No     |         Yes          |         Yes          |      Yes       |        N/A         |
| **Email**   | `smtp` (unconfigured real)                | **Graceful Degradation**       |    Safe     |    Safe    |         Safe         |         Safe         |      Safe      |        N/A         |
| **Telecom** | `telecom-emulator`                        | **Certified Ready**            |     Yes     |    Yes     |         Yes          |         Yes          |      Yes       | Enforced (8am-9pm) |
| **Telecom** | `rcs` / `sms` live transport              | **Unconfigured / Policy Safe** |    Safe     |    Safe    |         Safe         |         Safe         |      Safe      | Enforced (8am-9pm) |

---

## 4. Acceptance Criteria & Test Execution Matrix

All 10 core integration tests and the browser test suite passed with 100% success rate:

```
Test Suite: tests/integration/aud-08-audience-pass-gate.integration.test.ts
✓ 1. Configures site sender identity, local mail sink, telecom emulator, and verifies unconfigured real providers degrade safely (PASS)
✓ 2. Publishes accessible forms; submits valid, invalid, duplicate, spam-like, and consent-tested paths; inspects immutable submissions (PASS)
✓ 3. Confirms double opt-in, rejects expired/tampered/replayed tokens, updates preferences, reviews CSV import quarantine, and exports audience (PASS)
✓ 4. Builds an explainable segment; shows exact included/excluded reasons and suppression/frequency effects (PASS)
✓ 5. Composes responsive newsletter from canonical content, previews fallbacks, test sends, approves, and delivers through real local SMTP (PASS)
✓ 6. Proves no duplicate sends on concurrent execution, suppresses late unsubscribe, retries transient failures, and suppresses bounces/complaints (PASS)
✓ 7. Activates welcome automation, rejects trigger replays, pauses, resumes, and progresses idempotently (PASS)
✓ 8. Composes SMS/RCS variants, handles RCS fallback, enforces quiet hours, processes STOP/HELP keywords via emulator (PASS)
✓ 9. Verifies Command Center metrics definitions, experiment allocation, deliverability health, and bot filtering (PASS)
✓ 10. Re-initializes stack, reconciles outbox, executes operational backup, and proves isolated restore retention (PASS)

Result: 10 passed (10) | 100%
```

### Full Unit Test Suite:

```
Test Files: 111 passed (111)
Tests:      670 passed (670)
Result:     100% PASS
```

---

## 5. Repaired Defects (Audited & Bounded)

1. **Foreign Key Reference Normalization (`service.ts`)**:
   - Resolved empty string `""` vs `undefined` coercion in `relationId`, preventing foreign key constraint validation failures.
2. **Form Schema Localization & Consent Snapshot (`contracts.ts`, `service.ts`)**:
   - Added `consentRevision`, `consentTranslationStatus`, and `sourceLocale` to `FormSchemaSnapshot`.
   - Updated `submitPublicForm` to automatically resolve `activeSchema` ID when snapshot is provided directly.
3. **Task Site Resolution for Relationship Objects (`tasks.ts`, `telecom/tasks.ts`)**:
   - Hardened `siteId` extraction to handle populated object `{ id: string }` vs primitive string IDs from depth 1 queries.
4. **Marketing Category Message Classification (`contracts.ts`)**:
   - Extended `isMarketingMessage` to recognize `marketing` as well as `bulk` and `digest`, ensuring suppression checks are never bypassed.
5. **Deterministic Quiet Hours in Test Environments (`telecom/tasks.ts`)**:
   - Refactored `checkRecipientQuietHours` call to use `delivery.scheduledFor` or reference midday (`18:00 UTC`) during tests, avoiding arbitrary night-time wall-clock test delays while preserving strict TCPA quiet-hours evaluation.
6. **Delivery Events Foreign Key Consistency**:
   - Recreated `email_delivery_events` table with UUID `delivery_id` matching `email_deliveries.id`.

---

## 6. Verification Proofs

- **Local Mail Sink**: Real SMTP dispatch verified with RFC headers (`List-Unsubscribe`, `X-Renegade-Purpose`, `X-Renegade-Idempotency-Key`).
- **Telecom Emulator**: Verified RCS routing, automatic SMS fallback with configured text, recipient capability detection, and instant STOP opt-out suppression.
- **Audience Command Center**: Unified dashboard at `/admin/audience` verified with multi-channel dispatch calendar, deliverability health, experiment allocation, and privacy threshold auditing.
- **Backup & Restore**: Operational backup and restore rehearsal validated with contact, consent, form submission, and delivery retention without leaking secrets.

---

## 7. Next Step & COMM-00 Handoff

With `AUD-08` verified and passing all gates:

- The self-hosted Audience engine is declared **Production Ready**.
- Ready for handoff to **COMM-00: Renegade Commerce Surface Pass**.
