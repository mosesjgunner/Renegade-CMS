# RC3-23 — Operations confirmations, true upgrade rehearsal, leftover-gap sweep — RESULT

**Verdict: PASS for every leg this pass owns, with the blocked and
unproven legs named plainly below.** The family's one E0 at exit is
#78, named openly. No fake success: the live Docker Compose bring-up
was NOT RUN (no daemon on this rig), the current-tree production
build died silently on this rig (CI arbitrates), and the Wave 4 leg
of #90 has not run.

**Baseline:** branch `rc3-23` from fresh GitHub main
`7600c4890765feb03c62d67d15f09fc0b4507673` (post-RC3-22). Environment:
Node v24.22.1, PostgreSQL 16 (local cluster; the Compose topology
and CI target PG 17 — a standing fidelity gap, named). The VM was
replaced mid-pass (Nov 25 ~16:33 CT); Postgres and the acceptance
DBs were rebuilt from scratch and every pre-replacement result cited
here is backed by a log persisted under `~/workspace`.

## Owned rows (#76–90 family confirmations)

| Row                               | Level          | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #77 One-click-style provisioning  | E2 (stands)    | Compose file passes a structural audit: 7 services (postgres, migrate, renegade-web, renegade-worker, email-account-worker, media-worker, media-heavy); migrate gated on postgres `service_healthy`; web/worker gated on migrate `service_completed_successfully`; healthchecks on postgres/web/worker; named media + postgres volumes. `install.sh --help` exits 0 (Lean/Standard profile selected from RAM). **The live one-command bring-up was NOT RUN** — this rig has no Docker daemon and no Compose plugin (`docker compose` is not even a recognized command). The E2 stands on RC3-04's separate Docker measurement plus this audit; a live bring-up on a Docker-capable rig is the named residual (RC4). |
| #78 Managed hosting capabilities  | **E0 (named)** | No managed-hosting capability exists and none was built. This row moves only on the owner's hosting decision, which has not been given. It is the family's one openly-named E0 at the RC3 exit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| #80 Export & portability          | E2 (stands)    | Round trip re-proved on current main through the real CLI with planted real content (see below). Two named findings below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| #83 Background job engine         | E3 (stands)    | Re-validated under Wave 3 load, including the retention-purge queue by name (see below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| #85 System health & diagnostics   | E2 (stands)    | Truth check re-run: readiness-probe unit suite 4/4 (200 ready when valid; 503 when migrations are pending, when critical columns are missing, and when the DB is unavailable) and proxy-health-paths 4/4. The surface reports failure as failure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| #86 Unified admin Command Center  | E2 (stands)    | Confirm-only, as briefed: the admin section inventory was re-audited against current code (audience, catalog, commerce, fulfillment, operations, social, telemetry, workflow, releases, migration, email-composer, plus the Audience/Media/Editorial command-center modules). No new journey was run for this row in this pass.                                                                                                                                                                                                                                                                                                                                                                                     |
| #89 Development & maintainability | E3 (stands)    | Test-infrastructure integrity confirmed by this pass's own CI-order gauntlet on the final tree (numbers below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| #90 Unified CMoS coordination     | E2 (stands)    | Existing legs re-run green on current main: RC3-08 WordPress move 8/8, RC3-09 SEO journey 5/5, RC3-14 repurpose 6/6. **The fourth leg, RC3-24, is the Wave 4 freeze and has not run** — this row completes at the freeze.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### #80 round trip — detail

Planted a real site through product paths (brand, publication,
member, author, published article, and a media asset whose bytes were
written through the product media storage, RC3-05 pattern), then
drove the product CLI (`src/scripts/portability.ts`):

- Export: archive written, **10 records**.
- Import into a fresh bare target site: **9 completed / 0 failed**
  (the tenth record is the source site itself, which the CLI maps
  onto the target site by design). Readback in the target: the
  article is present with status `published`; the media asset's
  checksum matches the planted checksum and its stored bytes
  hash-match.
- **Finding 1 (named gap):** importing the same archive into an
  existing seeded site whose own publication already uses the slug
  `main` failed that publication on the (site, slug) uniqueness
  rule, and its dependents (the article, its article-family record,
  its revision record) then failed with raw foreign-key errors —
  5 completed / 4 failed, all recorded in the import checkpoint. A
  collision policy for merge-into-existing-site imports (rename,
  skip-with-reason, or fail-fast before writing) is an **owner
  scope decision**; bounded follow-up at RC4.
- **Finding 2 (fails closed, by construction):** exporting the
  fixture-seeded demo site refuses to run — its placeholder media
  asset (`local://demo/shared-photo.jpg`, empty checksum) has no
  bytes by construction, and the exporter will not silently drop
  media. Recorded as a fixture artifact, not a product defect.

### #83 re-validation — detail

Focused suites on current main: `operations-jobs` 3/3, RC3-16
social journey 6/6, RC3-21 governance journey 4/4. Plus a
real-worker proof (harness `tests/rc3-23/worker-proof.ts`): three
jobs queued through the Payload API were each completed **exactly
once** by the real worker subprocess — `analytics-retention-cleanup`
(the retention-purge task on the `analytics` queue, fixed in
RC3-21 and named here as required), `commerce-reconcile-payments`,
and `operations-heartbeat`. The purge deleted exactly the
expired-unheld analytics event; the legal-held and unexpired events
survived; the worker heartbeat file was written.

## True version-to-version upgrade rehearsal — PASS

The rehearsal RC3-05 explicitly left open, run end to end:

- **Old side (real on-disk state, not fixtures):** a worktree at
  tag `rc2.1` (`577fa3808344d7e0aeaab563e1d619fc0331abf3`) was
  installed, migrated (**156 migrations**), product-seeded, and
  planted with RC3-05's identity content (second site + published
  article, podcast show + episode with a real WAV enclosure in the
  media dir, member + supporter + entitlement, one pending
  `commerce-reconcile-payments` job). Its production build exited 0
  (RC3-05 recipe) and the standalone booted: `/health/ready` →
  ready, database ok, migrations applied. Source identity manifest
  captured from DB + live HTTP.
- **Upgrade leg:** the old server was stopped and the **current**
  tree's `db:migrate` ran against the same database. Exit 0;
  exactly **23 migrations applied** (156 → **179**) — precisely the
  post-rc2.1 set (RC3-12…RC3-22 and Creator Studio migrations).
  Set proof: **zero** old migration names missing afterwards, and
  the upgraded ledger set equals the current tree's migration
  index set exactly. A re-run applied 0 (idempotent).
- **Readback:** the post-upgrade manifest was captured through
  current code and diffed field-for-field against the source
  manifest: **90 fields, 4 differences, all intended** — the
  capture timestamp, the migration count/hash (156 → 179), and
  `job.completedAt` (set by the worker leg). Sites, both articles
  (including public HTTP readback), the podcast show and episode
  GUID fields, the enclosure bytes and their sha256, member,
  supporter, and entitlement are byte-identical.
- **Worker leg:** the pending job planted under rc2.1 survived the
  upgrade untouched (`total_tried` 0) and the **current** worker
  completed it exactly once (`total_tried` 1, no error).
- **Target label:** the target is post-RC3-22 main (`7600c48`), the
  freeze candidate-so-far. The freeze-time re-run of this rehearsal
  belongs to Wave 4 (RC3-24) and is not claimed here.
- **Sandbox substitutions, named:** host PostgreSQL 16 stands in
  for the Compose/CI PostgreSQL 17; serving used the repo's
  `LOCAL_E2E_TEST_MODE` smoke configuration (the same caveat as
  RC3-04/RC3-05); there is no Docker daemon, so no Compose leg ran.
  The old instance was served from its production standalone; the
  upgraded instance was served by the current tree in **dev mode**
  because the current production build is rig-blocked (below) —
  the manifest's DB fields come from the Payload local API either
  way, and its HTTP probes exercised the real route handlers.

## Footprint envelope — final statement for the exit report

The three numbers stay separate, per the owner's position:

- **1 GB was a stress fixture, not a recommendation.** RC2-H-06
  measured the Lean profile fitting under a hard 1 GB cgroup cap
  (peak ≈789 MB for the whole stack including PostgreSQL). The
  owner's position stands: Lean should not be run on 1 GB in
  practice; the practical floor is the **2 GB class**. No 1 GB
  recommendation is made anywhere in this exit picture.
- **Standard: ~929 MB peak at a 2 GB cap** (RC2-H-06 measurement;
  the peak was driven by a schedule-health N+1 that RC2-H-07 has
  since fixed, so 929 MB is a conservative ceiling, not a current
  measurement). RC3-04 separately cut the shipped standalone
  artifact from 1,117.8 MB to **283.9 MB** (packaging, not runtime
  memory).
- **6–8 GB is the owner's own server**, not a product requirement.

A fresh runtime-envelope measurement remains outstanding (named in
RC3-04 and still true); the H-06 figures are the latest measured
envelope and are cited as such, not as new proof.

## Leftover-gap sweep — outcome

The ledger (`docs/rc3/RC3-90-AREA-LEDGER.md` + `.csv`) was
reconciled against landed evidence, and the distribution table was
recounted from the rows for the first time since the RC3-00
re-baseline.

- **Ten stale rows corrected** to the levels their landed passes
  already proved (the passes had not updated the ledger): #2
  NOT VERIFIED → E2 and #3 E1 → E2, #7 E0 → E2, #22 E0 → E2
  (RC3-17); #13 E1 → E2, #14 E1 → E2, #16 → E2 (video) / E2
  (livestreams, local proof), #17 E0 → E2 (RC3-18); #28 E0 → E2
  (RC3-14); #6 E1 → E2 (RC3-09 delivered the live-audit proof the
  row itself named as missing; re-run 5/5 by this pass).
- **Distribution after reconciliation (90 rows):** E3 — 4 whole
  (#79, #82, #83, #89); E2 — 61 whole, 4 in part (#16, #59, #68,
  #74); E1 — 15 whole, 2 in part (#59, #68); E0 — 5 whole (#52,
  #54, #55, #56, #78); NOT VERIFIED — 1 whole (#10); E4 — 0.
- **Every sub-E1 row, named, with its bounded follow-up:**
  - #52 Marketplace, #54 Web3, #55 Provenance, #56 IPFS — all E0.
    Re-checked on current main: no marketplace/web3/provenance/
    IPFS code exists in `src/` (grep-verified); RC3-20 delivered
    no movement on these rows. Bounded follow-up: the RC4
    all-90-at-E3 gate owns them. No silent demo was built.
  - #78 Managed hosting — E0, owner decision (above).
  - #10 Adaptive template conversion — NOT VERIFIED. The deciding
    executed conversion journey with before/after readback is
    still not run or cited on current main. Bounded follow-up:
    the RC4 gate, or an owner scope decision.
- **E1 rows carried at their true level (15):** #11, #15, #20,
  #21, #25, #39, #51, #60, #63, #64, #66, #70, #75, #87, #88.
  Of these: #87's named residual is that RC3-03's Playwright spec
  has never executed (pre-existing harness failure; the F1 fix
  itself re-confirmed here, unit suite 8/8); #88 awaits a fresh
  runtime-envelope measurement; #64's full enterprise-SSO program
  and #71's shared-runtime sub-claim remain owner-scoped to
  1.5+/2.0 and say so in their rows.
- **Creator Studio tenant-isolation proof gap: NOT absorbed.**
  It remains a separate named debt awaiting the owner's word,
  exactly as briefed; nothing in this pass touches it.
- **Neo4j: named, not built.** The supplementary NEO4J row stands
  at E0: no Postgres → Neo4j projection demo was built in RC3.
  Per the governing plan's rule it is named E0 here in the exit
  report and carried to the exit review as the owner's open call.
- **Family exit picture (#76–90):** #76 E2, #77 E2, #78 E0
  (named), #79 E3, #80 E2, #81 E2, #82 E3, #83 E3, #84 E2, #85 E2,
  #86 E2, #87 E1, #88 E1, #89 E3, #90 E2 (Wave 4 leg named).

## Gauntlet (CI order, final tree)

| Stage              | Result                                                                                                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh migrations   | PASS (179 migrations)                                                                                                                                                                                                                                                                   |
| Fixture seed       | PASS                                                                                                                                                                                                                                                                                    |
| Upgrade migrations | PASS (September-fixture rehearsal → current)                                                                                                                                                                                                                                            |
| format:check       | PASS (repo-wide; this pass's two harness files were prettier-fixed first)                                                                                                                                                                                                               |
| lint               | PASS (0 warnings)                                                                                                                                                                                                                                                                       |
| typecheck          | PASS (after fixing two optional-`destroy` type errors in this pass's harnesses)                                                                                                                                                                                                         |
| Unit               | **2,983 passed / 0 failed** (369 files) — Δ0 vs the RC3-22 baseline                                                                                                                                                                                                                     |
| Integration        | **717 passed / 10 skipped / 0 failed** (127 files passed, 4 skipped) — Δ0 vs the RC3-22 baseline                                                                                                                                                                                        |
| Production build   | **RIG-BLOCKED**: the build died silently at "Creating an optimized production build" with no error output (the known failure pattern on this ~6 GB shared box; the smaller rc2.1 tree's build succeeded earlier the same day). No retry, per the pass rules — GitHub CI is the arbiter. |
| Smoke              | NOT RUN — it depends on the production build; CI arbitrates.                                                                                                                                                                                                                            |

No product code changed in this pass. New files are evidence and
test harnesses only (`tests/rc3-23/worker-proof.ts`,
`tests/rc3-23/portability-roundtrip.ts`), plus the ledger
reconciliation and this evidence. No migration was added; the
registration-expectation rule does not fire. Logs for every stage
are under `~/workspace/rc3-wave3-logs/rc323-*` (full logs, never
tails); upgrade-rehearsal artifacts (identity, both manifests) are
in `~/workspace/rc3-wave3-logs/rc323-upgrade/`.

## Blocked / unproven, named plainly

1. Live one-command Compose bring-up (#77 residual): NOT RUN — no
   Docker daemon, no Compose plugin on this rig.
2. Current-tree production build + smoke: rig-blocked (silent
   death); CI arbitrates.
3. #90's fourth leg (RC3-24 freeze journey): has not run; belongs
   to Wave 4.
4. Portability merge-into-existing-site slug collision (#80
   finding 1): owner scope decision; RC4 follow-up.
5. #78 managed hosting: E0, owner decision not given.
6. Neo4j: E0, owner's open call.
7. Creator Studio tenant isolation: unproven, separate named
   debt, not absorbed here.
