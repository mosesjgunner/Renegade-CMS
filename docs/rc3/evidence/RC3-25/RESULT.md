# RC3-25 — Exit review — RESULT

**Verdict: CONDITIONAL GO — the RC3 chapter closes.** The frozen
candidate (`fee7060`, see RC3-24) is verified, CI-green, and
upgrade-proven from the previous release. The conditions are not
defects: they are the five owner calls Matthew has not yet made
and the sub-E3 remainder that RC4's charter — all 90 areas to
evidence-backed E3, no exclusions — exists to own. Every one of
them is named below, in the open, with its bounded follow-up. No
fake success: nothing in this review upgrades a level on
inference, decides an owner call by proxy, or claims a live leg
that was not run.

**Baseline:** RC3-23's ledger audit (the last full reconciliation)
updated for the four passes that landed after it — RC3-CE
(PR #151), RC3-YT (PR #152), RC3-TT (PR #153), RC3-SOC (PR #154) —
and for the freeze itself. Freeze verification: RC3-24
(gauntlet green at the candidate baseline; rc2.1 → candidate
upgrade rehearsal PASS at 180 migrations, zero data loss).

## The 90 areas at exit

Distribution, recounted from the ledger rows at the freeze
(`docs/rc3/RC3-90-AREA-LEDGER.md` / `.csv`):

| Level        | Count               | Rows                                                                                                |
| ------------ | ------------------- | --------------------------------------------------------------------------------------------------- |
| E3           | 4                   | #79, #82, #83, #89                                                                                  |
| E2           | 61 whole, 4 in part | in part: #16, #59, #68, #74                                                                         |
| E1           | 15 whole, 2 in part | whole: #11, #15, #20, #21, #25, #39, #51, #60, #63, #64, #66, #70, #75, #87, #88; in part: #59, #68 |
| E0           | 5                   | #52, #54, #55, #56, #78                                                                             |
| NOT VERIFIED | 1                   | #10                                                                                                 |
| E4           | 0                   | —                                                                                                   |

**The distribution is unchanged from RC3-23's count.** The four
post-RC3-23 passes deepened rows already at E2 and moved no row's
level — verified programmatically at the freeze (no level cell in
the ledger differs from RC3-23's reconciliation; only the eight
annotated rows below differ at all):

- **#26 Social Media Studio / #27 Social queue** — RC3-YT built
  YouTube publish-out (per-creator upload-scope connect;
  receipts only on YouTube-confirmed processing; quota honesty;
  live leg NOT RUN). RC3-TT gave TikTok a receipt gate (published
  only on TikTok-confirmed SUCCESS; URL only from a real post
  ID). RC3-SOC receipt-audited the remaining adapters and fixed
  five (Discord, Facebook, Instagram, Threads, LinkedIn). All
  twelve adapters are now receipt-honest; all proof is against
  platform stand-ins/mocks, and live delivery to real networks
  remains NOT VERIFIED. Levels stand at E2.
- **#46 E-commerce engine / #48 Subscriptions & memberships /
  #49 Donations & crowdfunding / #50 Affiliate marketing** —
  RC3-CE built the Creator Earnings Engine over these rails: one
  Earn Center, statements that separate native collected,
  affiliate-owed and external-reported money and never sum them.
  Memberships and tips rails PASS in sandbox (CE-T02/T03:
  settled money lands exactly once under signed-webhook replay;
  executed refunds/disputes move the statement exactly).
  Affiliates are built at adapter level (Awin/CJ/impact.com/
  Amazon report translators, fixture-tested; live network reads
  disabled by construction; payout execution unproven) — #50's
  provider mode is corrected in the ledger from contracts-only
  to adapter-level. Levels stand at E2.
- **#78 Managed hosting** — stays E0; its row now records the
  owner's decision (below).
- **#90 Unified CMoS coordination** — the fourth journey leg
  (RC3-24 freeze) has run; the row's RC3 proof shape is complete.
  Level stands at E2.

Per-system picture at exit: Publishing (#1–7) and Distribution
(#26–33) and Analytics (#34–36) stand uniformly at E2.
Presentation (#8–11) carries #10 NOT VERIFIED and #11 E1. Media
(#12–18) carries #15 E1. Editorial (#19–25) carries #20, #21,
#25 at E1. Community (#37–45) carries #39 E1. Commerce (#46–56)
carries #51 E1 and the four E0 rows #52, #54, #55, #56. AI
(#57–61) carries #60 E1. Identity (#62–68) carries #63, #64, #66
at E1. Network (#69–75) carries #70 and #75 at E1, with #69 at E2
as a local-peer bounded demo (public interop NOT VERIFIED).
Operations (#76–90) carries the chapter's four E3 rows, #87 and
#88 at E1, and #78 at E0.

## The RC3 gate verdict

Against the governing plan's gate — every applicable item ≥ E1,
each family ≥ E2, federation #69 proven by a real narrow sandbox
demo or the gate fails openly:

- **#69's hard gate is met honestly**: the narrow sandbox demo
  exists and is green (RC3-22); public interop is labeled NOT
  VERIFIED, here and in the ledger.
- **#78 managed hosting is the gate's one openly-named E0
  exception** — it was E0 because the decision was the owner's,
  not engineering's, and the decision has now been given
  (below). It does not silently pass; it is named.
- The rest of the sub-E1 remainder is named, not hidden: #52,
  #54, #55, #56 at E0 (grep-verified in RC3-23: no such code
  exists; no silent demo was built) and #10 at NOT VERIFIED (its
  deciding conversion journey has never been run). The fifteen
  E1 rows sit at the gate minimum with their residuals recorded
  in their ledger rows. Owner-scoped exclusions (#64's full
  enterprise-SSO program, #71's full shared-runtime
  multi-tenancy — both 1.5+/2.0 scope) are excluded by the plan
  itself and say so in their rows.
- Every other applicable row stands at E2 or E3.

RC3 therefore closes with its gate posture stated exactly: the
breadth is real, the exceptions are named, and the remainder is
RC4's charter, not a footnote.

## The decisions packet — outcome

Collected Nov 26, 2026 so the owner answers once, in one place
(`files/rc3-wave4-exit-review-decisions-2026-11-26.md`, goal
workspace):

1. **Managed hosting (#78) — DECIDED Nov 27, 2026 (Matthew):
   build it HALFWAY in RC4.** His words: "Managed hosting can be
   built out by .5 — how about we make it half way there for
   now," with the halfway line at Harbor's framing ("whatever is
   half done to you or so"): the operated basics Renegade itself
   would run for its own hosted customers — provisioning a site,
   pushing updates, backups/restore — proven end to end; NOT yet
   the full commercial apparatus (partner/agency licensing
   enforcement, resale/white-label machinery, fleet-scale
   tooling, polished self-serve signup/billing), which stays
   queued after the halfway line in importance order. License
   model unchanged (adopted Nov 20, 2026).
2. **Neo4j — keep or cut: OPEN.** Carried to the RC4 charter as
   the owner's architecture call. It sits outside the 90
   (supplementary ledger row, E0: no projection demo was built).
3. **Grammar engine for RC4 (#7): OPEN.** Fully measured
   Nov 26, 2026: Harper as shipped scores 49% overall (strong on
   spelling/mechanics, 0/24 on verb agreement); LanguageTool
   self-hosted 57%, with its data pack 61%; the best shippable
   combination (Harper built-in + LanguageTool-with-data as an
   optional deeper pass) reaches 69% and still misses most verb
   agreement, with doubled false alarms and a heavy Java service
   that can only ever be optional, never the Lean default. No
   measured candidate clears the owner's enterprise-class bar.
   His call: accept the combo shape for RC4, or hold grammar's
   top level for something better. #7 stands at E2 meanwhile.
4. **Import name-collision behavior (#80): OPEN.** The RC3-23
   finding stands: merging an import into an existing site whose
   publication slug collides fails that publication and cascades
   raw foreign-key errors to its dependents. The policy (rename,
   skip-with-reason, or fail-fast before writing) is the owner's
   scope decision, carried to RC4.
5. **Member-standing enforcement flip: OPEN.** Model C (one
   identity, per-site standing) was decided Nov 12, 2026;
   posting gates are NOT yet enforced — measured behavior is
   still installation-wide. Flipping enforcement is the owner's
   call, carried to RC4.
6. **Federation (#69) public interop: carried labeled NOT
   VERIFIED.** The exit report labels it exactly that; a public
   leg is an RC4 proof obligation, not an RC3 claim.

## Blocked live legs (platform/account gates — not code)

- **YouTube real upload**: needs the operator's own YouTube
  channel + a Google Cloud OAuth app in production status,
  supplied as operator env. Built to the gate; not run.
- **TikTok posting at scale**: needs TikTok's own app approval
  (Direct Post audit). The adapter's receipt honesty is fixed;
  the platform gate is TikTok's.
- **Creator Earnings live-money legs**: real payment processing,
  live affiliate network APIs, sponsorship marketplaces,
  AdSense/GAM, dynamic ad insertion — all built to the gate and
  labeled blocked pending the owner's authorization and
  credentials. The CE-T32 real-creator pilot is blocked (no
  authorized independent creator).
- **Podcast directory legs (POD-RC-01)**: Apple and Spotify
  accounts do not yet exist (decided Nov 21, 2026: "we will
  create them"); the owner's old show is the designated test
  show once they do.
- **Podcaster audio**: the owner's listen-check on the graded
  audio pack (delivered Nov 24, 2026) is the open acceptance
  input; his ears are the bar.

## Honest limits, carried verbatim

- F-02 recurring checkout not executable in the sandbox.
- POD emulator-proven; live Printful unavailable by design.
- No hosted AI provider verified.
- #70 cross-install networking at E1 locally (RC3-22).
- #69 public interop NOT VERIFIED (above).
- Creator Studio tenant-isolation dynamic proof (portfolios +
  capture/editor legs) is still missing — a separate named debt,
  not absorbed by any RC3 pass; it feeds RC4.
- Live one-command Compose bring-up (#77 residual): NOT RUN in
  RC3 — no Docker daemon on the verification rig; the E2 stands
  on RC3-04's separate Docker measurement plus RC3-23's
  structural audit. A live bring-up on a Docker-capable rig is
  an RC4 proof obligation.

## Named RC4 input from the social pass

RC3-SOC fixed the five audited receipt defects and documented a
lesser honesty gap it deliberately left out of scope: post-send
exception paths in Facebook/Instagram/Threads/LinkedIn (and
Discord's publish path) still map a network exception after the
send to `failed`/`transient` rather than `unknown` — the post may
in fact have landed. Recorded here as a named RC4 input
(evidence: `docs/rc3/evidence/RC3-SOC/RESULT.md`).

## What RC4 inherits

- **The gate**: all 90 areas at evidence-backed E3, no
  exclusions — including the hard rows RC3 named at E0/E1/NOT
  VERIFIED, the tenant-isolation dynamic proof, and the public
  federation leg.
- **The decided build**: managed hosting, halfway (#78, above).
- **The five open owner calls** (above), by name.
- **The R&D shelf required before or by 1.0** (owner's word,
  Nov 24, 2026): SHOP-UX depth, the Business Engine, Creator
  Earnings depth, and Mainstream Monetization Providers —
  shelf pieces outside the 90 (Earn Center depth, sponsorship
  agency, opportunity finder) reconcile as their own tracked
  commitments at the RC4 charter pass.
- **The podcaster build delivery**, queued behind breadth
  (local branch, never pushed; POD-RC-01 verdict HOLD), plus
  the deferred podcast slices of RC3-12/13/14 and RC3-10/11.
- **Named residuals**: the #77 live Compose bring-up, a fresh
  runtime-envelope measurement (#88; the RC2-H-06 envelope —
  Lean fits under a hard 1 GB cap as a stress fixture, not a
  recommendation; Standard ~929 MB peak at 2 GB; the owner's own
  server is 6–8 GB — remains the latest measured envelope), the
  SOC exception-path gap (above), and #80's collision policy
  (owner call #4).

## Verification summary

Freeze verification is RC3-24's record: CI-order gauntlet on the
frozen tree — fresh migrations (180) / seed / upgrade migrations
PASS; format, lint, typecheck PASS; unit 3,043 passed / 0 failed;
integration 739 passed / 10 skipped / 0 failed — and the
freeze-time upgrade rehearsal (rc2.1 → candidate: 24 migrations
applied, zero data loss across a 92-field manifest diff, planted
pending job completed exactly once). The production build is
rig-blocked locally (OOM at the documented rig limit) and stands
proven by the candidate's own GitHub CI run (45978809034,
completed success on `fee7060`). One VM replacement struck
mid-pass; recovery and the rehearsal re-run are documented in
RC3-24. No product code changed in this pass — evidence and
ledger only.
