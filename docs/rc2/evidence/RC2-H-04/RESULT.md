# RC2-H-04 — Engineering cleanup batch 2: dead paths, test clutter, tooling

**Verdict: PASS.** A bounded set of 11 files (1,402 lines) removed, each with a zero-production-reference proof recorded below; every other candidate examined was kept with its reason — the proof table, not the deletion count, is the deliverable. No production behavior changed; no future-scope stub was touched. Base: main `40e67c4` (after PR #72).

## Runner map (measured first — it decides what "dead" can mean)

- Unit runner executes `tests/unit` only; the integration runner executes `tests/integration`; Playwright's testDir is `tests/browser`. Everything else under `tests/` is run by no runner.
- **Exception:** `tests/rc1-17c` is live infrastructure — a dedicated GitHub workflow (`rc1-17c.yml`) runs its `run.sh` on path triggers. Kept, obviously.
- The `tests/rc2-*` journey folders are Harbor-run audit harnesses cited by the RC2 RESULT files — living evidence tooling, kept.

## Removed (proof per file)

Production-reference proof = no import, no package.json script, no CI workflow step, no config reference. Historical citations in frozen evidence docs are history, not references; where a file is the harness of record for evidence, traceability won (see keeps).

| File                                         | Lines | Proof                                                                                                                                                                                                             |
| -------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/community/forum-composer.ts`    | 354   | Zero importers in src/tests/scripts/configs; its exports (`createForumTopic`, `replyToForumTopic`) have no caller anywhere. The dead writer of RC2-DEBT-20.                                                       |
| `tests/unit/comm-04b-forum-composer.test.ts` | 114   | The dead writer's own test — the only file that referenced it.                                                                                                                                                    |
| `src/modules/admin/WritingCanvasField.tsx`   | 19    | Unreferenced since the NEW-02 fix removed the override; absent from the Payload import map; the only other mention is a component-name string in a beta-generation probe. **Closes RC2-STATUS carryover item 6.** |
| `scripts/rc06-operational-acceptance.mjs`    | 219   | Pass-era one-off; zero package.json/CI/src references.                                                                                                                                                            |
| `scripts/rc07-configure-instance.mjs`        | 358   | Same.                                                                                                                                                                                                             |
| `scripts/rc07-pass2-preflight.mjs`           | 76    | Same.                                                                                                                                                                                                             |
| `scripts/rc07-setup-instances.mjs`           | 54    | Same.                                                                                                                                                                                                             |
| `scripts/verify-shop08-local-donation.mjs`   | 39    | Same.                                                                                                                                                                                                             |
| `scripts/fix-team-id.cjs`                    | 21    | Same; cited only in frozen RC1 evidence manifests.                                                                                                                                                                |
| `scripts/check-tables.cjs`                   | 44    | Same.                                                                                                                                                                                                             |
| `scripts/generate-demo-assets.mjs`           | 104   | Same.                                                                                                                                                                                                             |

Post-deletion verification: **typecheck clean (0 errors)** — the compiler is the import-graph proof that nothing referenced the removed code — and the **full unit suite completed: 284/285 files, 2,103/2,104 tests passed**. The single failure is the load-sensitive comm-06c digest test hitting its 15s timeout under this sandbox's shared-CPU throttling (its sibling comm-03b test took 13.5s in the same run; comm-06c passes standalone, 4/4 earlier the same day, and imports none of the removed code). The counts reconcile exactly: 2,106 baseline tests − the removed file's 5 + H-03's 3 new = 2,104. CI on this PR re-runs everything on unthrottled runners and is the deciding gate, as with every H pass.

## Kept, with reasons (the no-change record)

- `scripts/apply-patches.mjs` — wired as the package.json `postinstall`. Load-bearing.
- `scripts/verify-presentation-bundles.mjs`, `scripts/release-inventory.ts` — exposed as npm scripts (`verify:presentation-bundles`, `release:inventory`). Load-bearing.
- `scripts/check-admin-styles.mjs` — zero runner references, but named in the current RC2 ledger (row 87) as the report-only accessibility style checker; deleting it would orphan a live ledger claim. Kept as a documented operator tool.
- `tests/beta-gui01b/editor-journey.ts` — a one-file remnant (its successor folder holds 31 files), but it is the harness of record cited by `docs/beta/evidence/GUI-01B/`; evidence traceability outranks one file of tree size.
- `tests/rc1-17c/**` — live CI workflow (above).
- All remaining `tests/` generations (rc01–rc08b, rc1-\*, beta-gui01b-v2) — unexecuted harnesses that constitute the passes' working evidence; the pack's archive-with-traceability route was not exercised for bulk generations in this batch because the connector deletes one file per commit (a bulk move is one local commit from the owner's machine if ever wanted), and no generation presented a maintenance cost beyond existing. Recorded as a deliberate no-change.
- Dependencies: 40 packages (dependencies + devDependencies) — no dependency was proven unreferenced by a full import-reachability proof in this batch, so none was removed; a depcheck-grade sweep is the honest prerequisite and is recorded as undone rather than guessed.
- Future 90-scope stubs: none deleted; none needed labeling beyond their existing ledger rows (all E0/E1 scope stubs sit behind module-registry claims that already name them intentional).

## RC2-DEBT-20 update

The dead-writer half of DEBT-20 is closed by this PR (forum-composer + its test removed). The row's remainder — the stranded-store status decision for the v1 comment store — stays with the profile/space work, as H-03 recorded.

## Accounting (before → after)

- Tracked files: 5,911 → 5,900 (−11).
- `scripts/`: 16 → 8 files (−8); the surviving 8 are the verification chain + the three npm-wired tools + the ledger-named checker + demo/seed tooling.
- `tests/`: 842 → 841 files; test lines (ts/tsx/mjs) 193,561 → 193,447 (−114, the removed test).
- Production source: −373 lines of dead code (354 forum writer + 19 inert wrapper).
- Total removed: 1,402 lines across 11 files.
- Verification time: typecheck ~40s before and after (unchanged within noise); the local unit suite took ~9.5 min under sandbox throttling (not comparable to CI's unthrottled runners).
