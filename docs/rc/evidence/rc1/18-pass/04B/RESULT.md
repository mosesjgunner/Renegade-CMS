# RC1 04B — themes, globals and safe switching

Status: **04B PASS** (2026-10-18, America/Chicago). This is a bounded subpass receipt, not aggregate RC1 readiness.

## Exact source and isolation

Base commit: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`, with the complete 172-path dirty overlay in [tested-tree.json](tested-tree.json): `f8ea22a22dbeeb291275fa02d6adc76b26ea12d848e46ce2fb21fe3552bd2ddf`. No commit, push, tag, publication or deployment. Preexisting edits and earlier evidence remain in place; earlier 04A proof is not counted as a new 04B run.

Runtime: current-checkout Next development server, loopback HTTP 38910 and local HTTPS proxy 38911. **No application production image was built or tested.** Dedicated container `rc104b-20261018`, PostgreSQL 17.6 image ID `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, loopback PostgreSQL 5439, database `rc104b_release_acceptance`. Media, copied theme packages and local TLS fixtures are under `scratch/rc104b-20261018/`; build output is `.next-rc104b`. The migration runner's schema drop was inspected first and ran only against this explicitly disposable database. No existing database, media directory, Compose stack or provider was changed.

`LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, email disabled, no external provider actions. Fixtures create users and issue canonical signed operator sessions with persisted `admin_sessions` entries; subsequent actions use the real authorization and HTTP endpoints. Chromium supplements operator/API proof. **No passkey ceremony, ordinary login, deployed browser or remote-provider acceptance is claimed.** Local TLS is trusted with `NODE_EXTRA_CA_CERTS`; Node certificate validation is not disabled.

## Actual implementation

- `src/app/(frontend)/api/admin/themes/route.ts`: check canonical operator site grants for both reads and writes; publicly readable Sites records do not confer theme authority. Reject explicit unavailable sites. Require render preflight on the selected site's public host for activation/rollback, rather than conditionally probing the first public publication.
- `src/modules/presentation/request-theme.ts` and `src/app/(frontend)/layout.tsx`: unresolved HTTP hosts cannot inherit another tenant's theme/global regions through a first-publication fallback.
- `src/modules/admin/ThemeCenter.tsx`: restore persisted draft/active package and tokens into the controls; ignore stale discovery responses after site changes.
- `src/app/(frontend)/api/layouts/{patterns,templates,overview}/route.ts`: enforce canonical site grants, access-checked object reads, same-site object identity and same-origin reusable mutations. A foreign template ID cannot expose or instantiate foreign composition under an authorized site hint.
- `src/modules/presentation/composition.ts`: enforce same-site template inspection, instantiation and synchronization inside the canonical service as well as at routes.
- `src/modules/presentation/packages.ts`: support an operator-configured `RENEGADE_THEME_PACKAGES_DIR`, retaining the existing `theme-packages` default and package/integrity validation. This permits an isolated operator installation fixture without touching shipped packages.
- Added `tests/unit/rc1-04b-{theme-boundaries,template-scope}.test.ts`, expanded `tests/unit/theme-preview-identity.test.ts`, and added the guarded runner, verifier, TLS proxy, source manifest, bundle verifier and scoped type configuration under `tests/rc1-04b/`.
- Next generated the additional disposable build type entries in the already modified `tsconfig.json`/`next-env.d.ts`. No new schema or collection fields were needed; existing theme-state/audit/preview and layout snapshot services are reused.

## Executed path and persisted assertions

The owner operator uses native HTTP APIs to create and publish a canonical page, upload a real PNG, select it through the media chooser and publish a referenced layout. Each header, footer, announcement and CTA global is created, edited and published through the supported layout endpoint. A reusable pattern is saved and instantiated through its operator endpoint.

Discovery offers Neutral Starter 1.0.0, Neutral Starter 1.1.0 and Renegade Party 1.0.0. Both themes are drafted with a custom spacing token, previewed in an authenticated operator session and activated. Anonymous requests remain outside the preview. Rollback restores Neutral Starter 1.0.0; an upgrade to 1.1.0 migrates the custom token and a second rollback restores the earlier configuration.

At each observed switch/upgrade/rollback, anonymous canonical URLs render the expected theme identity and title; all four edited globals remain visible. Complete canonical content and all seven scoped content/layout/pattern records are compared against their original PostgreSQL values, including slugs, canonical paths, blocks, published snapshots and revision metadata. Media reference HTML and original PNG SHA-256 remain intact. The actual snapshots and original-media hash are in [state.json](state.json).

Negative cases: malformed and incompatible operator-installed packages appear as rejected discovery entries; missing package, invalid token, stale revision, anonymous/staff mutation, foreign owner read/write, foreign reusable discovery/creation, substituted template ID, cross-origin mutation and wrong-public-host activation are denied. A damaged declared package asset rejects activation with exact theme state retained; restoring its original bytes permits a successful retry. No business or theme status row is directly flipped to manufacture success.

## Commands and counts

All commands run from the current repository root. The runner fixes DB/media/package/build targets and disables local test authentication before invoking the underlying commands.

| Command                                                                                            | Exit | Result                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04b/run-isolated.ps1 start-db`      | 0    | Dedicated PostgreSQL created; existing containers untouched                                                          |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04b/run-isolated.ps1 migrate`       | 0    | 120 fresh migrations; second migration invocation idempotent; schema assertions pass                                 |
| Unit command below                                                                                 | 0    | 6 files, 52 passed / 0 failed / 0 skipped                                                                            |
| `npx.cmd tsc --noEmit -p tests/rc1-04b/tsconfig.json`                                              | 0    | All source plus scoped verification/tests; 0 diagnostics                                                             |
| Scoped ESLint command below                                                                        | 0    | 0 errors / 0 warnings; latest verifier also linted separately                                                        |
| Scoped Prettier check over the same TS/TSX/MJS paths plus `tests/rc1-04b/tsconfig.json`            | 0    | 17 paths pass; latest verifier formatted again after harness corrections                                             |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04b/run-isolated.ps1 verify`        | 0    | 47 passed / 0 failed / 0 skipped; operator/API journey and Chromium readback/editor loading                          |
| `node tests/rc1-04b/verify-bundles.mjs`                                                            | 0    | 4 passed / 0 failed / 0 skipped; public graph excludes Puck/BuilderShell/VisualEditor; builder owns its client entry |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04b/run-isolated.ps1 restart-check` | 0    | 15 passed / 0 failed / 0 skipped after actual web process replacement and PostgreSQL restart                         |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04b/run-isolated.ps1 types`         | 2    | Broader checkout: 7 existing 03D test diagnostics, first `tests/rc1-03d/verify-import-and-build.ts:31`; preserved    |

```powershell
npx.cmd vitest run tests/unit/pre-01-themes.test.ts tests/unit/pre-04-reusable-composition.test.ts tests/unit/theme-preview-identity.test.ts tests/unit/host-theme-cycle.test.ts tests/unit/rc1-04b-theme-boundaries.test.ts tests/unit/rc1-04b-template-scope.test.ts

npx.cmd eslint 'src/app/(frontend)/layout.tsx' 'src/app/(frontend)/api/admin/themes/route.ts' 'src/app/(frontend)/api/layouts/patterns/route.ts' 'src/app/(frontend)/api/layouts/templates/route.ts' 'src/app/(frontend)/api/layouts/overview/route.ts' src/modules/admin/ThemeCenter.tsx src/modules/presentation/request-theme.ts src/modules/presentation/packages.ts src/modules/presentation/composition.ts tests/unit/theme-preview-identity.test.ts tests/unit/rc1-04b-theme-boundaries.test.ts tests/unit/rc1-04b-template-scope.test.ts tests/rc1-04b/verify.ts tests/rc1-04b/manifest.mjs tests/rc1-04b/tls-proxy.mjs tests/rc1-04b/verify-bundles.mjs --max-warnings=0
```

Earlier exploratory commands were not all green. Harness syntax/content/reference/CSS/cookie/TLS setup errors were repaired; an initial 37-case unit run had one failure before the host-aware preview fixture was corrected. Later checks exposed and repaired the actual scoped-owner authorization gap. Browser harness corrections wait for hydrated controls and assert Puck's full heading, including `page / main`. Only the final accepted receipts contribute to the final counts; exploratory failures and the broader typecheck are not relabeled as successes.

Accepted scoped assertions: **118 passed / 0 failed / 0 skipped**, across unit (52), final journey (47), restart (15) and bundle boundary (4). Scoped mandatory groups unexecuted: **0**. Migration count is reported separately. The broader typecheck is a separate failed command with seven diagnostics, not included in this assertion total.

Receipts: [journey-trace.json](journey-trace.json), [restart-trace.json](restart-trace.json), [bundles.json](bundles.json), [theme-studio.png](theme-studio.png), [unit.log](unit.log), [migrations.log](migrations.log), [types.log](types.log). [source-check.json](source-check.json) verifies all 172 manifest paths still match after web/database restart. Bundle hashes describe the actual isolated development client-reference graphs before restart, not a production image.

Chromium selects the real site, opens the hydrated Themes tab, observes the restored active/previous package identities and persisted `2rem` token value, then loads the editor's exact full heading. After the web process changed from PID 13744 to PID 14984 and the database restarted, all seven full records, theme revision/configurations, canonical public output, four globals, referenced media HTML and original PNG bytes still match. Operator fixture sessions were removed (`admin_sessions` count 0). Only this subpass's web/proxy processes and `rc104b-20261018` container were stopped; its database/media/packages/build output remain available for review.

## Remaining boundaries and handoff

No open blocker within 04B. The broader checkout remains NOT READY: full typecheck still reports seven existing 03D test errors, first at `tests/rc1-03d/verify-import-and-build.ts:31`. Production image/build/bundle acceptance, ordinary passkey login and aggregate RC1 closure remain unexecuted in this subpass; no such claim is made. All scoped mandatory operator/persistence/error/retry/restart checks are executed. No later subpass has been started.
