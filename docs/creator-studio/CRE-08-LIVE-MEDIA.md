# Solo live broadcasting

Open a theater as a room manager and expand **Broadcast from this browser**. Check camera, microphone and provider, confirm the muted local preview, choose whether to record, then start. An audience sees a lobby while waiting, a live indicator once the provider receives media, and a reconnecting state when the source drops. Reopening the host room and choosing **Reconnect source** uses the same session.

The browser publishes H.264 and Opus over WHIP. The theater uses HLS, so buffering and keyframe intervals add several seconds of latency and audience chat may arrive before the corresponding video. Test publishing and playback on the browsers and networks in use. [MediaMTX browser publishing](https://mediamtx.org/docs/publish/webrtc-clients) · [MediaMTX HLS codecs](https://mediamtx.org/docs/read/hls)

## Self-hosted MediaMTX

Use the production Compose file with the live-media overlay. Set `LIVE_MEDIAMTX_ICE_HOST` to a DNS name or IP the host's browser can reach, expose UDP 8189 to the host's browser, and serve the public Renegade site over HTTPS. For networks with restricted UDP, validate the ICE path from the expected publisher network before scheduling an event. `LIVE_MEDIAMTX_STUN_URL` sets an optional browser STUN server. [MediaMTX connectivity](https://mediamtx.org/docs/features/webrtc-specific-features)

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.live-media.yaml up -d
```

At the TLS edge, forward `/live-media/` unchanged to the gateway, using the same public origin as the room. The example uses the overlay's loopback port.

```nginx
location ^~ /live-media/ {
    proxy_pass http://127.0.0.1:8088;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_buffering off;
    access_log off;
}
```

Keep MediaMTX's HTTP ports for WHIP, HLS, playback, and the Control API on the dedicated private Compose network. Its internal services trust that network. Only the gateway and WebRTC UDP listener are published. The HTTPS edge should preserve the request host and avoid logging cookies, Authorization headers, response bodies, and browser media credentials.

The gateway asks Renegade for an authorization decision on every WHIP, playlist, segment, and replay request. Media bytes go between the browser, gateway, and MediaMTX. Renegade issues a 90-second audience cookie scoped to the specific broadcast and verifies the current room policy on each media request. Revocation takes effect on the next request. Bytes already buffered may still play.

Recording is separately selected before publishing. MediaMTX writes fMP4 to the `live_recordings` volume. Renegade displays available replay parts after the source has ended and the provider acknowledges stop. A reconnect can produce multiple parts. Live and replay use the room's current access policy. The supplied configuration retains recordings for seven days. Size the volume independently from the web server. [MediaMTX recording](https://mediamtx.org/docs/features/record) · [MediaMTX recording playback](https://mediamtx.org/docs/features/playback)

MediaMTX also offers WHEP, RTMP, and encrypted RTMP in its native gateway configuration. This profile uses WHIP and HLS. HTTP authorization provides a fresh decision on every HLS request, while a connected WHEP viewer would also require explicit session teardown on revocation. RTMP/RTMPS uses its own authenticated listener and certificates. [MediaMTX WHEP](https://mediamtx.org/docs/read/webrtc) · [MediaMTX configuration](https://mediamtx.org/docs/references/configuration-file)

The pinned MediaMTX image passed two native protocol checks alongside the application test. A browser WHEP offer returned HTTP 201 and decoded incoming video while receiving audio. FFmpeg 8.1.3 published H.264 and AAC over RTMP and certificate-verified RTMPS, and ffprobe found both tracks in the corresponding HLS streams. To reproduce, enable the native RTMP listener with `rtmpEncryption: optional` on an isolated instance, configure its TLS certificate, publish an H.264/AAC FLV stream to each listener, and probe the two `index.m3u8` endpoints. [MediaMTX control and protocol configuration](https://mediamtx.org/docs/references/configuration-file)

MediaMTX uses an HLS session redirect before returning the master playlist. The gateway rewrites that redirect under the protected room prefix and carries the provider's HLS session reference in child playlist and segment requests. Keep both locations under the same protected prefix when adapting the gateway configuration.

## Optional Cloudflare Stream

For managed-only deployment, use `compose.live-managed.yaml` with the base production file. Set `LIVE_CLOUDFLARE_ACCOUNT`, `LIVE_CLOUDFLARE_TOKEN`, `LIVE_CLOUDFLARE_CUSTOMER_HOST`, `LIVE_CLOUDFLARE_KEY_ID`, and `LIVE_CLOUDFLARE_PRIVATE_KEY` on the web service. Supply the signing key as PEM; the environment value can use escaped newlines. The API token needs Stream edit access on the specified account.

Create a dedicated input with automatic recording and signed playback required. Register the input as `<room UUID>=<input UID>` in the comma-separated `LIVE_CLOUDFLARE_INPUTS` and select it in the host controls. Each input is reserved for one Renegade broadcast. A later broadcast uses a new input. This avoids replay mixing and duplicate input creation on retry. [Cloudflare live inputs](https://developers.cloudflare.com/api/resources/stream/subresources/live_inputs/) · [Cloudflare signed playback](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)

The managed adapter supports unrestricted public theaters. It issues short-lived signed HLS links with 120–240 seconds of remaining validity at issuance. Once Renegade revokes the broadcast it stops issuing links. A previously issued CDN link can remain usable until expiry. Member, paid, invite, and otherwise restricted theaters require the MediaMTX gateway's per-request authorization.

Cloudflare publishes storage pricing of USD 5 per 1,000 stored minutes per month and delivery pricing of USD 1 per 1,000 delivered minutes. A single viewer watching 21 minutes represents USD 0.021 in delivery usage at that rate. Check the account plan and minimum storage allocation separately. MediaMTX has no per-minute software charge. Its costs depend on compute, disk usage, and transferred bytes. [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/)

## Reproduce the gate

Use the guarded integration test on a fresh `*_release_acceptance` database. Run Renegade and the real gateway with the worker/test-auth switches off. The test uses two browser processes, the actual host controls, real member sessions and an H.264/Opus camera fixture. Its 45-second outage closes the publisher and reconnects the existing broadcast. Set `CRE08_WATCH_MINUTES=21`, `CRE08_OUTAGE_SECONDS=45`, and `CRE08_MTX_CONTAINER` to collect media-node CPU, memory, and traffic alongside continuous browser audio/video counters. Set `CRE08_GATEWAY_PORT` and `LIVE_MEDIAMTX_CONTROL_URL` to the test endpoints.

`tests/cre08/viewer-browser.sh` starts a Chromium fixture in a viewer-only Docker network. Attach the gateway to that network and give it a fixed IP for `CRE08_VIEWER_GATEWAY` inside the fixture container and `CRE08_VIEWER_GATEWAY_IP` in the test runner. The host browser resolves `*.localhost` to Windows loopback. The viewer resolves the same site names to the gateway's viewer-network IP. Publish the test gateway port unchanged and expose the fixture's CDP port on host loopback only. Set `CRE08_VIEWER_WS` to that local CDP endpoint. The viewer synthesizes no media.

```powershell
npm.cmd run test:integration -- tests/integration/cre08-live-media.integration.test.ts
```

For the direct provider soak, use `node tests/cre08/provider-soak.mjs` against a disposable MediaMTX with its HTTP listeners bound to test loopback ports. This independently tests the browser WHIP client against the pinned MediaMTX image. The integration test additionally covers authenticated gateway delivery, state persisted in PostgreSQL, and replay revocation.

## November 22 verification

The protected-theater gate passed on one workstation. A Windows Chromium publisher sent synthetic 720p H.264 and Opus. Linux Chromium on a separate Docker network watched for 21 minutes through the Renegade gateway. Playback reached 1,259.78 seconds with 25,165 video frames counted, including 649 dropped frames, and 3,786,863 decoded audio bytes.

The encoder was held offline for 45.007 seconds. The viewer resumed audio and video 57.293 seconds after the interruption began, and PostgreSQL still held one session. MediaMTX produced replay parts of 1,276.28 and 10.136 seconds. Chromium played the first part. The gateway denied anonymous access, a cross-site request with a valid signed cookie, and reuse of the replay cookie after revocation.

| Measured resource            | Observation                                             |
| ---------------------------- | ------------------------------------------------------- |
| MediaMTX ingress             | 0.49 Mb/s                                               |
| MediaMTX combined HLS egress | 0.99 Mb/s across the viewer and the host's open theater |
| Separate viewer's HLS egress | 0.49 Mb/s                                               |
| MediaMTX container CPU       | 4.38% median, 10.71% sampled peak                       |
| MediaMTX container memory    | 40.29 MiB median, 45.55 MiB sampled peak                |
| Nginx gateway CPU            | 0.31% median, 1.77% sampled peak                        |
| Nginx gateway memory         | 15.86 MiB median, 16.35 MiB sampled peak                |

Fresh PostgreSQL migrations reached 170. Focused regression suites passed 27 integration and 31 unit tests, with three optional regression cases skipped. The Cloudflare adapter passed fixture-based tests. WAN behavior and delivery through a connected Cloudflare account remain unverified. [Soak events, counters, and image digests](evidence/CRE-08-SOAK.json)
