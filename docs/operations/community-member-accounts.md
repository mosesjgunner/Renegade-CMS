# Community Member Accounts (COMM-01)

## Security boundary

`members` are public-community principals. They authenticate only through
`renegade-member`, an opaque, HttpOnly member-session cookie. Payload staff
continue to authenticate as `users` through the separate `renegade-passkey`
cookie and administrator authorization model. Never promote a member role,
profile edit, wallet connection, or verified email into a Payload `users` role.

Member sign-in is passwordless: an expiring, single-use magic link or a linked
WebAuthn passkey. There is no member password, password reset, or reusable
email token. Wallet authentication remains disabled unless a complete SIWX
signature and replay matrix is installed.

## Operator actions

Use the member lifecycle service, rather than directly editing `members`, for
state changes. It records an identity audit event and revokes all member
sessions for `suspended`, `deactivated`, `deletion-pending`, and `deleted`.

| Situation                     | Required action                                                                                           | Effect                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abuse or account compromise   | Suspend with an operator reason                                                                           | All member sessions are revoked immediately.                                                                                                      |
| Temporary participation limit | Restrict with reason and scope                                                                            | Sign-in remains possible; capability checks must enforce the restriction.                                                                         |
| Member requests time away     | Deactivate                                                                                                | Sessions are revoked; the member must recover through the approved process.                                                                       |
| Member requests erasure       | Start deletion, retain the cooling-off policy, then finalize                                              | Sessions revoke at request; finalization anonymizes profile data while retaining security, moderation, and financial evidence required by policy. |
| Lost device                   | Have the member sign in through another verified method, then revoke the affected session or all sessions | A member cannot unlink their final verified recovery method.                                                                                      |

`member-site-roles` grants only a site-scoped community role. It is not an
administrator role and must be evaluated by server-side community capability
policy, never by UI visibility alone.

## Member data and retention

The export endpoint returns the member's account projection, profile, linked
identity metadata (not credentials), session history, and identity audit
events. Deletion removes public profile details and direct contact identity
from the member projection. Audit, moderation, fraud/security, and financial
records may remain when an applicable retention obligation requires them; the
member-facing notice must identify that exception.

## Release evidence checklist

Before marking COMM-01 verified, execute and retain evidence for:

- PostgreSQL migration and regenerated Payload types.
- Two clean browser contexts: magic-link registration/verification and virtual
  WebAuthn enrollment/login, including wrong origin/RP ID, replay, and counter
  failure cases.
- Captured transactional magic-link delivery from an inspectable test mail
  provider (the process-local development capture alone is not cross-process
  browser evidence).
- CSRF rejection, session fixation/revocation, member/admin-cookie confusion,
  role denial, suspension race, REST/GraphQL projection leakage, and deletion
  recovery behavior.
- Worker/restart, backup/restore, aggregate static checks, and production build.
