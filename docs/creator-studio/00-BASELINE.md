# Creator Studio baseline inventory

Source inspected: `ef90e0acb9a14c22d4f05783ff3f22412d8954ab`, branch `main`, initially clean on 2026-11-22. The build pack inspected `82b5c6c7`; this checkout is newer. Local RC3 branches `rc3-09`, `rc3-15a` and `rc3-16` point at `82b5c6c7`. No release reference was changed. This is an initial source inventory, not a completed CRE-00 gate or proof of a creator journey.

## Existing seams and gaps

- `src/collections/Identity.ts`: `Members`, `Profiles`, and `Spaces`; a Space links a site to a profile and has a unique site/profile index. Space collection access uses operator site access. Member-grade creator grants and self-service Space workflows need separate verification and implementation.
- `src/collections/Publishing.ts`: `MediaAssets`, `MediaBlobs`, `MediaUploadSessions`, `Content`, `Albums`, and `MediaUsages`. Albums have `kind`, site ownership fields, visibility, ordered media references, download and EXIF policies. Their Payload read access is public, so any new private portfolio design must enforce visibility at every actual read surface; do not infer privacy from a field alone.
- `src/modules/media/workflow.ts`: `assertMediaPermission`, `uploadMedia`, `publicMedia`, and usage reconciliation are existing integration points. `src/modules/media/upload-sessions.ts` implements chunk write, retry, finalization and cancellation; finalization uses `Buffer.concat(parts)` and calls the existing whole-buffer workflow. This cannot be presented as large-file streaming.
- `src/modules/media/video.ts` defines a 250 MiB / 15 minute profile and uses `Uint8Array` sources. `src/modules/media/video-workflow.ts` includes stale-job recovery. `src/modules/media/tasks.ts` registers existing media tasks. Preserve limits until a streaming processor is actually proved.
- `src/modules/podcast-studio/capture/upload-bridge.ts` provides journal upload resume but assembles the complete recording into a `Uint8Array` before upload; it is therefore not a bounded-memory large-recording solution. The existing unit suite tests a fake transport failure/retry; it is not a live provider or browser-device test.
- `src/collections/MediaPublishing.ts` contains videos, video assets, livestream records and Podcast Studio collections. Existing public video and podcast routes live under `src/app/(frontend)/videos` and `src/app/(frontend)/podcasts`. `/studio/[showId]` is already the Podcast Studio workspace; reserve that route rather than shadowing it with a generic creator route.
- `src/modules/podcast-studio/live/live-room.ts` parses a binding; it does not by itself prove live chat. `src/modules/podcast-studio/guests/lobby.ts` implements lobby transitions and a three-remote-guest bound. Their presence is not proof of live video or recording consent enforcement across all tracks.
- Contrary to the pack's older snapshot, `src/modules/community/rooms.ts` already implements Rooms, including `createRoom`, `evaluateRoomAudience`, `requireRoomAccess`, `listRoomMessages`, read state and recap operations. `tests/integration/rc315b-groups-rooms.integration.test.ts` exercises them. Theater integration must build on this implementation and prove protected playback separately.
- `src/modules/social/adapters/youtube.ts` resolves outbound video to a buffer and uses `uploadVideoBuffer`. A production large-video path needs bounded streaming and actual provider authorization; fixture results are not external-provider proof.
- RC3 creator catalog code and `tests/integration/rc312-creator-catalog.integration.test.ts` already exist. Inspect their canonical relations and access before adding another catalog. `tests/fixtures/rc2-world.ts` supplies a two-site world used by catalog and Rooms integration tests, but it has not been extended here into the required Creator harness.

## Registration and migration direction

`src/modules/module-registry.ts` already defines `community` and `media-studio`; `src/modules/media/tasks.ts` supplies media jobs, and `compose.production.yaml` has an opt-in `media-heavy` profile. Reuse the existing registrars, task infrastructure, canonical content/media identities and room service. Choose the exact module ownership only after checking the registrar dependency graph and collection count; do not register a second queue or assume optional cross-module relationships are safe. Add additive migrations with tenant and ownership indexes, generated types, upgrade/fresh migration checks, and a retention-preserving disable/re-enable path. No schema or manifest changes have been made in this baseline.

Dependency order: site/member standing and scoped capabilities → private upload and media ownership → canonical content/portfolio references → capture and edit recipes → rooms and protected live playback → destinations, replay and catalog → portability and release proof. Each boundary must remain usable when later optional services are disabled.

## Threat model and operational assumptions

Treat member uploads, external URLs, provider callbacks and client IDs as untrusted. Recheck active identity, site, Space, object ownership and capability on each operation, including chunk retry and token issuance. Test cross-site and guessed IDs, immediate revocation, MIME/byte mismatch, active content, quotas and replayed requests. Keep originals private until policy permits disclosure; do not expose provider keys or storage keys. Apply SSRF restrictions to remote fetches, and enforce paid access at media delivery, not merely at the page.

`.env.example` documents PostgreSQL, local `MEDIA_DIR`, an optional S3-compatible backend and `APP_URL=http://localhost:3000`; `compose.production.yaml` provides the existing production topology. No external provider credentials, TURN/SFU, real live endpoint, remote viewer, physical capture devices or DNS/TLS setup were verified. Docker server 29.9.2, Node v24.19.0 and npm 11.17.0 were observed; `ffmpeg` was not found on the host PATH. Those observations do not establish a running isolated database or media service.

## Verification

See 02-CRE00-INVENTORY.md for operational details, 03-JOURNEY-TRACES.md for source paths and interfaces, and CRE-00-RESULT.md for current test evidence and limits.
