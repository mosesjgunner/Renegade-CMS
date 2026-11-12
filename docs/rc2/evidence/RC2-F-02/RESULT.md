# RC2-F-02 — Donation, subscription/entitlement, affiliate, POD

**Verdict: PASS** — journey 11/11 API stages + 2/2 browser stages + POD service proof 4/4, on a
disposable two-site world, deterministic sandbox providers only; no real funds, cards, or
production webhooks. One real stateful action plus readback was performed per implemented path;
where a path is not executable in this environment it is classified below, not dressed up.

## Donation / supporter (#49)

- A campaign provisioned for the site is publicly readable with its disclosures.
- Intent is created through the hosted-test boundary but **funds are not marked complete before
  payment**: no donation row exists for the intent pre-settlement. After the sandbox confirm and
  jobs-worker settlement, exactly one donation sits at lifecycle `succeeded`.
- Topology note (measured, not a defect): donation intents bind the campaign to the site resolved
  from the request Host, and the deterministic provider only enables on loopback (or a `.test`
  host matching APP_URL). In this two-site sandbox the loopback host resolves to Site B, so the
  donation leg runs on Site B with its own sandbox merchant + capability.

## Subscription / entitlement (#48)

- **Provider-hosted recurring checkout is NOT executable in the sandbox, and the product says so
  itself.** The only recurring-billing adapter is Stripe (hardcoded `api.stripe.com`, no local
  fixture); the deterministic sandbox provider deliberately does not implement recurring billing.
  The member plans response marks both plans unavailable with the reason "Provider
  deterministic-test does not support recurring billing", and the checkout POST refuses 503 with
  the same reason. Live recurring billing is **NOT VERIFIED**.
- **The supported executable path — operator complimentary grants — is proven end to end.** The
  grant route is preview-then-confirm by hash; granting two published plans (distinct
  entitlements) to a member produces two active subscriptions and two entitlement rows; the
  member's billing page renders both (browser proof).
- **Cancellation revokes only the intended entitlement.** This build has no member-facing cancel
  action (the billing portal action answers 409 "no provider payment-management handoff" for a
  complimentary subscription); cancellation arrives as provider state and the production
  `recomputeSubscriptionEntitlements` projects it. Driving that projection for plan A revoked
  exactly its `publication.read-premium` entitlement (`revokedAt` set, revoked count 1) while
  plan B's subscription stayed active and its `media.download-hd` entitlement stayed unrevoked.

## Affiliate / referral (#50)

- Offers are created through the validated creation path; an offer whose destination escapes its
  domain allowlist is **refused at creation**. The public details view discloses the offer name,
  disclosure text, and destination host only. A consented click resolves to the allowlisted
  destination with tracking parameters and persists the click; query-param destination injection
  is refused (400) and unknown offers 404.
- The first-party referral loop is proven: program + code provisioned through the referral
  service (which requires the referrer to be an active member holding a site role row — the same
  role-row seam as RC2-DEBT-19; it also refuses programs claiming payment/IP fingerprint rules it
  cannot enforce), claim captured with consent and bound by cookie, claim binds to the checkout
  session at initiation, referred guest order settles paid ($15.62 incl. flat shipping + tax).
- The network callback is HMAC-signed per site: a correctly signed conversion records once with
  an accrued commission projection in the operator referral report; an identical replay returns
  `{replay: true}` and does not double-count (exactly one callback row); a forged signature is
  refused 401. Payout execution itself remains `not-executed` by design (commissions are
  liabilities until an operator pays them out) and is not claimed here.

## Print-on-demand / fulfillment (#51)

- Service-level proof against the production adapters (the emulator is the only executable POD
  provider profile in the sandbox): preflight passes print-ready artwork (effective DPI ≥ 150)
  and visibly fails low-resolution artwork; order creation is idempotent on the provider boundary
  (same idempotency key → same external order id); a failed job hands off to a manual fulfillment
  package that an operator can acknowledge and ship with tracking.
- The live Printful adapter reports health `unavailable` without credentials and live opt-in —
  live POD is **NOT VERIFIED**. The end-to-end paid-order → pod-job → provider-event →
  fulfillment loop was not exercised over HTTP/operator persistence in this prompt; that is the
  named RC3 job for #51, which stays **E1** with strengthened evidence.

## Ledger consequences

- #48 Subscriptions: E2, now journey-backed for the grant/entitlement lifecycle; live recurring
  billing remains the open gap.
- #49 Donations: E2, now journey-backed for the one-time sandbox path; recurring donations and
  live processing remain open.
- #50 Affiliate marketing: E1 → **E2** (offer click → referral claim → paid order → signed
  conversion callback, replay-safe, operator-report readback).
- #51 Print-on-demand: stays E1 (see above).

## Findings

No new engineering debt filed. Behaviors characterized, all by design: over-threshold free vs
flat shipping rate selection (the $10 referred order quotes the flat rate; the free rate requires
the configured threshold); donation records are created at settlement, not at intent; entitlement
revocation is recorded by `revokedAt`, not a status field; referral programs cannot claim
unenforceable anti-fraud rules.

## Evidence

- `tests/rc2-f02/journey.mjs` — 11/11 stages (run 8, exit 0).
- `tests/rc2-f02/browser.mjs` — 2/2 stages (member billing surface).
- `tests/rc2-f02/pod.spec.ts` — 4/4 (emulator preflight/idempotency, Printful unavailable,
  manual recovery chain).
- `tests/rc2-f02/setup.spec.ts`, `tests/rc2-f02/issue-tokens.spec.ts`,
  `tests/rc2-f02/cancel.spec.ts` — world provisioning (campaigns, plans, offers, referral
  program/code, merchants/capabilities on both sites) and the cancellation projection driver.
