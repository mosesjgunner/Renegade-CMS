# RC2-E-02 — Forums, comments, reports and moderator decisions: RESULT

**Verdict: PASS** — API journey 12/12 stages, browser proof 3/3 stages.
The full governance arc is proven live: member post → threaded reply →
report → moderator queue → quarantine / lock / suspend → user-visible
outcome → reinstatement, with a tamper-evident moderation audit chain.
One P1 defect found and filed (RC2-DEBT-19): a member who holds no site
role row cannot be reported by profile or sanctioned at all, because
both the report service and the moderation-action service resolve a
`member_profile` target through `profiles JOIN member_site_roles`, and
self-signup plus ordinary participation never creates that row.

## Assignment

Seed a supported community and follow member → post/comment → threaded
reply/forum topic → report → moderator queue → accept/hide/lock/sanction
→ user-visible outcome. Prove moderation audit, spam/rate/role guard,
safe rendering and no cross-site visibility. Test a forbidden moderator
action and restore/reversal where supported. Keep the legacy nested
taxonomy/forum architecture; avoid inventing a separate comment store.
Add a repeatable browser path and negative tests.

## Environment

Production build of the D-04 tree (production code identical to main
`79ce2a6` for the E family; E-01/E-02 changed no production code) served
locally against the RC2 two-site world (fresh seed after a sandbox
rebuild; Site A `a.rc2-a04.test`, Site B `b.rc2-a04.test`). Five clean
public members (author, troll, reporter, moderator, spammer) signed in
through the production magic-link path; no staff credentials perform
any member or moderation action.

## Test boundary (stated plainly)

- Sign-in tokens are minted by calling the production `issueMagicLink`
  from a spec (the raw token is not observable over HTTP in the
  production profile; inherited from E-01) and completed over real HTTP.
- The moderator's `moderator` role row is granted through the
  in-process operator path the RC2 world builder uses: the
  member-site-roles REST create refused the site admin's own session
  (403, measured in run 1). The refusal is recorded under F1 — no HTTP
  path observed provisions these rows.
- The v1 comment thread is provisioned through the production
  `getOrCreateCommentThread` function from a spec, because no HTTP
  route creates one (F2). Everything after provisioning is real HTTP.

## The three discussion stores (the seam this prompt exposes)

1. **Payload `discussions` / `discussion-posts` — the live store.**
   `/api/community/threads|posts|comments` write it, the `/forums`
   pages render it, moderation acts on it. Everything below is proven
   against this store unless named otherwise.
2. **v1 SQL `comment_threads` / `comments`** — the article-page comment
   surface: idempotency keys, edit windows, and a rate limit (below).
   Mounted and functional, but its only thread creator has no callers
   in `src` (F2).
3. **Legacy SQL `forum_topics` / `forum_posts`** — its writer
   (`src/modules/community/forum-composer.ts`) is imported by nothing:
   dead code. The `forum_post` / `forum_topic` moderation target types
   nevertheless remain live and act on a store no live path writes.

## What was proven (12/12 API + 3/3 browser)

1. A member opens a forum topic; replies nest (reply → re-reply with
   parent); the thread reads back through the posts list.
2. A script-laden comment (`<script>` + `onerror` img) posts 201 and
   round-trips as plain text data; the browser stage proves the stored
   payload does not execute on the article page.
3. **Measured gap (F1):** reporting the troll's profile before he holds
   any site role row returns 404 "Report target not found." — no case
   is created.
4. Two reports on the troll's post from different members aggregate
   into exactly one moderation case carrying both reports.
5. Once a `member` role row exists (operator-path grant, see boundary),
   the same profile report returns 201 and opens a case.
6. Forbidden actions refused: a plain member's moderation POST → 403;
   an anonymous queue read → 403; a moderation POST against the wrong
   site's host → 404.
7. Quarantine by the moderator (200): the post disappears from the
   public thread read, and the hash-chained community audit log
   verifies (`auditValid: true`).
8. Locking the thread (200) makes further replies fail 403
   `discussion_locked`.
9. Suspend-posting on the profile case (200): the troll's next comment
   is refused 403 "Posting is suspended by moderation."; reinstatement
   (200) restores posting (201).
10. Reinstating the quarantined post (200) makes it public again —
    reversal is a first-class action, not an undo hack.
11. The v1 comment surface rate-limits a rapid poster: five comments
    at 201, then 429 (`COMMENT_RATE_LIMITED`, rolling 60-second
    window) — the spam guard holds.
12. Cross-site isolation: Site B's moderation queue contains none of
    Site A's cases; Site A's thread read against Site B's host → 404.

Browser (3/3): the public forum page lists the member-created thread;
the thread page renders the visible reply tree; the stored XSS payload
does not execute on the article page.

## Findings

**F1 = RC2-DEBT-19 (P1) — ordinary members cannot be reported by
profile or sanctioned.** Both target resolvers
(`moderation-reports.ts` snapshot SQL, `moderation-actions.ts`
`target()`) resolve `member_profile` via
`profiles p JOIN member_site_roles r ON r.member_id = p.member_id
WHERE p.id = $1 AND r.site_id = $2`. A self-signed-up member who posts
and comments acquires no `member_site_roles` row (verified in the
database: journey members hold zero role rows; only world-seeded
members and spec-granted moderators have any), so the report 404s and
no case can ever exist to sanction against. The members the moderation
system most exists for are precisely the ones it cannot reach. No HTTP
path provisions the missing row either: the member-site-roles REST
create returns 403 even for the site admin. Fix direction and
acceptance test are in RC2-DEBT-19; the right fix interacts with the
open member-standing policy decision (installation-wide identity vs
per-site standing), so it is filed, not patched, in this prompt.

**F2 = RC2-DEBT-20 (P2) — two of the three discussion stores are
stranded.** The legacy forum store's only writer is dead code while
its moderation targets stay live, and the v1 comment surface cannot be
provisioned over HTTP (`getOrCreateCommentThread` has no callers), so
it only serves content that already has a thread row. Both are
consolidation work for RC3 / the 1.6 cleanup, not correctness risks to
the live store.

## E-levels after E-02

- Forums, threads, threaded replies (live store): **E2 proven**.
- Comments on articles (live store): **E2 proven** (E-01 + here).
- Content moderation — report → case → quarantine/lock/remove →
  reinstate, hash-chained audit: **E2 proven**.
- Member sanctions (suspend/ban): **E2 proven once a site role row
  exists**; unreachable for role-less members (RC2-DEBT-19).
- v1 comment surface: **E1** — mounted, rate limit proven against a
  spec-provisioned thread; not provisionable through the product.
- Legacy forum store targets: **E0** — dead writer; targets act on a
  store no live path creates rows in.

Community & Member Systems family: **E2** (identity in E-01, community
governance here), with the F1 gap carried openly into E-03/RC3.
