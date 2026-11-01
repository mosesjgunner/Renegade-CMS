# RC1 14A — NOT READY

2026-11-01. Scope: BYO AI provider setup and capability discovery only. No next subpass executed. Aggregate RC1 remains NOT READY.

## Verdict and first remaining blocker

Implementation is present, but there is no accepted owner configure → persisted AI connection → observed UI result. `/admin/ai` failed to compile in the isolated runtime: Turbopack's PostCSS subprocess timed out (`turbopack-failure.log`); retrying with supported webpack dev mode failed with `RangeError: Failed to allocate memory`, code `ERR_MEMORY_ALLOCATION_FAILED` (`web.log`). A subsequent PowerShell launch failed with `Starting the CLR failed with HRESULT 80004005`, exit `-65536`. Host resource pressure is observed; no unrelated processes/environments were stopped to work around it.

The failure is reproducible through the guarded `resume` command in NEXT.md. A document, fixture identities, an empty UI, migrations, and passing units do not establish this subpass's acceptance.

## Source and changes

Initially clean HEAD: `c7e10f524cd695a4e7b9c2f4172c7bccdaf02d3f`. No commit created. Exact final 1,540-file source manifest: `source-tree.json`; SHA-256 `ccf169ed05cf1493515e34a4d26aed6b0439c339922802e4e7ec33d4944ccc64`. Source containment check exited 0. Dependencies are identified by the included package lock. No application image was built or tested. Owned PostgreSQL image ID: `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` (`postgres:17-alpine`).

Changed paths:

- `src/app/(frontend)/api/admin/ai/connections/route.ts`: scoped pre-save discovery with redacted failures; atomically create connection plus encrypted credential; serialize control actions; transactional disconnect removes credentials and clears capabilities/models; reject attempts to retest/re-enable disconnected records.
- `src/modules/ai/connections.ts`: reusable discovery validation; optional local credential passed to probes; registered task checks exclude prototype properties.
- `src/modules/ai/gateway.ts`: labels require selected-model probes; optional bearer authentication for local discovery/generate. OpenAI-compatible remains HTTPS chat-completions/model-discovery only; Ollama remains loopback, non-streaming generate/tags. JSON requires a successful JSON-object probe; no image-pixel support is claimed.
- `src/app/(frontend)/api/admin/ai/proposals/route.ts`: forward the same optional local credential through the existing canonical gateway.
- `src/modules/admin/AiStudio.tsx`: discover advertised models before saving, explicit adapter accessible name, truthful capability copy, visible load errors and disconnect/removal controls.
- `tests/unit/ai-adapters.test.ts`: credential rejection/redaction, text-only versus structured capability, unadvertised/empty model output, optional local bearer auth and invalid adapter/task negatives.
- `tests/rc1-14a/{journey.ts,run.ps1,provenance.ts,tsconfig.json}`: isolated real-HTTP/operator/browser acceptance, guarded destructive migration action, source provenance, scoped types.
- `next-env.d.ts`, `tsconfig.json`: Next-generated isolated dist type references. Prior generated references are preserved in tsconfig.
- This evidence directory and the single cumulative ledger row.

No schema change was needed: existing canonical AI collections already store encrypted envelopes, model/capability JSON and text statuses. Generic collection access remains denied. Existing grant, outbound-boundary, encryption and no-provider services were reused.

## Executed checks and exact commands

Commands ran from `C:\Projects\RENEGADE CMS\Renegade-CMS`. No command's success is inferred from a later shell command.

| Command | Exit / outcome |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14a/run.ps1 migrate` | 0; all 129 migrations applied once; second migration pass and physical-schema assertions pass. Guarded disposable target only. Last successful output in migrations.log. |
| `npx.cmd vitest run tests/unit/ai-adapters.test.ts tests/unit/ai-gateway.test.ts tests/unit/ai-workflows.test.ts tests/unit/connection-runtime.test.ts tests/unit/external-boundary-security.test.ts --reporter=json --outputFile=docs/rc/evidence/rc1/18-pass/14A/unit.json` | 0; 5 files, 38 passed, 0 failed, 0 skipped. Includes encrypted-envelope tamper protection, SSRF/redirect boundaries and safe no-provider behavior. |
| `npx.cmd eslint "src/app/(frontend)/api/admin/ai/connections/route.ts" "src/app/(frontend)/api/admin/ai/proposals/route.ts" src/modules/admin/AiStudio.tsx src/modules/ai/connections.ts src/modules/ai/gateway.ts tests/unit/ai-adapters.test.ts tests/rc1-14a/*.ts` | Earlier run 0, no errors/warnings. Final bounded-memory rerun also 0; exact command below. |
| `npx.cmd tsc --noEmit` | One repaired run exited 0. Initial TS2322 narrowing error was fixed. A later broad repeat was intentionally stopped under host pressure; it is not a final-current full-checkout PASS. |
| `node --max-old-space-size=2048 node_modules/typescript/bin/tsc --noEmit -p tests/rc1-14a/tsconfig.json` | 134; allocation failure / JavaScript heap out of memory, types.log. No final-current scoped type PASS. |
| `node --import tsx tests/rc1-14a/provenance.ts --check` | 0; all 1,540 source hashes match the manifest. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14a/run.ps1 journey` | Failed attempts: invalid fixture site-role selection (fixed to supported `contributor` grant); adapter-label timeout (explicit accessible name added); Turbopack CSS/PostCSS compilation failure. No complete journey accepted. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-14a/run.ps1 resume` | Final webpack attempt failed with memory allocation errors before configuration. Controller was terminated during cleanup. No accepted journey JSON was produced. |

Formatting writes were executed with Prettier on changed application/test files. An initial PowerShell script launch was rejected by its execution policy before tests; process-local `-ExecutionPolicy Bypass` was used subsequently. One attempted retry did not execute because the previous controller still held its log file. Its wrapper printed a stale `JOURNEY_EXIT=0`; that is explicitly rejected as evidence. The next retry used a different log and `$ErrorActionPreference='Stop'`.

## Ordinary path, persistence and remaining acceptance

An earlier browser attempt observed the empty no-provider UI, but no accepted current-source provider configuration journey completed. Direct SQL inspection of the owned database returned `ai_connections = 0`, `ai_credentials = 0`. These empty tables are the actual persisted outcome, not provider success. Only fixture identities, grants and site settings were created. No direct AI/business status updates were used.

Automated accepted count: 38 unit cases passed / 0 failed / 0 skipped. Accepted complete runtime journeys: 0. Three runtime browser attempts failed (selector, Turbopack compiler, webpack allocation), plus one fixture-setup failure. Mandatory runtime groups still unexecuted to completion: **6**:

1. Owner configuration, advertised models, selected-model text/JSON probes and actual persisted success.
2. Rejected credentials, saved degraded status, upstream outage and recovery/retest, runtime error/log redaction.
3. Wrong-site/foreign-object, staff/anonymous, CSRF and native-collection HTTP negatives with unchanged protected state.
4. Actual saved encrypted secret, server decryption and denied native secret reads.
5. Real PostgreSQL/web/browser restart, saved status in UI and retest using the persisted credential.
6. Ordinary disable/disconnect, transactional credential removal and blocked post-disconnect provider I/O.

These checks are implemented in the harness, not claimed as executed successes. Restart action was not run. No remote sandbox, real Ollama engine/model inference, external OpenAI-compatible provider, genuine passkey ceremony, worker/provider business outcome or production application image is claimed. Local protocol behavior is separately identified from real-world outcomes.

## Containment and cleanup

All destructive migration work was restricted to newly created container `rc114a-20261101`, label `rc1.scope=14a`, exact DB `rc114a_release_acceptance`, port 5471. The wrapper inspects both label and configured database name before setting DATABASE_URL. Migration script inspection confirmed that its `migrate` action drops the disposable public schema. Existing databases/media/secrets/evidence and other processes were preserved.

Owned web process failed; the remaining owned journey process tree was terminated. `taskkill` returned 255 because a browser child had already exited while the journey/esbuild processes were successfully terminated; this is not a test PASS. `docker stop rc114a-20261101` exited 0; data retained. Own media/dist paths are in NEXT.md. No reset/clean, tag, push, publish, deployment, charge, fulfillment order, external post or unsolicited message occurred.

## Final focused checks

Final scoped types exited **134**, allocation failure. This is a remaining verification blocker, not an ignored type gate.

Final lint command exited **0**, no errors/warnings (`lint.log`):

```text
node --max-old-space-size=512 node_modules/eslint/bin/eslint.js src/app/**/api/admin/ai/connections/route.ts src/app/**/api/admin/ai/proposals/route.ts src/modules/admin/AiStudio.tsx src/modules/ai/connections.ts src/modules/ai/gateway.ts tests/unit/ai-adapters.test.ts tests/rc1-14a/*.ts
```

Final formatting check exited **0**, all matched files formatted (`format.log`):

```text
node --max-old-space-size=512 node_modules/prettier/bin/prettier.cjs --check src/app/**/api/admin/ai/connections/route.ts src/app/**/api/admin/ai/proposals/route.ts src/modules/admin/AiStudio.tsx src/modules/ai/connections.ts src/modules/ai/gateway.ts tests/unit/ai-adapters.test.ts tests/rc1-14a/*.ts tests/rc1-14a/tsconfig.json
```

`git diff --check` exited **0**. Source containment exited **0**. Final headless-browser process inspection found none (query exit 1 because there were no matches). The stopped owned database retains its data; no existing resource was deleted. Verdict: **NOT READY**; resume 14A acceptance before starting 14B.
