# coturn runbook — Podcast Studio remote guests (POD-10, POD-REQ-23)

Renegade does **not** deploy coturn for you, and a local production is
**fully usable with coturn absent**: STUN defaults are built in, the
host side always works, and guests on friendly NATs connect directly.
What you lose without TURN is only the guests behind hostile
(symmetrical / carrier-grade) NATs — their joins may fail, and that
limitation is surfaced in the guest's diagnostics and the ICE config,
never hidden.

## What coturn gives you

A TURN server relays media for peers who cannot connect directly.
Each relayed guest costs the server real bandwidth (roughly the call's
audio bitrate × 2 for the relay leg), so TURN is an operator cost
decision, not a default.

## Configuration surface

Set these environment variables on the Renegade server (the
credential is a secret: it is never logged, never stored in the
database, and is only ever sent to a joining guest inside their own
ICE config):

| Variable                          | Meaning                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `PODCAST_STUDIO_TURN_URLS`        | Comma-separated `turn:` / `turns:` URLs, e.g. `turn:turn.example.org:3478,turns:turn.example.org:5349` |
| `PODCAST_STUDIO_TURN_USERNAME`    | coturn username (static-auth-secret setups: the username half)                                         |
| `PODCAST_STUDIO_TURN_CREDENTIAL`  | coturn credential / secret                                                                             |
| `PODCAST_STUDIO_TURN_FORCE_RELAY` | `true` forces relay-only transport (`iceTransportPolicy: relay`) — for the forced-relay test below     |
| `PODCAST_STUDIO_STUN_URLS`        | Optional override of the built-in STUN defaults                                                        |

With no `PODCAST_STUDIO_TURN_URLS` set, the ICE builder emits STUN
only and reports `turnConfigured: false` plus the limitation string.

## Minimal coturn deployment

1. Install coturn on a host with a public IP (a small VPS next to the
   Renegade server is typical). Open UDP/TCP 3478 (and 5349 for TLS),
   plus the relay port range (default 49152–65535 UDP).
2. Configure a **realm** matching your domain and restrict coturn to
   it — an open relay is a bandwidth donation to the internet:

   ```
   realm=turn.example.org
   server-name=turn.example.org
   # static credentials (simplest) — or use-auth-secret + REST-style
   # time-limited usernames if you operate that flow yourself
   user=renegade:<the credential from PODCAST_STUDIO_TURN_CREDENTIAL>
   listening-port=3478
   tls-listening-port=5349
   min-port=49152
   max-port=65535
   no-multicast-peers
   denied-peer-ip=10.0.0.0-10.255.255.255
   denied-peer-ip=172.16.0.0-172.31.255.255
   denied-peer-ip=192.168.0.0-192.168.255.255
   ```

   The `denied-peer-ip` ranges keep the relay from being aimed at
   your private network (SSRF-by-relay). Keep them.

3. Set the env vars above on the Renegade server and restart it.
4. Budget bandwidth: one relayed Opus guest leg is ~32–64 kbps each
   way. A 4-person call fully relayed is well under 1 Mbps; a public
   coturn on a metered VPS should still set coturn's
   `max-bps` / per-user quotas if strangers can reach the port —
   Renegade only hands the credential to joining guests, but the port
   itself is public.

## Forced-relay test procedure

This proves the relay path end-to-end (do it once after deployment):

1. Set `PODCAST_STUDIO_TURN_FORCE_RELAY=true` and restart Renegade.
2. Issue a guest invite and join from a second device/network.
3. In the guest browser's WebRTC internals (`chrome://webrtc-internals`),
   confirm the selected candidate pair is `relay` — with force-relay
   on, no host/srflx pair may be selected.
4. Check coturn's log/session table: an allocation for the guest's
   session must exist.
5. Turn `PODCAST_STUDIO_TURN_FORCE_RELAY` back off and restart.

Status: this procedure is **documented, not yet executed** — TURN
relay is UNVERIFIED until an operator runs it against a real coturn
(see GUESTS.md).
