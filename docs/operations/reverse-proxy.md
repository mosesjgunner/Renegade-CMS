# Reverse proxy and HTTPS

Renegade has one canonical public origin: `APP_URL`. Payload uses it for generated URLs, CORS and CSRF; the users collection derives its `Secure` cookie flag from its scheme. Production startup rejects HTTP, loopback origins and an implicit proxy policy.

## Modes

- `PROXY_MODE=trusted` is the normal VPS choice. Only a controlled reverse proxy may reach the app port. The proxy must replace, not append blindly to, `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto`. Set `TRUSTED_PROXY_HOPS` to the exact controlled hop count (1-3). Application authorization must never rely on a client-supplied forwarded header.
- `PROXY_MODE=direct` declares that forwarded address headers are not trusted evidence. The canonical origin still comes from `APP_URL`. This mode is useful for development and direct/internal deployments.

`PROXY_MODE` is a safety declaration consumed by diagnostics and request-address helpers; it does not turn an arbitrary proxy into a trusted one. Network policy must prevent direct public access to port 3000 when trusted mode is used.

## Generic proxy contract

Terminate TLS at the proxy, redirect HTTP to HTTPS, preserve the original host, and send traffic to the private app listener. Overwrite the forwarded headers from connection facts. Limit request bodies and timeouts deliberately; later media direct-upload work may use separate limits.

For Cloudflare or another CDN, keep authenticated TLS from the edge to the origin, restrict origin ingress to the edge/proxy where practical, and configure the origin proxy to derive the client chain only from provider-published networks. Renegade does not depend on Cloudflare-specific headers or services.

## Origin exposure checklist

- App port is private/firewalled.
- `APP_URL` is the only public HTTPS origin.
- Proxy overwrites forwarded headers and has the declared hop count.
- Cookies are observed with `Secure`, `HttpOnly`, and `SameSite=Lax` in production.
- CORS and CSRF do not use wildcards.
- Health endpoints expose only minimal status; rich diagnostics require owner authentication.
