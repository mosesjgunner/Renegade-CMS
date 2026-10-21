# RC1 03B — NOT READY

2026-10-20. Only subpass 03B was executed. Aggregate RC1/current-checkout readiness is not established.

**First reproducible blocker:** the strict unpublished-preview gate expects `no-store`, but the exercised Next.js development runtime returns `Cache-Control: no-cache, must-revalidate`. Content and `X-Robots-Tag: noindex, nofollow` are correct. Installed Next code explicitly overrides development cache headers (`next/dist/server/base-server.js:1107`). Production verification could not run: `next build --webpack` fails with `UnhandledSchemeError: node:crypto`, imported by `src/modules/social/models.ts:1` through the client `src/modules/admin/SocialCommandCenter.tsx`. Social modules were retained and concurrent Social edits were preserved. No production cache success is claimed.

**Implementation:**

- `src/modules/admin/DraftAutosave.tsx`: debounced native-form draft saves, truthful success/error state, retained edits, explicit retry and prevention of repeated automatic retries after an unchanged failed save.
- `src/collections/Publishing.ts` and generated admin import map: mount autosave in Writing; retain default Lexical features and canonical media/content relationships; register the editable editorial callout block.
- `src/modules/editorial/RichText.tsx`: preserve combined formatting, actual Lexical link fields, sub/sup and safe URL handling.
- `src/modules/editorial/presentation.ts`: project callout text and canonicalize media/upload/internal-link references to IDs without discarding unknown block data.
- `src/modules/editorial/persistence.ts`: transactional restore with canonical row/document locks and rollback; normalize newly written snapshots to prevent response-depth-dependent duplicate revisions and embedded related private records; preserve historical revision rows; recheck live creator site grants; order author labels.
- `src/app/(frontend)/api/admin/workflow/revisions/route.ts`: retain lock/conflict status codes. `src/app/(frontend)/preview/article/[token]/page.tsx`: reject foreign site hosts. `src/proxy.ts`: private preview noindex/no-referrer/no-store intent; actual no-store acceptance remains blocked as above.
- Focused tests and guarded operator runners: `tests/unit/rc1-03b-current.test.tsx`, `tests/rc1-03b/{run-current.ps1,verify-current.ts,verify-privacy.ts,tsconfig.current.json}`.

Existing JSON storage and UI fields need no new migration. Canonical collections/services were reused.

**UI/operator and persistence proof:**

Native staff API created two articles and one page with real uploaded PNG media, combined marks, a link, quote, callout and two ordered authors. The native Lexical browser editor typed and autosaved a draft, reloaded it, retained unsaved text after an intercepted HTTP 503, and persisted it through Retry draft save. Both native editors remained open while the second displayed Document locked; native save with `overrideLock=true` and History restore returned 423 without changing full content/history. An injected storage failure after revision/companion writes rolled back all three persisted objects. History UI restored the first draft; supported API edits/restores recovered exact original bodies for the second article and page.

Post-restart SQL (`recovery/persistence.sql` / `persistence-sql.txt`) reports:

| Record | Persisted status | Revision sequence/count | Reasons |
| --- | --- | --- | --- |
| Article `a469846d-7726-4f84-bea8-6662b525aee3` | draft | 4 / 4 | created, edited, edited, restored |
| Article `03add6d8-f36b-4ef3-9a5d-03ea02b3a876` | draft | 3 / 3 | created, edited, restored |
| Page `f141e6a7-37b6-485c-a3de-d9dc12776622` | draft | 3 / 3 | created, edited, restored |

Every inspected revision stores the inline media reference as an ID string. See `recovery/persistence.json`, `state.json`, and phase traces. Actual inline image decoding, callout/link/combined formatting and author order were observed in the browser. Anonymous canonical URLs returned 404; draft/private paths and titles were absent from sitemap/feed. Anonymous, foreign creator, foreign host, ungranted, tampered and expired preview requests returned 404. Unauthorized edits/restores/minting and foreign revision substitution were denied with full content/history unchanged. Deleting the creator's grant through the supported API immediately invalidated its existing preview.

Both web and PostgreSQL were restarted. Ten checks confirmed exact body/authors/status for all three records, public exclusion, retained restored history, the original saved preview, decoded media bytes and the reopened native editor.

Authentication is fixture-issued production-shaped sessions backed by `admin_sessions`; test authentication/routes were disabled. These are supported operator/API and fixture-authenticated native UI observations, not an ordinary WebAuthn/login acceptance claim. No provider delivery, production image, deployment or release success is claimed.

**Commands, exits and counts:** all frozen commands ran in `C:\Projects\RENEGADE CMS\rc1-03b-frozen-20261020`. Logs retain exact runtime output.

| Command | Exit | Passed / failed / skipped / unexecuted | Evidence |
| --- | --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-03b/run-current.ps1 start-db` | 0 | owned disposable container created | `final/database.txt` |
| same runner, `migrate` (`npm.cmd run test:migrations:fresh`) | 0 | 123 / 0 / 0 / 0 migrations | `final/migrations.txt` |
| focused Vitest command below | 0 | 58 / 0 / 0 / 0 tests, 9 files | `final/units.txt` |
| runner `verify` | 1 | 17 / 1 / 0 / 11 checks; first preview cache failure stops this command | `final/journey.txt`, `journey-trace.json` |
| runner `privacy` | 1 | 12 passed, 3 cache assertions failed, 0 skipped, 0 diagnostic checks unexecuted | `recovery/privacy.txt`, `privacy-trace.json` |
| runner `restart-check` | 0 | 10 / 0 / 0 / 0 checks | `recovery/restart.txt`, `restart-trace.json`, `web-restart.txt` |
| runner `types` | 0 | 0 scoped diagnostics; all application sources included | `recovery/types.txt` |
| focused ESLint command below | 0 | 0 errors / 0 warnings, 11 files | `recovery/lint.txt` |
| `npx.cmd prettier --check tests/rc1-03b/verify-privacy.ts tests/rc1-03b/verify-current.ts tests/unit/rc1-03b-current.test.tsx` | 0 | 3 files formatted; prior application formatting check also passed | `recovery/format.txt`, `final/format.txt` |
| `git diff --check -- src tests next-env.d.ts tsconfig.json` | 0 | no whitespace errors; line-ending warnings retained | `final/diff-check.txt` |
| `npx.cmd tsc --noEmit` | 1 | 7 diagnostics in existing `tests/rc1-03d/verify-import-and-build.ts`, first line 31 | `recovery/repository-types.txt` |
| runner `build` (`node ./node_modules/next/dist/bin/next build --webpack`) | 1 | client node:crypto compilation blocker; subsequent build phases/start/journey unexecuted | `production/build.txt` |
| read-only `docker exec rc103b-final-20261020 psql -U postgres -d rc103b_final_release_acceptance -c $query` | 0 | 3 persisted rows; `$query` is exactly `recovery/persistence.sql` | `recovery/persistence-sql.txt` |

```powershell
npx.cmd vitest run tests/unit/rich-editor-draft-preview.test.tsx tests/unit/rc1-03b-current.test.tsx tests/unit/rc02-content-preview.test.ts tests/unit/rc02-published-revision.test.ts tests/unit/rc08d-lock-projection.test.ts tests/unit/editorial-workflow.test.ts tests/unit/flow-01-cmos-workflow.test.ts tests/unit/flow-00-workflow-contract.test.ts tests/unit/editorial-workflow-permissions.test.ts

npx.cmd eslint src/modules/admin/DraftAutosave.tsx src/modules/editorial/RichText.tsx src/modules/editorial/persistence.ts src/modules/editorial/presentation.ts src/collections/Publishing.ts src/proxy.ts 'src/app/(frontend)/preview/article/[token]/page.tsx' 'src/app/(frontend)/api/admin/workflow/revisions/route.ts' tests/rc1-03b/verify-current.ts tests/rc1-03b/verify-privacy.ts tests/unit/rc1-03b-current.test.tsx
```

The build attempt used an isolated, temporary `typescript.tsconfigPath` selecting the same strict all-application-source scoped configuration; its own compilation failed before typechecking/prerender. No ignoreBuildErrors setting or module removal was used. `production/next.config.tested.ts` preserves that test configuration for reproduction. The current checkout's Next configuration was not changed for it.

The original strict assertion remains failing. The independent privacy diagnostic retains that assertion, records each failure and exits 1 while collecting independent security evidence. It does not convert these failures into a PASS. The full command's 11 follow-on checks were subsequently exercised by the independent diagnostic; an end-to-end production journey and production restart remain unexecuted. Genuine WebAuthn/login acceptance was not executed or claimed.

**Source / artifact identity and preservation:**

- Initial checkout was clean at `41fd29400811ef564043e4daaad1757f98f68513`. Tested frozen base: `cabb9e5a0fb4052fd553e4bbb2b4d13760af433e` plus dirty overlays. No commit was created by this agent.
- `final/tested-source.json` binds the frozen native editor journey. `recovery/tested-source.json` binds 1,431 source/config/test files for the independent privacy phase: SHA-256 `4d3e70f417bd207b959efc64ff3aa8af76c6c32c4ed7f189a9cefa5d1ca7dcaf`. Restart-only harness delta: `recovery/restart-source-delta.json`, SHA-256 `6b147e4035d165c04434c80fc4b35d5b829765e69d038c1d35f51b956f5ab142`. `recovery/source.patch` is the reviewable final overlay.
- Application source under `src/` stayed unchanged between frozen editor, privacy and restart phases. `recovery/containment.json` records current-checkout hashes for all 14 scoped source/harness paths; generated import-map line endings differ, with identical normalized content. Concurrent Social edits and generated type-path differences are recorded without claiming whole-checkout acceptance.
- Next.js 16.3.8 / Node v24.19.0, development Webpack runtime; no application image was accepted. PostgreSQL 17.6 image ID `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`. Exact process/container identities: `recovery/environment.json`.
- Retained original PNG: 126 bytes, SHA-256 `4e5b75021a3f2565cdc7d52f2d42989938845bf2216013e477dc37269fe06d14`; see `recovery/media-identity.json`. Screenshots and artifact hashes are indexed in `recovery/evidence-index.json`. Clean preview: `recovery/unpublished-preview-restart.png`; native editor: `recovery/editor-restart.png`; lock feedback: `final/lock-conflict.png`; restore: `final/revision-restore.png`.
- Prior 2026-10-18 receipt and evidence are preserved byte-for-byte under `prior-20261018/`; all five archived file hashes were rechecked. Earlier live-checkout experimentation under `current/` ended in a Next module-factory/stream error during concurrent recompilation, exit 1, and is not acceptance proof. `final/` is the frozen development attempt that stopped at its cache assertion, not an overall PASS.
- Only owned web processes and containers `rc103b-20261020` / `rc103b-final-20261020` were stopped. Databases, media and frozen worktree remain retained. No existing environments were reset, cleaned, pushed, tagged, published or deployed.

**Next:** resolve the client/server crypto build prerequisite in its owning scope, stabilize a candidate containing these 03B changes, then rerun strict unpublished-preview cache and complete runtime acceptance. Keep 03B NOT READY until that proof passes. 03C was not started.
