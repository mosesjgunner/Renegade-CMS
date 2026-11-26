# RC3-CE — Build Plan (from CE-00)

Parent pass on branch `rc3-ce`, one combined delivery. Stages run in
contract dependency order; each stage ends with focused tests green +
a progress note. Money/access invariants (contract §1, §7) bind every
stage: server-side site scope on every action, integer minor units,
append-only corrections, collected ≠ booked ≠ estimated, no secret
ever leaves a reference, no live external action without credentials
we do not have (all live legs disabled at the gate).

## Shared foundation (built once, CE-01/02)

- `src/collections/Monetization.ts` — the 15 additive collections
  (the CE-00 list of 13, plus `service-slots` — seat capacity needs an
  authoritative home of its own — and `ad-deliveries` — first-party
  delivery records behind frequency caps and sponsor proof)
  (GAP_MATRIX list), all site-scoped with the commerce owner-fields
  pattern and scoped uniqueness.
- `src/modules/monetization/` — services (profiles, offers, bookings,
  statements, catalog, connections, imports, sponsorships,
  representation, advertising, rights, licensing, distribution),
  `payload-domain.ts` registrar, pure money/state helpers.
- One migration (all CE tables + `products.kind` enum additions
  `service`/`license`), registered last in `src/migrations/index.ts`.
- `payload-types.ts` regenerated if the diff stays confined to CE
  additions; otherwise hand-extended in generated style (RC3-20
  precedent) with the reason recorded.
- Module registry: new `monetization` module claiming the 15 slugs,
  honest provider-boundary claim; every counting expectation updated
  in the same commit (module-registry, release-inventory,
  production-module-config, module-profiles tests re-run).
- Admin API: `src/app/(frontend)/api/admin/earn/*` (operator-grant
  authorized, site-scoped) + public sponsor/ads.txt/distribution
  routes where the contract requires them.
- Admin UI: `src/app/(frontend)/admin/earn/page.tsx` following the
  existing admin commerce page pattern — working controls only;
  unavailable capabilities render an explicit reason + fallback.

## Stage map

| Stage | Build                                                                                                                                                                                                                                                                                                             | Journeys                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| CE-01 | Re-prove merchant/settlement/entitlement integrity under CE negatives (wrong merchant, wrong site, replay/out-of-order, refund/dispute/grace); record seller-of-record modes on the monetization profile; fee config truth (unknown fees stay null)                                                               | T02, T03, T21, T22 (commerce legs)  |
| CE-02 | Monetization profile + Earn Center (overview/get-started/offers) + typed offers over canonical products; **service bookings with atomic capacity** (the R4 gap); first-dollar journeys for membership/digital/support/service/physical                                                                            | T01, T02–T07                        |
| CE-03 | Statement service + Earn statements view + CSV export: native collected (orders/payments/refunds/disputes by state) vs affiliate liabilities vs external evidence, per currency, never summed across sources; fee waterfall with unknowns null; expected-value fixtures                                           | T28, T09 (statement legs), T29      |
| CE-04 | Provider catalog (code-defined, all PROVIDER_MATRIX rows), connections (BYO secret references, five status dimensions kept distinct), generic mapping import pipeline + sync checkpoint records + a reconciliation task                                                                                           | T09, T11, T23, T31 (import legs)    |
| CE-05 | Affiliate depth on existing contracts: 12D re-run, disclosure/consent + redirect-safety negatives, Sub-ID templates (existing), network adapter handlers (Amazon Creators, impact, Awin, CJ) as mock-tested capability modules behind connections — live calls disabled without a connected account               | T08, T10, T11                       |
| CE-06 | Sponsorships: advertiser records, inventory + rate card, public inquiry, conflict-aware atomic reservations, versioned IO + approvals, proof, invoice vs collection as separate states, makegood/cancel/refund branches, media kit from measured audience data with source/period labels                          | T12, T13                            |
| CE-07 | Representation agreements (default off, versioned, carveouts/exclusions, revocation preserves history, blocks future bookings), fee allocation only on covered collected revenue, scoped sales role; marketplace channels stay catalog/external                                                                   | T14                                 |
| CE-08 | First-party ad placements (house + direct-sold), scheduling/caps/category exclusions, paid-content exclusion default, consent gate, no-fill fallback, per-site `/ads.txt` from approved relationships; newsletter sponsor blocks reuse CE-06 bookings; video sponsor placement records (static, creator-produced) | T15, T16                            |
| CE-09 | Podcast host-read placements in Podcast Studio riding CE-06 bookings + versioned proof + promo codes; private-feed entitlement/Range/GUID/revoke re-proof. **DAI: HOLD** (no authorized partner) — no VAST-in-RSS toggle is built                                                                                 | T17 (T18 HOLD)                      |
| CE-10 | Rights records + validator (missing releases / expired / exclusive conflicts block grants), license offers (product kind `license`), checkout → immutable grant with agreement version + fingerprint, bounded delivery, withdrawal preserves completed contracts, AI/TDM opt-in separate and default-off          | T19                                 |
| CE-11 | Distribution submissions + rights-metadata feed/export, Adobe Stock metadata CSV export, external royalty evidence via CE-04 import, Patreon/Ko-fi fail-safe external membership records (no inferred access)                                                                                                     | T20, T25                            |
| CE-12 | Catalog co-promotion: opt-in offer listings on Creator Catalog, canonical links, disclosure, opt-out + revocation/cache behavior, two-site isolation, multi-show scoped Earn views; 10-show fixture benchmark (bounded, measured, labeled fixture)                                                                | T24, T26 (fixture leg)              |
| CE-13 | Full gauntlet (CI order), upgrade rehearsal incl. new migration, outage-isolation proof (provider sync failure leaves publishing/checkout/auth intact — by construction + test), KNOWN_GAPS, RESULT with §10.2 verdict                                                                                            | T26, T27, T30, T32 (blocked, named) |

## Test strategy

- Unit tests for every pure service (money math, state machines,
  import mapping/dedupe, waterfall, validator, ads.txt rendering,
  fee allocation rounding).
- Integration journeys at the route/service layer on the release DB,
  following the RC3-20 pattern (real route handlers, deterministic
  provider settling through the production signed-webhook path,
  durable-state assertions, two-site negatives). Browser journeys
  remain CI's province on this rig (standing limit, named in RESULT).
- Existing suites are the regression floor: baselines unit 2,983 /
  integration 717 passed + 10 skipped (RC3-23) — re-measured at CE-00
  on this exact tree before changes.
