# RC3-CE — Creator Earnings Engine: result

Base: GitHub main `4d115d245981c58dd1f89adff157a11f642707a6` (post
PR #150). Branch: `rc3-ce` (local only; delivery is Harbor's step).
Contract: `rc3-ce-creator-earnings-pass-2026-11-24.md`. Audit:
`BASELINE.md` / `GAP_MATRIX.md` / `PROVIDER_MATRIX.md` in this
directory. Blocked rails and product gaps: `KNOWN_GAPS.md`.

## What shipped

One Earn Center over all nine creator earnings rails, on one
migration, one module (`monetization`), 15 collections, a
code-defined 57-entry provider catalog (0 live-verified, 0
native-verified — stated, not implied), four pure cores with unit
coverage (money, CSV import, statements, sponsorship/rights/ads/
co-promotion/distribution logic), a service layer, operator-gated
site-scoped API routes, and an Earn Center console page.

Money honesty is structural: native collected, affiliate-owed and
external-reported money are separate statement sections and are
never summed; unknown fees stay unknown (net is labeled "net before
unknown fees"); an invoice is never a collection; clicks never
become revenue; secrets are secret-manager references only and raw
credential fields are refused at the service boundary.

## Per-stage outcomes

| Stage                          | Outcome                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CE-00 audit                    | DONE — BASELINE.md/GAP_MATRIX.md/PROVIDER_MATRIX.md from first-hand inspection of current main; baselines re-run clean (unit 2,983/0; integration 716 pass/11 skip/0 fail).       |
| CE-01 Earn Center + statements | DONE — profile, connections, statement assembly (collected/refunds/disputes from their single sources), CSV export with formula-injection escaping.                               |
| CE-02 services & booking       | DONE — `service` product kind, service slots, atomic capacity via conditional update inside a pool transaction (race-proven).                                                     |
| CE-03 profile/offers           | DONE — MonetizationProfile + CreatorOffer kinds extended (`service`, `license`); catalog routes descriptive only.                                                                 |
| CE-04 connections & import     | DONE — connection rules (no raw secrets, no fake "connected"), preview/commit import with duplicate/conflict classification; retries insert nothing twice.                        |
| CE-05 affiliate networks       | DONE at adapter level — Awin/CJ/impact.com/Amazon report translators, fixture-tested; live reads disabled by construction (`liveReadEnabled` cannot be set).                      |
| CE-06 sponsorships             | DONE — advertisers, inventory, booking state machine, IO versioning on material change, overlap conflicts, explicit collection recording.                                         |
| CE-07 representation           | DONE — default-off agreements; fee computed only on covered, non-carved-out, actually-collected revenue at collection time.                                                       |
| CE-08 first-party ads          | DONE — placements (direct-sold > provider-tag > house), paid-content/category/consent/cap rules, delivery records, ads.txt from connected relationships only.                     |
| CE-09 podcast ads              | DONE at machinery level — host-read deals ride CE-06 with versioned creative + proof (CE-T17); private feeds re-proven at suite level. DAI: HOLD (no authorized partner).         |
| CE-10 licensing/rights         | DONE — rights registry with validator gates, license offers/grants, immutable terms snapshots (AI/TDM separate opt-in, default off), one-time delivery tokens (hash stored only). |
| CE-11 distribution & fail-safe | DONE — package manifests with checksums, submission records, exclusivity guard; provider-outage isolation journey-proven. External submission legs external-only.                 |
| CE-12 co-promotion             | DONE — opt-in-only cross-site discovery with explainable ranking.                                                                                                                 |
| CE-13 hardening                | DONE — upgrade rehearsal passed; full gauntlet below; this document + KNOWN_GAPS.md. CE-T32 pilot BLOCKED (no authorized independent creator).                                    |

## CE-T journey results (17 integration tests, 4 files, all green)

- `rc3ce-earn-core` (4/4): CE-T01 profile/route auth + site scoping;
  CE-T02 tip settled through the production signed-webhook path
  lands in the statement exactly once under replay, unknown fees
  labeled; CE-T03 executed refunds/open disputes move the statement
  exactly; CE-T04/T05 slot capacity atomic under parallel claims,
  cancel releases.
- `rc3ce-import` (3/3): CE-T09/T11/T23 preview writes nothing,
  commit durable, repeat import inserts 0, changed row = conflict
  (never overwritten), imports land only in external-reported;
  CE-T31 formula-shaped provider id escaped in CSV export;
  CE-T08/T10 adapter rows keep provider-original states, raw-secret
  and fake-connected connections refused.
- `rc3ce-sponsorship` (4/4): CE-T12 lifecycle with invoice ≠
  collection; CE-T13 overlap 409 + IO-2 re-versioning on material
  change; CE-T14 representation fee on covered collections only;
  CE-T17 podcast host-read with creative + proof.
- `rc3ce-ads-rights` (6/6): CE-T15 placement priority/paid-content/
  frequency caps + delivery records; CE-T16 ads.txt only from
  connected relationships; CE-T19 licensing gates, paid-order-only
  grants, one-time delivery, snapshot survives offer withdrawal;
  CE-T20 distribution checksum record; CE-T24/T26 opt-in-only
  co-promotion discovery; CE-T25/T27 provider-outage isolation.

Remaining journeys: CE-T06/T07 are re-proofs of RC3-20 shop/podcast
suites (run in the full integration gauntlet); CE-T18 DAI = HOLD;
CE-T21/T22 sandbox bounds are catalog/unit-level honesty assertions
(BTCPay stand-in caveat carried verbatim); CE-T28/T29 are the
service-level halves of CE-T09; CE-T30 upgrade rehearsal PASSED
(20260914 baseline → current, 180 migrations); CE-T32 BLOCKED.

## Gauntlet (CI order, final tree)

- Fresh migrations: PASS (180 migrations, applied twice by the
  verifier).
- Upgrade migrations: PASS (CE-T30).
- format:check: PASS (repo-wide, after prettier on the 36 new CE
  files).
- lint: PASS (eslint --max-warnings=0).
- typecheck: PASS.
- Unit: PASS — 373 files, 3,011 passed / 0 failed.
- Integration: PASS — 131 files passed / 4 skipped; 733 passed /
  11 skipped / 0 failed (744 total), including the 17 CE journeys
  and the RC3-20 shop/podcast re-proof suites (CE-T06/T07).
- Production build + smoke: RIG-BLOCKED — the local build was
  OOM-killed during "Creating an optimized production build" on
  this ~6 GB VM (3 OOM kills, log
  `rc3ce-gauntlet-build.log`). Not retried per the pass rules;
  GitHub CI is the build arbiter, as in prior Wave 3 passes.

Baselines (RC3-23): unit 2,983 passed / 0 failed; integration 717
passed / 10 skipped / 0 failed (727 total); 179 migrations.
Deltas at exit: migrations 179 → 180 (+1 CE); unit 2,983 → 3,011
(+28 CE tests, 0 regressions); integration — against this session's
own re-run baseline on this rig (716 passed / 11 skipped / 727
total, see BASELINE.md) the delta is exactly +17 passed (the CE
journeys), +0 skipped, 0 failed. Against RC3-23's recorded numbers
that reads as +16 passed / +1 skipped: the one pass→skip delta is
the environment-gated test family already documented at baseline,
not a CE regression.

Two counting tests were updated in-pass per the
registration-expectation rule: the optional-module list (17 → 18
with `monetization`) and the payload-domain collection list
(+15 CE collections).

## R1–R9 capability verdicts (§10.2)

| Rail                | Verdict                                           | Evidence level                                                                                                           |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| R1 Memberships      | PASS (sandbox)                                    | RC3-20/21 suites + CE statement re-proof (CE-T02/T03); live processor leg HOLD (no credentials).                         |
| R2 Digital products | PASS (sandbox)                                    | RC3-20 delivery journeys in the full gauntlet.                                                                           |
| R3 Tips/support     | PASS (sandbox)                                    | CE-T02 settled through the production signed-webhook path.                                                               |
| R4 Services/events  | PASS (first-party)                                | CE-T01/T04/T05 — new booking machinery, atomic capacity race-proven.                                                     |
| R5 Shop/POD         | PASS (emulator/sandbox)                           | RC3-20 journeys; live fulfillment HOLD. BTCPay: stand-in proof only, never a live claim.                                 |
| R6 Affiliates       | PASS (first-party + adapter level)                | CE-T08/T09/T10/T11/T23/T31; all live network APIs HOLD (no per-seller credentials; live reads disabled by construction). |
| R7 Sponsorships     | PASS (first-party)                                | CE-T12/T13/T14/T17; marketplace legs (Passionfroot/Paved/etc.) HOLD.                                                     |
| R8 Advertising      | PASS (first-party) / HOLD (networks)              | CE-T15/T16 first-party placements + ads.txt; AdSense/GAM live HOLD. DAI HOLD (no authorized partner).                    |
| R9 Licensing/rights | PASS (first-party) / external-only (distribution) | CE-T19/T20; stock-site submission itself happens outside Renegade.                                                       |

Provider catalog: 57 entries — 0 live-verified, 0 native-verified;
the rest are adapter-level (4 fixture-tested report translators),
connection/import-level, or external-only/blocked, counted by mode
in PROVIDER_MATRIX.md. A catalog entry is never an integration
claim.

## Exit verdict (§10.2)

**Parent: CONDITIONAL GO.** The safe first-party scope passes in
full (all CE journeys, the complete gauntlet, upgrade rehearsal);
every provider-dependent capability remains HOLD, is labeled as
such in the catalog and the Earn Center, and is not marketed as
active; exclusions and fallbacks are documented in KNOWN_GAPS.md.
No unresolved safety or regression defects; no mandatory core
journey failed. Conditions are exactly the blocked rails: live
payment processing, live affiliate APIs, sponsorship marketplaces,
ad networks, DAI, and the CE-T32 real pilot each require Matthew's
explicit authorization (credentials/agreements/a real creator)
before their live legs can run. The production build is
rig-blocked locally and must be proven by CI at delivery.
