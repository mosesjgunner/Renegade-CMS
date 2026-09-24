# SHOP-02 Carts, Pricing, and Checkout Proposals

Status: implemented; live PostgreSQL and browser acceptance required for release verification.

## 1. Ownership & Authority

`carts` and `checkout-proposals` are server-authoritative, site-isolated entities. Storefront layouts and client browsers hold only optimistic display projections. LocalStorage, session storage, or client cookies are never treated as the source of truth for items, prices, discounts, taxes, or availability.

Authoritative state rules:

- **Zero Client Trust**: All line prices, catalog offer versions, discount eligibilities, tax allocations, and shipping fees are calculated exclusively on the server using active catalog offers, published promotions, and verified adapters.
- **Site-Scoped Isolation**: Carts and proposals are strictly scoped to `siteId`. Tokens and identifiers from one site cannot read or mutate carts on another site.
- **Payload Domain Authority**: Carts, promotions, checkout proposals, and inventory reservations are registered collections in `commerceDomain`, backing real-time transactions with ACID guarantees in PostgreSQL.

---

## 2. Versioned Carts & Opaque Guest Tokens

Cart sessions support both anonymous guests and authenticated members:

- **Opaque Guest Tokens**: Guest carts issue a high-entropy random token via an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `renegade_cart_<siteId>`.
- **Hashed Persistence**: Only the SHA-256 hash of the guest token is stored in the database (`guestTokenHash`). The plain token is never stored.
- **Optimistic Concurrency**: Carts maintain a monotonic integer `version`. Mutation operations (item additions, quantity updates, coupon applications) verify `clientVersion === cart.version` (via payload or `If-Match` header). Mismatches return HTTP 409 Conflict with the fresh server cart state.
- **Re-resolution on Every Mutation**: Every mutation re-resolves the cart against active catalog offers. If an offer has changed price, been retired, or stock has dropped, the cart automatically re-prices or removes the item and appends an auditable `reconciliationNote`.

---

## 3. Guest-to-Member Cart Merging

When an anonymous guest authenticates, their guest cart is merged into their member cart via `/api/commerce/cart/merge`:

- **Deterministic Merge Strategy**:
  - Matching items (same `productId` and `variantSku`) have their quantities summed, clamped to available inventory limits.
  - Unique items from both carts are preserved.
  - Applied coupon codes are re-validated against member eligibility and usage limits.
- **Explicit Conflict Notes**:
  - Price changes, out-of-stock removals, or rejected promotions generate timestamped `reconciliationNotes` with codes: `price-changed`, `item-unavailable`, `quantity-adjusted`, `promotion-removed`, or `conflict-resolved`.
- **Single Owner Cleanup**: Upon successful merge, the guest cart is deleted and the guest cookie is cleared.

---

## 4. Central Deterministic Pricing Engine

Pricing calculations are centralized in `src/modules/commerce/pricing.ts` and adhere to financial invariants:

- **Integer Minor Units**: All monetary values are represented as stringified integers in minor units (e.g. cents: `"2500"` for $25.00 USD). Floating-point arithmetic is prohibited.
- **Zero-Residue Allocation**:
  - Proportional discount and tax allocations to order lines must sum exactly to the header-level discount and tax amounts.
  - Any remainder rounding pennies are distributed deterministically to the lines with the largest gross values using `allocateDiscountsToLines` and `allocateTaxToLines`.
- **Version Tracking**: Pricing computations pin `ruleVersion` and input catalog versions for reproducibility.

---

## 5. Versioned Promotions & Stacking Rules

Promotions are managed in `src/modules/commerce/promotions.ts` and the `promotions` collection:

- **Scopes & Types**: Supports order-level and line-item promotions with percentage (`percentage_off`), fixed amount (`fixed_amount_off`), or free shipping (`free_shipping`).
- **Eligibility & Limits**: Verifies temporal active windows (`startsAt` to `endsAt`), minimum subtotal requirements, maximum usage caps, and per-customer limits.
- **Stacking Behavior**:
  - `exclusive`: Cannot be combined with any other coupon or promotion.
  - `stackable`: Can combine with other stackable promotions in priority order.
  - `priority`: Evaluated by priority index; highest priority promotion wins if conflicting.

---

## 6. Inventory Availability & Bounded Reservations

Item availability is governed by 5 distinct policies in `src/modules/commerce/inventory.ts`:

1. `untracked`: Always available, unbounded inventory.
2. `tracked`: Finite inventory counted in PostgreSQL. Cannot be oversold unless `allowBackorder` is explicitly true.
3. `pod` (Print-on-Demand): Bounded by provider availability flags in active POD mappings.
4. `digital`: Entitlement delivery; checked against active digital media asset availability.
5. `preorder`: Active during an explicit preorder window (`startsAt` to `endsAt`) and capped at `maxPreorderQuantity`.

**Bounded Reservation TTL**:

- Inventory reservations (`inventory-reservations` collection) hold stock for a maximum of 15 minutes (`RESERVATION_TTL_MS = 900000`).
- Expired reservations are automatically released. Reservations cannot live indefinitely.

---

## 7. Address Validation & Shipping Adapters

- **Verbatim Input Preservation**: `validateAddress` cleans and normalizes presentation fields (e.g. trimming whitespace, uppercase state/country), but preserves the customer's `rawInput` verbatim for auditability and carrier compliance.
- **ShippingRateAdapter**: Pluggable interface for live carrier rates.
- **Local Fallback**: `LocalFallbackShippingAdapter` provides deterministic tier calculations:
  - Flat standard shipping.
  - Free shipping when subtotal reaches configured threshold.
  - Local pickup option.
- Every shipping estimate records `estimateSource` (`live` vs `local_fallback`) and `estimatedAt` timestamp.

---

## 8. Tax Adapters & Strict Outage Blocking

- **TaxAdapter**: Standard interface for calculating jurisdiction sales tax and VAT.
- **Strict Outage Blocking**:
  - `BoundedJurisdictionTaxAdapter` resolves tax for known state/province/country configurations.
  - When an address falls in a taxable jurisdiction where tax cannot be reliably determined, the engine throws `TaxCalculationUnavailableError`.
  - The system **strictly refuses to invent zero tax** or proceed with checkout when tax is required but cannot be determined.
  - Customer-facing messaging clearly states that tax cannot be calculated and payment cannot be accepted. The system never claims or implies tax filing/remittance.

---

## 9. Immutable Checkout Proposals

Before initiating payment, the system creates a cryptographic `CheckoutProposal` via `/api/commerce/proposal`:

- **Snapshot Invariants**:
  - Pins exact `cartId` and `cartVersion`.
  - Pins normalized customer identity and contact information.
  - Pins validated shipping and billing addresses.
  - Pins shipping method and fee snapshot.
  - Pins complete pricing breakdown (subtotal, line allocations, discounts, tax, grand total).
  - Pins required customer terms and marketing consent selections.
  - Pins fulfillment split (physical shipment vs digital entitlements vs POD orders).
- **Integrity Hash**:
  - Generates a SHA-256 integrity hash across canonical proposal fields.
  - `/api/commerce/checkout/initiate` verifies that the proposal exists, is not expired (15-minute TTL), has not been previously consumed, and that `computeProposalIntegrityHash(proposal) === proposal.integrityHash`.
  - Once payment initiates, the proposal status transitions to `consumed`.

---

## 10. Accessible Storefront UX & Privacy

- **WCAG 2.1 AA Compliance**:
  - `CartView` and `AddToCartControl` provide accessible table structures, ARIA live regions for price/quantity updates and errors, and high-contrast badges.
  - Full keyboard accessibility with logical focus movement.
  - Transparent itemized breakdowns with no hidden fees.
  - Guest checkout supported without forced account creation.
- **Privacy-Safe Analytics**:
  - Storefront events log sanitized identifiers (`cart_viewed`, `item_added`, `proposal_created`).
  - No PII, plaintext emails, physical addresses, or secret tokens are dispatched to analytics buses.

---

## 11. Release Acceptance Verification

Before deploying SHOP-02 to production, verify the following gates:

1. **Tampering Attempts Blocked**:
   - Client price override payload fails and server recalculates from catalog offer.
   - Currency mismatch between line item and cart currency fails validation.
   - Negative, fractional, or non-integer quantities are rejected (HTTP 400).
   - Cross-site guest token access is rejected.
   - Fabricated coupon codes are rejected.
2. **Deterministic Merge & Concurrency**:
   - Guest cart items merge into member cart upon login with proper quantity summing.
   - Concurrent updates with mismatched version reject with HTTP 409.
3. **Tax & Shipping Failure Safety**:
   - Unmapped taxable jurisdiction halts proposal creation with `TaxCalculationUnavailableError`.
   - Shipping estimate source is explicitly logged (`local_fallback`).
4. **Proposal Integrity**:
   - Tampered proposal attributes cause hash mismatch and fail checkout initiation.
   - Expired proposals (>15 min) or consumed proposals are blocked.
5. **Clean Verification**:
   - Vitest suite passes: `tests/unit/shop-02-tampering-and-invariants.test.ts` and `tests/unit/shop-02-carts-and-proposals.test.ts`.
   - TypeScript build passes cleanly: `tsc --noEmit`.
