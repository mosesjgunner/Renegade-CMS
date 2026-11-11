# RC2-A-04 — Result

**Prompt:** RC2-A-04 — Reproducible two-site, multi-role, module-profile fixtures
**Verdict: PASS** — with two findings recorded below (one capability gap, one open policy question), neither concealed and neither a P0/P1.
**Built against:** main `34e779e` (the tenant-remediation merges #43–#47).
**Governing frame:** RC2 pack as amended Nov 11, 2026 (quality-led; journeys as audit).

## What was built

- `tests/fixtures/rc2-world.ts` — the standard fixture world, extracted and generalized from the world the tenant-authorization matrix previously built inline. One call builds: **Site A and Site B**, each with a global owner, a site admin, an editor (staff + contributor grant), a member (profile + space), and a subscriber; **the denied principal** is a Site B admin holding no authority on Site A. Per site: a blog publication and a news publication, a published and a draft article, a media asset, the member's space with a post in it, and — when the module is on — a forum section/forum/discussion and a store (merchant connection, product, one unpaid and one paid order, each on its own checkout session).
- Helpers for every later pass: operator session, member login, site switch, active-site read, actor resolution, read/write denial probes, anonymous browsing (host resolution + published listing), principal reload, and deterministic provider failures (a crypto adapter that has observed nothing; a POD adapter whose submissions always fail).
- `tests/integration/rc2-a04-fixture-world.integration.test.ts` — the proof suite (15 tests).
- `tests/unit/rc2-world-guard.test.ts` — the production-safety guard in the fast unit gate.

## Production paths only

No test-mode auth bypass exists anywhere in the module, and no production code changed.

- **Member login** is the real machinery: `issueMagicLink` → `consumeMagicLink` → a genuine member session, resolved per site by `resolveCommunityActor`.
- **Operator sessions** are genuine passkey-strategy sessions. Staff password login does not exist in this product (the users collection sets `disableLocalStrategy: true`), so the harness mints sessions through the production session store — `createPasskeySession` + the `admin_sessions` row, the same path installation/recovery uses — and the real strategy validates the cookie on every request.
- **Site switching** goes through the real `POST /api/admin/active-site` route (auth → grant check → cookie), never a harness shortcut.
- **Seeding** goes through the Payload collections and their hooks. Two documented exceptions, recorded rather than hidden: spaces are created via the operator path because production has no member self-serve creation today; orders are created directly because production creates them only as settled-checkout output.
- **The forum-space trap was not repeated:** forum seeding uses the Payload `discussions` collections, not the SQL `forum_spaces`/`space_memberships` tables that no production code writes (RC2-DEBT-01; the merge design is H-03's).

## Safety

`assertFixtureSafeDatabase` refuses any target whose database name does not end in `_release_acceptance`, and refuses outright in production posture; it runs before every world build, and the integration runner enforces the same rule independently.

## Proof results (this run)

- Standard profile (`RENEGADE_MODULES=all`, the runner's posture): **15/15 pass.**
- Lean profile (`RENEGADE_MODULES` empty; boot verified separately to register 67 collections with no `discussions`/`products`): **15/15 pass** — Standard-only surfaces absent, module-off behavior asserted, core proofs unchanged.
- **Permitted transition:** Site A admin switches to Site A through the route (200 + cookie), active-site read-back confirms, and a fresh reload of principal state switches again (200). The editor writes on their own site.
- **Denied transition:** the Site B admin's switch into Site A is refused (403, no cookie), a forged `renegade-active-site` cookie naming Site A does not take effect, access-controlled read and write of Site A's draft are both denied, and after a full principal reload the switch is still refused (403). A subscriber resolves to no operator authority at all.
- **Anonymous:** each site's host resolves to its own site and lists only its own published content (no drafts, no cross-site titles); an unknown host resolves to nothing (fail-closed).
- **Regression:** the pre-existing tenant-authorization matrix still passes unchanged (21/21) against the same database.

## The member journey (Matthew, Nov 11, 2026)

The journey he specified — a member who has a profile, can blog on it, and can post on the forum — was run as named proofs:

- **Profile + forum: WORKS.** The member signs in through the real magic-link machinery, resolves as an actor on their site, and posts in the site's forum via `replyToForumThread`; the post persists attributed to them.
- **Finding 1 — member space-blogging has no write path (capability gap).** The space exists and a post placed in it by staff reads back in space scope, but a member identity cannot write it: content create/update access admits only staff Payload users (`tenantCreateAccess`), members are not Payload users, and no member-facing space-post service or route exists (the v1 spaces route is read-only). Root-cause class: missing member publishing path, entangled with the profile/space structural split. Owner: H-03 design, RC3 family journey. The suite asserts today's behavior explicitly so the fix flips a named test.
- **Finding 2 — cross-site member posting succeeds (open policy question).** Member identity is installation-wide: the Site A member, holding no role and no standing on Site B, can post in Site B's forum under their own name — `assertWriter` checks identity and active status only, never per-site membership. No data exposure and no privilege escalation (moderation still requires per-site grants); it is a policy question, not a breach: is a member of one website a member of every website on the installation (network model), or should forum writing require standing on that site (per-website model)? Owner: Matthew's call; H-02 tests whichever rule is chosen. The suite records the current behavior as a named assertion.

## Boundaries of this result

- This is **not** the complete role-matrix pass — that is H-02, which now has a standard world to run against.
- Provider-failure helpers are harness-side fixtures; sandbox results never count as live-provider proof (unchanged rule).
- Process-level restart proof is not re-run here; the reload proofs re-resolve every principal from the database with fresh sessions, which is the authorization-relevant effect.

## Files

- `tests/fixtures/rc2-world.ts` (new)
- `tests/integration/rc2-a04-fixture-world.integration.test.ts` (new)
- `tests/unit/rc2-world-guard.test.ts` (new)
- `docs/rc2/RC2-STATUS.md` (A-04 row)
- `docs/rc2/evidence/RC2-A-04/RESULT.md` (this file)

**Next prompt: RC2-B-01.**
