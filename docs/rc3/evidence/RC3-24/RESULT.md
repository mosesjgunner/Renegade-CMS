# RC3-24 — Freeze — RESULT

**The RC3 candidate is frozen at `fee7060`.** Freeze declared
Nov 27, 2026, on the owner's order: "Get everything else perfect
and ship RC3 today," followed immediately by "I dont care if its
not perfect we will worry about it later im busy" — read together:
ship it today, lean, honest; no gold-plating, no scope expansion.
Freeze-time verification (below) is green on every leg that can run
on this rig; the production build is rig-blocked locally and stands
proven by the candidate's own CI run on GitHub.

## The frozen candidate

- **Commit:** `fee7060c237ec592ae1745f27c60381b56b84cc5`
  (merge of PR #154, the social receipt-honesty pass).
- **Tree:** `165621ee1e7b77f1ca1e440da55073528c529160`.
- **Contents:** RC3 Waves 1–3 complete (passes 00–23), Creator
  Earnings (PR #151), YouTube publish-out (PR #152), the TikTok
  receipt gate (PR #153), and the five-adapter social receipt fix
  (PR #154). 180 migrations.
- This branch (`rc3-wave4-exit`) adds **documentation and evidence
  only** on top of the candidate — the freeze records reality; it
  does not alter it. No product code changed in this pass.

## What the freeze means

- The RC3 line is closed to new features. Anything further lands
  forward, on the RC4 line, under RC4's charter (all 90 areas to
  evidence-backed E3, no exclusions).
- Defects found from here are fixed forward, never by quietly
  rewriting the frozen candidate.
- The exit review (RC3-25) is the chapter's honest scoreboard and
  the input RC4's charter is written from.

## Freeze-time verification — gauntlet (CI order, final tree)

| Stage              | Result                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh migrations   | PASS (180 migrations)                                                                                                                                          |
| Fixture seed       | PASS                                                                                                                                                           |
| Upgrade migrations | PASS (September-fixture rehearsal `20260914_110000_med_05_video_workflow` → current)                                                                           |
| format:check       | PASS (repo-wide, pinned Prettier)                                                                                                                              |
| lint               | PASS (0 warnings)                                                                                                                                              |
| typecheck          | PASS                                                                                                                                                           |
| Unit               | **3,043 passed / 0 failed** (376 files) — exactly the candidate baseline                                                                                       |
| Integration        | **739 passed / 10 skipped / 0 failed** (132 files passed, 4 skipped) — exactly the candidate baseline range (skip count varies with rig media binaries)        |
| Production build   | **RIG-BLOCKED**: one solo attempt OOM-killed at "Creating an optimized production build …" (3 OOM kills; the documented ~6 GB limit of this rig). Not retried. |
| Smoke              | NOT RUN locally — it depends on the production build.                                                                                                          |

**Build arbiter:** GitHub CI's `verify` run on the candidate
itself — run **45978809034**, head `fee7060`, **completed success**
2026-11-27 04:27 CT — ran the full pipeline including the
production build and smoke on a clean runner. The frozen candidate
is CI-green as shipped.

Environment: Node v24.22.1, host PostgreSQL 16 (the Compose
topology and CI target PG 17 — the standing fidelity gap, named
since RC3-23). Full logs under `~/workspace/rc3-wave3-logs/rc3w4-*`.

## Freeze-time upgrade rehearsal — PASS (rc2.1 → frozen candidate)

RC3-23 ran this rehearsal at 179 migrations against the
candidate-so-far and assigned the freeze-time re-run to this pass.
Re-run end to end against the frozen candidate (180 migrations),
following the RC3-23 / RC3-05 method and harnesses
(`tests/rc3-05/seed-instance.ts`, `capture-manifest.ts`):

- **Old side (real on-disk state):** the worktree at tag `rc2.1`
  (`577fa3808344d7e0aeaab563e1d619fc0331abf3`) was migrated
  (**156 migrations**) and product-seeded on a fresh database, and
  the RC3-05 identity content was planted (second site + published
  article, podcast show + episode with a real WAV enclosure in the
  media dir, member + supporter + entitlement, one pending
  `commerce-reconcile-payments` job). Its previously built
  production standalone booted: `/health/ready` → ready, database
  ok, migrations applied. Source identity manifest captured
  (planted job pending, `completedAt` null).
- **Upgrade leg:** the old server was stopped and the **frozen
  candidate's** `db:migrate` ran against the same database. Exit 0;
  exactly **24 migrations applied** (156 → **180**) — the
  post-rc2.1 set (RC3-23's 23, plus the Creator Earnings
  monetization migration). Set proof: **zero** old migration names
  missing afterwards, and the upgraded ledger set equals the
  candidate's migration index set exactly (180 names). A re-run
  applied 0 (idempotent).
- **Worker leg:** the pending job planted under rc2.1 survived the
  upgrade untouched (`total_tried` 0) and the **candidate's**
  worker completed it **exactly once** (`total_tried` 1,
  completed, no error).
- **Readback:** the post-upgrade manifest, captured through the
  candidate code (HTTP probes exercised the real route handlers),
  diffed field-for-field against the source manifest: **92 fields,
  4 differences, all intended** — the capture timestamp, the
  migration count (156 → 180) and name-set hash, and
  `job.completedAt` (set by the worker leg). Sites, both articles
  (including public HTTP readback), the podcast show and episode
  GUID fields, the enclosure bytes and their sha256, member,
  supporter, and entitlement are byte-identical. **Zero data
  loss.**
- **Sandbox substitutions, named:** host PostgreSQL 16 stands in
  for the Compose/CI PostgreSQL 17; serving used the repo's
  `LOCAL_E2E_TEST_MODE` smoke configuration (the RC3-05 standard);
  there is no Docker daemon, so no Compose leg ran; the upgraded
  instance was served by the candidate in **dev mode** because the
  candidate's production build is rig-blocked (above) — the
  manifest's DB fields come from the Payload local API either way.
  Harness legs that touch module collections run with
  `RENEGADE_MODULES=all`, the pass's one rig lesson (two early
  attempts without it failed on absent module collections and were
  re-run cleanly; the failures were environmental, not product).

## Rig incident — VM replacement mid-pass

The VM was replaced once during this pass (Nov 27 ~17:24 CT),
during the first rehearsal's post-upgrade manifest capture: the
dev server was killed, the capture never wrote, and all Postgres
state (kept in `/var`) was wiped. Recovery followed the standing
playbook (cluster rebuilt, `renegade` role recreated,
`max_locks_per_transaction` restored to 512, databases recreated;
the first-boot apt stall on the dead mirror delayed it ~15
minutes). Disposition, per the RC3-23 precedent: the completed
gauntlet stands on its persisted full logs; the rehearsal, which
was mid-flight, was **re-run in full** on the rebuilt rig — every
rehearsal result cited above is from that coherent re-run (logs
suffixed `-r2` under `~/workspace/rc3-wave3-logs/`; the first run's
logs persist alongside and agree at every completed leg: 156 old
migrations, 24 applied, set proof exact, planted job completed
exactly once).

## #90's fourth leg

RC3-23 recorded #90 (Unified CMoS coordination) at E2 with its
fourth journey leg — this freeze — outstanding. **That leg has
now run**: the cross-product journey's RC3 proof shape
(RC3-08 → RC3-09 → RC3-14 → RC3-24) is complete. The row's level
stands at E2; its ledger note records the completion (RC3-25).
