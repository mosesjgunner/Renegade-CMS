# CRE-04 browser recording

Verified November 22, 2026 against the recorder working tree based on `27d4a55da2526c13031e730f4c59cc19c65a475f`, an isolated PostgreSQL 17 database, and local media storage. Browser runs used real capture and encoding APIs with synthetic browser devices. The desktop gate passed for the journeys below. The native mobile and Safari gate remains open.

## Browser evidence

| Browser                  | Journey                                                                            | Observed result                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium 151.0.7922.34   | Microphone, pause, resume, and review                                              | Opus/WebM master. The review gate rejected a request missing the review flag with HTTP 400 and a request missing CSRF with HTTP 403.                                                                                 |
| Chromium 151.0.7922.34   | Screen, camera overlay, microphone, and shared audio                               | A 3.995-second VP8/Opus WebM master played. The camera, screen, microphone, shared audio, and original master were retained as private source assets.                                                                |
| Chromium 151.0.7922.34   | Screen share with shared audio withheld by the test, and an unavailable screen API | Screen plus microphone narration played when the share returned zero audio tracks. With the screen API absent, the UI offered camera or microphone capture and a microphone take played.                             |
| Chromium 151.0.7922.34   | Network drop during microphone capture                                             | The server held one chunk during the outage. Local export worked offline. Reconnect sent all five chunks and the reviewed master played for 4.200 seconds.                                                           |
| Chromium 151.0.7922.34   | Entire browser process crashed during camera capture                               | The same browser profile reopened with three local chunks and one server chunk. Recovery retained the three committed chunks and saved a playable 3.044-second master. The encoder tail and stop marker were absent. |
| Chromium 151.0.7922.34   | Browser storage exhausted at preflight, using an injected quota reading            | The UI reported zero durable local chunks. A same-tab export succeeded, and a reload recovered the three server chunks plus the stop marker.                                                                         |
| Chromium 151.0.7922.34   | Device loss injected on a live microphone track                                    | Recording stopped with a recovery message. The saved portion played for 1.560 seconds.                                                                                                                               |
| Chromium 151.0.7922.34   | Advertised formats limited to MP4 by the test                                      | Native MediaRecorder produced VP9 in MP4. The reviewed master played for 6.794 seconds.                                                                                                                              |
| Firefox 153.0            | Camera-only and microphone-only, including pause and resume                        | Camera produced a 5.029-second VP8/WebM master. Microphone produced a 3.480-second Opus/WebM master.                                                                                                                 |
| Safari, iOS, and Android | Native device coverage                                                             | Blocked on this Windows host. Playwright WebKit 26.5 for Windows exposed no MediaRecorder, getUserMedia, or getDisplayMedia on localhost.                                                                            |

The permission recovery lane injected a denial on first preview. The UI explained the denial and required a successful preview before recording. The second attempt used native capture and produced a 3.300-second Opus/WebM master.

The browser harness checked canonical playback, exact HTTP byte ranges, a repeated finalize returning the same asset, and HTTP 404 for another member attempting playback or finalize. The retained original master matched the browser export byte for byte where a local export was present.

## Canonical master

The screen-plus-camera browser journey saved session `8a7bdfa3-f7f7-4ce7-bc89-8d2e8ff3aed3`. Its canonical `media-assets` relationship resolved to `f1f95575-7fb6-4799-952e-9b55bf4c01db` with `publicPolicy=private`. The saved database checksum and the downloaded file both had SHA-256 `004ac3e4371821e767ee2edeafee31fc9e98fbd9655ae261c4ef5f8dcd67952c`. FFmpeg decoded the entire file with exit 0. [Playable WebM](../../scratch/cre04-browser-proof/chromium-screen-camera-canonical.webm) · [Browser receipt](../../scratch/cre04-browser-proof/chromium-screen-camera.json)

## Replay

Use a fresh `_release_acceptance` database, a separate media directory, FFmpeg and FFprobe, and a local app URL. Run `npm.cmd run test:migrations:fresh`, seed with `node --import tsx tests/cre04/seed.mts`, and run the application with the same environment. `node tests/cre04/capture.mjs chromium screen-camera` runs the screen overlay journey. The harness also accepts the lanes shown by the JSON receipts under `scratch/cre04-browser-proof`. The seed creates actual member sessions for the isolated test site. Test-only authentication routes were disabled.

`npm.cmd run test:migrations:fresh`, `npm.cmd run typecheck`, focused ESLint and Prettier, and 48 focused unit tests passed. S3-compatible range reads, native Safari/iOS and Android capture, and physical device unplug remain outside the observed evidence.
