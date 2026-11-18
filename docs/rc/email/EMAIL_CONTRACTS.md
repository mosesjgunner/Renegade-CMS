# RC3-EMAIL-01 — Frozen Cross-System Contracts

Frozen at EMAIL-01 (2026-11-17) against baseline `6c291cf`. Changes to these
contracts require a note in the affected task record.

## 1. Traffic classes and purpose routing

| Class                   | Contents                                                                                                                       | Provider boundary                                                                                                                                   | Priority                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `account`               | Member sign-in (magic link), email-link confirmation, staff invitation/enrollment, supported account recovery/security notices | Account boundary (own credentials, quota, sender domain, reserved worker)                                                                           | Highest; reserved capacity      |
| `operational`           | Commerce receipts and order notices, community notifications, form notifications, telecom email fallback, admin alerts         | Account boundary by default (shares the transactional provider account) with its own bounded budget so a notification flood cannot starve `account` | Below `account`, above audience |
| `audience_confirmation` | Newsletter double-opt-in confirmations                                                                                         | Audience boundary, dispatched ahead of campaigns within audience capacity                                                                           | Top of audience boundary        |
| `audience`              | Campaigns, newsletters, digests, optional community subscriptions                                                              | Audience boundary                                                                                                                                   | Lowest                          |

**Purpose → class policy is immutable in code** (`src/modules/email/classes.ts`).
Callers name a _purpose_; the policy assigns the class. Caller-supplied
metadata, UI settings, and message content can never upgrade a purpose into
`account`. Purposes: `member-sign-in`, `member-email-link`, `staff-invitation`,
`account-recovery` → account; `order-receipt`, `community-notification`,
`form-notification`, `telecom-fallback`, `admin-alert` → operational;
`newsletter-confirmation` → audience_confirmation; `campaign`, `newsletter`,
`digest` → audience.

## 2. Durable message intent (account + operational): `email-intents`

Audience mail keeps its proven `email-deliveries` outbox. Account and
operational mail gain a dedicated durable outbox, `email-intents`, sharing the
adapter contract and dispatch patterns (leases, unknown quarantine,
reconciliation) without destabilizing the audience path.

Fields: stable id; `site` (nullable only for installation-level account mail);
immutable `purpose` + `trafficClass`; `recipientEmail` (staff-read only) +
`recipientHash`; `idempotencyKey` (unique — DB constraint prevents duplicate
intents from repeated event processing); rendered payload stored **encrypted**
(AES-256-GCM, `encryptSecret` from `src/modules/social/security.ts`) in
`payloadCiphertext` — action tokens never appear in logs, telemetry, or
operator views; `fromIdentity` snapshot; four independent state dimensions:

- **submission**: `queued | held | leased | submitting | accepted |
rejected | unknown | expired | cancelled | retry-scheduled`
- **receiving**: `unobserved | deferred | remote-accepted | bounced |
provider-failed`
- **placement**: `unobserved | inbox | inbox-tab | spam | other`
- **action**: `not-observed | completed | expired | revoked | consumed`

Plus: provider + providerMessageId, attempts, attempt budget, lease
owner/until, nextAttemptAt, expiresAt (bounded by the underlying action's
expiry — dispatch refuses intents whose action has < 2 minutes of life left),
and an append-only `events` json log (attempts, feedback, operator actions).

**Atomicity note (honest):** token issuance (`identity-tokens`) and intent
creation happen in one request; if intent creation fails, the route revokes
the just-issued token as a compensating action. A crash between the two
writes can leave an orphan token that expires unused in 15 minutes — it can
never produce a "success-shaped response with lost email" again, because the
response is only sent after the intent is durable, and dispatch state is
operator-visible. Full single-transaction issuance is a documented follow-up,
not claimed here.

**Retry policy:** account — at most 4 attempts within 5 minutes, always
bounded by action expiry; operational — 4 attempts within 1 hour; explicit
provider `Retry-After` honored with jitter. Only known-not-accepted errors
retry. `unknown` outcomes quarantine until reconciled; never auto-resent,
never failed over.

## 3. Provider contract

Adapters implement the existing `EmailDeliveryAdapter`
(`src/modules/email/delivery.ts`), extended per boundary:

- `selectEmailAdapterForBoundary('account' | 'audience', config)` resolves the
  boundary's adapter: Postmark HTTP API when configured for that boundary,
  else the legacy SMTP/development/disabled adapter. Account credentials are
  never visible to audience dispatch code paths and vice versa.
- Postmark adapter: single-message API, explicit `MessageStream` per class
  (account/operational → transactional stream; audience_confirmation →
  transactional stream on the audience account; audience → broadcast stream),
  metadata carries the intent/delivery idempotency key for correlation
  (correlation only — **not** provider-enforced idempotency), returned
  MessageID stored, bounded timeout, redacted errors, 429/`Retry-After`
  surfaced as retryable with delay.
- Readiness is per boundary + class + sender: `configured`,
  `provider-reachable`, `sending-authorized`, `dns-authenticated`,
  `callback-healthy`, `seed-verified`, `active` are separate facts. Legacy
  global-only configuration reports isolation as **degraded**, never as
  isolated.

## 4. Pause and suppression contract

**Pauses** (`email-pauses` collection): scope ∈ {`global-class`,
`provider-boundary`, `site`, `site-class`, `campaign`}, with reason and
creator. Precedence: campaign < site-class < site < boundary < global-class
(any matching active pause blocks). Dispatchers re-read pauses immediately
before submission — at initial dispatch, retry, lease recovery, and in every
worker profile. A request already accepted by the provider may still arrive;
that in-flight boundary is documented, not hidden.

**Suppressions** (existing `suppressions` ledger, semantics completed):

- Confirmed invalid mailbox (corroborated `5.1.1`-class / provider
  bad-address event): stops **all** classes for that site + address,
  including account attempts, until the address is corrected and verified.
  Account dispatch checks this scope before every send.
- Marketing opt-out / complaint: stops `audience` (+ confirmations beyond a
  rate-limited re-confirmation) for that site; never disables account mail.
- Deferral, full mailbox, policy rejection (`5.7.x`): evidence only, no
  suppression.
- Suppressions are never cleared by import, retry, fallback, or provider
  switch.

## 5. DNS verification contract

`src/modules/email/dns-verification.ts` performs real public DNS lookups
(Node `dns` promises, injectable resolver for tests) for a sender domain:
DKIM selector TXT presence/shape, Return-Path CNAME/SPF, effective SPF
(single policy, lookup-count sanity), DMARC record + policy + alignment of
SPF/DKIM identities with the From domain (relaxed/strict). Results are
reported as `verified | failed | unobserved` **with the observed records and
the exact missing/invalid item named** — never a bare boolean. The audience
command center consumes this for the sender domain(s) in configured use;
when no sender is configured the state is `unobserved` with that reason.

## 6. Feedback contract

- Existing normalized webhook (`/api/email/webhook`, Renegade signature)
  remains for internal/test producers.
- New native Postmark webhook (`/api/email/webhook/postmark`): authenticated
  with the boundary's webhook secret via HTTP Basic credentials configured on
  the webhook URL (Postmark sends no HMAC — none is invented); payload
  bounded and rate-limited; events are **durably recorded before
  acknowledgement**; correlation is by trusted boundary context +
  provider MessageID + metadata idempotency key — payload metadata alone can
  never select another tenant's record. Duplicate/reordered/replayed events
  apply once (event idempotency keys). Bounce classification separates
  invalid-address, deferral, full-mailbox, and policy rejection.
- Reconciliation: bounded job re-checks stale `accepted`/`unknown` rows via
  adapter `reconcile()` where the provider supports lookup; absence of
  evidence stays `unknown` and alerts — it is never rewritten as failure or
  success.
