# RC1 04A — PASS (bounded visual editing)

Current revalidation, 2026-10-18: the starting checkout matched all 159 entries of the retained tested tree below. Application/runtime source remains unchanged. This turn adds real keyboard acceptance and preserves rerun receipts through `RC1_04A_EVIDENCE_DIR`; see the revalidation section at the end. Historical command results below retain their original boundaries.

2026-10-18. Implemented and exercised the existing Puck editor against disposable PostgreSQL and an HTTPS Next development runtime. This passes 04A; it does not promote aggregate RC1 readiness. No commit, push, deployment, production image acceptance, or next subpass was performed.

## Exact source

Base commit: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`.

- Final dirty manifest: [tested-tree.json](tested-tree.json), 159 paths, overlay SHA-256 `2db0efbb2666e0296b42f77dac627be462f9136bf425bb17ded9fac325138f27`.
- Positive UI/operator/drag source: [positive-tested-tree.json](positive-tested-tree.json), overlay `6562e635fdcf871bb61456578b2f64cdc68e339c22bb6129d0d98c03e73c6e11`.
- [containment.json](containment.json) proves zero application/runtime changes between these trees, no removals and no current manifest drift. Six verification files changed. [ui-executed.ts.receipt](ui-executed.ts.receipt) matches the exact original UI script hash.
- Manifests include preserved preexisting edits, rather than attributing every dirty path to 04A. Evidence and the cumulative ledger are excluded from the source hash. No existing work was reset or cleaned.

## Implementation and changed paths

- `src/modules/presentation/VisualEditor.tsx`, `puck-adapter.ts`: canonical Puck add/configure/drag/reorder/duplicate/delete, keyboard toolbar, device widths, refreshable canonical choices and errors. Normalize Puck dotted IDs into valid portable IDs while retaining previous metadata.
- `src/modules/public/BuilderShell.tsx`: guarded saves, meaningful errors, conflict recovery retaining local work, navigation/unload protection, revision rollback with actual canvas replacement, saved-preview protection.
- `src/modules/presentation/themes/components.tsx`, `starter.css`: navigation block and real rendered responsive/alignment/spacing/width/background/emphasis controls alongside text, media and CTA blocks.
- `src/collections/PageLayouts.ts`, `src/modules/admin/LayoutEditorLink.tsx`, `src/app/(payload)/admin/importMap.js`: visible native editor entry and canonical site-scoped access.
- `src/app/(frontend)/api/layouts/[id]/{route.ts,choices/route.ts,rollback/route.ts}`, `src/modules/presentation/layout-write-lock.ts`, `composition.ts`, `src/app/(frontend)/builder/[id]/preview/page.tsx`: record authorization, serialized revision checks/writes, required expected revisions, 409 conflicts, canonical rollback response and authorized preview.
- `src/modules/public/page-builder.tsx`: malformed schema rejection and safe unavailable-block behavior.
- `src/modules/media/workflow.ts`: public media authorization from the immutable published layout snapshot. Newer drafts/history cannot authorize media. Existing rights, privacy and quarantine checks remain enforced.
- `tests/rc1-04a/*`, `tests/unit/rc1-04a-{visual-editor,layout-media}.test.ts`: isolated runtime, genuine WebAuthn browser auth, persisted assertions and focused regression tests. Next also generated its own dist-directory references in already-dirty `next-env.d.ts` and `tsconfig.json`.

No new schema migration was needed for the existing JSON layout representation. The isolated database nevertheless ran all 120 current migrations, schema verification and the idempotent repeat successfully.

## Ordinary UI → persisted state → output

Chromium CTAP2 virtual hardware performed genuine credential enrollment, then `/login` passkey authentication with test authentication/routes disabled. This is actual WebAuthn/session persistence, with virtual rather than physical hardware. The native Page Layouts document exposed “Open visual editor”. The browser uploaded canonical media, configured five blocks (hero/text/media/navigation/CTA), reordered, duplicated and deleted; PostgreSQL assertions inspected the stored block order, props and relationships. Reload restored the complete layout. Mobile canvas measured 375px; computed alignment and spacing reflected saved choices. Draft preview rendered the saved layout; publication rendered anonymous HTML and the exact original media bytes. A later private draft left the public snapshot unchanged. Revision rollback restored PostgreSQL blocks and the live Puck canvas.

See [trace.json](trace.json), [layout.png](layout.png), [state.json](state.json). UI layout ID: `2f1aea18-9c30-4240-b4b8-9c771917d26f`. After explicit failed-request recovery its draft title is `04A Retried after network failure`; the public snapshot retains `04A Welcome`.

Separate real pointer drag inserted and configured a block, then persisted it. An unavailable legacy block displayed a repair notice; saving preserved its payload exactly and preview rendered a safe fallback. See [interactions.json](interactions.json), [drag.png](drag.png).

## Commands, exits and counts

Commands ran from the repository root. Runner invocation is `powershell -NoProfile -File tests/rc1-04a/run-isolated.ps1 -Action <action>`; it sets only the explicitly disposable target and exits with the invoked command status.

| Command/action | Exit | Result / receipt |
| --- | --- | --- |
| `-Action migrate` → `npm.cmd run test:migrations:fresh` | 0 | 120 migrations, schema/idempotence; `migrations.log` |
| `-Action verify` → `npx.cmd tsx tests/rc1-04a/verify-editor.ts` | 1 | 16 positive UI assertions passed, then verification transport timed out at the first negative request; `ui.log`, `trace.json` |
| `-Action negatives` → `npx.cmd tsx tests/rc1-04a/verify-negatives.ts` | 0 | All 20 remaining schema/security/conflict/failure/retry assertions passed; `negative-final.log`, `negative-trace.json` |
| `-Action interactions` → `npx.cmd tsx tests/rc1-04a/verify-interactions.ts` | 0 | 5 passed, 0 failed; `drag-errors.log`, `interactions.json` |
| `-Action api` → `npx.cmd tsx tests/rc1-04a/verify-api.ts` | 0 | 18 passed, 0 failed; `operator-current.log`, `api-trace.json` |
| `-Action restart-check` → DB restart + `npx.cmd tsx tests/rc1-04a/verify-restart.ts` | 0 | 4 passed, 0 failed; `restart-final.log`, `restart-trace.json` |
| `-Action api-restart` → `npx.cmd tsx tests/rc1-04a/verify-api.ts --restart` | 0 | 2 passed, 0 failed; `api-restart.log/json` |
| `npx.cmd vitest run tests/unit/rc1-04a-layout-media.test.ts tests/unit/rc1-04a-visual-editor.test.ts tests/unit/pre-03-visual-editor.test.ts tests/unit/pre-04-reusable-composition.test.ts tests/unit/phase-a-media.test.ts tests/unit/med-00-media-contract.test.ts` | 0 | 6 files, 45 passed, 0 failed/skipped; `units.log` |
| `npx.cmd tsc --noEmit -p tests/rc1-04a/tsconfig.json` | 0 | All application `src` plus scoped acceptance/units, 0 diagnostics; `types-scoped-final.log` |
| `npx.cmd eslint` on the implementation TS/TSX paths above, `tests/rc1-04a/` and both new unit files, `--max-warnings=0` | 0 | 0 errors/warnings; `lint-complete.log` |
| `npm.cmd run typecheck` | 2 | Seven existing diagnostics in `tests/rc1-03d/verify-import-and-build.ts`, first `(31,42)`; `types-global-final.log` |

Successful acceptance groups contain 65 assertions (16 + 20 + 5 + 18 + 4 + 2), plus 45 units. No scoped mandatory case was skipped or left unexecuted. The original monolithic UI command did **not** finish successfully and is not labeled as an exit-zero run. Its remaining cases were rerun in the split negative suite after increasing verification request timeouts and fixing an ambiguous test locator; application source stayed identical. A restart harness checksum comparison was corrected to account for the canonical `sha256:` prefix and rerun successfully. Exploratory/rejected attempts are retained in ignored disposable scratch, not promoted as current proof. The operator suite uses explicitly identified persisted fixture sessions and makes no passkey claim; the UI suites independently provide that proof.

## Negative, error and restart proof

Invalid/malformed/new unknown blocks return 422; stale save/rollback revisions return 409; rejected writes leave the complete stored row unchanged. Anonymous edits are 403 and previews 404. A genuinely enrolled scoped staff actor can read its own choices but receives 403 for foreign save/rollback/choices and 404 for foreign preview, with unchanged foreign data. Concurrent writers produce exactly one 200 and one 409. The UI retains local conflict work in session storage and replaces its canvas only on explicit reload. A deliberately aborted save leaves DB state intact, navigation confirmation cancels leaving, and explicit retry saves the retained work. Published draft/media isolation and unsafe/foreign/private/hidden/removed media references are covered by browser/API assertions and focused units.

The database and Next process were restarted; the TLS proxy was restarted to discard stale upstream connections. Exact five-block draft, revision, public output, original media checksum, operator state and snapshot survived. Logs: `web-final-source.log`, `web-restart.log`, `proxy-final.log`, `proxy-restart.log`.

## Isolation and limits

Own container `rc104a-20261018` (`c3c9ffedfb21c5e2882e568b13a5756600a1f5ee7080e0a68db1b42d3f8433ec`), PostgreSQL 17.6, loopback5438, DB `rc104a_release_acceptance`; anonymous volume `3330a10eed6d19215204acdaf930d9e4bfc8a8a380b1e3deb18cb2a57f8b0d31`. Postgres image digest `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`. Node24.19.0 / Next16.3.8 / Puck0.23.0; backend38908, HTTPS proxy38909. Media/certs under `scratch/rc104a-20261018/`, build `.next-rc104a`. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, `SEED_ON_INIT=false`, email disabled. No live providers, charges, posts or external messages.

All 34 disposable admin sessions were revoked after testing; own web/proxy/container stopped, DB/media retained. No shared databases/media/environments were reset, deleted or deployed. Disposable request credentials were redacted from retained logs.

Open 04A blockers: none. First wider-checkout failure: the unrelated 03D type error above. The preceding 03D NEXT handoff was absent; source and current scope governed. Full production build/image, physical passkey hardware and aggregate release acceptance were not executed in this subpass. RC1 remains NOT READY. Stop here.

## Current-checkout revalidation

The opening source check found zero drift across all 159 entries in `tested-tree.json`. Actual implementation changes were inspected in Puck, BuilderShell, canonical PageLayouts access, layout save/rollback routes, PostgreSQL write locking, theme components, media rendering/authorization and focused tests. Existing working application behavior was reused. No application code was rewritten in this turn.

New changes are limited to three acceptance scripts: `verify-api.ts`, `verify-interactions.ts`, and `verify-restart.ts`. Each supports `RC1_04A_EVIDENCE_DIR` so reruns preserve previous receipts. The interaction suite now activates duplicate, move down, delete and Save Draft with focused buttons and actual keyboard Enter events, inspects distinct block IDs/order in PostgreSQL, and reloads with an explicit rendered iframe-heading assertion. Existing drag and broken-block assertions remain intact.

All new artifacts live in `recheck-01/`. Its `tested-tree.json` and `containment.json` identify the final source and show zero application changes/removals from the original tested tree. Prior positive UI and negative receipts remain valid only within their unchanged application-source boundary; they are not represented as fresh monolithic reruns.

Commands ran from this checkout. Runtime commands used `$env:RC1_04A_EVIDENCE_DIR='docs/rc/evidence/rc1/18-pass/04A/recheck-01'` and `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04a/run-isolated.ps1 -Action <action>`. The process-only execution-policy flag was required because the initial invocation without it was rejected before executing the script (exit 1). No persistent execution-policy setting changed.

| Current command | Exit | Observed result |
| --- | --- | --- |
| `-Action start-db` | 0 | Restarted only retained disposable `rc104a-20261018`; readiness passed |
| Six-file `npx.cmd vitest run` command listed above | 0 | 45 passed, 0 failed/skipped; `recheck-01/units.log` |
| Focused `npx.cmd eslint ... --max-warnings=0` on all implementation paths and acceptance tests listed above | 0 | 0 errors/warnings; `recheck-01/lint.log` |
| `npx.cmd tsc --noEmit -p tests/rc1-04a/tsconfig.json` | 0 | All source and scoped tests; `recheck-01/types.log`, `types-harness.log` |
| `npm.cmd run typecheck` | 2 | Same seven independent 03D diagnostics, first `tests/rc1-03d/verify-import-and-build.ts:31:42`; `recheck-01/types-global.log` |
| `-Action api` | 0 | 18 passed, 0 failed; real native HTTP create/save/preview/publication/rollback, persisted rows, malformed schema, anonymous denial and concurrent conflicts; `recheck-01/operator.log`, `api-trace.json` |
| `-Action interactions` | 0 | Final strengthened suite: 9 passed, 0 failed; genuine Chromium WebAuthn login, pointer drag, keyboard editing/reload and unavailable-block save/preview; `recheck-01/interactions.log/json`, `drag.png` |
| DB restart and identified own web/proxy process restart, then `-Action restart-check` | 0 | 4 passed, 0 failed: original five-block UI row/revision, public output and exact media checksum; `recheck-01/restart.log`, `restart-trace.json` |
| `-Action api-restart` | 0 | 2 passed, 0 failed: new operator layout/revision and public snapshot; `recheck-01/api-restart.log/json` |

Current successful groups contain 33 assertions (18 + 9 + 4 + 2) and 45 unit cases; no scoped case skipped. The earlier 5-check interaction run and the 9-check run preceding the stricter iframe wait are separate successful intermediate receipts, not additional unique coverage. Initial immediate `pg_isready` after manual DB restart returned 1 while PostgreSQL was starting; the subsequent readiness check returned 0, and both persisted-state suites passed. The final iframe-wait-only assertion was rerun in the complete interaction suite; it adds no application behavior change.

The mandatory full five-block build, responsive controls, preview/publication, rollback, denied foreign staff, save-conflict recovery and network retry retain the exact earlier receipts above. Fresh operator and browser rechecks corroborate those unchanged services. Full five-block construction and the 20-case negative suite were not independently repeated in this revalidation. No new migration/build/image/provider acceptance is claimed. The same local PostgreSQL container and image identity recorded above were verified again; no application container image was produced.

Final revalidation identity: base `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`, 159-path source overlay `b27a1e84c8d60c0d7e383b840580e3c00515804553818775b6db28b26741ccee`. Exact quality-tool executable/argument arrays and exits are in `recheck-01/commands.json`; final harness lint and scoped types were rerun after the canvas assertion (both exit 0). All five newly created disposable sessions were revoked, leaving zero active sessions, and identified own web/proxy processes and PostgreSQL container were stopped. Database/media and previous evidence remain preserved; `recheck-01/cleanup.log` records the result. No new commit or next-subpass execution. 04A PASS; aggregate RC1 remains NOT READY because broader acceptance is outside this bounded result.
