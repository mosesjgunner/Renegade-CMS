# RC1 14B ? PASS

2026-11-01. Budgets, permissions, context and proposal contract only. Aggregate RC1 and prerequisite 14A remain NOT READY. No next subpass executed.

## Source and implementation

Base HEAD `c7e10f524cd695a4e7b9c2f4172c7bccdaf02d3f`; no commit created. Final dirty source manifest: [source-tree.json](source-tree.json), **1,545 files**, SHA-256 **189e0cf379ec8841d6720c99789e7a9a8a5e83760d74dc0c611b7217379c8b2d**. Package lock identifies dependencies. No application image built/tested. PostgreSQL image: `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.

Preserved preexisting 14A implementation, evidence, database and unrelated work. [containment.json](containment.json) identifies exact differences against its historical manifest; that receipt is not promoted. Next temporarily generated `.next-rc114b` type references during runtime; restored the preexisting `.next-rc114a` references afterward and reran scoped types. Runtime application modules were unchanged after the accepted final journey/restart. The final manifest includes this type-reference restoration.

14B changes:

- `src/modules/ai/gateway.ts`: independently bound execution when adapters ignore abort; distinguish timeout/cancellation; reject invalid budgets and negative/nonintegral/missing usage rather than inventing free usage; explicitly require public/published sources; fingerprint exact outgoing context; reject redirects on discovery/generation; let the AI deadline precede the HTTP fallback deadline. Existing canonical safeFetch still denies remote private-address egress. Private editorial notes remain excluded; model output has no executable tools.
- `src/modules/ai/workflows.ts`: optional expected-site check before examining foreign content/media fields; distribution source remains public/published and same-site.
- `src/app/(frontend)/api/admin/ai/{preview,proposals}/route.ts`: pass authorized site into canonical retrieval; persist request fingerprint, task, model/provider, limits, controls, target version, actor, usage and audit ID in canonical proposal records. No new collection/migration needed. Context history contains the fingerprint and authorized object IDs, not the prompt, private notes or provider credentials. Existing original/output fields remain reviewable authorized proposal values.
- `tests/unit/ai-{gateway,workflows,adapters,egress}.test.ts`: focused security/budget/cancellation/egress regression coverage. Also fixed the preexisting 14A adapter test's missing required `structured: false` argument.
- `tests/rc1-14b/{run.ps1,journey.ts,provenance.ts,tsconfig.json}`: guarded disposable migration, real Next HTTP operator journey, actual PostgreSQL/process restart and source identity. The small route-transport harness is retained for diagnostics; accepted runtime proof uses `product`/`product-restart`, which use actual Next routes and proxy.

No autonomous publish/send/spend/moderate/permission grant/provider edit route was added or invoked. The existing proposal task allowlist rejects autonomous task names; extra structured action fields are stripped before persistence. Existing explicit human review/apply remains the only content write.

## Accepted proof

**31 unit tests + 13 ordinary HTTP operator checks + 6 restart/review checks = 50 passed, 0 failed, 0 skipped in accepted runs; 0 mandatory local 14B groups unexecuted.** Fresh database: 129 migrations. Focused types/lint/format pass. Full repository suite, production build/image, browser UI, genuine passkey ceremony and remote/live model behavior were not executed or claimed. The required ordinary-action alternative is the supported operator API.

[commands.json](commands.json) records exact commands and explicit exits. Main commands (all exit **0**):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14b/run.ps1 migrate
npx.cmd vitest run tests/unit/ai-gateway.test.ts tests/unit/ai-workflows.test.ts tests/unit/ai-adapters.test.ts tests/unit/ai-egress.test.ts --maxWorkers=1
npx.cmd tsc --noEmit --incremental false -p tests/rc1-14b/tsconfig.json
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14b/run.ps1 product
docker restart rc114b-20261101
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14b/run.ps1 product-restart
node --import tsx tests/rc1-14b/provenance.ts
```

Scoped ESLint and Prettier exact path lists/exits are in commands.json; raw output is in `lint-final.log` and `format.log`. Final type output is `types-final-restored.log`; units are `unit-accepted.log`.

### Ordinary operator API ? persistence ? observed output

Canonical-service fixture sessions authenticate real owner/staff/foreign-site administrator identities. `LOCAL_E2E_TEST_MODE=false`, test routes disabled. This is not passkey enrollment/browser acceptance. Fixture sites/content are setup data; AI statuses and review decisions are created only through product HTTP routes, never flipped in SQL.

Actual Next HTTP routes on port 39047: staff previews current draft context, requests a proposal, then reads persisted history. Owner creates a scoped connection using the supported connection API and real model/capability discovery against a local Ollama HTTP protocol harness on 39048. It is not an Ollama engine or remote model-quality proof. The draft contains hostile instructions to publish/send/spend/moderate/grant/edit providers; generated structured action fields are stripped and only title/description are saved as a proposal. Exact content row is unchanged through allowed generation and all provider error/budget/cancellation/retry paths.

Unauthenticated requests, foreign-site staff authority, foreign target hints, unsupported autonomous task and connection-disabled task are denied. Missing provider is stored as `no-provider`. Repeated ordinary requests exhaust the budget; the exhausted attempt makes zero provider calls. Provider diagnostic marker is absent from responses and DB output. A slow real adapter produces persisted `timed-out`; client abort after actual provider dispatch produces persisted `cancelled`; retry returns ready and releases the lease. Unknown billed usage conservatively retains the pre-I/O reserved maximum in the existing budget service.

After actual database restart and new web/operator processes, history and unchanged draft are read again. A foreign operator cannot apply. Human decline persists and blocks later apply. Separate explicit human apply persists only approved SEO metadata, retains body/draft status, records actor, and denies replay. Traces: `product.json`, `product-restart.json`; command outputs: `product-final.log`, `restart-final.log`; real Next request traces: `web.log`, `restart-web.log`.

Independent PostgreSQL inspection (`persistence.log`, exit 0): **13 final-fixture request records**, requester/task/audit IDs, exact context SHA-256 `5bd05ec37cda379172f743a04f4214bdfe04974be4e9353e976b4391d03a86f8`, model `14b-model`, known successful usage **80 input / 10 output / USD 0.009**. Includes no-provider, failed, ready/declined/applied, exhausted, timed-out and cancelled outcomes. **0 leaked provider diagnostics; 0 live budget leases; 129 migrations.** Authorization rejections occur before storing target content; they do not create proposals containing unauthorized material.

Inspection SQL executed through `docker exec rc114b-20261101 psql -U postgres -d rc114b_release_acceptance -c ...`:

```sql
select status,task,requested_by_id,audit_id,usage,
 context_preview->>'requestSha256' as request_sha256,
 context_preview->>'model' as model
from ai_proposals
where target_id='024e1425-fbc3-4897-a608-4d63c8fd7698' order by created_at;
select count(*) as leaked_provider_diagnostics from ai_proposals
 where output::text like '%never-log-provider-secret%';
select count(*) as live_leases from ai_connections where lease_id is not null;
select count(*) as migrations from payload_migrations;
```

### Earlier failures and limits

`earlier-attempts.log` preserves four failed exploratory route-harness runs (exit 1): incorrect expected denial code, missing disposable encryption configuration, incorrect one-call exhaustion assumption (replaced with bounded real consumption until exhaustion), then the real HTTP/gateway timeout ordering defect repaired above. It also retains one failed unit run (28 pass/1 fail, exit 1) whose old ?no HTTP options? expectation was replaced by exact restrictive redirect/timeout assertions, and an earlier six-check restart with teardown hang terminated at exit -1. Initial types found a missing required argument; repaired, final scoped types exit 0. None of those failed/terminated attempts is counted as accepted proof. Final runtime and restart both exit 0 after asserting no active DB query while releasing teardown clients.

Remaining boundaries: prompt instructions are defense in depth; the enforceable protection is absence of tools, authorized context retrieval, task allowlists, output schema projection, and explicit human apply. This does not claim a model always obeys prose. No remote credentials, charges, messages, external posts, provider products or production changes were used. Browser UI and remote providers remain unexecuted, not silently passed. No scoped blocker remains.

Owned resources: stopped container `rc114b-20261101`, label `rc1.scope=14b`, loopback port 5472, DB `rc114b_release_acceptance`; data retained. Isolated media `scratch/rc114b/media`, dist `.next-rc114b`, fixture state `scratch/rc114b/state.json`. Owned web/provider processes stopped; unrelated environments untouched. Guarded migration drops only this exact disposable database schema and must not be used as a resume command.
