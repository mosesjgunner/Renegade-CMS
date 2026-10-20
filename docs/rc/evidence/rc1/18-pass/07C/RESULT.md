# RC1 07C - Coordinated releases and recovery

**PASS 07C STATUS: PASS (bounded). Aggregate RC1 remains NOT READY.** 2026-10-19, America/Chicago.

Exact executable source: `ba65c8c7e40ff6b703ca9780d4da1ced44974934` plus [tested-tree.json](tested-tree.json), source overlay `f1e7e44a2c888bd73d2595c91eae15b8ce204533ac0a10778c833f528937181f`. Initial checkout was clean at `b5c8453f088dac0aa7266cff182d5ffdeb6600ed`. The user/external session committed the initial implementation as `ba65c8c7` during execution; final repairs remain in the manifest. No commit, reset, clean, push, tag, publication or deployment was performed by this agent.

Read root AGENTS.md, installed Next.js route-handler API guidance, RC1-SCOPE, RC1-ACCEPTANCE-MATRIX, cumulative ledger, canonical release/social/audience/publication/presentation services and tests, and 07A NEXT. No 07B NEXT existed at start or final inspection. Concurrent 07B scheduler, calendar route, canonical companion-creation changes and evidence remain preserved; this receipt does not accept 07B.

## Implementation and boundaries

- Persisted artifact ownership, including article authority derived from canonical Content and social destination account ownership. Server-derived fingerprints pin actual material and reject changed artifacts. Canonical JSON key ordering avoids false staleness after PostgreSQL JSONB persistence.
- Enforced matching release approvals, immutable executed releases, terminal replay and stale-schedule protection. Native collection writes cannot manufacture approvals, success/checkpoints or move a release to another site.
- PostgreSQL advisory locks serialize execution, cancellation and release edits. Scheduling saves release and worker job atomically. Newsletter review/scheduling uses canonical Audience services and saves recipient outbox rows/jobs in one transaction. Per-action execution remains a saga, classified as idempotent DB or outbox; the entire release is not globally atomic.
- Real per-action attempts/failures; successful actions remain unchanged during retries. Cancellation marks uncompleted actions cancelled and cancels unresolved social outbox work under its destination lock. Published effects are retained. Interrupted execution has a workspace resume action. Completed channel sends reject automatic rollback and require channel reconciliation; unsupported full-rollback copy was removed.
- Legacy operator scheduling retains approved single-article/product selection support, pins actual targets and records the operator's selection approval. The focused integration fixture now creates its own canonical site/publication, avoiding a stale broad seed that attempted to publish empty content.

Changed 07C paths: `src/modules/releases/{artifact-scope,transaction,service,saga,gates,contracts}.ts`, `src/collections/Releases.ts`, `src/modules/admin/ReleaseCenter.tsx`, `src/app/(frontend)/api/admin/releases/route.ts`, `docs/operations/coordinated-releases.md`, `tests/rc1-07c/`, the three focused unit files below and `tests/integration/content-release-acceptance.integration.test.ts`. Existing release task/ID route/publication/presentation/provider services are reused. No schema change was required for JSON action fields and contract types.

## Executed ordinary journey and persisted result

1. Provisioned isolated fixture identities/site and signed, revocable canonical operator sessions with test-auth/routes OFF. Created article through native HTTP; a separate reviewer approved it through the workflow API. Uploaded real PNG bytes; created page, newsletter and native approved social draft/destinations through supported admin APIs. Subscriber consent used request/confirm double opt-in.
2. Created release **5030728e-dbd0-48ff-89c3-86dfb3be9fed** in `/admin/releases`; pinned article, page, governed media, 308 redirect, reviewed email and approved social distribution. Admin Execute Now produced five successful actions plus the induced real-adapter HTTP 400 failure. Actual Content/page publication, public article HTML, durable email recipient row and two social outboxes were read back.
3. Stopped and restarted the real web process and PostgreSQL. Browser Retry Failed Steps ran only distribution. Harness accepted its missing post then dropped the response: the release stayed partially failed. The next explicit retry fetched the same provider record using its stable key. Final six actions succeeded; five original checkpoints were byte-identical with attempts 1; distribution attempts 3. Destination attempts were 1 and 3, with exactly two outbox rows, two external-post rows and two local provider records. No duplicate article or revision was created.
4. Actual audience email worker accepted exactly one recipient message into the development adapter sink; replay made no second message and attempts remained 1. Persisted status is **accepted**, with delivery explicitly not observed. A scheduled release created before restart completed through the real Payload worker; a cancelled scheduled job made no redirect.
5. Final operator checks proved origin denial/full-record invariance, concurrent completed replay, authenticated original-media checksum equality, exact public 308, and real page/global presentation publication. Visual inspection caught an unregistered block in the fixture. Ordinary native layout edits staged supported CTA revisions, then a **new approved page/presentation release** published them; anonymous HTML contains the intended page/header and no unavailable-component fallback. Original completed release and one canonical page row were retained. This is an explicit new publication, not a rewritten old checkpoint.
6. Final hydrated browser capture verified COMPLETED and six visibly successful action rows. [Partial failure](partial-failure.png), [completed UI](completed.png).

Persistence: [partial release](persistence-partial.json), [final release/outboxes/delivery](persistence-final.json), [new presentation/page release](presentation-persistence.json), [local provider records](provider-records.json). Trace assertions: [journey](journey-trace.json), [restart](restart-trace.json), [controls](controls-trace.json), [hydrated screenshot](screenshot-trace.json). IDs are isolated fixture IDs, not production/customer records.

## Commands, exits and counts

All commands ran at the substantive repository root with guarded process-only configuration from `tests/rc1-07c/run-isolated.ps1`. Its destructive migration action was inspected first: it drops only the explicitly isolated schema, guarded by the dedicated database suffix. Database/container/media/ports are in [runtime.json](runtime.json).

| Executed command | Exit | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-07c/run-isolated.ps1 start-db` | 0 | resource guard | 0 | 0 |
| same runner `migrate` (`npm.cmd run test:migrations:fresh`) | 0 | 123 migrations; physical schema/idempotent replay checks | 0 | 0 |
| `npx.cmd vitest run tests/unit/releases-service.test.ts tests/unit/flow-04-coordinated-releases.test.ts tests/unit/rc1-07c-releases.test.ts` | 0 | 24 cases / 3 files | 0 | 0 |
| same runner `integration` (exact Vitest command below) | 0 | 1 case / 1 file | 0 | 0 |
| same runner `verify` | 0 | 10 assertions | 0 | 0 |
| fresh `serve`, then same runner `restart-check` | 0 | 17 assertions | 0 | 0 |
| same runner `controls` | 0 | 8 assertions | 0 | 0 |
| same runner `capture` | 0 | 2 assertions | 0 | 0 |
| `node node_modules/typescript/bin/tsc --noEmit -p tests/rc1-07c/tsconfig.json` | 0 | scoped source + modified tests | 0 | 0 |
| focused ESLint and Prettier below | 0 | no diagnostics | 0 | 0 |
| `node node_modules/typescript/bin/tsc --noEmit` | 2 | not a clean repository gate | 7 existing 03D diagnostics | 0 |

**Accepted test/assertion total: 62 passed, 0 failed, 0 skipped. Scoped mandatory checks unexecuted: 0.** Migration/quality counts are separate from test cases. Full repository types remain failed, first `tests/rc1-03d/verify-import-and-build.ts:31`; this bounded result does not waive that blocker. [Raw quality](quality.txt), [migrations](migrations.txt), [journey](journey.txt), [restart](restart.txt), [controls](controls.txt), [capture](capture.txt), [full types](full-types.txt).

Exact integration command under the runner's isolated environment:

```powershell
npx.cmd vitest run tests/integration/content-release-acceptance.integration.test.ts --no-file-parallelism --hookTimeout 60000 --testTimeout 60000
```

Focused lint used `npx.cmd eslint` with these targets; evidence scripts were also checked after their final changes. Prettier used `npx.cmd prettier --check` on these TS/TSX targets, `tests/rc1-07c/tsconfig.json` and `docs/operations/coordinated-releases.md`.

```text
src/modules/releases
src/modules/admin/ReleaseCenter.tsx
src/collections/Releases.ts
src/app/(frontend)/api/admin/releases/route.ts
tests/rc1-07c/verify.ts
tests/rc1-07c/controls.ts
tests/rc1-07c/capture.ts
tests/unit/rc1-07c-releases.test.ts
tests/unit/releases-service.test.ts
tests/unit/flow-04-coordinated-releases.test.ts
tests/integration/content-release-acceptance.integration.test.ts
```

Rejected intermediate runs included stale unit/seed fixtures, fixture self-approval, JSONB ordering, a development hydration timeout and premature screenshot capture. Fixtures/assertions were repaired and accepted commands rerun; no assertion, authorization or module was weakened. Intermediate ignored logs are retained outside the lean evidence directory in disposable scratch diagnostics.

## Negatives, remaining boundaries and handoff

Proved denied anonymous/ungranted/foreign-site read and execution with unchanged release, foreign artifact/account rejection, draft/stale approval and edited-material rejection, native status/checkpoint bypass denial, cross-origin denial, failed-only retry, lost-response reconciliation, cancellation/outbox guards, completed immutability/concurrent replay and automatic channel-rollback denial. Transaction fault probes proved no orphan scheduled job or recipient outbox after storage failure.

First unresolved **07C** blocker: **none**. Unexecuted broader groups: genuine passkey ceremony, production app image/build, remote provider sandbox/real delivery and process kill during an in-flight provider request. These are not claimed by this bounded receipt; exercised recovery is actual web/DB restart with persisted failed and pending work plus a real adapter lost-response boundary. The database image digest is a PostgreSQL resource identity, not an application image identity.

Runtime: Next.js 16.3.8 development source, PostgreSQL 17.6; no application image. PostgreSQL digest `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`. Actual Bluesky adapter used only loopback port 38986 with explicit test credentials. Email used only the development local sink. No remote sandbox or real post/delivery success is claimed. Fixture operator sessions are not a WebAuthn ceremony.

Owned web/DB/harness/browser processes are stopped; DB/media retained. Other environments, historical receipts and concurrent 07B edits were preserved. Single cumulative ledger row updated for 07C only. [NEXT](NEXT.md); no next subpass executed.
