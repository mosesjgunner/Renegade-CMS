# RC1 10A — Members, passkeys, profiles and privacy

**PASS — bounded local source acceptance, 2026-10-26. Aggregate RC1 remains NOT READY.**

The mandatory member actions, persisted state, privacy negatives and actual web/PostgreSQL restart passed. A separate full repository build attempt failed in the unchanged social-studio client dependency graph; no compiled application/image or deployment acceptance is claimed.

## Exact source and environment

- Base HEAD: `0e37d694b856d6ff275c2e42d4799591717347ae`, with uncommitted changes; no commit, push, tag or deployment.
- [source-tree.json](source-tree.json): 1,423 source/config/test/script files, SHA-256 `1a0a8bdecbcc19863c87d764b94d83bc6d00927792bd2e12e27ac04477d1751c`. Final containment check passed. Package-lock identity is included. Generated declarations/dist-specific compiler includes, documentation, dependencies, secrets and disposable data are excluded explicitly.
- [environment.json](environment.json): Node 24.19.0, Next 16.3.8, development Webpack source server; `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, seeding disabled, all modules registered.
- Chromium virtual CTAP2 authenticator performed real WebAuthn challenge/signature verification. Member cookies came from the ordinary email/passkey endpoints. Staff authorization negatives use separately labelled fixture operator sessions.
- Only owned resources: PostgreSQL `rc110a-20261026`, database `rc110a_release_acceptance`, loopback port 5454; web 39010; SMTP sink 3142; `scratch/rc110a/media`; `.next-rc110a` and the failed `.next-rc110a-built` output. PostgreSQL image ID: `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929` (`postgres:17.6`).
- Own web/browser/SMTP processes are closed and database stopped, data retained. Preexisting 09D edits/evidence and other environments were preserved. Next-generated declaration/compiler changes were restored; no remaining diff in `next-env.d.ts` or `tsconfig.json`.

## Implementation / changed paths

- `src/modules/identity/member-identity.ts`: transactional enrollment using the canonical transaction adapter; email-scoped serialization; atomic token consumption; rollback-safe member/profile/identity/session creation; existing canonical-email member reuse; host-selected registration policy; rejected enrollment audits without fictitious member IDs.
- `src/modules/identity/member-passkey.ts`: atomic single-use claims for registration/login challenges.
- `src/collections/Identity.ts`: scoped staff cannot read/mutate raw profiles, read private audit details, or read/replace canonical recovery email. Global-owner governance and authenticated member self-service remain the explicit boundaries.
- `src/app/(frontend)/api/member-auth/{magic-link/complete,profile,me}/route.ts`: host-bound admission/profile writes, unverified invite-string rejection and private/no-store self-profile responses.
- `src/app/(frontend)/member-auth/{page,verify/page}.tsx`: hydration-safe sign-in controls, one submission per verification token, truthful pending-approval/network-error feedback.
- `src/app/(frontend)/members/settings/page.tsx`: real sign-out wiring, export object-URL cleanup and accurate deactivation/retention copy; removed the ineffective post-deactivation reactivation button.
- `src/modules/community/{MemberDirectory,ProfileRelationshipActions}.tsx`: errors clear directory results/pagination; relationship controls wait for persisted relationship state and expose load failure.
- `tests/unit/member-identity.test.ts`; `tests/rc1-10a/{run.ps1,browser.ts,security.ts,provenance.ts}`: focused regression, real browser/local-SMTP, operator/API, concurrency, rollback and restart verification.
- This RESULT, NEXT and the single 10A ledger row. Existing collections/schema were reused; field types/structure did not change, so no new migration/generated schema types were necessary.

## Ordinary UI / supported API proof

[trace.json](trace.json), [state.json](state.json), [browser.log](browser.log), [member-settings.png](member-settings.png): **60 passed, 0 failed, 0 skipped** in the successful complete run; command exit 0. `state.json` records the three actual member/profile identities, message/conversation IDs and run marker `mvp4l8jp`.

1. Three clean contexts used the email form and four actual loopback SMTP deliveries (three enrollments plus recovery). Each consumed its delivered link, persisted exactly one private canonical profile, edited display name/bio/locale/privacy through settings, and refetched persisted values.
2. Each enrolled a real virtual-authenticator passkey, signed out through UI, lost authenticated access, and signed in through WebAuthn to the same member. Email-link and passkey challenge replays returned 400. No admin cookie authenticated these member journeys.
3. Varied profile/field visibility, discovery opt-out, anonymous/unrelated-member denial, raw collection denial, same/foreign-site staff, foreign-site substitution, site-local follower permission, CSRF, unsafe links and foreign export ownership were checked. Directory public/opt-out/private, empty and induced 503 states were observed. Successful run used **zero development reload retries**.
4. Supported member APIs created an actual canonical message and owned comment contribution. SQL refetched the message body. The settings export UI downloaded both, while excluding forbidden credential/storage fields and the actual stored credential/session values. Unrelated conversation access returned 403; export/self responses are private/no-store.
5. Email recovery reused the same member/profile. UI deactivation persisted the lifecycle state, revoked access and hid the profile. Permanent deletion returned 410 and preserved the record.
6. Actually stopped web, closed the harness-owned adapter pool, restarted PostgreSQL, and started a new web process. Exact ordered profile/privacy rows were unchanged. Authenticated UI reads and authored-message export survived. Fresh WebAuthn login returned the original member; the deactivated member's enrolled passkey was denied. Ordinary block UI then persisted denial in the profile projection and directory.

The installed adapter retains a probe connection and its destroy routine does not close the pool. The isolated harness explicitly releases its quiescent checked-out clients and closes its pool before restarting its owned database; `pool-close.log` verifies zero connected clients. This is test resource teardown, not a claim of general database failover/recovery.

## Focused automated / operator security proof

[unit.log](unit.log): **25 passed / 0 failed / 0 skipped** across three files. [security-trace.json](security-trace.json), [security-final.log](security-final.log): **13 passed / 0 failed / 0 skipped**, exit 0. Security probes are fixture-issued tokens/operator identities, independently labelled from ordinary browser enrollment.

The persisted probes prove disabled/invite-only tenant denial of forged invite strings, no member creation on denial, concurrent same-token single winner, concurrent different valid links converging on one identity, unknown-host writes denied without persistence, private audit/email field denial for scoped staff, blocked recovery-email replacement, actual enrollment rollback on injected profile persistence failure, and successful endpoint retry with the same rolled-back token.

**Accepted scoped total: 98 passed, 0 failed, 0 skipped, 0 mandatory local checks unexecuted.** Command gates below have separate dispositions; a failing broad build is not counted as a passing test.

## Commands and exits

Run from the repository root. Disposable migration runner checks the owned container label and exact dedicated database before the fresh-schema script drops anything.

| Command | Exit / result |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-10a/run.ps1 start-db` | 0; owned container created |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-10a/run.ps1 migrate` | 0; 125 fresh migrations, idempotence/schema assertions; current migration graph unchanged |
| `npx.cmd vitest run tests/unit/member-identity.test.ts tests/unit/comm-02-profile-projection.test.ts tests/unit/comm-03a-comment-identity.test.ts` | 0; 25/0/0 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-10a/run.ps1 pool-close` | 0; installed-adapter teardown verified |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-10a/run.ps1 browser` | 0; final complete 60/0/0 journey |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-10a/run.ps1 security` | 0; final 13/0/0 persisted probes |
| `npx.cmd tsc --noEmit` | 0; full repository typecheck after restoring generated files |
| `node --import tsx tests/rc1-10a/provenance.ts --check` | 0; exact final source containment |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-10a/run.ps1 stop-db` | 0; stopped/data retained |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-10a/run.ps1 build` | **1; broad build blocker below** |

Focused lint, exit 0 (`lint.log`):

```powershell
npx.cmd eslint src/collections/Identity.ts src/modules/identity/member-identity.ts src/modules/identity/member-passkey.ts src/modules/community/MemberDirectory.tsx src/modules/community/ProfileRelationshipActions.tsx 'src/app/(frontend)/api/member-auth/magic-link/complete/route.ts' 'src/app/(frontend)/api/member-auth/profile/route.ts' 'src/app/(frontend)/api/member-auth/me/route.ts' 'src/app/(frontend)/member-auth/page.tsx' 'src/app/(frontend)/member-auth/verify/page.tsx' 'src/app/(frontend)/members/settings/page.tsx' tests/unit/member-identity.test.ts tests/rc1-10a/browser.ts tests/rc1-10a/security.ts tests/rc1-10a/provenance.ts --max-warnings=0
```

## Policy, limits and retained failures

Permanent hard deletion is excluded by approved scope. The supported action is deactivation: revoke sessions and hide the profile, while retaining contributions, messages and audit history. Export before deactivation; reinstatement requires the site operator. Private attachment bytes are excluded. Unverified public invite strings do not authorize registration; no newly implemented verified-invitation workflow is claimed.

Physical-device/browser-platform certification, remote email delivery, a production application image and a successful production build were unexecuted/unproved. These receipts establish local WebAuthn protocol and loopback SMTP behavior.

**First broader reproducible blocker:** `run.ps1 build` fails with `UnhandledSchemeError: Reading from node:crypto`, imported by `src/modules/social/contracts.ts` into the client `src/app/(frontend)/social-studio/page.tsx`. See [build.log](build.log). Those application paths were unchanged in 10A. This prevents a whole-checkout build/readiness claim and remains open; no required module was removed to make a build pass.

Superseded browser diagnostics are preserved in `attempt-1` through `attempt-9` logs (and available traces), and are **not counted as current success**: attempts 1/2/4 stopped on hydration/cold-compilation timing; 3 exposed unready relationship controls; 5 matched export's own not-included scope declaration; 6/7 aborted at adapter pool teardown; 8 was terminated while the adapter probe held pool shutdown; 9 lost the empty-state result during development reload. The initial lint warning was fixed. Final assertion checks still require actual UI output, persisted state and denied access. Disposable session/link values in logs are redacted; [artifacts.json](artifacts.json) binds retained receipts and the successful screenshot.

No scoped mandatory blocker remains. Aggregate RC1 is NOT READY; prior 09D acceptance gaps remain outside this subpass. No next subpass executed.
