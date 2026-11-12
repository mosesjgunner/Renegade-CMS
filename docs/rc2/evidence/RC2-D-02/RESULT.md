# RC2-D-02 — Distribution journey (social) — RESULT

**Verdict: PASS — 7/7 stages green** (`tests/rc2-d02/journey.mjs`, two runs:
run 1 was 6/7 with every product behavior correct — the one failure was the
journey asserting the provider error code inside the message field; the code
lives in `providerCode`. Run 2: 7/7).

## Test boundary (stated plainly)

Dispatch ran through the **production** path end to end — drafts API →
approval hash → queue items → Payload `social-publish` jobs → the production
Bluesky adapter — against the repository's own local AT-protocol fixture
(`tests/rc03/provider-fixture.mjs` on `127.0.0.1:3130`), an explicitly labeled
deterministic test destination. Reaching it in production posture required two
deliberate operator opt-ins, both verified working as designed:
`RENEGADE_ENCRYPTION_KEY` (credential envelopes) and
`SOCIAL_LOCAL_ADAPTER_ORIGINS=http://127.0.0.1:3130` (the SSRF allowlist for a
local harness). **No live network delivery is claimed.** Provider truth:
Bluesky is the sole live adapter; X/Threads/Facebook/Instagram/LinkedIn/
YouTube/TikTok are manual-handoff (no automated post is sent, by design);
ActivityPub is unavailable.

## What was proven

1. **Compose → approve → schedule → dispatch.** A draft composed from an
   existing published article is reviewed, approved, scheduled, and dispatched
   by the worker; the queue item lands `published` with a persisted attempt
   receipt and the fixture records exactly one created post; the draft rolls
   up to `published`.
2. **No duplicate dispatch.** Re-scheduling a published draft is refused
   (400 — it is no longer in `approved` state), so the same approval cannot
   enqueue twice.
3. **Failure isolation.** A two-destination draft (one healthy, one whose
   provider returns 422 `DestinationDisabled`) ends `partially-published`:
   the healthy destination publishes, the failing one is `failed` with the
   provider code/message persisted as its dead-letter reason and no retry
   scheduled (validation errors are not retryable).
4. **Transient failure, backoff, idempotent recovery.** With the fixture in
   lose-response mode (record created, response lost as a 503), the first
   attempt fails `transient`, a retry is scheduled with backoff, and the
   retry recovers through the adapter's read-before-write idempotency —
   final state `published`, **exactly one** record created at the provider,
   two attempts on file.
5. **Disconnected account.** After disconnect, dispatch fails as
   `reconnect-required` and the provider records **zero** requests — no
   provider call is made with dead credentials.
6. **Cancellation.** A declined draft is `cancelled`; scheduling it is
   refused (400); nothing is sent.
7. **Permissions.** A Site B principal cannot compose for Site A (403); a
   non-admin editor cannot schedule (403 — scheduling is owner/administrator
   only).

## Not exercised (named)

- Queue UX in the browser (operator screens) — the journey drove the same
  APIs the UI uses; no screenshots claimed.
- Manual-handoff destinations produce an honest "requires manual handoff"
  failure in the automated path (code-read from `tasks.ts`); not run live.
- Rate-limit (429) retry timing — the transient/backoff path above covers
  the retry machinery; a 429-specific run is not claimed.

**Family verdict:** Distribution moves to **E2 proven** in
`docs/rc2/RC2-12-FAMILY-JOURNEYS.md` (the row also carries Audience, which
lands with D-03).
