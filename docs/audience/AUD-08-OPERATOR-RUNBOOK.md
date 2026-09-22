# AUD-08 Operator & Visitor Runbook: Renegade Party Audience Product

This runbook documents the deterministic operator runbook and visitor walkthrough for the Renegade Party Audience product.

---

## Workflow 1: Sender Identity & Transport Configuration
1. **Configure Site Sender Identity**:
   - Navigate to Site Settings or execute sender identity configuration.
   - Configure Default Sender: `news@renegadeparty.org`, Reply-To: `contact@renegadeparty.org`.
   - Set Email Mode to `development` (using `local-mail-sink` / `development-capture`).
2. **Configure Telecom Transport**:
   - Activate Telecom Emulator for local testing.
   - Set Default Outbound Long Code / Short Code identifier.
3. **Verify Safe Degradation**:
   - Unconfigured real external providers (SendGrid, SES, Twilio, Sinch) report status `unconfigured` or `disabled` and never attempt external network egress.

---

## Workflow 2: Public Form Authoring & Visitor Submissions
1. **Author Form Definition**:
   - Template: `newsletter-signup`.
   - Form Fields: `email` (email, required), `full_name` (text), `consent` (checkbox, required).
   - Localized Consent Text: "I consent to receive occasional political updates from the Renegade Party." (Revision `2026.1`).
2. **Visitor Submissions**:
   - **Valid Path**: Visitor submits valid email with checked consent. A new `form-submissions` record is created in status `received`, triggering automated double opt-in.
   - **Invalid Path**: Missing required fields or malformed emails return structured field-level validation errors.
   - **Duplicate / Replay**: Resubmissions using the same idempotency key return the original submission record without re-triggering downstream actions.
   - **Honeypot / Spam**: Non-empty honeypot fields trigger silent rejection.

---

## Workflow 3: Double Opt-In & Preference Center
1. **Double Opt-In Token Verification**:
   - The system generates an expiring, cryptographically signed token bound to the visitor's email and site ID.
   - Visiting `/audience/confirm?token={token}` transitions the subscriber record from `pending` to `active` and logs an immutable `consent-events` record (`double-opt-in-confirmed`).
   - Tampered, expired, or replayed tokens are rejected with safe operator-facing diagnostics.
2. **Self-Hosted Preference Center**:
   - Subscribers access `/audience/preferences?token={token}` using purpose-bound claims (`signAudienceClaims`).
   - Subscribers can toggle list subscriptions, update contact details, or request full unsubscribe.
3. **CSV Import & Quarantine**:
   - Operators can upload CSV lists with required consent provenance metadata.
   - Invalid rows (malformed emails, missing consent evidence) are segregated into quarantine for review.
   - Approved contacts are exported or merged cleanly into lists.

---

## Workflow 4: Explainable Segmentation & Recipient Snapshots
1. **Define Segment Filter Criteria**:
   - Build criteria combining list membership, tags, engagement, and consent status.
2. **Explainable Evaluation**:
   - Evaluate contacts against segment rules. Each contact evaluation yields explicit included/excluded reasons (e.g. `tag 'supporter' matched`, `channelEligible: false due to suppression`).
3. **Generate Recipient Snapshot**:
   - Generate an immutable `recipient-snapshots` record with SHA-256 fingerprint of the eligible recipient set.
   - Future message dispatches freeze against this snapshot to ensure content changes or membership shifts post-approval cannot tamper with scheduled sends.

---

## Workflow 5: Newsletter Composition & Local SMTP Dispatch
1. **Author Responsive Email**:
   - Compose multi-block message using heading, text, button, content-card, and divider blocks.
   - Validate design against responsive width and contrast rules.
2. **Preview & Test Send**:
   - Inspect HTML and plain text previews with variable fallback simulation (`{{subscriber.firstName}}`).
   - Send test message to operator inbox via local SMTP boundary.
3. **Approval & Schedule**:
   - Submit message for review; transition from `review` to `scheduled`.
   - Dispatch task processes snapshot recipients through `development-capture` SMTP adapter.
   - Verify presence of RFC-compliant headers (`List-Unsubscribe`, `X-Renegade-Purpose`, `X-Renegade-Idempotency-Key`).

---

## Workflow 6: Concurrency, Suppression & Fault Recovery
1. **Worker Concurrency**:
   - Simultaneous worker executions for the same `email-deliveries` ID acquire row-level locks or concurrency keys (`audience.email:{id}`).
   - Idempotent delivery prevents duplicate email emission.
2. **Send-Time Suppression Checks**:
   - If a subscriber unsubscribes or is suppressed *after* snapshot creation but *before* actual dispatch, the task intercepts the send, updates delivery status to `cancelled`, and records `code: 'suppressed-before-send'`.
3. **Transient Failure Recovery**:
   - Simulated network timeouts or temporary provider errors update the delivery to `sending`/`queued` and re-throw retryable errors for exponential backoff.
4. **Bounce & Complaint Ingestion**:
   - Hard bounces and spam complaints automatically record a global or channel-specific suppression.

---

## Workflow 7: Welcome Automations
1. **Activate Automation Definition**:
   - Trigger: `form-submission` or `list-joined`.
   - Actions: `add-segment-with-consent`, `notify`, `create-draft`.
2. **Idempotency & Replay Defense**:
   - Replaying the same trigger event with an existing `automationIdempotencyKey` returns the existing execution state without duplicate action execution.
3. **Pause & Resume**:
   - Operators can pause an automation; pending jobs remain suspended until resumed.

---

## Workflow 8: Telecom SMS & RCS Dispatch
1. **Author Telecom Messages**:
   - Compose rich RCS Card with media, title, suggestions, and explicit SMS fallback body.
2. **Capability-Aware Routing**:
   - Check recipient device capability:
     - RCS-supported: Route direct to RCS (`rcs-direct`).
     - Non-RCS supported + fallback policy allowed: Route to SMS (`rcs-fallback-to-sms`).
     - Non-RCS supported + fallback policy disallowed: Fail safely with `rcs_not_supported_no_fallback`.
3. **TCPA Quiet Hours Enforcement**:
   - Evaluate recipient timezone against quiet hours (8:00 AM to 9:00 PM local time window).
   - If dispatch falls within quiet hours, automatically reschedule for the next compliant window (8:00 AM local).
4. **Inbound STOP & HELP Keywords**:
   - Inbound `STOP` immediately suppresses phone hash and cancels pending dispatches.
   - Inbound `HELP` generates automated compliance response.

---

## Workflow 9: Audience Command Center Operations
1. **Unified Command Center (`/admin/audience`)**:
   - View Multi-Channel Dispatch Calendar across Email and Telecom.
   - Inspect Deliverability Health: Provider status, latency, bounce rates, spam rate.
   - Review Channel Suppression Ledger.
   - Monitor A/B Experiment variants and conversion attribution.
   - Inspect TCPA Quiet Hours & Email Frequency fatigue policies.
   - Access immutable consent & delivery audit logs.

---

## Workflow 10: Stack Restart, Backup & Isolated Restore
1. **Operational Backup**:
   - Run `npm run backup:operational` to create snapshot of database and media files.
2. **Stack Restart & Outbox Reconciliation**:
   - Restart all application services.
   - Unreconciled or interrupted deliveries in status `unknown` reconcile against provider idempotency keys before retrying.
3. **Isolated Restore Rehearsal**:
   - Run `npm run restore:rehearsal` on an isolated test environment.
   - Verify that all subscribers, consent records, form submissions, and delivery histories are fully restored while cryptographic secrets remain protected.
