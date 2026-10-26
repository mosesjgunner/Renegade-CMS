# RC1 Subpass 09D/70 — CRM Views, Metrics and Audience Acceptance Result

## Overview
- **Subpass:** 09D/70
- **Goal:** Operators can administer contacts and trust audience numbers.
- **Timestamp:** 2026-10-21T09:58:00Z
- **Status:** PASS
- **Base Commit:** `05f58a570ee51b0a6154d71db9d9322340c2f59f`
- **Dirty Tree Manifest:** See [tested-tree.txt](file:///c:/Projects/RENEGADE%20CMS/Renegade-CMS/docs/rc/evidence/rc1/18-pass/09D/tested-tree.txt)

---

## Changed Paths
1. `src/app/(frontend)/api/admin/audience/command-center/route.ts`
   - Added canonical database reconciliation for subscribers, contacts, suppressions, messages, automations, and experiments with multi-site grant scoping (`resolveOperatorGrantContext`).
   - Added structured deliverability health evaluations (healthy, warning, critical) with rate thresholds.
   - Added unified calendar schedule aggregation with quiet hours and frequency policy conflict detection.
   - Served authoritative 14-term metric dictionary distinguishing transport handoff vs carrier delivery receipts.
2. `src/app/(frontend)/api/admin/audience/crm/route.ts`
   - GET: Full search/filter query support (`query` across name/email/phone substring, `status` filtering), paginated responses, and contact detail drawer with linked subscriber, suppression status/reason, and consent history.
   - GET (Export): Operational CSV cohort summaries enforcing strict k-anonymity (cohorts with $N < 5$ masked as `< 5`).
   - GET (Metrics): First-party observed metrics only (`observedOpensConfirmed: 0`, `observedClicksHuman: 0`, explicit uncertainty notice guaranteeing zero phantom inferences).
   - POST (`create-contact`): Normalizes email address and E.164 phone number, computes `audienceDigest` for base64url emailHash, scopes to site grant.
   - POST (`update-contact`): Updates status and contact details within authorized operator site grant.
   - POST (`export-subject`): Full GDPR Data Portability subject export bundle.
   - POST (`erase-subject`): Right to be Forgotten workflow: hashes subscriber email, creates suppression, erases PII with `erased+...` alias, records immutable GDPR erasure audit event.
   - POST (`suppress-contact`): Manual operator suppression with site scoping.
3. `src/modules/admin/AudienceCommandCenter.tsx`
   - Comprehensive operator dashboard with 13 functional sections:
     - CRM Directory: Search input, status filter pills, contact table with pagination.
     - Detail Inspection Drawer: Contact metadata, linked subscriber info, suppression reason badge, complete consent event timeline.
     - GDPR Tools: Subject export and Right to be Forgotten subject erasure with operator confirmation.
     - Deliverability Health Card: Delivery rate, bounce rate, complaint rate, spam warning thresholds.
     - Unified Calendar: Scheduled dispatches with quiet hours and fatigue conflict alerts.
     - Canonical Reconciliation: Reconciled counts comparing UI indicators directly against canonical collection records.
     - Metric Dictionary Browser: 14 metrics with explicit definitions of transport vs carrier handoff.
4. `src/modules/audience/service.ts`
   - Mapped suppression reasons to valid `ConsentEvents.event` enum options (`bounce`, `complaint`, `unsubscribe`, `legal` -> `erased`, default `operator-correction`) preventing validation rejection during subject suppression.
5. `tests/unit/rc1-09d-crm-metrics.test.ts`
   - 14 focused unit tests covering email normalization, phone E.164 normalization, deliverability health status classification, k-anonymity export masking, metric dictionary invariants, and quiet hours/frequency policy checks.
6. `tests/rc1-09d/run-isolated.ps1` & `tests/rc1-09d/verify.ts`
   - Fully isolated PostgreSQL 17.6 disposable container harness (`rc109d-20261021`, port 5452, db `rc109d_release_acceptance`).
   - 50 end-to-end automated checks covering visitor double-opt-in, campaign delivery, suppression, CRM search/filter, detail inspection, k-anonymity CSV export, contact creation, GDPR erasure, negative 403 access controls, and container restart survival.

---

## Commands and Exits

| Command | Exit Code | Details |
|---|---|---|
| `npx.cmd eslint ...` | 0 | 0 errors, 0 warnings across all modified and test files |
| `npx.cmd tsc --noEmit` | 0 | Clean type checking across repository |
| `npx.cmd vitest run tests/unit/rc1-09d-crm-metrics.test.ts` | 0 | 14 passed (14 tests total) |
| `npx.cmd vitest run tests/unit/aud-*.test.ts tests/unit/rc1-09d-*.test.ts` | 0 | 49 passed (49 tests total) |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-09d/run-isolated.ps1 start-db` | 0 | Started PostgreSQL 17.6 on container `rc109d-20261021` |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-09d/run-isolated.ps1 migrate` | 0 | Fresh migration acceptance passed |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-09d/run-isolated.ps1 verify` | 0 | 50 automated checks passed |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-09d/run-isolated.ps1 restart-check` | 0 | 6 container restart persistence assertions passed |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-09d/run-isolated.ps1 stop-db` | 0 | Clean teardown and disposal of container |

---

## Test Counts Summary
- **Unit Tests:** 14 passed, 0 failed, 0 skipped
- **Audience Suite Unit Tests:** 49 passed, 0 failed, 0 skipped
- **End-to-End Acceptance Checks:** 50 passed, 0 failed, 0 skipped
- **Container Restart Checks:** 6 passed, 0 failed, 0 skipped
- **Total Executed Checks:** 70 passed, 0 failed, 0 skipped, 0 unexecuted

---

## Observed Operator & User Journey
1. **Visitor Signup & Confirmation:**
   - Visitor `visitor.jane@example.test` requested subscription via `requestDoubleOptIn`.
   - Single-use token generated; visitor confirmed double opt-in via `confirmDoubleOptIn`.
   - `verifiedAt` recorded and `double-opt-in-confirmed` event appended to `consent-events`.
2. **CRM Directory Sync & Campaign:**
   - CRM contact `Jane Doe` linked to subscriber; test campaign dispatched via `/api/admin/audience/campaign`.
   - Delivery recorded as accepted (`deliveriesAccepted: 1`).
3. **Preference Change & Suppression:**
   - Recipient changed preference to unsubscribe; recipient suppressed via `suppressSubscriber`.
   - Suppression recorded in `suppressions` collection and `canDeliverToSubscriber` immediately evaluated to `false`.
4. **Command Center & Count Reconciliation:**
   - Operator authenticated via passkey cookie accessed `/api/admin/audience/command-center`.
   - Reported counts matched canonical collection records: subscribers (1 = 1), contacts (1 = 1), suppressions (1 = 1).
   - Structured deliverability health evaluated (`healthy`, bounce rate 0%, complaint rate 0%).
   - Full 14-term metric dictionary served with transport handoff vs carrier DLR distinctions.
5. **CRM Search & Filter:**
   - Search by name `Jane` matched contact `Jane Doe`.
   - Search by phone substring `1234567` matched E.164 phone `+15551234567`.
   - Filter by status `lead` matched contact.
6. **Detail Inspection & First-Party Metrics:**
   - Detail drawer loaded contact ID, showing `isSuppressed: true`, `suppressionReason: "unsubscribe"`.
   - Consent history loaded full audit timeline (`double-opt-in-confirmed` and `preference-withdrawn`).
   - Observed metrics reported `deliveriesAccepted: 1`, `observedOpensConfirmed: 0`, `observedClicksHuman: 0`, and explicit notice `"Zero unobserved events inferred; metrics represent first-party observed outcomes only."`
7. **Privacy-Preserving Export:**
   - Export CSV generated with k-anonymity policy header; small cohort ($N < 5$) masked as `< 5`.
8. **Contact Creation:**
   - Operator created contact `Robert Operator` with un-normalized email and formatted phone.
   - System normalized email to `robert@example.test` and phone to `+15558889999`.
9. **GDPR Subject Erasure:**
   - Operator submitted erasure request via `/api/admin/audience/crm` (`action: "erase-subject"`).
   - Subscriber email anonymized with `erased+...` alias, status set to `suppressed`, `erasedAt` recorded.
   - GDPR erasure audit record persisted in `consent-events` with `event: "erased"`.
10. **Negative & Security Cases:**
    - Anonymous access to command center and CRM returned HTTP 403.
    - Foreign operator (assigned to Site Beta) denied access to Site Alpha command center and CRM (HTTP 403).
    - Querying non-existent contact ID returned clean HTTP 404 without leaking server errors.
11. **Persistence Across Restart:**
    - Docker container `rc109d-20261021` restarted; validated persistence of site, anonymized subscriber, suppressions, CRM contacts, and consent events.

---

## Artifact Files
- [tested-tree.txt](file:///c:/Projects/RENEGADE%20CMS/Renegade-CMS/docs/rc/evidence/rc1/18-pass/09D/tested-tree.txt)
- [journey-trace.json](file:///c:/Projects/RENEGADE%20CMS/Renegade-CMS/docs/rc/evidence/rc1/18-pass/09D/journey-trace.json)
- [restart-trace.json](file:///c:/Projects/RENEGADE%20CMS/Renegade-CMS/docs/rc/evidence/rc1/18-pass/09D/restart-trace.json)
- [state.json](file:///c:/Projects/RENEGADE%20CMS/Renegade-CMS/docs/rc/evidence/rc1/18-pass/09D/state.json)
