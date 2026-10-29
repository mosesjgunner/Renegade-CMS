# RC1 13B — PASS, bounded local adapter/provider-state acceptance

2026-10-29. **135 passed / 0 failed / 0 skipped in accepted final checks:** 91 focused cases, 12 real-adapter HTTP protocol checks, 24 persisted checkout/operator checks, 8 restart checks. Zero mandatory local 13B acceptance groups unexecuted. Aggregate RC1 remains NOT READY. No next subpass executed.

This supersedes this folder's earlier partial NOT READY handoff. Remote sandbox and real production fulfillment are separate **unexecuted** evidence classes; neither is claimed by this PASS.

## Exact source and ownership

Base **`2197e44cc8624fdbf5beec8996a5c9583607c6ac`** plus [source-tree.json](source-tree.json): **1,530 source/configuration files**, SHA-256 **`6aae9249b42ddc0a8ea87d4c6105d8606ea2471c9ce6e1ed332ce0682ad796aa`**. No commit or application image created. Dependencies are bound by package-lock.json in the manifest. Documentation/evidence, dependencies, media, databases and secrets are excluded from source hashing. Final containment passes.

Preexisting 13A implementation, migration, generated types, tests, evidence and ledger row were preserved. None of its historical zero-provider-attempt proof is relabeled as 13B proof. The same checkout was used. 13B TypeScript changes are the 24 explicit paths in [check-paths.txt](check-paths.txt), plus `tests/rc1-13b/run.ps1`. Next's generated next-env.d.ts/tsconfig.json output includes now also identify `.next-rc113b`; both are bound in the manifest. No new collection schema/migration or generated Payload type change was needed: existing job audit JSON stores request identities, provider status, certainty, diagnostics, tracking and reconciliation timestamps.

Implemented canonical provider factory with Printful/Printify selection and fail-closed unsupported/missing/disabled configuration. An explicitly enabled loopback development simulator is a separate adapter mode and cannot run in production or use a non-loopback URL. Process-local emulator instances can supply catalog fixtures but cannot authorize durable operator submissions. Simulator-sold instructions cannot authorize real-provider fulfillment.

Added an independently running, authenticated HTTP simulator with durable order/call records and connection/provider namespaces. Mapping review now uses its actual catalog/template/preflight responses for either provider identity, retains canonical private artwork facts and labels the result deterministic-emulator. It returns no invented provider mockup. Standalone operator preflight also derives artwork dimensions/hash from actual same-site private PNG bytes.

Added owner/admin operator submission, reconcile, known-rejection retry, hold release and cancellation under the shared order execution lock. Submission persists an exception/reserved-attempt audit **before** external I/O. Crashes or lost responses cannot authorize automatic resubmission or manual production. Reconciliation uses stable request identity if no provider ID was received; absent/failed lookup never grants retry. Known rejected requests require an explicit audited repair reason and remain bounded to three attempts. Provider IDs block duplicate submission even for draft/hold results. Health repair is persisted and returns a safe connection projection without encrypted credentials.

Printful order create/poll now uses the documented v1 envelope/paths and stable external request identity, preserves actual status/request ID, rejects malformed/unknown observations and does not invent shipment line indices. Printify supports existing shop-product order create/poll and bounded exact external-ID lookup; unknown statuses stay exceptions. Neither adapter treats HTTP/provider failure as business success. Raw response bodies/network exception text are excluded from submission diagnostics. Unknown signed webhook types cannot invent order-created events. Actual provider rendering/upload/quote methods remain safely unavailable; external availability cannot authorize checkout without its required proof. Live creation requires explicit opt-in and remains disabled by the operator factory. No remote request or real manufacturing order was made in these runs.

The UI exposes provider order identity, observed status/request ID, local-simulator evidence, unknown-outcome guidance, reconcile and audited retry actions. Failed operation responses refresh saved job/provider state as well. Reconciliation timestamps and sanitized tracking observations survive in the audit and are refetched; no database rows were flipped to manufacture success.

## Ordinary actions → storage → observed output

Operator sessions came from canonical fixture session services with `LOCAL_E2E_TEST_MODE=false` and `ENABLE_TEST_ROUTES=false`; this is business/operator workflow proof, **not a genuine passkey ceremony**. All payments are local deterministic checkout confirmations processed by a separate real commerce worker.

1. Uploaded actual 1600×1600 private PNG bytes over HTTP, approved rights, created products/connections through supported APIs, reviewed mappings, then requested review/approval/publication. Mapping review persisted actual simulator catalog/template/preflight observations and the observed 1250 USD item estimate rather than the caller's forged cost. Shipping remains distinct from that item estimate.
2. Confirmed browser checkout, processed signed callback with the worker, and obtained paid order **`8593172e-f212-4571-ae26-8e4d91cbffc7`**, job **`01a189cf-ae77-7036-851b-02e5ce1317df`**. Released its hold and concurrently submitted twice: one HTTP 200 and one 409; one actual simulator create call, one attempt and provider order **`sim-9089dcb47fd4da62fd14`** persisted. The simulator fetched the signed private artwork URL and verified actual original-byte checksum.
3. Explicitly advanced only the isolated simulator to in_production and shipped. Supported operator polling persisted those actual simulator responses/request IDs. Browser refetch displayed the saved provider ID and `simulated:shipped`, never a real-world shipment claim. [operator.png](operator.png) is the earlier operator view; [restart.png](restart.png) is the final refetched UI. These simulator transitions are controls of the local test provider, not direct application database status mutation.
4. Reviewed the product against the separate Printify simulator connection, republished, confirmed another browser checkout and persisted order **`f4fad8fb-27c0-4e53-af3c-efc5dc9bd649`**, job **`01a189d0-8ab0-7a1c-87e9-11783d065da4`**. The simulator saved the create request/order and deliberately lost its HTTP response. Application storage recorded exception, attempt 1, no invented provider ID. Resubmit, local cancel and unauthorized repair were denied. Stable-request reconciliation recovered **`sim-86180c74f5a7ae5bdb3c`** without another submission.
5. A third real local checkout produced order **`92623fef-db47-4973-8550-91975ecff93f`**, job **`01a189d0-db56-71c8-8e3e-9ff1a7360183`**. Actual simulator HTTP 422 rejection persisted failed state, known certainty, request ID/status and redacted error. Missing repair reason/staff retry were denied. Owner's supported audited retry produced **`sim-8f0360aa359601cac018`** at attempt 2; no automatic manual package was manufactured.
6. Unsupported-provider health check saved unavailable health and safe repair guidance. Restarted only owned PostgreSQL and the independent simulator; started fresh web, separate worker and browser context. Saved identities/attempts survived, repeated submits were denied and provider order counts stayed fixed. Disabled/re-enabled connection repair retained the original provider ID. Actual signed artwork download remained byte-equal; wrong site, forged signature, expired grant and changed checksum returned HTTP 403.

[storage.json](storage.json) is a fresh read-only PostgreSQL projection from [storage-query.sql](storage-query.sql), with independent [storage-assertions.txt](storage-assertions.txt). Final **3 paid orders/plans / 3 POD jobs / 3 pending manual packages / 3 processed payment callbacks**. Job states: **shipped, submitted, submitted**; attempts **1, 1, 2**. Receipts/settlement and site/merchant/connection bindings agree. Current simulator connections have exactly **3 provider orders and 4 create requests** (one known rejection, one lost response, no duplicate creation). [provider-calls.json](provider-calls.json) retains scoped request IDs, actual response/transport outcomes and original input hashes; ingestion bearer query values are redacted. Prior failed-development simulator entries remain in retained scratch and are excluded by exact connection identity, not relabeled as current proof.

## Real adapter protocol proof and evidence classes

[protocol.json](protocol.json), produced by `tests/rc1-13b/protocol.ts`, proves **the real PrintfulPodAdapter and PrintifyPodAdapter classes** against independent loopback HTTP responses in their actual API shapes. For each: actual create request/body/external identity, observed response status/request ID, provider-server restart and persisted lookup, unknown status, redacted known HTTP rejection, and lost-response recovery by stable external ID. The harness opts into creation only within its own process and routes every request to owned loopback HTTP; its example artwork URL is protocol data and is not fetched. Actual artwork ingestion belongs to the separate application/simulator journey above. Neither harness is an approved remote sandbox. Protocol references: [Printful official API](https://developers.printful.com/docs/) and [Printify official API](https://developers.printify.com/).

| Evidence class | Executed disposition |
| --- | --- |
| Safe unconfigured/error behavior | Passed units and persisted unsupported/disabled operator actions |
| Local real-adapter protocol harness | 12 passed; actual HTTP and durable harness records |
| Local operator/simulator lifecycle | 24 journey + 8 restart checks passed, actual PostgreSQL and private bytes |
| Approved remote Printful/Printify sandbox | Unexecuted; no remote credentials/approval or provider-artifact claim |
| Real production manufacture/shipment/delivery | Unexecuted; no real POD order or physical outcome claim |

## Commands and explicit exits

| Command | Exit / result |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-13b/run.ps1 migrate` | 0; 129 fresh migrations, migration.log; guard verifies exact owned container/database before schema reset |
| Focused Vitest command below | 0; 7 files / 91 passed / 0 failed/skipped, unit.log |
| `$env:RC1_13B_DISPOSABLE='yes'; node --import tsx tests/rc1-13b/protocol.ts` | 0; 12 passed / 0 failed/skipped, protocol.log/json; owned HTTP server closed |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-13b/run.ps1 simulator` | Actual ready output on loopback 39026; independently restarted and later stopped; durable scratch preserved |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-13b/run.ps1 journey` | 0; 24 passed / 0 failed/skipped, journey.log/json |
| `docker restart rc113b-20261029` | 0; database-restart.log; label/database verified before restart |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-13b/run.ps1 restart` | 0; 8 passed / 0 failed/skipped, restart.log/json and restart web/worker logs |
| `npm.cmd run typecheck` | 0; full repository, types.log |
| `$paths=Get-Content docs/rc/evidence/rc1/18-pass/13B/check-paths.txt; npx.cmd eslint --max-warnings 0 $paths` | 0; 24 TypeScript paths, zero warnings/errors, lint.log |
| `npx.cmd prettier --check $paths` | 0; same 24 paths, format.log |
| `Get-Content …/13B/storage-query.sql -Raw \| docker exec -i rc113b-20261029 psql -X -U postgres -d rc113b_release_acceptance -v ON_ERROR_STOP=1 -t -A` | 0; fresh storage.json, independent storage assertions exit 0 |
| `node --import tsx tests/rc1-13b/provenance.ts --check` | 0; 1,530-file containment, containment.log |
| `git diff --check` | 0; diff-check.log |
| `docker stop rc113b-20261029` | 0; owned provider/web/worker/browser also stopped, data retained; resource-closure.log |

```powershell
npx.cmd vitest run tests/unit/rc1-13b-provider-truth.test.ts tests/unit/rc1-13b-adapters.test.ts tests/unit/rc1-13b-operator.test.ts tests/unit/shop-03-pod-fulfillment.test.ts tests/unit/fulfillment-provider-boundaries.test.ts tests/unit/pod-production-key.test.ts tests/unit/rc1-13a-fulfillment-eligibility.test.ts
```

Development failures were repaired rather than assertions weakened: emulator offline rejection was incorrectly marked unknown; private ingestion and simulator verifier each needed the canonical `sha256:` checksum prefix; Printify was missing from mapping review's provider allowlist. Scoped lint also caught one prefer-const. A post-run Windows encoding error during log redaction lost the journey web.log; it is explicitly marked unavailable, with no manufactured replacement transcript. The accepted journey command log/JSON, worker log, durable provider calls, storage receipt, screenshots and independently collected restart-web.log remain retained. Accepted runs exclude those failed attempts. One final restart rerun verifies the UI's concise status/request/evidence display after replacing its initial raw JSON presentation. The initial 13B partial source and earlier intermediate source hashes are superseded only for this scoped receipt; historical 13A evidence remains untouched.

## Isolation and limits

Only owned container **`rc113b-20261029`**, label **`rc1.scope=13b`**, PostgreSQL database **`rc113b_release_acceptance`**, loopback **5469**, was migrated/reset/restarted. Inspected the fresh migration script's DROP SCHEMA behavior before use; the wrapper checks the exact container label, DB environment and dedicated URL. Private media is `scratch/rc113b/media`; provider state `scratch/rc113b/provider`; protocol state `scratch/rc113b/protocol`; Next output `.next-rc113b`; web **39025**, simulator **39026**, protocol HTTP **39027**. Email/telecom outbound disabled. No `.env` edits, production migrations, existing media/database mutations, push, tag, publication, deployment, live charge, payout, real POD product order or unsolicited message.

[resource-identity.json](resource-identity.json) binds PostgreSQL image/container and screenshot hashes; it is not an application image. No open mandatory local 13B blocker. External provider preflight/rendering/quotes, real artwork/provider approval, remote sandbox success, manufacture/shipment/delivery, antivirus, genuine passkey identity and production application-image acceptance remain outside the observed evidence. No such success is implied. Stop at 13B.
