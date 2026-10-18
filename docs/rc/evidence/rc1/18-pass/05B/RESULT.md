# RC1 05B - variants, governance and private media

**05B: PASS, bounded to the source below. Aggregate RC1: NOT READY.**

Base commit: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`. Final dirty overlay: `1ca1b92a3d390959c8928102f5113a59e2ca30a799d1577ee0b83ebb71fb0882` (239 paths), recorded in [tested-tree.json](tested-tree.json). No commit, tag, push, publication or deployment.

The accepted repeat began at overlay `82a4d5112e0f68e25e994b403498c5659de51ef946f91ef3da0a37db65e8d3f0` in [acceptance-retry-start-tree.json](acceptance-retry-start-tree.json). All 24 scoped source/config/test paths remain identical through the final repeat and restart; [scope-containment.json](scope-containment.json) records hashes and the separate concurrent 05A changes. This does not accept those 05A changes. Earlier changing-source runs are retained and are not promoted as final proof.

Read root AGENTS.md, installed Next.js Route Handlers guidance, RC1 scope/matrix and ledger. No 05A RESULT/NEXT existed when requested; the available 04E NEXT was read. No predecessor PASS is inferred.

## Implementation and changed paths

- `api/media/[id]/variants/route.ts`: derive permission from the persisted asset site; reject forged site hints before reads/mutations/queueing; reject non-finite focal coordinates.
- `media/[id]/route.ts`: authorize before bytes, conditionals, ranges, HEAD and downloads; use resolved replacement variants; preserve the legacy variant alias; serve the requested format or explicit 503; repair suffix ranges. Public mutable URLs now require revalidation; private bytes and denials use no-store. 304 retains cache/Vary headers.
- `modules/media/workflow.ts`: recheck private/rights policy throughout replacement chains; validate live usage targets instead of trusting stale approval projections; reject private/future article uses; support published book covers. This shared file also contains preserved preexisting/concurrent 05A work.
- `modules/media/responsive.tsx` and `modules/editorial/persistence.ts`: carry persisted derivative dimensions through article presentation and use actual width descriptors; preserve explicit decorative alt text. Preexisting editorial and concurrent replacement work is preserved.
- `collections/MediaPublishing.ts`: queue a newly created video asset inside its actual Payload transaction using the canonical transaction helper. The real API creation previously persisted a failed queue attempt with “Not Found”.
- `modules/media/video.ts` and `video-workflow.ts`: recipe version 2 samples short clips sufficiently to create the contact sheet, and persists the executed recipe identity. A real 3-second clip reproduced the missing contact-sheet failure before repair.
- `video-media/[id]/[filename]/route.ts` and `video-captions/[id]/route.ts`: enforce asset policy/site consistency before alternate bytes, revalidate public delivery, and repair video suffix ranges.
- `modules/media/audio.ts`: preserve sample-derived PCM measurements; reject unavailable normalization with 503 instead of fabricating a target measurement without changed bytes. Compressed formats cannot receive invented loudness measurements. The existing audio test now verifies actual sample-derived values and explicit normalization refusal.
- `modules/graphics/contracts.ts`, `graphics/service.ts`, `graphics-studio/page.tsx`: split browser-safe presets from server crypto/persistence so the shipping preview loads. Generation/save remain explicitly unavailable.
- `modules/media/command-center.ts`: fix numeric cleanup-result handling encountered in concurrent scoped typechecking.
- `tsconfig.json`: exclude disposable scratch data because HLS transport-stream `.ts` files are binary data, not TypeScript. Preserve all application/test includes and preexisting edits. Next also added this run's generated dist references to tsconfig/next-env.
- Focused regressions and reproducible guarded operator harness: `tests/unit/rc1-05b-private-media.test.ts`, `tests/unit/med-04-audio-metadata.test.ts`, `tests/rc1-05b/`. Complete path inventory: [scoped-paths.json](scoped-paths.json). Existing collections and types already held the governance fields; no schema migration was needed.

## Ordinary actions and persisted output

Canonical persisted operator fixture sessions authenticate through the ordinary strategy with `LOCAL_E2E_TEST_MODE=false` and test routes disabled. Fixtures create identities/sites; uploads, metadata, publication, private-policy changes and retries use real HTTP APIs. This is supported operator/API proof, not a WebAuthn enrollment/login claim.

Upload PNG → save alt/credit/ownership/rights/consent → run the durable media queue → publish an article → observe AVIF/WebP/JPEG delivery and a decoded Chromium article image. All seven approved recipes produce 20 image derivatives. Every delivered hash matches its blob checksum and physical disk bytes; originals remain unchanged. Actual pixel dimensions, MIME, cache headers, 304 and suffix bytes are checked. [journey.json](journey.json), [article.png](article.png), [state.json](state.json).

Enabled Media Studio: a published book renders its governed cover; a real local FFmpeg job produces MP4, HLS playlist/segment, poster and contact sheet; caption bytes and a published podcast's WAV enclosure are real and hash-checked. Graphics displays a truthful preview-only status. PCM level measurement is an estimate, not certified integrated LUFS; normalization has no byte-producing adapter and explicitly fails. SVG/animated originals are retained rather than silently rasterized. [studio.json](studio.json), [studio-state.json](studio-state.json).

Anonymous and foreign-site staff are denied the original, download, alias and all 20 private image variants, with exact “Not found” responses and no byte leakage. Forged variant-site hints cannot return metadata or change the full persisted asset. Private HEAD, stale usage after article privacy changes, expired rights and unsupported requested formats are exercised. Private video sources withdraw every output URL; private captions withdraw the alternate caption URL. Unit negatives also cover foreign video/caption sites and unapproved rights.

Stop/restart the own web process and PostgreSQL container, then use fresh storage adapters and HTTP reads: **50 byte objects** (5 originals, 40 image variants, 5 video outputs) match their saved hashes on disk and in delivery. Governance/consent, article output and durable worker completions persist. [restart.json](restart.json), [studio-restart.json](studio-restart.json).

## Commands and outcomes

All commands run from the current Renegade-CMS checkout. Wrapper actions set hardcoded disposable DB/media targets; fresh migration's DROP SCHEMA was inspected before use and ran only on the new disposable database.

| Command | Exit | Passed / failed / skipped |
| --- | ---: | --- |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-05b/run-isolated.ps1 start-db` | 0 | New isolated PostgreSQL container |
| Same wrapper, `migrate` (`npm.cmd run test:migrations:fresh`) | 0 | 120 migrations; idempotent second migration pass |
| Same wrapper, `verify` | 0 | 125 / 0 / 0 |
| Same wrapper, `studio` | 0 | 19 / 0 / 0 |
| Own server stop + `docker restart rc105b-20261018` + wrapper `serve` | 0 | Web and DB actually restarted |
| Same wrapper, `restart-check` | 0 | 90 / 0 / 0 |
| Same wrapper, `studio-restart` | 0 | 17 / 0 / 0 |
| Focused Vitest command below | 0 | 11 files, 89 / 0 / 0 |
| `npx.cmd tsc --noEmit -p tests/rc1-05b/tsconfig.json` | 0 | All src + 05B harness/regressions, 0 diagnostics |
| Focused ESLint command below | 0 | 0 errors/warnings |
| `npm.cmd run typecheck` | 2 | 7 independent 03D diagnostics; first `tests/rc1-03d/verify-import-and-build.ts:31` |

**340 scoped assertions pass in the final receipts.** Raw final logs: `journey-accepted.log`, `studio-accepted.log`, `restart-accepted.log`, `studio-restart-accepted.log`, `unit-final.log`, `types-final.log`, `full-types-final.log`, `lint.log`, `migrations.log`. Earlier attempts reproduce two application defects (transactional queue visibility and short-clip contact-sheet absence) and fixture-driver errors. The latter included density-adjusted naturalWidth, a populated relation passed as an ID, an omitted siteId, global queue admission and one overlapping disposable-site host mapping. Final accepted fixtures run sequentially; assertions were repaired to test actual output, not relaxed to conceal application failure.

```powershell
npx.cmd vitest run tests/unit/rc1-05b-private-media.test.ts tests/unit/med-03-variant-engine.test.ts tests/unit/media-storage.test.ts tests/unit/media-contracts.test.ts tests/unit/media-publishing-workflows.test.ts tests/unit/phase-a-media.test.ts tests/unit/med-02-dam-governance.test.ts tests/unit/med-04-audio-metadata.test.ts tests/unit/med-05-video.test.tsx tests/unit/med-ext-01-minipaint.test.tsx tests/unit/med-06-command-center.test.ts

npx.cmd eslint 'src/app/(frontend)/api/media/[id]/variants/route.ts' 'src/app/(frontend)/media/[id]/route.ts' 'src/app/(frontend)/video-media/[id]/[filename]/route.ts' 'src/app/(frontend)/video-captions/[id]/route.ts' 'src/app/(frontend)/graphics-studio/page.tsx' src/modules/media/workflow.ts src/modules/media/responsive.tsx src/modules/media/audio.ts src/modules/media/video.ts src/modules/media/video-workflow.ts src/modules/media/command-center.ts src/collections/MediaPublishing.ts src/modules/editorial/persistence.ts src/modules/graphics/contracts.ts src/modules/graphics/service.ts tests/unit/rc1-05b-private-media.test.ts tests/unit/med-04-audio-metadata.test.ts tests/rc1-05b/verify.ts tests/rc1-05b/verify-studio.ts --max-warnings=0
```

The supplementary full-tree type receipt predates later concurrently added 05A verification files. It is a retained failure receipt, not a claim that every file in the final overlay was typechecked successfully. The 05B/all-src scoped type command passed; all 24 owned proof paths are contained exactly.

## Isolation, identity and remaining boundaries

Only `rc105b-20261018`, loopback `5444` / `38960`, database `rc105b_release_acceptance`, and `scratch/rc105b-20261018/` were used. PostgreSQL 17.6 image: `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`. Development app runtime; no production application image was built or accepted. Exact FFmpeg/ffprobe/fixture hashes and flags: [runtime-identity.json](runtime-identity.json). Tools were downloaded only into this disposable scratch directory; no package/lock dependency was added.

No scoped blocker remains. Repository-wide typechecking remains blocked by the separate 03D script. Concurrent 05A work and its missing handoff are not signed off here. Three nonclaimed gate groups remain unexecuted: production build/image acceptance, real WebAuthn ceremony, and remote S3/provider proof. Graphics generation and audio normalization are explicitly unavailable; no success is claimed for them.

Own web/DB resources are stopped; database, media and evidence are retained. Existing environments, secrets, user edits and historical evidence are preserved. No next subpass executed.

