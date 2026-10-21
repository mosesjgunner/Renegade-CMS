# RC1 08C - dispatch, outbox, retries and acceptance

PASS - bounded 08C only, 2026-10-20. Aggregate RC1 and the concurrently changing whole checkout remain NOT READY for a release claim. No next subpass was executed by this run.

## Source and runtime identity

Tested base: `8775209d84d7a3071d0ba49919c71021be82ea39`, with the complete executable dirty overlay in [current/tested-source.json](current/tested-source.json). Overlay identity: `2052765e0921067a3c9e12e7e1e51ec3494ea5f7832acd623ac04e9a24b5ddb6` (SHA-256 of the manifest's compact JSON `files` array). No commit was created.

The tests ran in the detached disposable checkout `C:\Projects\RENEGADE CMS\rc1-08c-frozen-20261020`, preventing unrelated concurrent edits from changing runtime code. [current/main-containment.json](current/main-containment.json) verifies that every scoped product file, package manifest and new acceptance driver matches the user's main checkout. Differences are generated Next.js path declarations and the unused legacy `verify.ts`; unrelated concurrent audience/email/09B work is excluded and preserved. The manifest binds all unchanged files through the base SHA and all executable overlays through their individual SHA-256/size entries. This is scoped source proof, not whole-checkout acceptance.

Node `v24.19.0`, Next.js `16.3.8` webpack development, Payload `3.90.2`; see [runtime dependencies](current/runtime-dependencies.txt). No production application image/build acceptance is claimed. Disposable PostgreSQL image `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, container `a50cc143907f9796178397d04e00222a377bb410769fe1f53df7f75bff7012ce`, label `renegade.acceptance=rc108c-current-20261020`, loopback port `5466`, database `rc108c_accepted_release_acceptance`. Full filtered identity and retained diagnostic databases: [resources.json](current/resources.json).

## Implementation

- Canonical social worker now pins approved content and site/account scope; acquires the existing PostgreSQL execution lock per variant; commits a publishing lease and started attempt before networking; and commits response, outbox, variant, parent, receipt and next durable job together. External delivery is outside the database transaction; no atomic transaction across PostgreSQL and a provider is claimed.
- Explicit `unknown` outcomes quarantine lost responses/timeouts. Bluesky uses deterministic record keys and read-only reconciliation, verifying returned URI/content before recording success. Mastodon retains idempotency keys and leaves unsupported reconciliation unknown. Neither adapter fabricates acceptance. Media uses the canonical resolver and fails explicitly when unavailable.
- Known transient/rate-limited failures receive durable, due-time-aware retries capped at three attempts. Failed-only retry never resends success, terminal failure or uncertain work. Expired leases recover through the actual jobs-worker outbox sweep; an active lease cannot be bypassed even by the same worker ID.
- Operator worker endpoints enforce both account and draft site scope, reject unsupported actions and filter due/eligible work before the batch limit. Native collection access cannot create forged queue/receipt rows or write draft/variant publication and approval fields. Disconnect/configuration refusals are terminal and truthful.
- Adapters require explicit loopback test origins, bound requests and disable redirects. Receipt mode distinguishes exact local origins, explicitly named HTTPS sandbox origins and live providers. Numeric/date/reset retry headers are parsed. Browser hashing now uses pinned `@noble/hashes@1.8.0`, preserving existing SHA-256 keys while removing the Node crypto client-bundle failure.
- The Social Command Center presents per-action failures, uncertain outcomes, retry timing and persisted provider mode; retry and reconciliation buttons call the canonical service. Scheduling enqueues actual Payload `operations` jobs. A registered migration and generated types add `unknown` to all four shared social enums.

Changed product paths: `src/app/(frontend)/api/admin/social/{drafts,worker}/route.ts`; `src/collections/Social.ts`; `src/modules/social/{tasks,contracts,models,provider-runtime,dispatch-boundary}.ts`; `src/modules/social/adapters/{bluesky,mastodon}.ts`; `src/modules/admin/SocialCommandCenter.tsx`; `src/scripts/run-jobs-worker.ts`; `src/migrations/{index,20261020_080000_rc1_social_dispatch_recovery}.ts`; `src/payload-types.ts`; `package.json`; `package-lock.json`. Focused tests: `tests/unit/{rc1-08c-current,rc1-08c-social-dispatch,social-contracts}.test.ts`, `tests/rc1-08c/{run-current.ps1,verify-current.ts,tsconfig.current.json}`. Exact paths and byte identities are in the source manifest. This receipt, `NEXT.md` and the single cumulative ledger row were updated.

## Executed operator/browser -> persistence -> output

The driver installs isolated actors, site grants, encrypted local account connections and canonical session fixtures. Test-auth routes and local E2E authentication are disabled. Fixture session insertion is explicitly not ordinary WebAuthn enrollment/login acceptance. All draft/review/approval/scheduling/dispatch/retry/reconcile/disconnect business actions then use supported product HTTP APIs and Chromium controls. There are no SQL business status or lease edits.

In `/admin/social`, the operator dispatched a two-destination approved draft: actual Bluesky HTTP success and deliberate Mastodon HTTP 500. PostgreSQL and the browser showed published/failed children and a partially-published parent. Failed-only UI retry published the failed destination; the successful destination retained one send. The observed sink URL returned the exact submitted text. See [primary trace](current/journey-trace.json), [partial destination screenshot](current/partial-destination.png), [provider output](current/provider-state.json) and [persisted rows](current/persistence.json).

Further real cases covered 429/backoff, early retry denial, three-send ceiling, lost response after provider acceptance, read-only UI reconciliation, real socket timeout, unsupported reconciliation, ordinary disconnect and an explicitly unapproved loopback origin with zero requests to that sink. Anonymous, foreign-site, same-site insufficient role and cross-origin actions were denied; native approval/state/receipt forgery attempts left persisted state unchanged. Active-lease, cancellation, approval mutation and malformed adapter response guards also have focused contract coverage.

The driver killed the actual web dispatch process after the sink accepted a post. PostgreSQL retained `publishing`, a real lease and a `started` attempt. It started `src/scripts/run-jobs-worker.ts`, waited for the natural 60-second lease expiry, and observed published recovery with exactly one send and one attempt. A fresh browser page displayed that recovered state: [screenshot](current/recovered-publication.png), [worker output](current/worker.txt).

Final persisted state: 10 queue rows (5 published, 3 failed, 1 unknown, 1 future scheduled), 13 attempts and 5 confirmed external posts. The sink retained 6 accepted messages across 10 POST requests; the additional accepted Mastodon timeout remains unknown with no published receipt. Persisted `(account, remoteId)` pairs are unique. [state.json](current/state.json) contains exact IDs and counters.

The owned PostgreSQL container was then actually restarted. A new web process, with no provider sink running, verified all 10 queue status/attempt pairs, exact receipt/attempt counts and a zero-work dispatch that added no attempt: [restart trace](current/restart-trace.json).

## Commands and counts

All commands below ran in the frozen checkout identified above. PowerShell output logs retain the corresponding actual output; empty lint/type logs mean exit 0 with no diagnostics.

| Command | Exit | Result / evidence |
| --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-08c/run-current.ps1 -Action migrate` | 0 | Fresh, empty owned target; 124 migrations, [log](current/migrations.txt) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-08c/run-current.ps1 -Action types` | 0 | Scoped typecheck, [log](current/types.txt) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-08c/run-current.ps1 -Action lint` | 0 | Scoped ESLint, zero warnings, [log](current/lint.txt) |
| `npm.cmd run typecheck` | 0 | Repository typecheck of frozen candidate, [log](current/typecheck.txt) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-08c/run-current.ps1 -Action verify` | 0 | 41 passed, 0 failed/skipped, [log](current/journey.txt) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-08c/run-current.ps1 -Action restart-check` | 0 | 14 passed, 0 failed/skipped, actual PostgreSQL restart, [log](current/restart.txt) |
| `npm.cmd ls @noble/hashes next payload --depth=0` | 0 | Installed dependency identities, [log](current/runtime-dependencies.txt) |

Additional exact commands, both exit 0:

```powershell
$env:NODE_ENV='test'
npx.cmd vitest run tests/unit/rc1-08c-current.test.ts tests/unit/rc1-08c-social-dispatch.test.ts tests/unit/social-contracts.test.ts tests/unit/rc1-08a-social-providers.test.ts tests/unit/rc1-08b-social-composer.test.ts tests/unit/dist-03-social-command-center.test.tsx tests/unit/dist-05-social-api-routes.test.ts
npx.cmd eslint src/modules/social/models.ts src/modules/social/provider-runtime.ts src/migrations/20261020_080000_rc1_social_dispatch_recovery.ts src/migrations/index.ts tests/unit/rc1-08c-social-dispatch.test.ts tests/unit/social-contracts.test.ts --max-warnings=0
```

[Unit result](current/unit.txt): 7 files / 51 tests passed, 0 failed/skipped. [Additional lint](current/lint-additional.txt): zero warnings. Final behavioral total: **106 passed = 51 unit/contract + 41 primary + 14 restart; 0 failed, 0 skipped, 0 mandatory local checks unexecuted**. Migration operations and lint/types are separate gates, not added to this test count.

Unexecuted/unclaimed acceptance categories (4): ordinary WebAuthn ceremony, remote-provider sandbox delivery, real-world provider delivery, production application image/build. All network publication proof here is actual protocol traffic to explicitly configured local sinks, never external social posting.

## Historical containment and disposition

Earlier attempts remain diagnostic, excluded from final counts: attempt 01 had 2 passed/1 failed (sink RPC path mismatch); attempt 02 had 16 passed/1 failed (fixture retry window too short for the negative); attempt 03 had 31 passed/1 failed (interrupted browser page reload); attempt 04 had 41 passed/0 failed against the instrumentation-only predecessor. These were repaired and rerun; `attempt-*` logs/traces, `attempt-02-tested-source.json`, `tested-source-v1.json` and `attempt-04-tested-source.json` retain their original source boundaries. The final full journey was rerun against the exact scoped main-source bytes after the concurrent debug-log removal, using another fresh disposable database. No stale proof is assigned to the final manifest.

The previous root receipt/handoff are preserved byte-for-byte as `PRIOR-RESULT-20261020.md` and `PRIOR-NEXT-20261020.md`; their root screenshots/traces/manifest retain their historical identity in [preserved-prior-evidence.json](current/preserved-prior-evidence.json). Their old counts and claims are not incorporated into this result. Earlier initial/intermediate quality logs are diagnostics, not final gates.

Owned web/worker/sink processes and loopback listeners were stopped. The owned PostgreSQL container is stopped; all five disposable databases, media/scratch state and the frozen checkout are retained. Existing environments, unrelated source edits, databases, secrets and historical evidence were preserved. No reset/clean, push, tag, deployment or external post occurred.

Final closure: `git diff --check` exit 0; scoped main-source hashes and preserved historical evidence hashes rechecked, with a single 08C ledger row. See [closure.json](current/closure.json).

Open scoped blockers: **none**. Next: stop here and await an explicit next-subpass instruction; use `NEXT.md`.
