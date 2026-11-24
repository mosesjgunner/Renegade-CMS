# RC3-SHOP-UX Test Matrix — the spec's 20 cases

_Evidence classes are stated honestly: **route/integration** = production
code paths driven against a real database on this rig; **fixture** =
deterministic test evidence (processor observations, sandbox card rail);
**contract stub** = a local HTTP stub implementing the provider's API
contract so the real adapter code runs over real HTTP — not a live
provider receipt; **existing suite** = pre-existing repository tests that
cover the case and still pass in this slice's full gauntlet; **CI** =
browser/production-build proof that belongs to GitHub CI (this rig
cannot run the production build — standing limitation)._

| #   | Case                                   | Verdict               | Evidence                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Three-product creator shop             | PASS                  | Slice-3 journey test (Pass 01): a 3-product shop with category, featured flag, and a sold-out item exercises search/filter/sort/featured/attribute paths end to end. Small-catalog gating is in the page.                                                                       |
| 2   | Hundred-product retail shop            | PARTIAL               | Server pagination at 24/page past the old 100 cap was proven in slice 1; this slice's filters run on the same native queries. No dedicated 100-product fixture was built in this slice.                                                                                         |
| 3   | Large catalog pagination + search      | PASS                  | Slice 1 (search + pagination data path, draft exclusion) + this slice's parameterized `/api/catalog` with pagination metadata on the same query builder.                                                                                                                        |
| 4   | Physical guest checkout                | PASS                  | Slice-1 DoD journey + slice-2 mixed-cart journey + this slice's Pass 04 and both BTC journeys — all guest, all exactly one paid order.                                                                                                                                          |
| 5   | Digital purchase + entitlement         | PASS                  | Existing suites (commerce runtime acceptance, digital delivery grants on the status route) — unchanged surfaces, still green in the full gauntlet.                                                                                                                              |
| 6   | Recurring membership purchase          | PARTIAL               | Pre-existing state stands: grant/entitlement lifecycle is journey-proven, but recurring **checkout** is not executable in the sandbox (ledger F-02). This slice adds only the Membership/Pricing block (presentation).                                                          |
| 7   | Coupon and discount                    | PASS                  | Existing cart/pricing suites (apply/remove, eligibility, stacking) + CartView behavior unchanged and green in the full gauntlet.                                                                                                                                                |
| 8   | Out-of-stock prevention                | PASS                  | Existing reservation/stock suites + this slice: sold-out product derives `anyAvailable=false`, is excluded by the availability filter, and cart re-resolution behavior is unchanged.                                                                                            |
| 9   | Shipment selection + tax               | PASS                  | Slice-3 journey test (Pass 04): merchant-configured $7 flat with no pickup offered; pickup selection re-quotes shipping to $0; merchant VT rate (6%) applied and labeled `merchant-configured`; unconfigured VT → 422 fail-closed.                                              |
| 10  | Custodial BTC payment                  | PASS (fixture)        | Slice-3 journey test (Pass 05/06): $10.62 total at a frozen processor quote (10,620 sats), processor fee $0.11 / net settlement $10.51 recorded on the intent, Lightning address + on-chain invoice issued, settle → exactly one paid order with issued receipt.                |
| 11  | Noncustodial BTC payment               | PASS (contract stub)  | Slice-3 journey test (Pass 05): the real BTCPay adapter over real HTTP against the Greenfield contract stub; quote frozen (`btcpay-rates`), settlement only on server-queried Settled. **Live BTCPay instance: NOT RUN** (no server/Docker on this rig — owner-authorized leg). |
| 12  | Card/hosted-payment sandbox            | PASS                  | Slice-1 + slice-2 journeys and this slice's switching test: hosted test rail through the signed-webhook handler → exactly one paid order.                                                                                                                                       |
| 13  | Expired crypto quote                   | PASS                  | Custodial: full payment observed after invoice expiry → `late`, not accepted, no order. BTCPay: Expired invoice → `expired`, refused.                                                                                                                                           |
| 14  | Failed + repeated payment events       | PASS                  | Duplicate verify = replay-safe refresh (still one order); same transaction against a second intent → 422; partial payment → `underpaid`, no order; overpayment → manual reconciliation, never auto-accepted; webhook replay proven in slice 1.                                  |
| 15  | Guest order access                     | PASS                  | Status route: 200 with the possession-verified cookie, including for **crypto** checkouts (the cookie gap this slice fixed); member order history API returns 401 for guests.                                                                                                   |
| 16  | Refund + fulfillment failure           | PARTIAL               | Refund state/amount is rendered from the canonical order record (existing) and fulfillment records drive the new shipment view; a dedicated refund-journey re-proof was not run in this slice.                                                                                  |
| 17  | Cross-site / cross-merchant denial     | PASS                  | Existing adversarial cross-site matrix + tenant-binding guards (verify route host↔intent binding, site-scoped queries everywhere new code reads) — green in the full gauntlet.                                                                                                 |
| 18  | Mobile + keyboard-accessible checkout  | PARTIAL               | Native controls, labeled radio groups/selects, gallery buttons, live regions — verified by construction and typecheck/lint. **Browser execution belongs to CI**; no browser exists on this rig. No field performance metrics are claimed.                                       |
| 19  | Theme switch without product-data loss | PASS (registry level) | Unit test: all eight blocks registered in the shared starter registry (merged into every theme), validate() requires the canonical reference, renders carry the reference, and no block field can hold price/inventory. Rendered-browser confirmation belongs to CI.            |
| 20  | Restart during payment/fulfillment     | PARTIAL               | All payment/fulfillment state lives in durable database records (intents, proposals, reservations, orders) — no in-memory payment state was introduced. The dedicated restart-recovery suite (rc03) still passes; no new mid-payment restart drill was run in this slice.       |

## New tests added by this slice

- `tests/unit/rc320-shop-ux.test.ts` — 21 tests: listing projection,
  exponent-aware money parsing, merchant-config parsing, merchant tax
  precedence + fail-closed, custodial adapter (config parsing, quote,
  settlement fee, processor-address invoice), custody registration,
  payment presentation (labels/custody/PayPal naming), storefront params.
- `tests/unit/rc320-commerce-blocks.test.ts` — 4 tests: block
  registration, reference validation, no-price-in-layout invariant,
  reference-carrying renders.
- `tests/integration/rc320-shop-ux-journey.integration.test.ts` — 5
  journey tests (Pass 01 storefront; Pass 04 merchant config; Pass 05/06
  custodial $10 journey + order center; Pass 05 BTCPay $10 journey with
  negatives; Pass 05 method switching).
