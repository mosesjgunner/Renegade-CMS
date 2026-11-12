# RC2-D-03 — Audience journey (newsletter lifecycle) — RESULT

**Verdict: PASS — 7/7 stages green** (`tests/rc2-d03/journey.mjs` + segment
seed `tests/rc2-d03/seed-segment.spec.ts`; run 1 was 3/7 with the core
lifecycle already working — its failures were journey-model errors plus
finding F1 below; run 2: 7/7).

## Test boundary (stated plainly)

Email runs on the **development capture adapter** (`EMAIL_MODE=development`)
— the supported test mail profile. Captured deliveries with provider
receipts are the test inbox; no live marketing send is possible in this
profile, and none is claimed. The confirmation token is read from the
captured confirmation email's own button link, exactly what a subscriber
would click.

## What was proven

1. **Double opt-in is real.** Public signup (host-resolved site) returns 202
   and leaves the subscriber `pending`; the confirmation email is captured
   with a provider receipt; using its link activates the subscriber
   (`verifiedAt` set), activates the list membership, and leaves consent
   events as provenance.
2. **Pending means pending.** An unconfirmed subscriber stays `pending` and
   is not among a segment's eligible recipients.
3. **Test send.** An operator test send is captured exactly once with a
   provider receipt.
4. **Campaign send.** A scheduled campaign is picked up by the dispatch
   sweep and delivers **once** to the confirmed subscriber — with an
   unsubscribe token issued on the delivery — and never to the pending one.
5. **Unsubscribe suppresses.** The delivery's unsubscribe token unsubscribes
   the address, a suppression record exists, and the next campaign delivers
   nothing to it (verified after the dispatch sweep had run).
6. **Provider bounce suppresses.** A signed bounce webhook (HMAC,
   `EMAIL_WEBHOOK_SECRET`) matching a real delivery suppresses the address
   against the following campaign; a forged signature is refused 401.
7. **Site isolation.** The same address on Site B is a separate subscriber
   record; a Site B principal cannot run Site A's campaigns (403), and the
   operator REST surface itself is site-scoped.

## Findings

- **F1 = RC2-DEBT-15 (P2, reporting labels).** Segment evaluation buckets a
  subscriber as `suppressed` only when they are still `active`; an
  unsubscribed subscriber (status flipped by the suppression itself) is
  counted under `unconsentedOrPending` instead. Delivery exclusion is
  correct in all cases — only the operator-facing counts mislabel the
  reason.
- **Provider failure/retry without duplicate delivery** is covered at the
  delivery-task level by design (retryable failures reschedule with
  backoff; the capture adapter's simulated outcomes are test-only module
  state with no operator surface to drive in this profile) — the live
  failure path exercised here is the bounce → suppression arc above, plus
  D-02's dispatch-level retry proof. A retryable-failure delivery run is
  named NOT VERIFIED for this profile rather than claimed.

**Family verdict:** Audience moves to **E2 proven**, completing the
Distribution, Marketing & Audience family row in
`docs/rc2/RC2-12-FAMILY-JOURNEYS.md`.
