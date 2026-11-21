# RC3 Wave 1 — file-ownership and overlap map (RC3-00)

Purpose: Wave 1 passes (00A, 01–07) can run in parallel only where
their file sets are disjoint. This map names each pass's primary
files, the shared files that force serialization, and the merge
rules. It is a planning artifact of RC3-00; if a pass finds its real
file set differs, it updates this map in its own evidence.

## Per-pass primary file sets

| Pass | Primary files / surfaces | Notes |
| ---- | ------------------------ | ----- |
| 00A — dependency triage | `package.json`, `package-lock.json` | Exclusive ownership of both files while it runs. Every build-dependent pass rebases onto its adjudicated baseline. |
| 01 — federation ownership & retry | `src/app/(frontend)/ap/actors/[handle]/inbox/route.ts`, `src/modules/social/activitypub.ts`, `src/modules/social/activitypub-runtime.ts`, `src/collections/Community.ts` (discussions index), federation/tenant tests | Community service/policy (`src/modules/community/service.ts`, `policy.ts`) is read-mostly here; behavior changes there belong to 15A. |
| 02 — audience exclusion accounting | `src/modules/audience/service.ts` (segment evaluation + counts), audience operator readback consumers | Single-owner file: see serialization rules. |
| 03 — field-level validation & accessibility | Payload REST error-formatting path, the editor's custom HeadlineField, shared form primitives, browser regression tests | Touches the build's module graph; coordinate with 04 if the instanceof-gate cause turns out to be trace/bundling related (the exit report flags them as plausibly the same family). |
| 04 — shipped artifacts & resource envelope | `next.config.ts`, `src/modules/presentation/packages.ts`, `scripts/build.mjs`, `Dockerfile`, Compose files | `src/proxy.ts` is a watch file, not an edit target: lane 08's trace spans the app through the middleware's Payload-config import. Uses 00A's dependency baseline — never edits the lockfile itself. |
| 05 — actual RC2 upgrade & off-host restore | `src/scripts/verify-upgrade-migration.ts`, operational backup/restore machinery, seeded RC2 fixture state | Runs on 04's artifact. Reads the migration set; adding a migration is a serial, whole-team event (see rules). |
| 06 — beginner install & admin recovery | `install.sh`, setup / guided-setup routes and forms, install docs | Depends on 03 (field errors render) and 05 (recovery rehearsed). Browser evidence is this pass's own. |
| 07 — production email isolation | Email delivery code (audience delivery paths, Postmark/SMTP adapters), `docs/rc/email` record | Fixture-only under the owner's email hold. Shares `src/modules/audience/service.ts` with 02 — runs after 02 lands. |

## Serialization rules (the collisions, named)

1. **`src/modules/audience/service.ts` — one owner at a time.**
   RC3-02 owns it first (counting semantics). RC3-07's delivery work
   in the same module starts only after 02 merges, and re-runs 02's
   counting proof if it touches the evaluation path.
2. **`package.json` / `package-lock.json` — one owner at a time.**
   00A adjudicates; 04 and every later pass rebase onto the result
   and never carry a private lockfile change.
3. **Migrations are append-only and merge serially.** Any pass that
   adds one announces it before starting; dependent proofs re-run
   after it lands.
4. **Shared harnesses have a single owner at a time:** the release
   verifier (`scripts/verify-clean-clone.mjs`,
   `src/scripts/verify-release.ts`) and the Compose harness. Passes
   may run them; only one pass edits them in a wave.
5. **Evidence never collides:** each pass writes only
   `docs/rc3/evidence/<PASS-ID>/` and its own ledger rows' notes.
   Ledger edits append annotations; two passes never rewrite the
   same row in the same wave.
6. **Docs trees are evidence, not product:** nothing in Wave 1 edits
   `docs/rc2/` — it is the frozen RC2 record.

## Safe parallel pairs at wave start

- 01 ∥ 02 (disjoint file sets)
- 01 ∥ 03 (disjoint; 03 watches the module-graph question)
- 02 ∥ 03 (disjoint)
- 00A ∥ 01/02/03 for their audit halves only — any pass whose proof
  builds must wait for 00A's baseline before its final verification
  run.

## Dependency order inside Wave 1

00A baseline → 04 artifact → 05 upgrade/restore → 06 install
recovery; 02 → 07 (shared audience module); 03 → 06 (error rendering
before the beginner journey is judged).
