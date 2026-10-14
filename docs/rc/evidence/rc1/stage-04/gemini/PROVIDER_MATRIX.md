# Stage 04 — Provider Integration & Boundary Matrix

Release: `v0.1.0-rc.1`  
Stage: **Stage 04 — Commerce, Audience, Community, and Provider Integration**  
Evaluator: **Gemini**  
Date: 2026-10-14  

This matrix documents the verification of all external provider adapters, simulated local harnesses, remote sandboxes, and safe unconfigured / degraded states across Renegade CMS.

---

## 1. Provider Capabilities and Boundary Status

| Provider / Adapter | Protocol / Scope | Simulated Local Harness | Remote Sandbox | Live Delivery / Charges | Unconfigured / Degraded Safe Behavior | Proof Reference |
|---|---|---|---|---|---|---|
| **Local SMTP Sink** (`tests/rc04/smtp-sink.mjs`) | RFC 5321/5322 Email (port 2525) | **VERIFIED** — Captures full MIME `.eml` with DKIM/List-Unsubscribe headers | N/A | **BLOCKED** — No unsolicited outbound emails sent | N/A (Harness active during acceptance) | `docs/rc/evidence/rc-04/delivered-newsletter-redacted.eml`, `tests/rc04/acceptance.spec.ts` |
| **SendGrid / Mailgun / Postmark** | Transactional & Audience Email | Verified via loopback transport | **UNRESOLVED PREREQUISITE** (No live remote sandbox API keys) | **OFF** — Never send unsolicited live emails | **VERIFIED** — Safe degraded mode: Warning logged, events recorded in outbox with retry, zero unhandled crash | `tests/integration/aud-08-audience-pass-gate.integration.test.ts` (Test 6), `src/modules/audience/worker.ts` |
| **Deterministic Local Card** (`local-test-checkout`) | Commerce Card Payments | **VERIFIED** — Zero-cost test card, HMAC signed webhooks, replay rejection | N/A | **OFF** — No live cards charged | **VERIFIED** — Enabled only on loopback or explicit `.test` domain when `COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED=true` | `tests/integration/commerce-runtime-acceptance.integration.test.ts`, `src/modules/commerce/local-test-checkout.ts` |
| **Stripe Hosted Checkout** (`StripeProviderAdapter`) | Credit Cards, Apple Pay, Google Pay | Verified via deterministic test adapter | **UNRESOLVED PREREQUISITE** (`STRIPE_SECRET_KEY` unconfigured) | **OFF** — No live charges incurred | **VERIFIED** — When unconfigured, checkout proposals reject initiation with 400/404; zero fake charges | `tests/integration/rc05-pass2-commerce-routes.integration.test.ts`, `tests/unit/shop-04-payment-operations.test.ts` |
| **Telecom Simulator** (`/api/admin/telecom/simulate`) | SMS / RCS Messaging | **VERIFIED** — Routes outbound SMS/RCS events to audit logs, handles STOP/HELP | N/A | **OFF** — No live SMS/telecom traffic sent | **VERIFIED** — Multi-tenant isolated; per-event SMS preferences reject deferred configurations with HTTP 410 | `tests/integration/aud-08-audience-pass-gate.integration.test.ts` (Test 8), `tests/rc04/acceptance.spec.ts` (Test 2) |
| **Twilio / Telnyx** | Outbound SMS / Telecom | Verified via telecom simulator | **UNRESOLVED PREREQUISITE** (`TWILIO_ACCOUNT_SID` unconfigured) | **OFF** — Zero live telecom traffic | **VERIFIED** — Safe degraded behavior: Unconfigured telecom provider logs warning, suppresses outbound delivery | `src/modules/audience/telecom.ts` |
| **POD Emulator** (`PodEmulatorAdapter`) | Print-on-Demand Physical Goods | **VERIFIED** — Simulates job submission, idempotency, shipment tracking updates | N/A | **OFF** — No physical manufacturing orders created | **VERIFIED** — Emulates end-to-end order handoff; transitions to manual fulfillment on simulated failure | `tests/integration/commerce-runtime-acceptance.integration.test.ts`, `src/modules/commerce/pod-emulator.ts` |
| **Printful Adapter** (`PrintfulPodAdapter`) | Real Print-on-Demand Orders | Verified via adapter boundary tests | **UNRESOLVED PREREQUISITE** (`PRINTFUL_API_KEY` unconfigured) | **OFF** — No live production orders placed | **VERIFIED** — Automatic handoff to manual fulfillment (`handoffFailedPodJobToManual`); packages queued for operator review | `tests/integration/commerce-runtime-acceptance.integration.test.ts`, `src/modules/commerce/manual-fulfillment.ts` |
| **Affiliate Referral Engine** | Outbound Partner Links & Conversions | **VERIFIED** — Whitelisted destination verification, click tracking, conversion import | N/A | Verified with local destination URLs | **VERIFIED** — Host tampering rejected; untrusted/corrupted affiliate destinations blocked with HTTP 400 | `tests/integration/commerce-runtime-acceptance.integration.test.ts`, `tests/integration/shared-contract-affiliate-pod.integration.test.ts` |
| **AI Control Plane** | Editorial Suggestions & SEO Proposing | **VERIFIED** — Local deterministic adapter generates suggestions and classifications | **UNRESOLVED PREREQUISITE** (No live OpenAI/Anthropic/Gemini API keys) | **OFF** — Zero outbound cloud API calls | **VERIFIED** — Graceful fallback: Manual authoring and editorial workflows remain fully operational | `tests/integration/ai-control-plane.integration.test.ts`, `tests/unit/ai-adapters.test.ts` |

---

## 2. Unresolved External Prerequisites (Retained as Explicit Boundaries)

As mandated by safety and truthfulness rules, genuine external dependencies that are safely unconfigured are explicitly identified rather than fabricated:

1. **Live Stripe Sandbox / Production Credentials**:
   - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are not set in the test environment.
   - Verified behavior: System truthfully reports checkout capabilities based on active merchant connections. With deterministic-test active, local test payments succeed without contacting external Stripe APIs. Unconfigured gateways fail gracefully with 400 Bad Request.

2. **Live Remote SMTP / Telecom Credentials**:
   - `SENDGRID_API_KEY`, `POSTMARK_API_TOKEN`, `TWILIO_ACCOUNT_SID`, and `TWILIO_AUTH_TOKEN` are not set.
   - Verified behavior: Local SMTP sink (`tests/rc04/smtp-sink.mjs` on port 2525) receives and persists 100% of generated email MIME messages. Telecom simulator captures SMS events. When transports are disabled, background worker retries and logs truthful failure reasons.

3. **Live Printful API Key**:
   - `PRINTFUL_API_KEY` is not set.
   - Verified behavior: Printful adapter errors trigger graceful fallback to manual fulfillment packages (`handoffFailedPodJobToManual`), generating operator notifications without dropping orders.
