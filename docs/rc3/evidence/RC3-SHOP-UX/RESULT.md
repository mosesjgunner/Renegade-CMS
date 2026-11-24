# RC3-SHOP-UX Result — Slice 3 (Passes 01–09 remainders) and the RC3-20 verdict

_Final slice of RC3-20. Slices 1 (working shop journey) and 2 (adapter
engine) are recorded in `docs/rc3/evidence/RC3-20/RESULT-SHOP.md` and
`RESULT-ADAPTERS.md`. This slice's baseline: `BASELINE.md` in this
directory; implementation detail: `IMPLEMENTATION.md`; the 20-case
matrix: `TEST-MATRIX.md`; remainders: `NEXT.md`._

- **Base:** `0bb627e` (fresh GitHub main, merge of PR #146; re-fetched
  before the gauntlet — main had not moved)
- **Branch:** `rc3-20-ux` (local only — not pushed, no PR; the lead
  delivers)

## Verdict per pass

| Pass                           | Verdict | One-line basis                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01 Storefront depth            | PASS    | Filters (category/price/availability/featured), 5 sorts, category nav, featured rail, small-catalog gating, canonical listing — proven by journey test on the hook-maintained projection. Attribute filtering is in-memory over the site-scoped set with a labeled 1,000-scan cap (see TEST-MATRIX case 2 for the related PARTIAL).                                                  |
| 02 Product pages               | PASS    | Accessible gallery with thumbnails, per-dimension variant selectors, exponent-correct money everywhere (the hardcoded `$`/`/100` defects are gone), related products from real catalog relationships, delivery/returns policy visibility. Zoom/lightbox named in NEXT.md.                                                                                                            |
| 03 Cart depth                  | PASS    | Audit-verified as already true (guest→member merge, reconciliation notes, promotions, recovery, in-cart variant change); not rebuilt. Drawer + two display remainders named in NEXT.md.                                                                                                                                                                                              |
| 04 Checkout depth              | PASS    | Explicit per-group shipping-method selection with re-quote; merchant-configured shipping and tax (merchant rates first, labeled, fail-closed preserved); consent policy versions recorded — slice 1's named PARTIAL is closed; country selects replace ISO text inputs; double-submit protection verified (existing structural design).                                              |
| 05 Payment selection           | PASS    | Presentation layer (recognizable methods, custody explained, never adapter keys); **$10 BTC journey proven in both custody modes** with frozen quotes, fee/settlement disclosure, and the expired/partial/duplicate/switching negatives. PayPal/wallet/stablecoin **rails**: NOT STARTED (no rail exists; presentation already names PayPal when a wallet capability is configured). |
| 06 Order center                | PASS    | Itemized receipt rendered, buyer-word timeline, fulfillment groups + shipment tracking from canonical records, member order history, and the guest-crypto access gap fixed (crypto initiate now issues the possession-verified order cookie). Entitlement naming and a return-request entry point are named remainders.                                                              |
| 07 Builder commerce components | PASS    | All eight blocks registered, references-only props (unit-proven: no price/inventory can live in layout JSON), live catalog reads at render. Rendered-browser confirmation belongs to CI.                                                                                                                                                                                             |
| 08 Accessibility / performance | PARTIAL | Native controls, labels, radio-group legends, live regions throughout the new surfaces — verified by construction. Browser/WCAG execution and any field metrics belong to CI; no VPS envelope is claimed.                                                                                                                                                                            |
| 09 Evidence + verdict          | PASS    | The 20-case matrix was run as far as this rig honestly allows: 13 PASS, 5 PARTIAL, 2 PASS at fixture/contract-stub class with live legs explicitly NOT RUN (cases 10–11), 0 FAIL. Full gauntlet below.                                                                                                                                                                               |

## RC3-20 overall verdict: CONDITIONAL GO

All three slices are complete. The working shop journey (slice 1), the
adapter engine (slice 2), and the SHOP-UX depth pass (this slice) are
implemented and proven at the strongest evidence level this rig supports:
production code paths against a real database, with every mocked or
stubbed element labeled as such. No requirement in Passes 01–09 is left
silently unbuilt — the remainders are named in NEXT.md.

Conditions:

1. **GitHub CI must go green on the delivery PR**, including the
   production build (this rig cannot complete it — standing limitation)
   and the browser journeys. Local evidence cannot substitute for that
   leg by the project's own rules.
2. **Live-provider legs stay owner-authorized future work**, as they
   were scoped from the start: a live BTCPay instance, a live custodial
   processor integration, and live card processing. RC3-20's gate was
   sandbox/contract evidence; none of these block it, and none are
   claimed.

Not NO-GO: nothing in scope failed. The one defect this slice's own
testing surfaced in pre-existing code — guest crypto buyers never
receiving the order-access cookie — was fixed in-slice and is covered by
the Pass 05/06 journey test.

## Gauntlet (CI order, final tree, local PG16 rig)

| Stage             | Result                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh migrations  | EXIT 0 — 177 migrations (176 base + `20261124_120000_rc320_shop_ux_listing`), applied twice idempotently by the acceptance script                   |
| Seed              | EXIT 0 (`ALLOW_FIXTURE_SEED=true`)                                                                                                                  |
| Upgrade rehearsal | EXIT 0 — "Upgrade rehearsal passed: 20260914_110000_med_05_video_workflow -> current"                                                               |
| format:check      | EXIT 0 (repo-wide, pinned prettier)                                                                                                                 |
| Lint              | EXIT 0                                                                                                                                              |
| Typecheck         | EXIT 0                                                                                                                                              |
| Unit              | **367 files / 2,953 tests, 0 failed** (slice-2 baseline 2,928; delta = exactly the 25 new tests)                                                    |
| Integration       | **681 passed / 11 skipped / 0 failed** (123 files: 119 passed, 4 skipped) — includes the 5 new SHOP-UX journey tests, each also verified standalone |

Full logs: `rc320-ux-*` in `~/workspace/rc3-wave3-logs/`.

**Environment note:** the VM was replaced mid-gauntlet (the first full
integration run was SIGTERM'd at ~33 files with no failures observed).
PostgreSQL was reinstalled and both databases recreated and re-baselined
(fresh + seed + upgrade all re-run green) before the integration suite
was re-run from the top; the numbers above are from that complete run.
The production build was not attempted (rig-blocked; CI is the arbiter).

## Ledger updates (this delivery)

- #46 E-commerce engine — stays E2; note now cites the RC3-20 evidence.
- #47 Payment gateway system — stays E2 (Renegade-side contract); note
  extended for the Pass 05 presentation layer + custodial registration.
- #53 Simple Crypto Pay — **E1 → E2**: both custody modes journey-proven
  in sandbox/fixture evidence class; live legs recorded as NOT RUN in
  the row itself.
- All other commerce rows unchanged — the evidence does not support
  moving them.
