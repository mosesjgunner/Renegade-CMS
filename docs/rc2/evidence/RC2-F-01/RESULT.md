# RC2-F-01 — Result

**Prompt:** RC2-F-01 — Product → cart → sandbox order
**Date:** 2026-11-12
**Verdict:** PASS — 12/12 API stages + 3/3 browser stages
**Evidence:** `tests/rc2-f01/journey.mjs` (exit 0; run log `f01-journey-run2.log`), `tests/rc2-f01/browser.mjs` (3/3), `tests/rc2-f01/setup.spec.ts`. World: the shared RC2 two-site world (suffix `6ef24941`, DB `b01_release_acceptance`), production build of main `3d318bc`, jobs worker running (settlement is worker-processed).

## What was proven (live, over HTTP, guest buyer)

- **Operator product lifecycle.** A staff operator uploads product media (201), creates a real product with a tracked-inventory variant (3 units), price and public offer (201, state `draft`), and publishes it through the catalog workflow (`PATCH /api/admin/catalog`: request-review → approve → publish, all 200) — final state `published`.
- **Public page.** The product page renders name and price on Site A (200) and 404s on Site B.
- **Server-authoritative cart.** A guest adds the variant and the cart prices from the server-side offer. Negative quantity → 400. An over-stock add (99 against stock 3) **clamps the cart at available stock** — the cart can never exceed inventory (characterized design; the proposal stage re-resolves stock, so no oversell is possible). A fresh guest sees an empty cart and a proposal on it → 400 "Cart is empty or not found."
- **Proposal.** Server-priced snapshot: 3 × $50 = `15000` subtotal; the buyer supplies identity/addresses/consents only — no client price is ever trusted.
- **Initiate refusals.** Unknown proposal → 404; Site A's proposal initiated on Site B's host → 403; unknown payment capability → 404.
- **Sandbox payment.** Initiate returns the deterministic-test payment page reference (`det_cs_…`) and sets the signed guest checkout cookie. Replaying initiate with the same idempotency key returns the same session and creates **no second payment attempt** (1 attempt total).
- **Confirm refusals.** Missing guest token → 403; unknown reference → 404; the same confirm on the public site host → 404 (see topology note).
- **Settlement.** Confirm (303 → `/checkout/return?session=…`) signs a payment event into the real webhook receiver; the jobs worker settles it: exactly **one order, state `paid`, receipt `issued`**, structured total `amountMinor` **15937** = 15000 subtotal + 937 tax (6.25% on the Austin address; free standard shipping rate) — and **inventory decremented exactly 3 → 0**. The buyer's status endpoint returns the `{downloads, checkout, payment, order}` bundle, and the browser return page reads "Payment confirmed — Order … is paid" with inventory-applied and payment-confirmed timeline entries and a receipt id.
- **Replay safety.** Re-confirming the settled payment returns 303 and changes nothing: still 1 order, stock still 0.
- **No oversell.** After depletion, a new guest's add leaves the cart empty and their proposal → 400.
- **Browser.** Product page renders name/price; the return page shows the settled status to the buyer; a fresh visitor's `/cart` page states "Your cart is currently empty." Zero page errors.

## Characterized behavior (not defects)

1. **Over-stock cart adds clamp instead of erroring.** The cart is server-authoritative and capped at tracked inventory; stock is enforced again at proposal (a depleted cart's proposal fails 400, proven in D-03-style re-resolution in the repo's own race test and by stage 12 here). No oversell path exists through it.
2. **The deterministic sandbox is loopback/test-host gated by design.** `localTestCheckoutEnabled` enables the test confirm only on loopback hosts (under `LOCAL_E2E_TEST_MODE`) or on `.test` hosts matching `APP_URL` with the operator env flag and ≥32-char secrets; the CMS config validator also forbids `LOCAL_E2E_TEST_MODE` with a non-loopback `APP_URL`. In this sandbox the confirm therefore runs on the loopback host (the same pattern the repo's own acceptance test uses in-process), and the site-host confirm 404 is asserted as a stage. In production the deterministic provider is simply off; real-provider checkout is F-03/NOT VERIFIED territory.
3. **Entitlements.** The physical order's fulfillment implication is the inventory decrement plus the order's fulfillment timeline; digital-delivery grants belong to digital products and are exercised by F-02 (donation/subscription/affiliate/POD paths), not claimed here.

## Findings

None. No P0/P1/P2 filed by F-01: the commerce core — server pricing, signed-webhook settlement, idempotent initiate/confirm, exact inventory accounting, cross-site refusals — held under every stage. (The site-settings write wall behind the setup's in-process capability toggle remains RC2-DEBT-16, already filed.)

## Family / ledger effect

- Commerce & Monetization family: product → cart → proposal → sandbox settlement is **E2-proven** (row 8 updated); the family completes with F-02 (revenue-adjacent paths) and F-03 (idempotence/reversals under attack).
- 90-area ledger: #46 E-commerce engine's E2 rating is now backed by live journey evidence; #47 Payment gateway system gains sandbox-path E2 evidence (real providers remain NOT VERIFIED by design).

## Next

RC2-F-02 — revenue-adjacent workflows: donation, recurring, affiliate, POD, one real stateful action + readback per implemented path, honest classification where a path is not executable.
