# RC2-E-01 — Member identity → profile → public participation: RESULT

**Verdict: PASS** — API journey 11/11 stages, browser proof 4/4 stages,
service-level session-expiry proof green. One P1 defect found and filed
(RC2-DEBT-18): the GET variant of the magic-link completion route 500s on
its success path and burns the single-use token. The supported sign-in
path (emailed verify page → POST completion) is fully proven.

## Assignment

Use a clean public-member fixture, not admin credentials, to sign up and
sign in through one supported method; edit a profile; create/use a
permitted Space or public contribution; sign out; verify visibility and
edit permissions. Test an unverified account, an expired session, another
member's profile-edit denial, Site A / Site B limits, and member-data
privacy. Do not conflate Member and staff User. Add browser + service
proof and document E-levels for alternative login/identity methods.

## Environment

Production build of the D-04 tree (base `f4f2d5d` + the PR #59 fix;
production code identical to main `190983c`) served locally against the
RC2 two-site world (fresh seed after a sandbox rebuild; Site A
`a.rc2-a04.test`, Site B `b.rc2-a04.test`). All member actions used
member credentials only; staff sessions appear solely as operator setup
(activating Site A's blog publication, opening comment policy on the two
target articles — the same operator setup D-04 performs).

## Test boundary (stated plainly)

Sign-in tokens are never returned by the public API outside test mode,
and in the development-capture email profile the mailbox is a
process-local sink with no readable surface. Tokens were therefore
obtained by calling the production issuing function
(`issueMagicLink`, the same function the HTTP route calls) from a test
spec. Everything after issuance — HTTP request surface, token storage,
completion, cookies, CSRF, permissions, commenting, privacy, sessions —
ran over real HTTP and a real browser. The public HTTP request surface
was exercised directly (stage 1).

## What was proven

Browser proof (`tests/rc2-e01/browser.mjs`, 4/4):

1. Clicking the emailed sign-in link (the verify page, which POSTs the
   token) lands the brand-new member in member settings with an
   auto-created profile ("New member", handle `member-<id12>`).
2. Editing display name + bio in the real settings UI and saving
   persists ("Profile saved.").
3. A brand-new profile is **private by default**: the anonymous public
   profile page returns 404 and shows nothing.
4. Sign out returns to the sign-in page and settings require sign-in
   again.

API journey (`tests/rc2-e01/journey.mjs`, 11/11):

1. The public signup surface is enumeration-safe (identical generic 200
   for any address; no token material in the response) and the issued
   token row stores only a SHA-256 hash — no plaintext token field —
   unconsumed, with a 15-minute TTL (measured 14.9997 min).
2. An address that never completes sign-in has no session (`/me` 401).
3. API sign-in converges on the **same member** the browser created
   (two different links, one canonical identity — the advisory-lock
   convergence in `consumeMagicLink` works as designed).
4. Profile edits persist for the owner; edits without the CSRF token
   are refused 403.
5. Another member cannot edit member A's profile: the profile route is
   structurally self-only (it patches the caller's profile), a direct
   Payload REST PATCH of A's profile with B's member cookie is refused
   403, and A's profile is unchanged afterward. A's member session is
   **not** a staff session (`/api/users/me` returns no user).
6. Public contribution: the member comments on Site A's published
   article (201), the comment is publicly readable with the member's
   display name, anonymous posts are refused (403 — the CSRF gate
   answers before the auth gate), and member posts without CSRF are
   refused 403.
7. Space reality, re-measured: a self-signed-up member has **no space**
   (0 space records) and there is no member space-post write path (the
   v1 space route is GET-only; POST returns 405). Consistent with
   RC2-A-04 Finding 1; see Finding F2.
8. Site B limits, measured: member identity is installation-wide — the
   same session returns the same member on Site B, and the member's
   comment on a Site B article **succeeds (201)**. See Finding F3.
9. Privacy: with visibility set public, the anonymous profile page
   shows display name + bio and never the member's email; the
   community directory payload contains no email addresses and no
   `preferences` field; setting visibility back to private returns the
   public page to 404.
10. Sessions: the member can list sessions and revoke all (revoked
    session's `/me` → 401); logout kills the session (old cookie →
    401); a consumed sign-in token cannot be reused (400); a garbage
    session cookie is refused (401).
11. Session expiry (service proof, `session-expiry.spec.ts`): session
    rows store only a token hash; a live session resolves; the same
    session with its stored expiry backdated is refused by the real
    resolver.

## Findings

**F1 — P1 — filed as RC2-DEBT-18.** `GET
/api/member-auth/magic-link/complete` builds its success response with
`Response.redirect(...)` and then appends the session/CSRF cookies to
it. Redirect responses have immutable headers, so the append throws
`TypeError: immutable` and the route returns **500 on every successful
sign-in** — after `consumeMagicLink` has already consumed the
single-use token. A member arriving through this route is locked out
and must request a fresh link. Measured directly: a fresh valid token
presented to the GET route returned HTTP 500; the server log shows the
`TypeError: immutable` at the same instant. Reachability today is
limited — no email template or page links to the GET variant (the
emailed link opens the verify page, which POSTs) — but it is a shipped
public route whose success path always fails destructively. The
supported path is unaffected and is what this journey proves.

**F2 — the member Space remains operator-gated (known, re-measured).**
Signup creates a member + profile but no space, and no member-facing
space-post write path exists (RC2-A-04 Finding 1; the profile/space
record merge is RC2-DEBT-01 / H-03). Whether a space is created
automatically at signup or is opt-in remains the owner's open decision.
E-level for member self-serve spaces today: **E0** (no path), against
E2 for the rest of the member journey.

**F3 — cross-site member standing is installation-wide (known,
re-measured).** A member who registered on Site A can comment on Site B
with no per-site join step (stage 8, comment 201). This is the current
designed behavior of the global member identity; whether standing
should be per-website is the owner's open policy decision (decision
brief filed Nov 11, 2026). Recorded as measured behavior, not a defect.

## E-levels for member identity methods

| Method                                  | E-level    | Basis                                                                                                                        |
| --------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Email magic link (verify page → POST)   | **E2**     | Proven end-to-end in this journey (browser + API + service).                                                                 |
| Email magic link (GET completion route) | **broken** | F1 / RC2-DEBT-18: 500 on success, token consumed.                                                                            |
| Member passkey (register + login)       | E1         | Routes, ceremonies and a settings-page enrollment UI are mounted; not exercised in this pass (no virtual authenticator run). |
| Email linking (add a second email)      | E1         | Routes mounted (`link/email` + confirm); not exercised in this pass.                                                         |
| Password sign-in                        | —          | None for members by design; members are passwordless (staff authenticate by passkey).                                        |
| OAuth / social sign-in                  | E0         | No member OAuth surface exists in the codebase.                                                                              |

## Credit where the code is clean

The identity core (`src/modules/identity/member-identity.ts`) held up
under direct pressure: tokens and sessions are stored hashed only,
tokens are single-use via transactional compare-and-set, duplicate
links for one address converge on one identity under an advisory lock,
the signup response leaks nothing about account existence, profiles
start private, and the profile projection never serializes email or
preferences. These were verified by measurement, not by reading.

## Run history

- Run 1: stages 1–2 pass; the browser leg used the GET completion route
  directly and failed — the probe isolated F1 (HTTP 500,
  `TypeError: immutable` in the server log).
- Run 2: browser re-pointed at the real emailed path (verify page);
  harness failure in the browser script's identity read (Playwright's
  APIRequestContext ignores `--host-resolver-rules`); fixed to fetch
  in-page.
- Run 3: 6/11 + 3/4 — a Playwright strict-mode collision (the Bio
  textarea vs the "Bio audience" select) blocked the UI save and
  cascaded into three name-checking stages; two journey expectations
  corrected (anonymous comment refusal is the CSRF gate's 403; Site B
  content is invisible to Site A's admin, correctly, so Site B's own
  admin supplies the target article).
- Run 4: **11/11 API stages + 4/4 browser stages PASS.**

## Files

- `tests/rc2-e01/journey.mjs` — orchestrating API journey (operator
  setup, 11 stages, drives the specs and the browser script).
- `tests/rc2-e01/browser.mjs` — browser proof (4 stages).
- `tests/rc2-e01/issue-tokens.spec.ts` — production-function token
  issuance + HTTP-issued token-row verification.
- `tests/rc2-e01/session-expiry.spec.ts` — service-level expiry and
  storage-hygiene proof.
- This RESULT; RC2-STATUS (E-01 row); RC2-ENGINEERING-DEBT
  (RC2-DEBT-18); RC2-12-FAMILY-JOURNEYS (family 7).

No production code was changed by this prompt.
