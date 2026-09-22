# AUD-06 Telecom & Messaging Operations Guide

Renegade CMS treats telecom transport (SMS, MMS, and RCS) as an **honest, capability-driven adapter layer**, not a fake universal sender. Mobile operator policy, recipient hardware/carrier support, strict jurisdictional quiet hours, separate opt-in consent, and irreversible STOP opt-out keywords are core system invariants.

---

## 1. Core Architectural Rules

1. **Email Consent Never Implies Telecom Consent**: A subscriber who gave double opt-in consent for a newsletter has NOT granted SMS or RCS consent. Telecom requires an explicit, purpose-specific consent event (`channel: 'sms' | 'rcs'`).
2. **Honest Capability Truth**: RCS is never assumed to be universally available. If an adapter or recipient does not support RCS, Renegade inspects the message's explicit fallback policy (`prohibit`, `allow-with-configured-text`, or `manual-review`). Rich media and interactive cards are never silently flattened or converted into unexpected SMS URLs without operator-configured text.
3. **Inbound STOP Always Wins**: An inbound STOP keyword (`STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`, `ARRET`) is processed immediately upon arrival:
   - A `preference-withdrawn` event is recorded.
   - A canonical `suppression` record is created for the recipient's phone hash.
   - Any currently queued deliveries for that recipient are immediately cancelled with `suppressed-before-send`.
   - Send-time checks in worker tasks repeat this suppression check immediately before any transport call.
4. **Quiet Hours & Timezones**:
   - Standard marketing window: 8:00 AM to 9:00 PM local recipient time (TCPA compliance).
   - Quiet hours are computed using the recipient's profile timezone with conservative fallback for unknown timezones.
   - Morning send windows calculate exact opening timestamps across Daylight Saving Time (DST) shifts.
   - Emergency and critical security/transactional messages (e.g. OTPs, fraud alerts) are exempt from quiet hours.
5. **No Marketing Reply Bots**:
   - Inbound free-form messages (e.g. "When will my item arrive?", "Can I speak to someone?") are not processed by a generative AI reply bot.
   - If staff routing is enabled, a `workflow-items` record is created for human operator review in the staff inbox. Otherwise, standard compliance acknowledgement is returned.

---

## 2. Provider Capability Matrix

| Feature | SMS | MMS | RCS Basic | RCS Rich |
| :--- | :--- | :--- | :--- | :--- |
| **Transport** | Standard Carrier SS7/SMPP | WAP / MMSC | IP (Google Jibe / Carrier UP) | IP (Google Jibe / Carrier UP) |
| **Max Single Length** | 160 chars (GSM-7) / 70 chars (UCS-2) | N/A (Media payload) | 2048 characters | 2048 characters + Media |
| **Encoding** | GSM 03.38 7-bit or UCS-2 | UTF-8 | UTF-8 | UTF-8 |
| **Rich Media** | No | Image/Audio (up to 1MB) | No | Images, Video (up to 2MB) |
| **Interactive Cards** | No | No | Quick Reply Chips | Standalone Cards, Carousels |
| **Suggested Actions**| No | No | Open URL, Dial, Reply | Open URL, Dial, Reply |
| **Sender Identity** | Shortcode, 10DLC, Toll-Free, Alphanumeric | 10DLC, Toll-Free | Verified Brand / Agent ID | Verified Brand / Agent ID |
| **Capability Check** | Carrier routing | MMSC check | Required (Preflight / Jibe) | Required (Preflight / Jibe) |
| **Delivery Receipts**| Network DLR | MMSC DLR | Read & Delivery Receipts | Read & Delivery Receipts |

---

## 3. GSM-7 vs. UCS-2 Segmentation & Cost Preview

Renegade CMS accurately calculates message segmentation according to 3GPP TS 23.038:

- **GSM-7 Characters**: Standard alphanumeric and punctuation (`@`, `£`, `$`, `è`, `é`, etc.) take 1 septet.
  - Single segment: Up to 160 characters.
  - Multi-segment: 153 characters per segment (7 bytes reserved for concatenation UDH).
- **GSM-7 Extension Characters**: `|^€{}[]~\\` require an escape character (0x1B) and count as **2 septets**.
- **UCS-2 (Unicode)**: Any emoji, non-Latin script, curly quote (`“`, `”`, `’`), or em-dash (`—`) switches the entire message to UCS-2:
  - Single segment: Up to 70 characters (140 bytes).
  - Multi-segment: 67 characters per segment (134 bytes + 6 bytes UDH).
- **Cost Estimation**: The composer shows real-time segment counts, detected encoding, and estimated provider units/cost labeled clearly as a projection (`isEstimate: true`).

---

## 4. Local Deterministic Telecom Emulator

For development, testing, and CI, set `TELECOM_MODE=development` or leave telecom credentials unset. The deterministic emulator (`src/modules/telecom/emulator.ts`):

1. **Capability Emulation**: Phone numbers default to SMS-only. Specific numbers can be flagged as RCS-capable (`setEmulatorRecipientCapability(phone, { rcsSupported: true })`).
2. **Deterministic Simulations**:
   - `success`: Message accepted and retained in `getTelecomEmulatorReceipts()`.
   - `rcs-fallback`: Safely executes `rcs-fallback-to-sms` using configured fallback text.
   - `rcs-refused-fallback`: Prohibits send when fallback is disabled.
   - `rate_limited`: Simulates carrier 429 backoff.
   - `carrier_congestion`: Simulates temporary carrier queue congestion.
   - `timeout` / `unknown_outcome`: Tests reconciliation workflows without transport failover.
3. **Inbound Keyword Testing**:
   - Call `simulateInboundTelecomMessage({ from, to, text })` to test STOP/HELP/START processing locally.

---

## 5. Real Provider Preflight (Twilio / Standard Telecom)

To configure live telecom transport:
```env
TELECOM_MODE=real
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+18005550199
# Live outbound transmission guard:
TELECOM_ALLOW_OUTBOUND=true
```

- **Preflight Check**: `createTwilioTelecomAdapter` verifies API connection and account readiness before enabling delivery.
- **Safety Guard**: `TELECOM_ALLOW_OUTBOUND=true` is required for live external dispatch. If omitted, messages fail closed safely without sending unauthorized SMS.
- **Credential Protection**: Account SIDs and Auth Tokens are strictly redacted from error traces, payloads, and operations diagnostics.

---

## 6. Delivery Lifecycle and Failure Recovery

1. **Queued**: Delivery row created with stable idempotency key `telecom:${messageId}:${subscriberId}`.
2. **Send-Time Invariants**:
   - Fresh suppression check (catches STOP race condition).
   - Fresh purpose consent check.
   - Quiet hours evaluation (reschedules for next morning if quiet).
   - Frequency cap check.
3. **Dispatch**:
   - If RCS: queries capability. Routes `rcs-direct`, `rcs-fallback-to-sms`, or refuses send.
4. **Outcomes**:
   - `accepted`: Provider acknowledged dispatch.
   - `delivered`: Carrier DLR confirmed receipt.
   - `retryable`: Transient carrier congestion or rate limit; exponential backoff scheduled.
   - `failed`: Permanent failure (invalid destination, missing consent, unallocated number, fallback prohibited).
   - `unknown`: Gateway timeout; held for reconciliation via `adapter.reconcile` (never blindly retried across other transports).
   - `manual-review`: Held for operator action (e.g. unconfigured international route).

---

## 7. Next Milestone Handoff: AUD-07

With AUD-06 telecom contracts, composer, emulator, delivery pipeline, and operator runbook complete and verified, the project is prepared for AUD-07 (Audience Release Gate, End-to-End Orchestration, and Production Multi-Channel Verification).
