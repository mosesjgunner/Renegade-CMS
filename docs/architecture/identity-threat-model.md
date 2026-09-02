# Gate 7A identity threat model

## Implemented boundary

Public membership uses a separate, first-party opaque session registry. Staff continues to use the existing passkey-only Payload strategy. A `users.member` link is attribution only; it never grants member sessions staff permissions or vice versa. The member module does not add passwords, password hashes, reset routes, or Payload local auth.

Magic-link tokens are 256-bit opaque values. PostgreSQL stores only SHA-256 hashes, an email hash, expiry and consumption time. Requests always return a generic response. Tokens are single-use and expire after fifteen minutes. SMTP delivery uses the configured transactional adapter; disabled email leaves the generic response intact but cannot provide a working public sign-in flow. Member sessions are opaque, hashed, revocable, HttpOnly, SameSite=Lax cookies with a thirty-day maximum lifetime. Every authenticated request re-checks that the member is active, so suspension and deactivation take effect before the cookie expires.

## Residual risk and required next work

- Registration is invitationless first-party email verification: consuming a verified link creates the member and private profile on first use. Email must be configured before public member sign-in is enabled.
- Member passkeys, OAuth, social identities, recovery codes/device UI, current-session linking proof, and duplicate-account resolution remain incomplete.
- Wallet authentication is capability-gated. Reown AppKit is not installed or imported; no wallet connection can authenticate a Member. The reviewed compatibility target is AppKit/adaptor 1.8.23 together with Wagmi >=2.19.5, Viem >=2.45.0 and TanStack Query >=5, but it must be exact-pinned and browser-smoke-tested before activation.
- Rate limits are a one-minute persistence-side cooldown only. Shared abuse policy, origin-bound CSRF checks for unsafe member routes, and proxy-aware abuse signals remain required before an internet-facing rollout.
- No automatic provider-email merge is implemented. Future linking must require a current member session plus proof of the added identity.

## Security invariants

Never log a raw magic token, session token, email address, provider subject, signature, private key, seed phrase, approval request, or balance. A wallet `connect` event is never authentication. A wallet login nonce must bind the browser session, domain, URI, account, chain, action and expiry before server-side signature verification can create or link an identity.
