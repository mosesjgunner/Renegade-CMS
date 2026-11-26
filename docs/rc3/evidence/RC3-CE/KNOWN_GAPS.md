# RC3-CE — Known gaps (honest bounds)

Every item here is a named limitation of the CE pass, not a hidden
defect. Blocked rails follow the contract's blocked-rail rule: built
to the gate, labeled, live action disabled, no fake pass.

## Blocked rails (provider gates — no authorization given)

- **Live payment processing** (Stripe live, PayPal live, BTCPay live,
  PYUSD): no production credentials exist and none were authorized.
  All money movement in this pass is the sandbox/deterministic
  provider family already proven by RC3-20. BTCPay remains proven
  against a faithful local stand-in over real HTTP — **not** a live
  BTCPay Server; the catalog entry carries that caveat verbatim.
- **Live affiliate network APIs** (Awin, CJ, impact.com, Amazon
  Associates, all 17 catalog networks): no per-seller credentials.
  Adapters translate provider report shapes and are fixture-tested;
  `liveReadEnabled` cannot be set by any UI or job in this pass, so
  live reads are disabled everywhere. Imports are manual/CSV/API-
  shaped evidence committed through the same idempotent path.
- **Sponsorship marketplaces** (Passionfroot, Paved, Gumball, Libsyn
  Ads, beehiiv ad network, Kit): accounts/agreements required — the
  first-party sponsorship engine (CE-06) is the shipped rail.
- **Advertising networks** (AdSense, Google Ad Manager live tags,
  IMA): account approval required. First-party placements and
  ads.txt generation ship; no third-party tag is ever injected
  without an explicit per-site connection (no silent ad insertion).
- **Dynamic ad insertion (CE-09, CE-T18): HOLD.** No authorized DAI
  partner; nothing was built beyond the sponsorship/proof machinery
  that a DAI partner would plug into.
- **Stock/licensing distribution submission** (Adobe Stock, Pond5,
  etc.): external-only — packages are prepared locally with checksums
  and recorded; actual submission happens outside Renegade.
- **CE-T32 real pilot: BLOCKED.** No authorized independent creator
  exists for a live pilot. The 10-show fixture benchmark is labeled
  fixture evidence, not a pilot.

## Product gaps carried forward

- **Catalog capability vocabulary predates services.** The commerce
  catalog's capability list (shippable, digital-entitlement,
  subscription, donation, affiliate, pod) has no `bookable`
  capability for the new `service` product kind; service products
  currently ride `shippable` with inert shipping fields. RC4
  candidate: add a bookable capability with its own checkout
  requirements.
- **Provider fees are not recorded on payment intents**, so CE
  statements honestly report provider fees as unknown (net is labeled
  "net before unknown fees") until a rail records per-intent fees.
  Fees are never estimated into the statement.
- **Co-promotion facets** come from sponsor inventory audience
  snapshots; profiles without inventory are not discoverable. That is
  by design for this pass (offers, not profiles, are matched).
- **Podcast private feeds** were re-proven only at suite level
  (existing pod03 tests in the full integration run); no new external
  podcast client leg was run (unchanged from RC3-20's bound).
- **Earn Center UI** is an operator console page (profile, rails,
  connections, three separated money sections, statement CSV,
  ads.txt). It is not a creator-facing public page; creator-facing
  presentation is future work.
- **Opportunity Finder** (contract §6.7) is represented only by
  co-promotion discovery (CE-12). A general opportunity feed needs
  opted-in network data that does not exist yet; not faked.

## Invariants held

- No mandatory cut of self-hosted sales; no license server; no
  silent ad insertion; money reported as collected only — invoices,
  estimates, clicks and impressions are never presented as cash.
- Secrets are secret-manager references only; raw credential fields
  are refused at the service boundary (journey-proven).
- The 90-area ledger was not touched: Earn Center, sponsorship
  representation and co-promotion live outside the 90 areas.
