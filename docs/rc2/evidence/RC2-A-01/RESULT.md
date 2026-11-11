# RC2-A-01 — Result

- **Verdict: PASS**
- **Executed at:** 2026-11-11 (America/Chicago), Harbor
- **Tested source:** `d79e6d7784a001cdc1ef78b29bbcc7d953befb9d` (main; merge of
  PR #39, the CI fix). Working tree for this pass: clean clone of that exact
  commit; the only additions are this pass's two documents
  (`docs/rc2/RC2-STATUS.md`, this RESULT). No product code changed.
- **Fixture:** local PostgreSQL 16.15 (CI uses postgres:17.6-alpine —
  version difference recorded, not hidden); disposable acceptance databases
  (`renegade_release_acceptance`, `renegade_upgrade_acceptance`,
  `gui01b_capture_release_acceptance`, `gui01b_integ_release_acceptance`);
  fixture content source is `src/scripts/seed.ts` behind the
  `ALLOW_FIXTURE_SEED=true` guard; browser fixture recipe:
  `tests/beta-gui01b-v2/seed-session.mts` (single site, owner session) and
  `seed-layout.mts` (page-layout fixture). Module profile for the baseline
  chain: default (lean floor; `RENEGADE_MODULES` unset).
- **Scope:** baseline freeze + RC1 → RC2 reconciliation only. No feature work.

## Starting snapshot

- **HEAD:** `d79e6d7784a001cdc1ef78b29bbcc7d953befb9d` — main, merge of PR #39.
- **Latest CI:** GitHub Actions run **43017632098** on main — **success**
  (concluded 2026-11-11T12:15:20Z). First green GitHub run since Nov 8, 2026.
- **Toolchain:** Node v24.22.1 (engines ≥20.9.0), npm 10.9.4, TypeScript 5.9.2,
  Next.js 16.4.1, React 19.2.8, Payload 3.90.2 (incl. `@payloadcms/ui` and
  `@payloadcms/richtext-lexical` 3.90.2), `@puckeditor/core` ^0.23.0.
  Lockfile: `package-lock.json` (npm), version field 0.1.0.
- **Repo shape:** 5,812 tracked files; 938 TypeScript sources under `src/`;
  133 migrations in `src/migrations/` (+ index and snapshot JSONs).
- **Module system:** registry `src/modules/module-registry.ts` — lean floor is
  derived (any collection/global/task no optional module claims); **17 optional
  modules, all OFF by default**, enabled via `RENEGADE_MODULES`:
  collaboration, community, events, sources, media-studio, social, network,
  integrations, releases, forms, crm, newsletter, notifications, analytics,
  experiences, quality, commerce.

## Baseline chain — executed on the frozen tree (this pass)

| Stage              | Command                             | Result                                                                                                                                                             |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format             | `prettier --check .`                | PASS (exit 0)                                                                                                                                                      |
| Lint               | `eslint . --max-warnings=0`         | PASS (exit 0)                                                                                                                                                      |
| Typecheck          | `tsc --noEmit`                      | PASS (exit 0)                                                                                                                                                      |
| Unit               | `vitest run tests/unit`             | PASS — 284 files, **2,104/2,104**                                                                                                                                  |
| Fresh migrations   | `test:migrations:fresh`             | PASS (exit 0)                                                                                                                                                      |
| Fixture seed       | `db:seed` (ALLOW_FIXTURE_SEED=true) | PASS (exit 0)                                                                                                                                                      |
| Upgrade migrations | `test:migrations:upgrade`           | PASS — rehearsal from `20260914_110000_med_05_video_workflow` → current                                                                                            |
| Integration        | `test:integration`                  | PASS — 54 files, **317/317**                                                                                                                                       |
| Production build   | `npm run build`                     | PASS — compiled 4.2 min, "Built source d79e6d7…" (see note)                                                                                                        |
| Smoke              | `test:smoke`                        | **NOT RUN this pass** — proven on identical content in the Nov 11 CI-fix session (local PASS + GitHub run 43017632098 includes it); explicitly not re-claimed here |

Build note (honest record): the first build attempt in this tree failed with a
Turbopack error — "Symlink node_modules could not be resolved" — an artifact
of this workspace's symlinked `node_modules`, not a product defect (the known
Turbopack/symlink limitation). After replacing the symlink with a real copy,
the build ran clean (compiled successfully in 4.2 min). The build script's
trailer reads "clean source: false" because this pass's two new `docs/rc2/`
files are uncommitted in the working tree — the compiled source is exactly
`d79e6d7` and the dirtiness is this pass's own deliverables, nothing else
(`git status` showed only `docs/rc2/`). CI builds from `npm ci` and is
unaffected.

## RC1 → RC2 reconciliation (superseded verdicts, kept distinct)

1. **RC1 engineering READY** (Pass 18D addendum, Nov 7, 2026;
   `docs/rc/FINAL_RC_REPORT.md` lead): candidate `fcf046a`, all 70 subpasses
   PASS, packaged proof run 42433965930 green. This is a statement about the
   RC1 engineering candidate. It is **not** a statement that every GUI
   acceptance cell was verified, and it is not re-proven on today's HEAD.
2. **GUI overhaul CONDITIONAL GO** (`docs/beta/gui-overhaul/GUI-EXIT-REPORT.md`,
   GUI-08E): issued _before_ GUI-05 and GUI-06D completed, so its six
   conditions are partly stale. Disposition as of this freeze:
   - (1) GUI-05 family unrun → **CLOSED** (executed Nov 10, merged PR #38;
     05A PASS, 05B/05C/05D PARTIAL with named debts).
   - (2) GUI-06D seeded-fixture acceptance unrun → **CLOSED** (PASS on the
     core builder journey; block-field depth remains a bounded gap for RC2-B-02).
   - (3) Interactive two-site/role proof → **OPEN** → RC2-A-04 + RC2-H-02.
   - (4) Accessibility depth (08B) → **OPEN** → RC2-H-01.
   - (5) Editor focus mode unimplemented → **OPEN** → RC2-H-01 (decision cell).
   - (6) Editor after-state captures 375/768 + dark → **OPEN** → RC2-H-01.
3. **Matthew's hands-on verdict** (Nov 8, 2026) stands alongside both: RC1 was
   "a really good beta, but not a RC1" as a lived-in product. The GUI pack
   (35/35 prompts, all merged) was the response to that verdict; his eye
   remains the final gate on visual work (the editor sheet verdict was
   "closer, but keep pushing the design" — design iteration is not closed
   by any document in this repo).
4. **CI history:** GitHub CI was red from Nov 8 to Nov 11, 2026 (root causes:
   75 unformatted pack-era files + one unit test asserting the superseded
   pre-GUI-04H editor layout). Fixed by PR #39; green since run 43017632098.
   The RC1-era gate counts (2,104 unit / 317 integration) are **re-proven on
   today's HEAD** by this pass — they are current, not inherited.
5. **Pack §1 snapshot drift:** the RC2 prompt pack (Nov 11, 2026) describes
   PR #39's CI against a pre-merge SHA; the actual merge and green run are
   recorded above. The pack's instruction to record actual HEAD at start is
   satisfied by this document.

## Carryover list

Maintained in `docs/rc2/RC2-STATUS.md` (seven items: exit-report conditions
3–6, GUI-05 named debts, spaces/profiles structural merge, article-level SEO
live test, editor-extras decision, inert `WritingCanvasField.tsx`, license
mismatch). Each names its owning RC2 prompt or its owner-decision status.

## Change list

- `docs/rc2/RC2-STATUS.md` (new) — RC2 ledger, governing frame, carryover.
- `docs/rc2/evidence/RC2-A-01/RESULT.md` (new) — this receipt.
- No product code, no migrations, no config changes.

## Unverified / blocked

- Smoke stage not re-run this pass (see table note) — NOT VERIFIED here.
- Packaged/Docker proof not run (Docker is unavailable in this environment;
  GitHub Actions is the packaged-proof route, and its run is green).
- Nothing else outstanding for A-01's exit criteria.

## Next

**RC2-A-02** — Build the all-90 executable maturity ledger (audit-only; uses
the reconciled Appendix A scope index). Not started.
