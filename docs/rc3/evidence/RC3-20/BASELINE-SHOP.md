# RC3-20 Baseline — The Buyer Journey on Main d3cb893

_Audit of the current shop journey against the SHOP-UX definition of done: "A person can discover a product, select a variant, place it in a cart, review accurate costs, choose an eligible payment method, complete a sandbox purchase without duplicate charges, receive a correct order confirmation and independently access the resulting delivery or entitlement information."_

Baseline commit: `d3cb8936b08ac54c7a0f9271579d3c444c072c10` (merge of PR #144). Branch audited: `rc3-20-shop` at that commit, unmodified. Baseline test results (local PG16 rig, env `rc320shop-env.local`, fresh migrations + seed): commerce-runtime-acceptance 1/1, shared-contract-commerce-shop 34/34, shop-08-local-donation-checkout 1/1, rc05-pass2-commerce-routes 5/5, rc1-cart-worker-schema 3/3 — all pass. Logs: `rc320-shop-baseline-*` in the wave log dir.

## Step-by-step verdicts

### 1. Discover a product — /store — WORKS, with a ceiling

- `src/app/(frontend)/store/page.tsx:20-26` — server-rendered grid of published products for the host's site via `ProductCard`. Empty state exists (line 33).
- **Defect (ceiling):** `limit: 100` hard-coded (line 23) with no pagination — products past the first 100 are undiscoverable.
- **Missing:** no search, no category/price/availability filters, no sorting. `src/app/(frontend)/api/catalog/route.ts` has no search/query handling either. (Full filter matrix is SHOP-UX Pass 01 scope; this slice adds search + pagination so discovery works at any catalog size.)

### 2. Product page + select a variant — WORKS

- `src/app/(frontend)/store/[slug]/page.tsx` — canonical-path resolution, JSON-LD, 404 for unpublished/other-site products.
- `src/modules/commerce/ProductView.tsx:71-243` (`ProductDetail`) — per-variant price via `resolveActiveOffer`, availability states (tracked stock, POD, affiliate staleness), recurring terms, disclosures. Prices use the currency-correct `formatMinorMoney` (`src/modules/commerce/catalog.ts:488`).
- `src/modules/commerce/AddToCartControl.tsx` — variant select (unavailable options disabled), quantity stepper, donation amount mode, out-of-stock state, add confirmation with View Cart link, aria-live announcements.

### 3. Cart — WORKS

- `src/app/(frontend)/cart/page.tsx` renders `CartView`; the cart itself is server-authoritative: version-checked PATCH (`/api/commerce/cart`), 409 reload on concurrent edit, coupon apply/remove with eligibility feedback, reconciliation notes for price/stock changes, guest→member merge action.
- Guest carts are cookie-token based (`guestCartCookieName`, `hashGuestToken` in `src/modules/commerce/cart.ts`); the cart route issues the cookie the proposal route later reads.

### 4. Checkout — WORKS mechanically, WRONG presentation, one consent defect

- `src/app/(frontend)/checkout/page.tsx:1-12` — **/checkout is literally the cart page**: it renders the same `CartView` as /cart. There is no dedicated checkout presentation; cart editing, checkout details, proposal review, and payment all stack on one page.
- **Customer-facing technical language** in `src/modules/commerce/CartView.tsx`:
  - submit button "Create Checkout Proposal" / "Generating Proposal..." (line ~715)
  - review panel headed "Immutable Proposal" with "Guaranteed Quote" badge (line ~723)
  - proposal ID, integrity hash prefix, and cart version printed to the customer (lines ~728-732)
  - announcement "Immutable checkout proposal created. Ready to proceed to payment." (line ~277)
  - "Intent ID" printed after payment initiation (line ~761)
  - The internal model (proposal/integrity) is sound engineering; the defect is exposing its vocabulary to buyers. Hashes must stay internal per SHOP-UX Pass 04.
- **Money formatting:** CartView formats amounts with a hardcoded `$` and `/100` in at least 6 places (unit price, subtotal, discounts, shipping, tax, grand total, pay button) — wrong for non-USD currencies and zero-decimal currencies. `formatMinorMoney` already exists and is used by ProductView.
- **CONSENT DEFECT (privacy, Red-gate-adjacent):** consent is synthesized in two places instead of flowing from the customer's selections:
  - Client: `CartView.tsx` `handleGenerateProposal` sends `consents: { termsAccepted: true, privacyAccepted: true }` as literals, ignoring the `termsAccepted` checkbox state it maintains.
  - Server: `src/app/(frontend)/api/commerce/proposal/route.ts` validates that both were submitted true (400 otherwise) but then **discards the submitted values** and stores literals `termsAccepted: true, privacyAccepted: true` in the proposal (only `marketingAccepted` passes through, via `Boolean(...)`).
  - There is **no marketing-consent control in the UI at all**, although the data model supports it (`ProposalConsent.marketingAccepted`, `src/modules/commerce/proposal.ts:17-22`) — a customer can never actually choose it.
  - `ProposalConsent` carries a `timestamp` (recorded) but **no policy-version fields**, and no commerce policy-version source exists in the codebase (the audience module has one for subscribers; commerce does not). Recording policy versions is therefore PARTIAL in this slice: values + timestamp are recorded faithfully; versions await a policy source.
- Country fields ask for a raw "2-letter ISO" code in text inputs (CartView billing country + address country) instead of recognizable country names (SHOP-UX Pass 04). Noted; the address form is otherwise complete and server-validated (`validateAddress` in the proposal route).
- Shipping inside the quote uses `LocalFallbackShippingAdapter` with hardcoded $5.00 flat / free ≥ $50 (`proposal/route.ts`, "Shipping rate calculation") — not merchant-configured. Recorded here for the RC3-20 adapter layer; **shipping rework is not part of this slice** (per the Nov 24 scope correction, shipping keeps its normal place inside RC3-20, after this journey slice).

### 5. Choose a payment method + sandbox purchase — WORKS

- Methods are capability-driven: `GET /api/commerce/checkout/methods?proposal=` returns eligible methods with customer labels; CartView renders them in a select (the deterministic test rail is labeled "test payment — no real charge").
- Initiate (`src/app/(frontend)/api/commerce/checkout/initiate/route.ts`) is idempotent: an existing open intent is replayed, not duplicated (returns `replay: true` + the guest order cookie again); integrity hash and cart version are re-verified server-side; amounts are recomputed from the catalog, never trusted from the browser.
- The deterministic-test provider completes through the **real signed-webhook path**: `POST /api/commerce/checkout/test/confirm` builds a signed event and calls the production webhook handler; it is gated by `localTestCheckoutEnabled` (loopback + env flags + ≥32-char secrets) and `canConfirmTestCheckout`. No fabricated success: settlement happens only from verified provider evidence, same as a live rail.
- Duplicate-charge protection is proven by the baseline suites (commerce-runtime-acceptance covers settlement + replay; shared-contract-commerce-shop 34/34).

### 6. Order confirmation + independent access — WORKS, with developer-speak on the page

- Confirmation lives at `/checkout/return?session=<id>` (`CheckoutStatus.tsx`), polling `GET /api/commerce/checkout/status?session=`. It shows order number, state, receipt number, itemized items, totals snapshot, refund state, and digital download links.
- **Access control is correct:** the status route authorizes either the owning member (actor match) or the signed guest-order cookie (`renegade_checkout_<sessionId>`, HMAC-signed, 30-day, set at initiate) — possession-verified, not guessable by order number.
- **Presentation defects** in `CheckoutStatus.tsx`: amounts are printed as raw minor-unit integers with the words "minor units" ("Settled total: 2599 USD minor units", item lines "— 1500 USD minor units", refund line likewise), and the pending state shows "Server status: …" plus developer copy ("A redirect or cancel click does not change payment truth. This page will update after verified provider evidence arrives."). A buyer cannot read their own total from this page today.
- The guest's durable path back is the cookie + the return URL; there is no email-link order lookup page in this slice's scope (receipt resend exists on the admin side). Recorded as a known gap for the SHOP-UX Pass 06 build-out, not fixed here.

## Baseline summary

| Journey step                         | Verdict                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Browse / discover                    | Works; 100-product ceiling; no search                                                      |
| Product + variant                    | Works                                                                                      |
| Cart                                 | Works                                                                                      |
| Checkout presentation                | Broken (cart page reused; internal jargon shown to buyers)                                 |
| Consent recording                    | **Defect** — synthesized client- and server-side; no marketing control; no policy versions |
| Payment selection + sandbox purchase | Works; duplicate-safe                                                                      |
| Confirmation + guest access          | Works; amounts unreadable (raw minor units), developer copy                                |

The engine is sound; the defects are at the glass and in the consent record. This slice fixes exactly those, plus storefront search/pagination, and proves the whole journey end-to-end on synthetic data.
