# 14D RESULT - PASS (2026-11-01)

Scoped media/social AI assistance and four-workflow cross-surface acceptance: **94 passed, 0 failed, 0 skipped, 0 mandatory 14D checks unexecuted** in accepted runs. Historical 14A and aggregate RC1 remain NOT READY. No next subpass executed.

Base commit `c7e10f524cd695a4e7b9c2f4172c7bccdaf02d3f` plus 1,555-file dirty handoff manifest [source-tree.json](source-tree.json), SHA-256 `ff94dc1732cfdf061942bac576116429f5a12dc223232b07059a35eddf118f00`. Exact executed browser/restart tree: [runtime-source-tree.json](runtime-source-tree.json), SHA-256 `766dd35b9979065e1aad93b1e344908602a665818c43970b824bbbb2a02b19b4`. No new commit or application image. PostgreSQL image `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.

Runtime and handoff application/test source are identical. Only Next-generated `next-env.d.ts` and `tsconfig.json` differ; both restored byte-for-byte to 14C, with restored types passing. Exact runtime contents remain in runtime-type-config.json. [containment.json](containment.json) proves five intentionally changed prior implementation paths, five new verifier/test paths, no removed paths, and equality for every other 14C source entry. Earlier receipts remain historical at their own source; they are not relabeled current.

Implemented:

- `src/modules/ai/gateway.ts`: optional bounded caption (500 characters) and description (2,000 characters), alongside existing alt text (240). Strict output allowlist drops publishing, grant and storage instructions. Alt-only responses retain existing omitted metadata.
- `src/modules/ai/workflows.ts`: captured-original media metadata and canonical media field application; distribution draft/source version pin invalidates proposals after parent/source changes.
- `src/app/(frontend)/api/admin/ai/proposals/route.ts`: persist the dependency version in inspectable proposal provenance.
- `src/app/(frontend)/api/admin/ai/proposals/[id]/route.ts`: lock media or social variant plus its parent during transactional human review; reject stale distribution dependencies before canonical save. Existing native access, decisions, quotas and audit are retained.
- `src/modules/admin/AiStudio.tsx`: advertise media metadata review. Existing native media/social links, human comparisons and explicit variant selection reused.
- New `tests/unit/ai-media-metadata.test.ts` and `tests/rc1-14d/{journey.ts,run.ps1,provenance.ts,tsconfig.json}`. Existing schema fields suffice; no migration/type schema change required. Ledger and this evidence/handoff updated. Preexisting unrelated edits, databases, media, secrets and 14A-14C evidence preserved.

Commands and results:

Exact argument lists and exits are in [commands.json](commands.json). `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14d/run.ps1 migrate`: exit 0, 129 fresh migrations recorded exactly once. Guard inspected the dedicated 14d container/database; this action intentionally drops only that isolated schema and is not a resume command.

`npx.cmd vitest run tests/unit/ai-workflows.test.ts tests/unit/ai-media-metadata.test.ts tests/unit/ai-gateway.test.ts tests/unit/ai-adapters.test.ts tests/unit/ai-egress.test.ts tests/unit/ai-writer-review.test.ts`: exit 0, 6 files / 44 tests passed, no failed/skipped cases. `npx.cmd tsc --noEmit -p tests/rc1-14d/tsconfig.json`, scoped ESLint (`--max-warnings=0`), Prettier check and `git diff --check`: exit 0. Restored-configuration types also exit 0.

`powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14d/run.ps1 product`: exit 0, 39 checks. Actual Next webpack dev server, real Chromium and supported authenticated product APIs; no custom route transport used in the accepted run. `docker restart rc114d-20261101`, then the same guarded runner with `product-restart`: exits 0, 11 checks using fresh web/provider/browser processes. Source checks pass before/after restart and at handoff.

Ordinary UI/operator -> persistence -> output:

The operator creates real canonical media, manual social account, draft and variant through product REST, and configures the isolated local provider through the supported AI connection API. In Chromium an alpha-site staff editor generates and inspects exact context/original/proposed output for writer, SEO, media and social. For **each** workflow the editor declines a proposal, verifies attributed persisted decline without target mutation, generates a fresh proposal, and explicitly applies it. Wrong-site and anonymous apply are denied before each apply. Social uses **Apply variant 2**.

Accepted content `9f2eec1d-9fac-4a7f-b999-5d716d56ce74` persists writer text `Review proposal`, SEO title `Review title` and description `Review description`; media `233ffd86-0542-45f5-bf01-fee8dc22e059` persists alt `River at dusk`, caption `River caption` and description `Review description`; social variant `bf2d9571-d06f-4a3c-badf-983336b9d9e7` persists `Second reviewed copy` while both variant and parent remain `draft`. Actor `8bc53eed-2c42-44f5-b79b-827b3732d028` is present on application audits. Persisted full documents/audits: persistence.json and restart-persistence.json (identical after restart). Independent PostgreSQL output: [persistence.log](persistence.log), including 26 proposals for accepted targets (4 applied, 8 declined, 4 failed, 4 no-provider, 4 no-budget, 2 stale ready), **zero social queue rows and zero live budget leases**. The two stale ready records remain unmodified evidence; apply is denied.

Negatives/recovery:

- All four browser workflows exercise HTTP 503 provider failure, persist failed proposals and leave exact canonical target documents unchanged. Restored provider health allows a fresh reviewable proposal, then human decline without mutation.
- All four deny foreign-site operator/configuration and foreign connection usage with no provider dispatch; unconfigured and quota-exhausted requests persist truthful no-provider/no-budget and do not dispatch or mutate targets.
- Untrusted source instructions request publish/send/spend/grants/provider edits. Structured provider responses also include publishing/grant/storage commands. Application writes only allowlisted content/metadata/copy; no publication or social queue is created. Provider prompts exclude storage locations/credential secrets. Text adapters explicitly disclose that image pixels were not inspected.
- Ordinary human REST changes to the media title or social parent draft invalidate older proposals (409), preserving newer state.
- Actual PostgreSQL restart plus fresh web/browser refetch preserves writer, SEO, media, selected social copy and decision attribution. All four applied proposal replays return 409.

Product/restart JSON contain named assertions; browser traces retain all actions, DOM snapshots and network records. review.png and restart-review.png show actual UI. Repetitive screencast frames sampled to 60 per trace, with original/retained hashes and event counts in trace-retention.json; no action, DOM or network evidence removed.

Three earlier browser attempts exited 1 on harness expectations (Unicode locator; populated relation ID; expected foreign-site status), repaired without weakening product assertions. Their logs and prior fixture/proposal records are retained; they are excluded from accepted totals. All final commands pass. No scoped blocker remains.

Limits/resources:

Authentication uses canonical fixture-issued operator sessions; local test mode and test routes are false. This proves ordinary product UI/actions after session establishment, **not genuine passkey enrollment/login**. The Ollama protocol adapter used an isolated loopback harness, not a real model engine, remote sandbox or external provider. No external post/message/charge, deployment, push, tag or publish occurred. Full release suites/build/image, public rendered SEO and in-flight crash injection were not executed or claimed.

Only owned `rc114d-20261101` (label 14d; loopback 5474; DB `rc114d_release_acceptance`), web/provider 39059/39060, scratch/rc114d/media and .next-rc114d were used. All own processes/container stopped, data retained; resources.json records image/state. Supported resume: start that container and run `product-restart`; never rerun `migrate` against retained evidence. Stop here.
