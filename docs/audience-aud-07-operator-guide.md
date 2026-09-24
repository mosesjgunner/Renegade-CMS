# AUD-07 Audience Command Center & Bounded Operations Guide

Renegade CMS AUD-07 establishes a **calm, decision-useful Audience Command Center** across contacts, consent health, forms, segment estimates, campaigns, automations, delivery, provider health, and source-labeled outcomes. It rejects fabricated universal engagement scores, dark tracking, and contact-level surveillance by default in favor of verifiable operational evidence, explicit uncertainty boundaries, and bounded experiments.

---

## 1. Core Architectural Invariants

1. **Operational Events Are Evidence, Not Editorial Truth**:
   - Every metric retains its exact source, numerator, denominator, time window, channel, and upstream provider.
   - Dashboards query canonical projections and materialized summaries without becoming secondary state owners.
2. **Provider Accepted Is Transport Handoff, NOT Inbox Proof**:
   - An SMTP `250 OK` or Twilio `201 Created` indicates the upstream gateway accepted the envelope.
   - It is never reported to operators as confirmed inbox placement or handset receipt without a verified carrier DLR or DSN.
3. **Explicit Proxy & Bot Uncertainty Ranges**:
   - Apple Mail Privacy Protection (MPP) and Google Image Proxies prefetch image assets automatically.
   - Reports display open counts as an explicit uncertainty range: minimum confirmed (human active) vs. maximum possible (including proxy cached).
   - Corporate security gateways (Barracuda, Proofpoint, Mimecast) pre-click links to scan malware. Known scanners and HTTP `Purpose: prefetch` requests are filtered and tallied separately.
4. **Strict K-Anonymity & Privacy Thresholds (N ≥ 5)**:
   - Any cohort, cell count, or demographic breakdown with fewer than 5 subjects is masked (`< 5`).
   - Individual contact engagement, email addresses, and phone numbers are never exposed in aggregate reporting.
5. **Bounded Message Experiments Without Auto-Deployment**:
   - Experiments define immutable hypotheses, metrics, windows, and variant allocations frozen before launch.
   - Recipient assignment is strictly deterministic: seeded cryptographic hashing (`SHA-256(experimentId:subscriberId)`) guarantees uniform distribution and prevents mid-test reassignment.
   - Statistical power warnings are displayed if total sample size is below required minimums.
   - Guardrails monitor bounce rates (> 4.0%) and complaint rates (> 0.15%), triggering auto-pause on breach.
   - Winners are declared via **explicit manual operator decision**; automatic deployment without review is prohibited.

---

## 2. Source-Labeled Metric Dictionary

| Metric Key                | Label                    | Channel | Calculation Formula                                             | Uncertainty & Caveats                                     |
| :------------------------ | :----------------------- | :------ | :-------------------------------------------------------------- | :-------------------------------------------------------- |
| `form_views`              | Form Impressions         | Web     | `COUNT(form_view_events)`                                       | Client-side lower bound; subject to content blockers.     |
| `form_submissions`        | Form Submissions         | Web     | `COUNT(form_submissions WHERE status = "received")`             | Validated against published schema; excludes honeypots.   |
| `double_opt_in_sent`      | Confirmations Dispatched | Email   | `COUNT(subscriber_confirmation_tokens)`                         | Hashed, single-use, 24h expiration tokens.                |
| `double_opt_in_confirmed` | Confirmed Opt-Ins        | Email   | `COUNT(consent_events WHERE event = "double-opt-in-confirmed")` | Verifiable affirmative consent evidence.                  |
| `eligible_snapshot`       | Eligible Audience        | Multi   | `COUNT(recipient_snapshot_members)`                             | Exact frozen snapshot evaluated at campaign approval.     |
| `dispatch_attempted`      | Attempted Dispatch       | Multi   | `COUNT(deliveries WHERE status IN (...))`                       | Handed to channel worker after suppression re-check.      |
| `provider_accepted`       | Provider Accepted (Sent) | Multi   | `COUNT(deliveries WHERE status = "accepted")`                   | **Transport handoff only; not inbox receipt.**            |
| `carrier_delivered`       | Confirmed Delivered      | Multi   | `COUNT(delivery_events WHERE event = "delivered")`              | Network DLR (SMS/RCS) or MTA DSN (Email).                 |
| `deferred_transient`      | Deferred / Retryable     | Multi   | `COUNT(deliveries WHERE status = "deferred")`                   | 4xx MTA rate limit or carrier congestion; retried.        |
| `hard_bounced`            | Permanent Hard Bounce    | Multi   | `COUNT(deliveries WHERE status = "bounced")`                    | 5xx invalid mailbox / unallocated phone; auto-suppressed. |
| `spam_complaint`          | Spam Complaint           | Email   | `COUNT(delivery_events WHERE event = "complaint")`              | ISP Feedback Loop report; critical alert at > 0.10%.      |
| `unsubscribed`            | Unsubscribe / Opt-Out    | Multi   | `COUNT(consent_events WHERE event = "unsubscribe")`             | Permanent suppression until affirmative re-opt-in.        |
| `observed_opens`          | Observed Opens           | Email   | `COUNT(DISTINCT delivery_id WHERE open_observed)`               | Proxy cache uncertainty range: ±20-35% due to Apple MPP.  |
| `observed_clicks`         | Human Clicks             | Multi   | `COUNT(DISTINCT delivery_id WHERE click AND NOT is_bot)`        | Filtered known security crawlers and prefetch bots.       |
| `inbound_replies`         | Inbound Replies          | Multi   | `COUNT(telecom_inbound_messages WHERE keyword != "stop")`       | Conversational inbound routed to staff workflow inbox.    |
| `attributed_conversions`  | Configured Conversions   | Multi   | `COUNT(attributed_goal_events)`                                 | First-party goal attribution (?rcid=) over 7-day window.  |

---

## 3. Unified Campaign & Automation Calendar

The Audience Command Center merges Email, SMS, and RCS communications into a single schedule:

1. **Statuses**: `draft`, `review`, `approved`, `scheduled`, `running`, `completed`, `paused`.
2. **Accessible Controls**:
   - Full keyboard accessibility and explicit action buttons ("Submit for Review", "Approve Send", "Pause", "Resume").
   - Non-drag scheduling controls with local and UTC timezone presentation.
3. **Conflict Detection**:
   - **Frequency Conflict**: Warns when multiple campaigns target the same audience segment within 24 hours.
   - **Quiet Hours Warning**: Alerts if a telecom send is scheduled outside the TCPA window (8:00 AM to 9:00 PM local recipient time).
4. **Workflow Linkage**:
   - Links each campaign directly to its governing `content-release` or publication package.

---

## 4. Deliverability Health & Direct Remediation

The Command Center monitors deliverability telemetry in real time:

- **Hard Bounce Rate**: Warns at ≥ 2.0%; critical at ≥ 4.0%.
- **Spam Complaint Rate**: Warns at ≥ 0.10%; critical at ≥ 0.20% (Google & Yahoo postmaster threshold).
- **Domain Authentication**: Real-time verification of SPF, DKIM, DMARC, and TLS cipher strength.
- **Queue Age**: Alerts if any outbox delivery item is un-dispatched for > 60 minutes.
- **Direct Remediation Actions**:
  - `review_bounce_suppressions`: Immediately purges unconfirmed contacts and updates suppression digest.
  - `pause_marketing_campaigns`: Halts running and scheduled marketing sends pending consent audit.
  - `quarantine_invalid_forms`: Removes forms with outdated schemas or unreviewed localized legal text.
  - `refresh_stale_segments`: Triggers background recalculation of segments older than 24 hours.

---

## 5. Bounded Message Experiments Engine

Renegade CMS enables scientific, honest A/B experimentation without dark patterns:

1. **Hypothesis & Metric Freezing**: The hypothesis, target metric (`open_rate`, `click_rate`, `conversion_rate`), and allocation ratio (e.g. 50/50) cannot be altered once launched.
2. **Deterministic Assignment**:
   ```ts
   assignRecipientToVariant(experimentId, subscriberId, variants)
   ```
   Recipients are assigned by hashing `experimentId:subscriberId` with SHA-256 modulo 100. The allocation fingerprint is hashed and persisted immutably in `allocations_hash`.
3. **Safety Guardrails**: Automatically flags experiments and prevents send scaling if bounce rate exceeds 4% or complaints exceed 0.15%.
4. **Manual Winner Decision**: Operators review facts, uncertainty intervals, and conversion facts in the Command Center before manually confirming the winning variant. Automatic deployment without review is strictly prohibited (`autoDeployed: false`).

---

## 6. Privacy-Aware Link & Conversion Attribution

- **First-Party Parameters**: Uses clean query parameters (`?rcid={campaign}&rcch={channel}&rcvar={variant}`).
- **Direct-Link / Tracking-Off**: When visitors opt out of analytics, links are generated with zero tracking parameters.
- **Bot Click Classifier**:
  - Detects HTTP headers: `Purpose: prefetch`, `Sec-Purpose: preview`.
  - Recognizes security scanners: Barracuda, Proofpoint, Mimecast, Symantec, FireEye, etc.
  - Scanners are excluded from human click counts; bot tallies are preserved for audit.
- **Zero Fingerprinting**: Never performs canvas, audio, WebGL, or battery fingerprinting.

---

## 7. Reports & Privacy-Safe Export

Operators can export operational summaries to CSV or JSON under permission (`owner`, `administrator`, `staff`):

- All cohort cells with `N < 5` are masked as `< 5`.
- Individual subscriber contact records, email addresses, and phone numbers are excluded from aggregate export.

---

## 8. Next Milestone Handoff: AUD-08

With AUD-07 completed and verified (Command Center, unified calendar, metric dictionary, bounded experiments, bot filtering, deliverability health, and privacy exports), the system is ready for **AUD-08** (Audience Release Gate, End-to-End Orchestration, and Production Multi-Site Release Proof).
