# RC3-SHOP-UX Implementation — Slice 3

_Base `0bb627e` (GitHub main, merge of PR #146). Branch `rc3-20-ux` (local
only — the lead delivers). One migration:
`20261124_120000_rc320_shop_ux_listing` (products: `featured`,
`min_price_minor`, `price_currency`, `any_available`), rehearsed fresh and
as an upgrade._

## Pass 01 — Storefront depth

- **Denormalized listing projection.** Price truth stays in the offers
  JSON. A products `beforeValidate` hook now maintains `minPriceMinor` /
  `priceCurrency` / `anyAvailable` from the mapped catalog document via
  the pure `deriveCatalogListingFields` (lowest `resolveActiveOffer` price
  across purchasable variants), so filters and price sorts are native,
  indexed Payload queries. Bound: pre-existing rows carry null projection
  fields until their next save (see NEXT.md).
- **One query builder** (`src/modules/commerce/storefront.ts`) backs both
  `/store` and `/api/catalog`: search, category (by slug), collection,
  price range, availability, featured, five sorts (newest, featured,
  price ↑/↓, name), pagination. Variant-attribute filtering runs in
  memory over the natively-filtered, site-scoped set, capped at 1,000
  scanned products with the cap surfaced to the buyer and in the result
  object — never silently truncated.
- `/store` page: category navigation with counts, featured rail (bare
  first page only), filter/sort form with all state in the URL,
  small-catalog gating (filter controls hidden when the published catalog
  fits one page and nothing is filtered), ItemList JSON-LD, canonical
  `/store` for every filtered variant.
- `/api/catalog`: parameterized (same params + `id` for a single product),
  returns pagination metadata; the historical unparameterized default
  (12 items, same entry shape) is preserved for existing consumers.

## Pass 02 — Product pages

- `ProductGallery` (client): main image + thumbnail buttons
  (`aria-pressed`, native keyboard-operable buttons, alt text follows the
  shown image).
- `AddToCartControl`: per-dimension selectors when the product declares
  `optionDimensions` (impossible combinations disabled, resolved variant +
  formatted price shown live); flat select kept as the no-dimension
  fallback. Money defects fixed: all prices via `formatMinorMoney`;
  donation entry via the new exponent-aware `parseMoneyToMinor` /
  `minorMoneyDecimal` (no hardcoded `$` or `/100` anywhere in the
  control).
- Related products: explicit catalog `relationships` first, same-category
  top-up, published + same site only (`relatedProductsFor`).
- Delivery & returns: the product page links the merchant's configured
  shipping/returns policy records with versions (Pass 04 source).

## Pass 03 — Cart

Audit-verified as already true (merge, reconciliation notes, promotions,
recovery, in-cart variant change) — not rebuilt. The inline add-to-cart
confirmation ("✓ Added to cart" + View Cart) stands as the fast
confirmation; a slide-over drawer was not built (NEXT.md).

## Pass 04 — Checkout depth

- **Merchant configuration is the canonical record**
  (`src/modules/commerce/merchant-config.ts`, defensive parsers over the
  merchant connection's `configuration` JSON — the same record that
  already carries `btcpay` / `crypto` settings):
  - `configuration.shipping` → the local fallback adapter's rates
    (flat / free threshold / pickup). Platform defaults apply only when
    the merchant has not configured their own.
  - `configuration.tax.ratesBps` → consulted **before** the bounded
    baseline in `BoundedJurisdictionTaxAdapter`; results are labeled
    `source: 'merchant-configured'`. An explicit merchant 0 is honored as
    the merchant's assertion. Unmapped destinations with neither source
    still fail closed (422) before any charge. `taxShipping` honored.
  - `configuration.policies` → versioned policy records
    (terms/privacy/returns/shipping, title + version + URL or body).
- **Shipping-method selection:** `quoteShippingForGroups` now also returns
  every quoted rate per group; the proposal response carries
  `shippingOptions`; CartView renders a Delivery method radio group and
  re-quotes on change (the superseded proposal is cancelled server-side,
  as before). Verified end-to-end with a pickup selection repricing
  shipping to $0.
- **Consent versions:** the proposal stamps `policyVersions` (from the
  merchant's configured records) into the consent record next to the
  buyer's actual selections and timestamp — omitted entirely when the
  merchant has configured none, never invented. This closes slice 1's
  named PARTIAL.
- **Policy surfaces:** `/policies/[type]` renders the site's active
  record (or redirects to the merchant's external URL);
  `/api/commerce/policies` feeds the checkout consent links (with
  versions) and the product-page and order-center policy links.
- Country fields are now `<select>`s with recognizable names
  (`Intl.DisplayNames` over ISO codes) for billing and shipping.
- Proposal review "How you'll get it" now names dropship ("shipped by the
  supplier") and referral ("bought at the seller's own site") groups
  instead of mislabeling them digital delivery.

## Pass 05 — Payment selection + the $10 BTC journeys

- **Custody is a rail property.** `PaymentRailAdapterDescriptor` gains
  `custody`: btcpay → `noncustodial`, fixture-crypto → `noncustodial`,
  new `custodial-crypto` → `processor-managed`.
- **Custodial rail** (`createCustodialCryptoAdapter`): a deterministic
  processor-managed adapter implementing the same invoice/verification
  contract as the other crypto rails. The buyer pays the **processor's**
  deposit address (or its Lightning address); the FX quote freezes on the
  intent (`quoteSource: 'custodial-processor'`) together with the
  processor fee and settlement mode (`fxQuote.settlement`); settlement
  verifies from processor-reported observations under the same production
  guard as fixture evidence — the deterministic feed is test evidence
  until a live processor integration swaps the feed, not the contract.
  Incomplete configuration → 503, mirroring BTCPay.
- **Presentation layer** (`payment-methods.ts`): the methods endpoint now
  returns recognizable methods — label, plain-language detail (including
  who holds the money), custody, networks, payment options
  (lightning/on-chain), test-mode flag. Adapter/rail keys are never the
  label; an unregistered rail degrades to its family label instead of
  throwing. PayPal is named when a wallet capability uses it; no PayPal
  rail exists yet (RESULT.md, NOT STARTED for the rail itself).
- **CartView payment UI:** radio groups instead of a key-labeled
  `<select>`; after initiating crypto, a full invoice panel — exact BTC
  amount, frozen-rate explanation with processor fee/settlement when
  custodial, Lightning address when offered, on-chain address, a real QR
  code (the declared `qrcode` dependency rendering the server-issued
  payment URI), expiry, and a verify action whose transaction ID is a
  lookup hint only.
- **Method switching:** initiating a new intent cancels every other open
  intent for the session, and the crypto verify route refuses cancelled
  intents (409) — a stale invoice from an abandoned method can no longer
  settle after the buyer switches. Duplicate verification stays a
  replay-safe refresh (exactly one order); a transaction that settled one
  intent is rejected for any other (existing guard, re-proven).

## Pass 06 — Order center

- Status route projects the order's fulfillment: groups from the frozen
  `downstreamInstructions`, shipments from the canonical fulfillment
  records (manual packages + POD jobs) with carrier/tracking only when
  recorded there.
- CheckoutStatus renders the itemized receipt (subtotal, discounts,
  shipping, tax, total — the previously unrendered `totalsSnapshot`), a
  buyer-word timeline, fulfillment groups and shipment tracking, refund
  state, downloads, and seller policy links for help.
- **Guest access fixed for crypto:** all crypto initiate branches now set
  the possession-verified, expiring order cookie (previously only the
  hosted-card path did), so a guest who paid by crypto can open their
  order page.
- Member order history: `GET /api/commerce/orders` (member → carts →
  sessions → orders, site-scoped, 401 for guests) + a
  `/members/settings/orders` page linking each order to its status view.

## Pass 07 — Builder commerce components

Eight blocks registered in `starterComponents` (category Commerce):
Product Card, Product Grid, Featured Product, Collection Grid, Buy
Button, Cart Indicator, Membership/Pricing Card, Donation/Tip Card.
Props carry **only canonical references** (product/category/collection
IDs) and display options — a unit test asserts no price/inventory field
exists on any block. Prices, availability, and recurring terms are read
live from `/api/catalog` at render time (`CommerceBlocks.tsx`), so a
theme switch or a price change can never strand a stale authoritative
value in layout JSON. Donation/affiliate products route the Buy Button to
the product page instead of a wrong one-click add.

## Pass 08 — Accessibility / performance (lab evidence only)

New surfaces use native form controls throughout (radio groups with
legends, labeled selects/inputs, buttons with `aria-pressed` in the
gallery, `role="status"` announcements, visible focus via native
elements). Catalog data-path timing is exercised by the integration
suite at suite scale; no field metrics, no VPS envelope claims — browser
and Core Web Vitals proof belongs to CI (see TEST-MATRIX case 18).
