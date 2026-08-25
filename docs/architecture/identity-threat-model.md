# Gate 7A identity threat model

## Implemented boundary

Public membership uses a separate, first-party opaque session registry. Staff continues to use the existing passkey-only Payload strategy. The member module does not add passwords, password hashes, reset routes, or Payload local auth.

Magic-link tokens are 256-bit opaque values. PostgreSQL stores only SHA-256 hashes, an email hash, expiry and consumption time. Requests always return a generic response. Tokens are single-use and expire after fifteen minutes. Member sessions are opaque, hashed, revocable, HttpOnly, SameSite=Lax cookies with a thirty-day maximum lifetime.

## Residual risk and required next work

- Delivery is intentionally disabled until an audited email adapter is configured; production does not return a token.
- Member passkeys, OAuth, social identities, recovery codes/device UI, current-session linking proof, and duplicate-account resolution remain incomplete.
- Wallet authentication is capability-gated. Reown AppKit is not installed or imported; no wallet connection can authenticate a Member. The reviewed compatibility target is AppKit/adaptor 1.8.23 together with Wagmi >=2.19.5, Viem >=2.45.0 and TanStack Query >=5, but it must be exact-pinned and browser-smoke-tested before activation.
- Rate limits are a one-minute persistence-side cooldown only. Shared abuse policy, origin-bound CSRF checks for unsafe member routes, and proxy-aware abuse signals are Gate 7E work.
- No automatic provider-email merge is implemented. Future linking must require a current member session plus proof of the added identity.

## Security invariants

Never log a raw magic token, session token, email address, provider subject, signature, private key, seed phrase, approval request, or balance. A wallet `connect` event is never authentication. A wallet login nonce must bind the browser session, domain, URI, account, chain, action and expiry before server-side signature verification can create or link an identity.
