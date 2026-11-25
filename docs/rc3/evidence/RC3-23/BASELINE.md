# RC3-23 Baseline — Ops + Leftover Gaps

Pass: RC3-23 (Wave 3). Branch base: `7600c48` (main after the RC3-22
merge, PR #149). Rows owned: #77, #78, #80, #83, #85, #86, #89, #90,
plus the leftover-gap sweep across all 90 rows. This baseline was
written from a fresh audit of the current code and the landed passes'
evidence before any change in this pass. **The ledger is not the
baseline**: several landed passes moved rows without updating
`docs/rc3/RC3-90-AREA-LEDGER.md` / `.csv`, so where the ledger and a
landed pass's RESULT disagree, the RESULT is the before-truth and the
ledger is a sweep finding (see "Ledger staleness" below).

## Owned rows — before state

### #77 One-click-style provisioning — E2 (carried)

Two supported one-command shapes exist in the tree: the Compose
appliance (`compose.production.yaml`: postgres → migrate →
renegade-web / renegade-worker / email-account-worker / media-worker /
media-heavy; README's documented bring-up is one
`docker compose ... up --build -d --wait` after copying
`.env.production.example`) and `install.sh`, an 18 KB supported
production bootstrap (PostgreSQL + web + worker) with a one-command
VPS form. **This sandbox has a Docker client (29.1.3) but no daemon**
(`docker ps` cannot connect; no socket), so a live Compose bring-up
cannot execute here — the same constraint RC3-04/RC3-05 recorded.
This pass rehearses everything provable without a daemon (compose
render validation, bootstrap static audit, the non-container install
legs already proven by RC3-06 for #76) and labels the live bring-up
honestly.

### #78 Managed hosting capabilities — E0 (owner decision, does not move)

No managed-hosting capability exists in the code (no provisioning /
tenancy / billing machinery for hosted customers; grep surface is the
working license-model document only). Managed-hosting terms are
Matthew's decision (working license model adopted Nov 20, 2026;
legal drafting is future work on his word, and that word has not been
given for an RC3 build). Per the brief, this row **stays E0** and is
named in the exit picture as this family's one openly-named E0. No
hosting machinery is built in this pass.

### #80 Export & portability — E2 (carried; final confirmation owned here)

Machinery present on current main: `src/modules/portability/
site-export.ts`, the CLI `src/scripts/portability.ts`
(`npm run portability`), and `/api/migration/export`. DEBT-26 closed
in RC2-I-02: the full round trip replayed through the real CLI —
export from a populated instance, import into a fresh target —
**20 records completed, 0 failed** (harness `tests/rc2-h08/`). This
pass owns the final confirmation of that round trip against
post-Wave-3 main (179 migrations, Waves 2–3 schema growth), not a
rebuild.

### #83 Background job engine — E3 (carried from RC2; re-validation owned here)

Postgres durable queues; the worker is `src/scripts/run-jobs-worker.ts`,
which services the queues of every registered Payload job task.
Wave 3 added real load on this engine: commerce tasks
(`commerce-reconcile-payments`, `commerce-process-payment-event`,
`commerce-reconcile-subscriptions`, `commerce-reconcile-referrals`,
`commerce-abandon-checkouts`), the social queue (`social-publish`,
RC3-16), and — by name — **`analytics-retention-cleanup`**, the
retention-purge task RC3-21 found sitting on a queue the worker never
serviced and fixed (the worker now services the `analytics` queue;
purge proven on a real DB in RC3-21 for #68). The E3 claim is carried
from the RC2 audit; this pass re-validates it under the Wave 3 task
set — no new claim without a run.

### #85 System health & diagnostics — E2 (carried)

Health surface present: `/health/live` and `/health/ready` routes
(`src/app/(frontend)/health/`), the admin schedule-health route, and
podcast feed-health. Unit proof exists (`tests/unit/
proxy-health-paths.test.ts`, `tests/unit/readiness-probe.unit.test.ts`).
RC3-06 already fixed the bare-error-page failure when the database is
down. This pass confirms the surface still tells the truth after
Wave 3's changes (readiness reflects migrations + database; liveness
is process-only).

### #86 Unified admin Command Center — E2 (carried; confirm only)

The admin surface on current main is the sectioned operator console
under `src/app/(frontend)/admin/` (audience, catalog, commerce,
fulfillment, operations, social, telemetry, workflow, releases,
migration, email-composer) plus the per-area command centers
(`src/modules/admin/AudienceCommandCenter.tsx`,
`MediaCommandCenter.tsx`, `EditorialWorkflowCenter.tsx`). Confirm
only — no dashboard rebuild is in this pass's scope.

### #89 Development & maintainability — E3 (carried)

Test infrastructure on current main: `.github/workflows/ci.yml`
(the `verify` pipeline: migrations → seed → upgrade → format → lint →
typecheck → unit → integration → build → smoke), the release
verifiers (`scripts/verify-clean-clone.mjs`,
`src/scripts/verify-release.ts`, fresh/upgrade migration verifiers),
and the bundled-ffmpeg machinery that ended the RC2 ffmpeg CI saga
(PRs #109–#111) plus the PR #112 lint repair. This pass owns the final
integrity confirmation for the exit candidate: the gauntlet below is
itself the primary evidence, run on this tree in CI order.

### #90 Unified CMoS coordination — E2 (carried; journey legs confirmed here)

Its RC3 proof shape is the cross-product journey RC3-08 → RC3-09 →
RC3-14 → RC3-24. Legs 08 (WordPress move, PR landed Wave 2), 09 (SEO /
site-quality journey, landed) and 14 (article → campaign repurpose,
DEBT-04 closed, landed) exist on current main. **Leg 24 is the Wave 4
freeze rehearsal, which has not run** — this pass confirms the three
legs that exist and names the fourth honestly; the full journey
cannot be claimed before Wave 4.

## The upgrade rehearsal — before state

RC3-05 rehearsed upgrade-safety and off-host restore on the tagged
RC2 (all legs pass, Nov 20) and stated plainly what remained: the
**true version-to-version upgrade rehearsal** — a real previous-release
instance's on-disk state, migrated forward to the RC3 candidate, data
read back. That is this pass's rehearsal: previous release = tag
`rc2.1` (`577fa38`), target = this branch's base `7600c48`
(post-RC3-22 main — the freeze candidate-so-far; the freeze-time
re-run against the frozen candidate belongs to Wave 4 and is labeled
as such). Method follows the RC3-05 standard: real release code
builds and boots the old instance, real content is seeded on top of
the product seed, an identity manifest is captured, the current
code's migrations are then applied forward to that same database,
and the data is read back through the current code. Sandbox
substitutions (host Postgres 16 vs the Compose topology's PG 17;
no Docker daemon) are named in the result, as RC3-05 named its own.

## Footprint envelope — before state (sources, not new claims)

- RC2-H-06 measured under hard cgroup caps (systemd scopes,
  `MemoryMax`, RSS sampled every 200 ms) against the standard world:
  **Lean under a 1 GB cap FITS** (idle 251 MB, peak 666 MB app;
  ≈789 MB whole stack incl. PostgreSQL) and **Standard under a 2 GB
  cap peaked at 929 MB** (idle 386 MB).
- RC3-04 slimmed the shipped standalone artifact from 1,117.8 MB to
  **283.9 MB** (docs/tests/fixtures pruned at packaging time).
- The history file (`files/memory-footprint-history-2026-11-13.md`)
  and Matthew's standing position: the 1 GB figure was an early
  Lean **stress-test fixture, not a deployment recommendation** —
  the practical floor is the 2 GB class; the 6–8 GB figure is
  Matthew's own server, not a product minimum. RC3-04's own RESULT
  lists a fresh runtime-envelope measurement as remaining work; this
  pass's envelope statement carries the H-06 measurements as the
  latest measured numbers and claims nothing newer.

## Neo4j — before state

Supplementary ledger row NEO4J is **E0** in the runtime: no Neo4j in
the data layer (descriptive contract only; Postgres is canonical).
Matthew questioned Neo4j itself on Nov 20, 2026; its place is his
open call. Per the brief, this pass **names it and does not build
it** — no silent demo. It is carried to the exit review as an owner
decision, named E0.

## Leftover-gap sweep — before state

Sub-E1 rows and NOT VERIFIED splits on current evidence, with their
resolution path in this pass:

- **#52 Marketplace / P2P commerce — E0.** No marketplace code exists
  (RC3-20's delivered shop scope was the single-seller journey,
  adapters and SHOP-UX; its evidence claims no #52 movement, and no
  marketplace surface exists in `src/`). The governing plan's
  "simulated lifecycle at RC3" was not built. → named at E0 with an
  owner scope decision / RC4 charter reconciliation in the result.
- **#54 Web3 gateway — E0.** No web3 code in `src/` (types only at
  audit; still none). RC3-20's owned opt-in proof was not delivered.
  → named at E0, same treatment.
- **#55 Content provenance — E0.** No provenance code in `src/`.
  → named at E0, same treatment.
- **#56 Optional IPFS — E0.** No IPFS client/pinning code in `src/`
  (optional by design, out of Lean). → named at E0, same treatment.
- **#10 Adaptive template conversion — NOT VERIFIED.** System 2
  conversion work (PRs #101/#102) was aimed at this row, but the
  deciding executed conversion journey with before/after readback
  has never been run or cited (ledger note, unrebutted by any landed
  RESULT). → stays NOT VERIFIED, named with its bounded follow-up.
- **#78 — E0** (above; owner decision).
- **NEO4J — E0** (above; owner decision, outside the 90).
- Creator Studio tenant-isolation dynamic proof (portfolios +
  capture/editor legs): a separate named debt, **not absorbed** by
  this pass — it awaits Matthew's word and feeds RC4.

E1 rows (at gate minimum, no movement required; levels re-checked
against landed evidence during the sweep): #6, #11, #15, #20, #21,
#25, #39, #51, #60, #63, #64, #66, #70, #75, #87, #88. Of these,
#15's ledger note flags itself STALE (podcast evidence advanced in
the unmerged podcaster build — that build is not on main, so E1
stands here), and #87/#88 carry residuals this pass re-checks
(#87's F1/F2 were fixed by RC3-03; #88's packaging leg landed in
RC3-04 and its H-07 bottleneck was fixed in RC2-H-07).

## Ledger staleness (a sweep finding, recorded before fixing)

The ledger (MD + CSV) does not reflect several landed passes'
verdicts. Confirmed examples at baseline: #2 NOT VERIFIED → E2,
#3 E1 → E2, #7 E0 → E2, #22 E0 → E2 (all RC3-17); #13 E1 → E2,
#14 E1 → E2, #16 video E1 → E2 and livestream E0 → E2 (local proof),
#17 E0 → E2 (all RC3-18); #28 E0 → E2 (RC3-14). Other passes
(RC3-20 slices, RC3-21, RC3-22) did update their rows. This pass
reconciles the ledger to the landed evidence as part of the sweep —
movements are applied only where a landed RESULT claims them, at
exactly the level it claims.
