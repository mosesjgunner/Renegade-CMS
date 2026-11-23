# External live destinations

The MediaMTX profile can send a public Theater broadcast to custom RTMP or RTMPS ingest, YouTube Live with a Live Control Room encoder key, or Twitch with an authorized Creator Dashboard key. The destination credential and recorded operator authorization govern broadcast access independently of social publishing connections. [YouTube RTMPS setup](https://support.google.com/youtube/answer/10364924) · [Twitch stream keys](https://help.twitch.tv/s/article/twitch-stream-key-faq?language=en_US)

## Enable the worker

Set `LIVE_DESTINATION_ENCRYPTION_KEY` to a dedicated random 32-byte value encoded as 64 hex characters. Inject the same value into the web and relay services. Keep it outside application backups. When rotating the encryption key, revoke the old configurations and add new ones using the new encryption key.

Set `LIVE_DESTINATION_ENDPOINTS` to the comma-separated operator-approved `scheme://hostname:port` entries. Include default port numbers explicitly and approve hosts with trusted DNS and network destinations. Use RTMPS for Internet destinations that support it. Plain RTMP carries the key and media without transport encryption.

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.live-media.yaml -f compose.live-destinations.yaml up -d
```

The relay reads MediaMTX over private RTSP/TCP and runs a separate FFmpeg process and output connection for each destination. MediaMTX serves Theater HLS and writes the source recording. The relay container handles sensitive FFmpeg arguments. Restrict process inspection to operators and exclude process arguments and credential request bodies from infrastructure capture.

## Operate a destination

1. In the broadcast controls, open **External destinations**. Enter the ingest base URL and separate key. Set privacy in the destination dashboard and confirm the matching setting, broadcast authorization, and terms in Renegade. Twitch uses the public setting. [Twitch simulcasting guidelines](https://help.twitch.tv/s/article/simulcasting-guidelines?language=en_US)
2. **Test endpoint** checks the RTMP handshake and, for RTMPS, verifies the server certificate. It sends no stream key or media. The actual relay verifies ingest acceptance when it sends media.
3. Start a MediaMTX broadcast in an unrestricted public Theater. Click **Start relay** for each destination. The worker rechecks room policy and source session state during delivery. Renegade reports when it is sending media. Use the provider dashboard for audience visibility and remote event identity. The remote ID field is empty for manual ingest.
4. **Stop relay** ends the selected delivery. **Disconnect** deletes the local credential. **Revoke locally** deletes the credential and records explicit revocation. Both end active delivery. Reset the key or remove the authorized broadcaster in the provider dashboard to revoke it there.

Each run has a duration deadline and a byte limit shared by all retries. Output is paced at 2.7 Mb/s of RTMP data. The byte limit counts outbound RTMP data including retry handshakes. Network framing, TLS overhead, and provider charges are separate. Up to four sends run concurrently per deployment. A send interrupted by worker loss requires a fresh explicit start because the worker cannot recover its in-flight byte count.

Operational backups keep destination settings and history and exclude the credential table's data. Run the backup with all three Compose files, repeating `--compose-file` for each. After restore, add new destination credentials before starting delivery. Independent PostgreSQL physical backups retain encrypted ciphertext.

## Integration gate

Use a dedicated `cre10_release_acceptance` database and the live gateway with non-media requests proxied to Renegade. With Next dev, forward WebSocket upgrades as well. Set `CRE10_GATEWAY_PORT` to the gateway port and `CRE10_WEB_LOG` to the development web log path to include it in redaction checks. The test uses Docker network `cre10-proof` with containers named `cre10-proof-db`, `cre10-source`, `cre10-gateway`, `cre10-relay`, `cre10-receiver-a`, and `cre10-receiver-b`. Each receiver listens privately on RTMP port 1935 and Control API port 9997 with fixture publish and API access. Expose the source replay API on loopback port 4596. Set `CRE10_FIXTURE_IMAGE` to a local image with FFmpeg available on PATH, or use `renegade-cms:local`.

To run the encrypted receiver variant, set `CRE10_RECEIVER_B_INGEST=rtmps://cre10-receiver-b:1936/live`. Configure receiver B for strict RTMPS with a certificate for its container hostname. Add the endpoint to both services' allowlists and trust the fixture CA in the relay process. [MediaMTX configuration](https://mediamtx.org/docs/references/configuration-file)

```powershell
npm.cmd run test:integration -- tests/integration/cre10-destinations.integration.test.ts
```

### November 23 verification

The local gate passed with two RTMP receivers and again with one RTMP and one certificate-verified RTMPS receiver. In each run Chromium played the same source through the authenticated media gateway while both receivers' ingest counters advanced. Killing receiver A exhausted its independent retry budget. Receiver B continued ingesting and Theater playback advanced. Stopping and restarting B worked, then revocation disconnected it and denied another start. The source recording reached 84.939 seconds on the RTMP run and 58.349 seconds on the RTMPS run. A separate 1 MiB run stopped at 993,231 and 1,003,483 outbound RTMP bytes respectively.

The canary checks covered authenticated API responses and errors, browser HTML, observed browser requests and console output, web and media container logs, and restored SQL from the filtered PostgreSQL dump. The dump omitted all credential rows, including the still-connected destination. Fresh PostgreSQL migrations reached 171. The tests ran against the working tree based on `27bedf88b30c8c682ffe5e086aac6e3eda59ede3`, MediaMTX 1.21.4, and FFmpeg 8.1.3 in a fixture image with the current worker source mounted. YouTube and Twitch account delivery and a newly built production image remain unverified.
