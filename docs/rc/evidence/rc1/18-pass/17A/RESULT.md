# RC1 Subpass 17A — Result

**Status: PASS (bounded)** — Adversarial identity, role and tenant
security. Every scoped authorization boundary held under hostile client
requests, proven through the ordinary operator/API paths against a
disposable database: role/site matrix across two sites, cross-tenant
object substitution, revocation of grants/accounts/sessions, CSRF on
both the admin proxy guard and the member double-submit token, and the
WebAuthn login negatives (origin, challenge, replay, expiry) with a
software authenticator. **No product-code change was required**: the
owning policy code (`resolveOperatorGrantContext`, the passkey session
strategy, the installation WebAuthn verification, the proxy origin
guard, member session scoping) already enforced every boundary the
battery exercised, so this subpass is a valid no-change verification
plus new adversarial proof and focused unit tests. Every failed
attempt left protected state byte-identical (before/after snapshots).

## Environment (recorded verbatim)

- Linux VM, Node v24.22.1, npm flow; **no Docker** on this VM.
- PostgreSQL **16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)** — locally
  installed on this VM for this run (the VM had been replaced since
  Pass 16; CI uses a PostgreSQL 17.6 service; nothing in 17A exercised
  PG17-specific behavior).
- Disposable database `rc117a_release_acceptance` only; 132 migration
  files fresh-verified (`npm run test:migrations:fresh`, exit 0).
- Base: `4bd1de2` (Pass 16 complete) on branch `rc1-17a`.

## UI/operator proof (harness `tests/rc1-17a/`, real Next.js web process)

Journey **32/32** checks (`journey-trace.json`), restart **5/5**
(`restart-trace.json`, real web + PostgreSQL cluster restart):

- Controls: global owner reads the operator API for both sites;
  Alpha-scoped staff reads its own site; a community member lists its
  own member sessions; a genuine WebAuthn protocol login (software
  authenticator) issues a session that works on the operator API.
- Role/site negatives: anonymous, member-session and grant-less staff
  denied the operator API (403); scoped staff denied a foreign site on
  read (403) and write (403, no subscription row created); anonymous
  and member sessions denied the users list (403) and a foreign draft
  (403/404).
- Payload REST tenant boundary: scoped staff cannot read a foreign
  draft or foreign media by id (404 / 403), a foreign-site list query
  leaks none of Beta's records, and PATCH foreign content / POST into
  a foreign site / DELETE foreign draft / PATCH the owner account are
  all denied (400/403/404) — with the protected-state snapshot
  byte-identical afterwards.
- CSRF: admin mutations carrying the session cookie are blocked by the
  proxy origin guard for a foreign `Origin` (403, guard message) and
  for `Sec-Fetch-Site: cross-site` with no Origin/Referer (403);
  same-origin and header-less non-browser mutations pass the guard to
  the handler. Member mutations without (403) and with a mismatched
  (403) `x-member-csrf` token are refused before any session change.
- Member object substitution: member A cannot revoke member B's
  session (404) and B's session stays valid; A revoking its own second
  session succeeds (200) and that token immediately dies (401).
- WebAuthn (software authenticator, generated P-256 key, protocol
  assertions crafted in the harness): completing without a challenge
  (400), foreign origin (400, no cookie), never-issued challenge (400),
  expired challenge (400), unknown credential (400) are all refused
  with the stored sign counter unmoved; the valid assertion completes
  (200 + session cookie), the counter advances exactly to the
  assertion counter, and replaying the consumed assertion is refused
  (400) with no second session created.
- Revocation, all effective on the very next request with live
  sessions: owner deletes staff B's account → B's session dies (403);
  owner deletes staff A's only site grant → A loses the operator API
  (403) and content access (403/404); logout kills the cookie (403);
  direct `admin_sessions` revocation kills a second live session
  (403); an expired session row (403) and a validly-signed JWT with no
  session row (403) are denied; forged-secret (403), tampered-payload
  id-elevation (403) and garbage (403) tokens are denied without a
  server error; member suspension kills the member's live session
  (401).
- Persistence: after the whole battery, Beta article/draft/media,
  Alpha article, Beta site record and content/media counts are
  identical to the pre-battery snapshot; the only account change is
  the deliberate owner deletion of staff B. Restart phase: pre-restart
  owner and WebAuthn-issued sessions still authenticate; the revoked
  grant, suspended member and forged token are still denied; the
  protected snapshot is still identical. Canary sweep: the harness
  `PAYLOAD_SECRET` appears in no response body.

## Automated proof

- New focused unit tests `tests/unit/rc1-17a-security.test.ts`:
  **4/4 pass** — grant revocation takes effect on re-resolution of the
  grant context; a community-only `member` site role never authorizes
  an operator; the passkey strategy rejects a live session whose
  account was deleted and rejects an attacker-signed token without
  touching the user lookup.
- Full unit suite: **2024 passed / 5 failed (2029)** — the 5 failures
  are exactly the pre-existing baseline set verified at base
  `4bd1de2` (`flow-04-acceptance`, `payload-domains`,
  `rc1-04d-campaign-commerce`, `shop-08-command-center-boundaries`
  ×2); the +4 over the 2020 baseline is this subpass's new test file.
- ESLint on the harness + new test file: clean (0 warnings).
  Prettier: clean on all touched files.
- Typecheck: the harness tsconfig reports **no errors in any 17A
  file**; the project `npm run typecheck` reports exactly 2 errors,
  both pre-existing at base in `src/scripts/portability.ts`
  (TS2352 `as null` casts at lines 200/216, introduced by 16C and
  untouched here) — recorded as a carried item in NEXT.md, not fixed
  in this subpass (outside 17A scope).

## Negative-case record (payload classes → result codes)

- Operator API read/write with anonymous / member / grant-less /
  foreign-site sessions → 403, no state change (verified by snapshot
  and by a zero Beta subscription count after the foreign write).
- REST object substitution by id (foreign draft/media read, foreign
  PATCH/POST/DELETE, owner-account PATCH) → 400/403/404, target rows
  byte-identical after.
- CSRF classes: foreign Origin → 403 guard; cross-site fetch metadata
  → 403 guard; member missing/mismatched CSRF token → 403 route.
- Session classes: revoked row, expired row, row-less JWT,
  forged signature, tampered claims, garbage value → 403.
- WebAuthn classes: no challenge, wrong origin, wrong challenge,
  expired challenge, unknown credential, replayed assertion → 400,
  no cookie issued, sign counter unmoved (except the single genuine
  login, which advanced it exactly once).
- Server logs for the run: `web.log` / `restart-web.log` in this
  folder; per-case statuses are in the traces.

## Bounds (what this PASS does not claim)

- Operator sessions in the matrix are **fixture passkey sessions**
  (session rows inserted for seeded users), the Pass 16 convention —
  no genuine passkey ceremony is claimed for them. The WebAuthn
  battery is a **software authenticator** performing the real protocol
  against the operator HTTP path; no hardware/browser authenticator
  was exercised.
- Member suspension was applied as a local operator action
  (Payload local API, override access); the observed effect — the
  live member session dying — was measured over HTTP.
- Everything ran on PostgreSQL 16.15, not CI's 17.6, on one Linux VM
  without Docker. No external provider, network or real-world outcome
  is claimed anywhere in this subpass.

## Evidence

- `docs/rc/evidence/rc1/18-pass/17A/` — this RESULT.md, NEXT.md,
  `journey-trace.json` (32 checks), `restart-trace.json` (5 checks),
  `web.log`, `restart-web.log`, `source-tree.json`.
- Source containment at the tested tree: **1,608 files, SHA-256
  `450adbee7a9cea6302074e916fba016f66fec1fe9a8b757e53c18cd6609c985b`**
  (re-verified with `node --import tsx tests/rc1-17a/provenance.ts
  --check` after the final commit).
- Ledger: 17A row in `docs/rc/RC1-70-SUBPASS-LEDGER.md`.
