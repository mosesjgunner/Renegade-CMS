# RC3-SHOP-UX Baseline — Slice 3 (Passes 01–09 remainders)

_This is the pre-build audit for the final RC3-20 slice. The slice-1 baseline
(`docs/rc3/evidence/RC3-20/BASELINE-SHOP.md`) and its result
(`RESULT-SHOP.md`) cover the definition-of-done journey; the slice-2 result
(`RESULT-ADAPTERS.md`) covers the adapter engine. This document records only
what those slices left open, verified first-hand against the code at base
`0bb627e` (GitHub main, merge of PR #146) plus four independent read-only
audits (storefront, product/Puck, cart/checkout, payments/order center)
whose findings agreed with the first-hand read._

## Pass 01 — Storefront

- Filters (category / price / availability / variant attribute): **MISSING**.
  `/store` filtered only on published + site + optional name search
  (slice 1). No sort parameter anywhere; the catalog API route was
  parameterless (fixed limit 12, no totals).
- Collection navigation: **MISSING**. Featured products/collections:
  **MISSING** (no `featured` field on Products, none in SiteSettings).
- Listing metadata: bare `{ title: 'Store' }` — no canonical, robots, or
  ItemList JSON-LD (product detail SEO already existed via the discovery
  module).
- Price lives in the offers JSON, so Payload cannot filter or sort on it;
  a denormalized projection is required. Cross-site isolation already
  existed in every catalog query (site-scoped + `publishedProductRead`).

## Pass 02 — Product pages

- Gallery: static grid of all images; no selected-image state, thumbnails,
  or zoom. Variant selection: one flat SKU `<select>` in
  `AddToCartControl`; the per-dimension model (`optionDimensions` +
  `optionValues`, validated in the catalog layer) never reached the UI.
- Money defect: variant option labels used a hardcoded `$` and `/100`;
  donation amounts used `/100` math both ways — wrong for zero- and
  three-decimal currencies.
- Related products: **MISSING** (the `relationships` relation and category
  data existed, unused). Delivery/returns visibility: **MISSING** (no
  merchant policy source existed — see Pass 04).

## Pass 03 — Cart

Already true (audit-verified, not rebuilt): guest→member merge without
duplication, price/stock reconciliation notes rendered in the cart,
promotion apply/remove with server-side eligibility, refresh/restart
recovery via the server cart, in-cart variant change. Named remainders:
cart drawer (inline "Added to cart" confirmation exists; no drawer),
promotion expiry display, reservation-hold clarity in the review panel.

## Pass 04 — Checkout

- Shipping-method selection: **MISSING** buyer-side. The proposal route
  accepted `selectedShippingRateId` and quoted per group (slice 2), but
  CartView never sent it and the response never returned the option list.
- Merchant configuration: **MISSING**. The proposal route hardcoded the
  shipping adapter ($5.00 flat / $50 free threshold / pickup on) and used
  the bounded statewide tax table as the only rate source. The tax adapter
  itself was sound: fail-closed on unmapped jurisdictions, never invents
  zero tax.
- Consent policy versions: **MISSING** — no commerce policy-version source
  existed anywhere (slice 1 recorded the values; versions were the named
  PARTIAL). Country fields were raw 2-letter text inputs. Merchant policy
  links in checkout: **MISSING**.

## Pass 05 — Payments

- Methods endpoint returned `label: capability.railKey` — internal adapter
  keys shown to buyers — and only `{id, label, family, providerKey}`.
- Custody was not representable: `PaymentRailAdapterDescriptor` had no
  custody field; **no custodial crypto adapter existed** (BTCPay =
  merchant's own server; fixture-crypto = merchant wallet). Wallets/PayPal
  and stablecoins had no rails at all.
- The crypto invoice (amount, destination, QR payload, expiry) returned by
  initiate was **never rendered** in CartView — a BTC buyer saw no address,
  amount, or QR.
- Method switching: **MISSING** — a second method created a second live
  intent; the abandoned intent could still settle.

## Pass 06 — Order center

- Status route returned itemized totals data (`totalsSnapshot`) that
  CheckoutStatus never rendered; fulfillment split and carrier tracking
  were not projected at all; history rendered as raw state strings.
- Member order history: **MISSING** (no list API, no page).
- **Guest crypto buyers could never reach the status page**: the
  possession-verified order cookie was set only on the hosted-card and
  replay responses — the BTCPay and fixture-crypto initiate branches
  returned without it, so the status route's guest authorization could
  never succeed for a crypto checkout.

## Pass 07 — Puck commerce components

All eight named components **MISSING** as builder blocks. The nearest
existing block (`publisher.product-showcase`) client-fetches the whole
catalog; the donation block is hardcoded demo copy not bound to any
record. Components register through `starterComponents`
(`src/modules/presentation/themes/components.tsx`), which the presentation
registry merges across themes — references survive theme switches if the
blocks store references only.

## Pass 08 — Accessibility / performance

Shopping surfaces used native controls with labels in most places (slice 1
state). No WCAG audit evidence and no lab performance evidence existed for
the new surfaces this slice adds; no browser is available on this rig, so
browser-level proof belongs to CI (standing posture for all RC3 passes).
