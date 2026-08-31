# Admin authentication and publishing evidence

## Automated evidence

`npm run typecheck` passes. `npm test` runs 200 passing unit tests; the existing
`payload-domains` expectation currently fails because concurrent, uncommitted
discoverability/media changes added collections without updating that fixture.

Browser automation is not installed in this repository (`npm ls @playwright/test`
is empty), so no hardware or virtual-authenticator result is claimed here.

## Required production/manual browser check

Use HTTPS at the exact `APP_URL` origin and a proxy that overwrites forwarded
headers. With a fresh browser profile:

1. Complete `/setup` with the console-issued bootstrap token; verify it lands in
   `/admin` already signed in and save the displayed recovery codes offline.
2. Open Admin → Security, add a named passkey, sign out, and sign in with each
   passkey. Confirm user verification is required by the platform prompt.
3. Re-submit a captured authentication or registration completion request;
   it must fail because its challenge was consumed. Wait five minutes and repeat;
   it must fail as expired.
4. Sign out, confirm `/admin` redirects to sign-in, then remove one passkey only
   while another remains. The final passkey must not be removable.
5. Test an administrator and a staff user against the intended site records;
   both receive staff collection access, while only the owner can manage users,
   system operations, or destructive settings. Confirm cross-site collection
   queries are constrained by the collection/service scope before enabling a
   multi-site deployment.
6. Create a draft Content record, select a Media Asset, set SEO fields, preview,
   change it to published, and confirm the public route and navigation update.

## Security assumptions

Payload remains the admin authentication/authorization integration. The custom
passkey strategy adds a signed, HttpOnly, SameSite=Lax cookie backed by a
revocable eight-hour database session. `APP_URL` is the WebAuthn origin and RP
ID source; production config rejects non-HTTPS origins. Challenges are stored
server-side, expire after five minutes, are atomically consumed, and counters
are updated only after verification. Login initiation is rate-limited per
hashed email window. This project intentionally has no password authentication;
offline one-time recovery codes remain the fallback policy.
