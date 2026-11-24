# RC3-SHOP-UX — What remains after slice 3

_RC3-20's three slices are complete. The items below are named remainders,
not hidden gaps; each carries its owner or trigger._

## External legs (owner-authorized, not rig problems)

- **Live BTCPay instance leg.** The BTCPay rail is proven against the
  Greenfield contract stub over real HTTP. A live leg needs the owner's
  own BTCPay Server (or Docker on a suitable host) and runs on his word.
- **Live custodial processor integration.** The custodial rail's contract
  (invoice, frozen quote with fee/settlement, server-side verification)
  is implemented and fixture-proven. A live integration swaps the
  observation feed for the processor's API/webhooks and registers real
  processor credentials per merchant — no contract change expected.
- **Live card processing.** Still test-mode evidence only (standing
  posture; no live merchant accounts exist).

## Named build remainders

- **PayPal / wallet / stablecoin rails.** The presentation layer already
  names PayPal when a wallet capability exists, and the family enum
  covers wallets, bank debit, BNPL, and more — but no such **rail** is
  implemented. PYUSD follows the shop R&D order (after BTC): Solana Pay
  sovereign route or PayPal Pay with Crypto; PYUSD is issuer-freezable
  and must never be marketed as sovereign.
- **Listing-projection backfill.** Products written before this slice
  carry null `minPriceMinor`/`priceCurrency`/`anyAvailable` until their
  next save, so price/availability filters can miss them. A one-off
  backfill (re-save pass over published products) belongs with RC3-23
  ops/gaps or as a small standalone fix on the owner's word.
- **Cart drawer.** The inline add-to-cart confirmation stands; a
  slide-over mini-cart was not built.
- **Gallery zoom/lightbox.** The product gallery has thumbnails and a
  selected main image; click-to-zoom/lightbox was not built.
- **Small UX remainders from the audits:** promotion expiry shown on the
  applied-code chip; a reservation-hold line in the proposal review
  ("items held until …"); a proposal idempotency key (structural
  double-submit protection exists and is proven; key-based replay is
  not); per-kind purchase controls beyond the current set (POD
  production notice, digital delivery terms, subscription trial/cancel
  surfacing from the plan contract); POD/dropship availability staleness
  surfaced from their stored snapshots; entitlement names/status in the
  order view (downloads are surfaced; membership detail lives in member
  billing); a customer return-request entry point (refunds are
  operator-side today); digital-only carts receive no tax calculation
  (pre-existing behavior — tax runs inside the shippable branch).
- **Hundred-product fixture** for matrix case 2, and a mid-payment
  restart drill for case 20, if the owner wants those cases at full
  PASS.

## Verification that belongs to CI

- Production build (this rig cannot complete it — standing limitation;
  GitHub CI is the arbiter) and the browser journeys, including the
  rc1 commerce harnesses, keyboard journey, and rendered theme-switch
  confirmation for the new builder blocks.
