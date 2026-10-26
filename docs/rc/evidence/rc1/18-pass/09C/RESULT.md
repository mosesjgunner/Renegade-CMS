# RC1 09C — PASS (bounded local/operator acceptance)

Date: 2026-10-21 (America/Chicago). Aggregate RC1 remains NOT READY. No next subpass was executed by this agent.

## Exact source and containment

Tested host source: base commit `05f58a570ee51b0a6154d71db9d9322340c2f59f` plus [tested-tree.json](tested-tree.json), SHA-256 `65c30d18e04dbd3b2ab1a7406e959fe96fef0eab4f9e449ea2d0e0524244861d`. The manifest records every dirty source overlay path/hash and identifies 19 owned implementation/test paths. Generated 09C evidence and the cumulative ledger are excluded from the circular source hash. Final verification found **0 scoped source changes** after testing. No new commit, tag, push, publication or deployment.

Preexisting 08C/09B work and evidence were preserved. Concurrent AudienceCommandCenter, command-center, CRM and 09D test edits are outside this acceptance; they were neither authored nor reverted here. Prior 09B receipts retain their historical source boundary. This result proves 09C directly on the recorded source rather than relabeling previous proof.

Runtime: host Node.js v24.19.0. Isolated PostgreSQL 17.6 image `postgres@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`. No production application image claim.

## Implementation

- `src/modules/audience/tasks.ts`: persist sending lease and next-attempt time, honor both on replay, bound automatic sends to four attempts per explicitly requested retry cycle, retain lifetime attempts, quarantine interrupted sends, and recover orphan/interrupted work through a durable outbox scan.
- `src/scripts/run-jobs-worker.ts`: run that recovery scan in the actual worker, independently of abandoned Payload job processing state.
- `src/app/(frontend)/api/admin/audience/retry/route.ts`: same-origin enforcement; allow only safely failed/dead-letter outcomes; retain lifetime attempts and establish an explicit new retry budget. Accepted, queued, permanent rejection and unknown outcomes cannot be retried.
- `src/modules/email/delivery.ts`: classify ambiguous SMTP socket closure/reset as unknown; prevent development sink reconciliation from manufacturing acceptance after a simulated failure.
- `src/modules/audience/service.ts`: enforce suppression for marketing test recipients without subscriber records; bind provider events to canonical relation IDs and the original provider.
- `src/modules/telecom/{service,tasks}.ts`: obtain phone from canonical site-scoped contacts, timezone from member profiles, pin event kind into the existing message snapshot, recheck per-event preferences, persist/reschedule quiet-hour jobs, bind unknown reconciliation to the original provider, and constrain STOP cancellation to its site. The transport defaults to disabled and requires explicit selection.
- `src/modules/audience/payload-domain.ts`, `src/modules/module-registry.ts`, `src/payload-types.ts`: register existing telecom tasks/collections under newsletter and regenerate types.
- `src/migrations/20261021_090000_rc1_delivery_suppressions.ts` and `src/migrations/index.ts`: additive migration for canonical suppression reasons and telecom job/log enum values. Existing enum labels/history remain on rollback.
- Focused tests: `tests/rc1-09c/{run-isolated.ps1,verify.ts,telecom.ts}`, `tests/unit/rc1-09c-{delivery,telecom}.test.ts`; SMTP regressions in `tests/unit/email-delivery.test.ts` and exact task inventory in `tests/unit/payload-domains.test.ts`.

## Executed ordinary operator/API → persistence → output

`verify.ts` forwards real HTTP requests to the product campaign/retry route handlers, authenticates persisted operator sessions, creates queued delivery rows, and starts **the actual `src/scripts/run-jobs-worker.ts` process**. Auth/session prerequisites are fixtures; this is supported operator/API proof, not a Next-rendered UI or genuine WebAuthn ceremony.

Campaign test-send HTTP action → durable queue → SMTP at `127.0.0.1:3139` → captured DATA with multipart HTML/plain text and reviewed body. A supported authenticated Payload local API draft plus canonical queue command also proves duplicate queue commands yield the same delivery ID, one attempt and one exact [MIME specimen](controlled-message.eml) containing `Dedup exact body`. The [SMTP trace](smtp-trace.json) records six captured envelopes, all `@example.test`; no remote mail transport or carrier was used.

Final email persistence in [state.json](state.json): bounced=1, accepted=3, failed=1, cancelled=1, unknown=2; lifetime attempts respectively include successful operator recovery at **5**, temporary rejection recovery at **2**, and suppression after exhaustion at **4**. SMTP acceptance is recorded as acceptance with downstream delivery `not-observed`, never remote inbox success.

[Telecom state](telecom-state.json) proves canonical phone resolution, persisted quiet-hour delay, profile event opt-out, one exact emulator receipt, STOP suppression and foreign-site isolation. Registered Payload jobs execute the allowed telecom message. Quiet-hour opening-window continuation is additionally tested with a deterministic clock, explicitly unit proof rather than elapsed real overnight delivery.

## Commands, exits and counts

All PowerShell harness commands below use `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-09c/run-isolated.ps1 <action>` in the current checkout. The bypass is process-scoped; system policy was not changed.

| Command | Exit | Passed / failed / skipped |
| --- | --- | --- |
| Harness `start-db` | 0 | Dedicated `rc109c-20261021`, DB `rc109c_release_acceptance`, loopback port 5451 |
| Harness `migrate` (`npm.cmd run test:migrations:fresh`) | 0 | 125 migrations, fresh schema; second migrate checks idempotence |
| Harness `types` (`npm.cmd run generate:types`) | 0 | Generated telecom task types |
| Focused Vitest command below | 0 | **97 / 0 / 0**, 13 files |
| `npx.cmd tsc --noEmit` | 0 | 0 diagnostics at recorded run |
| Focused ESLint command below | 0 | 0 errors, 0 warnings |
| Harness `verify` | 0 | **22 / 0 / 0** operator/SMTP/worker assertions |
| Harness `telecom` | 0 | **12 / 0 / 0** telecom/security assertions |
| Harness `restart-check` | 0 | Actual PostgreSQL restart; **16 / 0 / 0** email state/replay assertions |
| Harness `telecom-restart` | 0 | **5 / 0 / 0** telecom persistence assertions |
| `git diff --check` | 0 | No whitespace errors; concurrent CRLF notices retained as notices |
| Harness `stop-db` | 0 | Own container stopped, data retained; no test/worker Node processes left |

Final accepted assertion total: **152 passed, 0 failed, 0 skipped; 0 mandatory local checks unexecuted**.

Exact focused unit command:

```powershell
npx.cmd vitest run tests/unit/rc1-09c-delivery.test.ts tests/unit/rc1-09c-telecom.test.ts tests/unit/email-delivery.test.ts tests/unit/audience-interrupted-delivery.test.ts tests/unit/aud-06-telecom.test.ts tests/unit/telecom-admin-simulate.test.ts tests/unit/rc1-09b-campaigns-templates.test.ts tests/unit/module-registry.test.ts tests/unit/payload-domains.test.ts tests/unit/module-profiles-acceptance.test.ts tests/unit/production-module-config.test.ts tests/unit/audience-newsletter-workflow.test.ts tests/unit/aud-01-audience-evidence.test.ts
```

Exact focused lint command:

```powershell
npx.cmd eslint src/modules/audience/tasks.ts src/modules/audience/service.ts src/modules/audience/payload-domain.ts src/modules/module-registry.ts src/modules/email/delivery.ts src/modules/telecom/tasks.ts src/modules/telecom/service.ts src/scripts/run-jobs-worker.ts 'src/app/(frontend)/api/admin/audience/retry/route.ts' src/migrations/20261021_090000_rc1_delivery_suppressions.ts tests/rc1-09c tests/unit/rc1-09c-delivery.test.ts tests/unit/rc1-09c-telecom.test.ts tests/unit/email-delivery.test.ts tests/unit/payload-domains.test.ts --max-warnings=0
```

## Negatives, interruption and repaired failures

- SMTP 451: persisted backoff, automatic recovery, one accepted DATA. Four failed attempts produce dead-letter. Explicit failed-only retry then accepts at lifetime attempt five. A separate retry is suppressed before another send.
- SMTP 550: one durable permanent failure; unsafe retry denied. Accepted/queued/unknown retry requests are rejected. Foreign-origin retry returns 403. Anonymous campaign action, foreign-site staff retry and native delivery creation/status forgery are denied.
- Sink captures DATA and drops the response: outcome stays unknown, attempt=1; retry denied. A different sink holds its response: actual worker is killed while row is `sending`, provider/attempt/60-second lease persisted. Restart waits for **natural lease expiry**, then quarantines unknown. One DATA, no second attempt; no lease/status SQL mutation.
- Controlled canonical bounce event updates the matching delivery and suppression; event replay creates no duplicate event. This is service-level controlled provider-event proof, not receipt from a remote provider/webhook.
- Telecom event opt-out, actual quiet-hour deferral, send-time STOP, repeated delivery execution and same-phone foreign-site STOP isolation all pass. Default disabled transport and deterministic next-window continuation have focused unit coverage.

Earlier failed runs exposed and repaired: missing suppression enum (`attempt-1-failure.log`), unsafe replay of post-DATA `ECONNECTION` (`attempt-2-failure.log`), and missing telecom job enum/registration (`attempt-3-telecom-failure.log`). Their exits were 1; they do not count as accepted proof. Expanded task inventory initially had 95 passed/1 failed and was updated to require both newly registered task names; final 97/97 pass. An earlier successful-assertion harness process required termination because open handles prevented exit; final harness closes HTTP connections and exits 0. Initial shell execution-policy failures were corrected with the process-scoped invocation above. All affected accepted runs were rerun.

## Boundaries and handoff

No scoped blocker remains. Remote SMTP sandbox/real inbox delivery, remote carrier sandbox/real carrier delivery, genuine browser/passkey ceremony, production application image and aggregate release gates were **not executed or claimed**. Local SMTP and telecom emulation remain distinct from remote outcomes. No unsolicited or remote messages, real charges, payouts, POD orders or external posts were authorized or made.

Disposable resources only: container `rc109c-20261021` stopped with its data retained; loopback sink/API and owned worker processes terminated; isolated media path `scratch/rc109c/media`. Existing environments and historical evidence untouched. See [NEXT.md](NEXT.md); stop here.
