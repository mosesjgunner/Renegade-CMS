# RC1 14C - PASS

2026-11-01 (America/Chicago). Writer and SEO assistance only. Aggregate RC1 and historical 14A remain NOT READY. No next subpass executed.

## Source and implementation

Base HEAD `c7e10f524cd695a4e7b9c2f4172c7bccdaf02d3f` plus the dirty source manifest [source-tree.json](source-tree.json): **1550 files**, SHA-256 **0a56c32cce7d437ecd0625fd5e592034dd8fc3ee79f5a5b60598b87f274881bc**. No commit or application image created. Dependencies bound by package-lock.json. PostgreSQL image: `sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab`.

Read AGENTS.md, installed Next route-handler guidance, current scope/acceptance matrix, canonical AI/editorial collections/services/tests and 14B RESULT/NEXT. Preserved preexisting edits, 14A/14B evidence and resources. [containment.json](containment.json) records exact differences against the historical 14B manifest; that receipt is not relabeled current. Runtime used the Next-generated type configuration retained in [runtime-type-config.json](runtime-type-config.json); both next-env.d.ts and tsconfig.json were restored byte-for-byte to the preexisting manifest. Application modules remained unchanged through the accepted main and restart journeys.

Changes:

- Canonical workflow retrieval reads article-family-content.currentRevision, not a nonexistent content.currentRevision, and pins it into proposal provenance.
- Apply/decline serialize on the proposal row. Content applies lock the canonical content row before retrieving/checking the snapshot, and reject changed timestamps, canonical revision pins, site/collection scope or published state. Decisions, native content save, immutable revision and application audit commit in one PostgreSQL transaction; errors roll back. Native editor access and document locks remain enforced with the acting user. The canonical content hook creates the writer revision with that editor's attribution.
- SEO writes only existing seoTitle/seoDescription fields. History now returns application details; UI shows applied fields/revision and labels the captured value Original at request. Explicit accessible workflow/provider names support review controls. Existing preview/diff, model/context fingerprint, human decline and apply reused.
- Six focused writer/discovery regression cases plus guarded actual Next/Chromium/operator acceptance and provenance harness. Existing schema/types suffice; no migration or new collection needed.

Changed executable/test paths relative to preexisting 14B source:

- `src/app/(frontend)/api/admin/ai/proposals/[id]/route.ts`
- `src/app/(frontend)/api/admin/ai/proposals/route.ts`
- `src/modules/admin/AiStudio.tsx`
- `src/modules/ai/workflows.ts`
- `tests/unit/ai-workflows.test.ts`
- `tests/rc1-14c/journey.ts`
- `tests/rc1-14c/provenance.ts`
- `tests/rc1-14c/run.ps1`
- `tests/rc1-14c/tsconfig.json`
- `tests/unit/ai-writer-review.test.ts`

Documentation changes: this evidence directory and only the cumulative ledger's new 14C row. Earlier ledger rows retained.

## Accepted proof

**37 unit + 9 ordinary UI/operator + 3 restart checks = 49 passed, 0 failed, 0 skipped; 0 mandatory local 14C groups unexecuted.** Fresh database: 129 migrations, verifier exit 0. Scoped types, ESLint and Prettier exit 0. [commands.json](commands.json) records exact accepted commands and explicit exits; unit output is units-final.log, types are types-final-restored.log, lint is lint-final.log, format is format.log.

Core commands (all exit 0):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14c/run.ps1 migrate
npx.cmd vitest run tests/unit/ai-gateway.test.ts tests/unit/ai-workflows.test.ts tests/unit/ai-adapters.test.ts tests/unit/ai-egress.test.ts tests/unit/ai-writer-review.test.ts --maxWorkers=1
npx.cmd tsc --noEmit --incremental false -p tests/rc1-14c/tsconfig.json
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14c/run.ps1 product
docker restart rc114c-20261101
powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14c/run.ps1 product-restart
node --import tsx tests/rc1-14c/provenance.ts
```

## Ordinary UI -> persisted state -> observed output

Real Next routes/proxy at localhost:39057, separate PostgreSQL at loopback 5473 and a local Ollama-protocol HTTP harness on 39058. This is an adapter harness, not an Ollama engine, remote model or model-quality result. Fixture identities/site grants and canonical-service sessions authenticate editor/owner/wrong-site administrator; LOCAL_E2E_TEST_MODE=false and test routes disabled. **No ordinary passkey ceremony claimed.** Fixture content is setup data. Proposals/decisions are created through product UI/API; content edits/publication use supported native API, never direct SQL status mutation.

Owner configures the local connection through the product API. Chromium staff editor opens /admin/ai, previews and requests writer and SEO proposals, compares captured/proposed text, declines the writer proposal and explicitly applies the SEO proposal. Independent refetch proves decline and generation leave the exact content row unchanged; SEO apply persists Review title / Review description while retaining the body. Editor then requests/applies another writer proposal through UI. Canonical body now contains Review proposal; revision 2 is immutable, points to revision 1 and attributes createdBy to the editor. Proposal application records the revision, actor and changed fields. No automatic publication occurs on apply.

Accepted content ID: `32e78298-410f-43a4-919d-de6a6d10ddd3`. Editor: `b1dfadbd-d690-4555-8871-4b7c3c1733c0`. Revision 1: `9f1bddff-410f-498c-8d5c-cb212eef54ca`; writer revision 2: `9b6722ff-e412-4793-a895-9b2976c2e86a`. Independent PostgreSQL output in [persistence.log](persistence.log) confirms seven accepted-draft proposals, original/model/revision provenance, decisions/application fields, editor-attributed revision chain, persisted SEO and zero live budget leases. The test also refetches full body/revision documents, not only status labels.

Traces: [product.json](product.json), [restart.json](restart.json), product.log/restart.log and actual web.log/restart-web.log. [review.png](review.png) captures comparison/review with the writer UI refresh still pending after its committed apply; [restart-review.png](restart-review.png) proves the refetched applied writer audit after restart. browser-trace.zip retains all action/DOM/network records; repetitive screencast frames sampled to approximately 60, with raw hash and retention details in trace-retention.json. No assertions or request records removed.

## Negatives, concurrency and restart

- Anonymous and wrong-site operator apply denied with 403, content unchanged.
- Ordinary owner edits title through /api/content/id; older proposal apply returns 409 and newer title survives.
- No-provider request persists truthful no-provider, cannot apply; declined proposal cannot later apply (409).
- Concurrent apply/decline on one proposal yields exactly one 200 and one 409.
- Owner publishes through the native API, then old proposal apply returns 409; exact newly published row remains unchanged.
- Actual PostgreSQL restart and fresh web/operator/browser processes preserve body, SEO and decision audit. Applied replay returns 409. Restart UI refetch shows the applied writer revision.

Earlier attempts are not accepted: three browser exits 1 (label ambiguity, cold-route five-second expectation, then Unicode locator corruption), initial types exit 2 and lint exit 1 repaired. Logs retained separately. Their two proposals remain intact on a separate earlier fixture target; final assertions/SQL bind the fresh accepted target above.

Unexecuted boundaries: full repository suite/build, production application image, genuine passkey authentication, remote/sandbox models, public rendered SEO and in-flight crash injection. No remote provider, charge, message, post or production environment used. These are not claimed by this scoped receipt. No scoped blocker remains.

Owned resources: rc114c-20261101 (label rc1.scope=14c), database rc114c_release_acceptance, loopback 5473; isolated media scratch/rc114c/media, dist .next-rc114c and state scratch/rc114c/state.json. Web/provider/browser processes stopped and container stopped with data retained at handoff. The guarded migrate action drops only this disposable schema and must not be used to resume evidence.
