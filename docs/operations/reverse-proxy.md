# Reverse proxy and HTTPS

Renegade has one canonical public origin: `APP_URL`. Payload uses it for generated URLs, CORS and CSRF; the users collection derives its `Secure` cookie flag from its scheme. Production startup rejects HTTP, loopback origins and an implicit proxy policy.

## Modes

- `PROXY_MODE=trusted` is the normal VPS choice. Only a controlled reverse proxy may reach the app port. The proxy must replace, not append blindly to, `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto`. Set `TRUSTED_PROXY_HOPS` to the exact controlled hop count (1-3). Application authorization must never rely on a client-supplied forwarded header.
- `PROXY_MODE=direct` declares that forwarded address headers are not trusted evidence. The canonical origin still comes from `APP_URL`. This mode is useful for development and direct/internal deployments.

`PROXY_MODE` is a safety declaration consumed by diagnostics and request-address helpers; it does not turn an arbitrary proxy into a trusted one. Network policy must prevent direct public access to port 3000 when trusted mode is used.

## Generic proxy contract

Terminate TLS at the proxy, redirect HTTP to HTTPS, preserve the original host, and send traffic to the private app listener. Overwrite the forwarded headers from connection facts. Limit request bodies and timeouts deliberately; later media direct-upload work may use separate limits.

For Cloudflare or another CDN, keep authenticated TLS from the edge to the origin, restrict origin ingress to the edge/proxy where practical, and configure the origin proxy to derive the client chain only from provider-published networks. Renegade does not depend on Cloudflare-specific headers or services.

## Realtime collaboration

The default appliance uses authenticated HTTP mutations and an optional SSE stream at
`/api/realtime/stream`; it requires no WebSocket broker, Redis, Kafka, or hosted realtime
service. Do not buffer that path at the reverse proxy: preserve `text/event-stream`, disable
response buffering, and allow a read timeout longer than the client reconnect interval.

SSE is an advisory wake-up channel. Clients resume with `Last-Event-ID` (or `after`) from the
PostgreSQL-backed event outbox and must refetch canonical notifications/drafts after reconnect.
The ordinary draft checkpoint endpoint remains available even with `REALTIME_ENABLED=false`.

## Managed-proxy path (clean dedicated host, Caddy)

For a clean dedicated host with no existing proxy, the supported managed
path is **Caddy** in front of the loopback listener. Caddy is
operator-installed and operator-owned — it is not bundled into the
Compose stack — but this exact configuration is the one the HTTPS
diagnosis checks are written against. (The repo previously leaned on no
single proxy; Caddy is chosen here because it obtains and renews
publicly trusted certificates automatically once DNS is correct, which
removes the most common certificate failure class for a beginner
operator.)

Prerequisites, in order:

1. DNS first: create the exact records the installer/diagnosis names —
   `A <hostname> → <host public IPv4>` and, if the host has IPv6,
   `AAAA <hostname> → <host public IPv6>`. A correct A with a stale
   AAAA still fails the HTTPS check (IPv6 visitors would reach the
   wrong host).
2. Ports 80 and 443 open to the host; the app listener stays on
   `127.0.0.1:3000` (`RENEGADE_WEB_BIND`).
3. `.env.production` carries `PROXY_MODE=trusted` and
   `TRUSTED_PROXY_HOPS=1`.

Caddyfile (replace the hostname and keep the bind loopback):

```caddy
cms.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

That is the whole required configuration: Caddy terminates TLS with an
automatically issued certificate, redirects HTTP to HTTPS, and — for
`reverse_proxy` — sets `X-Forwarded-For`, `X-Forwarded-Host`, and
`X-Forwarded-Proto` from connection facts (it does not pass through
client-supplied values for the proxied request). Do not add
`header_up X-Forwarded-*` lines that copy client headers; overwriting
from connection facts is the contract.

## Existing-proxy variant (Nginx / Traefik / CDN already in place)

If a proxy already terminates TLS for the host, keep it and hold it to
the same contract:

- It must **overwrite**, never append to or pass through,
  `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto`.
  Nginx example for the Renegade location:

  ```nginx
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://127.0.0.1:3000;
  ```

- `TRUSTED_PROXY_HOPS` must equal the number of controlled proxies in
  the chain (a CDN edge in front of an origin proxy is 2). A
  forwarded-for chain longer than the declared hops is treated as
  spoofing by the diagnosis module.
- The app port must not be reachable from the public network by any
  other path (firewall or loopback bind), or the proxy boundary can be
  bypassed entirely.
- For Cloudflare or another CDN, keep authenticated TLS from edge to
  origin as described in the generic contract above; no
  Cloudflare-specific headers are trusted.

## Verifying the proxy and HTTPS (UXI-04 diagnosis)

`src/modules/operations/https-diagnosis.ts` checks this story from
facts, not from configuration claims: DNS records against the host's
expected public addresses (stale AAAA called out separately),
certificate validity (expired / wrong host / self-signed / untrusted
chain / handshake failure), forwarded headers as observed at the app
(contradicting host/proto, over-long chains, forwarded headers in
direct mode), and a non-loopback listener bind. Public HTTPS readiness
is false while any blocking finding exists. Live public proof still
requires a real owner domain and host — the module grades what its
probes observe at check time and nothing more.

## Origin exposure checklist

- App port is private/firewalled.
- `APP_URL` is the only public HTTPS origin.
- Proxy overwrites forwarded headers and has the declared hop count.
- Cookies are observed with `Secure`, `HttpOnly`, and `SameSite=Lax` in production.
- CORS and CSRF do not use wildcards.
- Health endpoints expose only minimal status; rich diagnostics require owner authentication.
