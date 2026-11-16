# RC2-DEBT-01 — Profile = space merge

**Verdict: PASS.** The decided profile=space merge is executed: the
profile is the one canonical member-home record, and a space is now
only a profile's per-site presence. All nine duplicated identity
fields are gone from the spaces collection and from the database.
Every journey that was green before the merge is green after it, at
the same counts. Owner approved the merge before RC3 on Nov 16, 2026
("Yeah do it before i guess"), sequenced as its own pass on fresh
main after PR #84.

**Base:** GitHub main at `a875b3f` (the PR #84 merge) · **Branch:**
`rc2-debt01-merge`

## What changed

- `src/collections/Identity.ts` (Spaces): removed member, handle,
  displayName, avatar, cover, bio, visibility, fieldAudience and
  layoutTheme. `profile` is now required and indexed; uniqueness is
  (site, profile) and (site, canonicalPath); the admin title is the
  canonical path. Anything displaying identity resolves through the
  profile — the settled space=profile model (Nov 10, 2026).
- Migration `20261116_130000_rc2_profile_space_merge`: backfills
  `profile_id` from profiles via member_id where null (before the
  member column drops), drops the nine columns and their indexes,
  sets `profile_id NOT NULL`, adds the unique (site, profile) index.
  Down migration restores the columns and backfills from profiles.
- Consumers migrated: the audience space fact
  (`src/modules/audience/service.ts` — spaces found by site, member
  resolved via profile.member), comment scoping
  (`src/modules/community/comment-composer.ts` — nested
  profile.member query), space creation
  (`src/scripts/seed.ts`, `src/modules/operations/onboarding.ts` —
  upserts keyed by (site, profile); onboarding's canonical path now
  uses the resolved unique profile handle), and portability export
  (`src/modules/portability/site-export.ts` — profiles pulled by
  reference first, member ids derived from the profile records;
  composes with the DEBT-26 sever-to-null import).
- Tests updated where they encoded the old shape: the aud-09d
  selector-closure integration test (a space now requires a profile;
  the foreign-space member therefore carries the install-global
  profile fact — the site-scoped space fact still excludes them, and
  the expectation records why) and the canonical
  information-architecture test (space found by canonical path,
  ownership asserted via its profile).

## The forum correction

The register named a third store: SQL `forum_spaces` /
`space_memberships`, read by `forum-space-access.ts`. Recon for this
pass found a name collision, not a third member-home store: those
tables are forum boards (name/slug/parent/visibility/join
policy/entitlement) belonging to the comm-04 SQL forum engine. That
engine never reads the Payload member spaces collection, so this
merge does not touch it. Its own status — a complete but orphaned
subsystem whose board/membership tables have no production writer
and which no live journey exercises — is the same species as
DEBT-20's stranded v1 comment store and joins that item's pre-RC3
status decision (wire up vs retire), flagged for the owner at this
pass's PR. It is not silently dropped and it does not balloon this
pass.

## Before / after (the register's measure)

- Duplicated identity fields: **9 → 0**
- Canonical member-home records: **2 collections + 1 SQL table → 1
  collection** (the SQL tables turned out to be forum boards, not a
  member-home store — see the correction above)
- Audience / comment / forum journeys: green before and after

## Proof (production build of this tree; rig rebuilt after two VM

replacements on Nov 16, 2026)

S0 baselines were captured on the pre-merge build the same day;
every leg was re-run on the merged build:

- E-02 community journey: **14/14 API + 3/3 browser** before and
  after (includes the model C join legs and the DEBT-24 stage 7b)
- D-03 audience journey: **7/7** before and after (clean re-seeded
  world each time — the journey is single-run-per-world)
- Space-fact probe (new harness this pass): a segment whose only
  predicate is `communityFact = space` includes the space-owning
  member's subscriber — **true** before and after; after the merge
  the fact resolves through the profile
- Portability round trip: export of the seed world (24 records, the
  full member → profile → space → space-post chain inside) into a
  fresh target database — **23 completed / 0 failed** (the 24th
  record is the site itself); target verified: spaces 1 with
  profile/member remapped to real new ids, space posts 1, content
  3, article family 2, revisions 2. Before the merge the same chain
  scored 20/0 on a 21-record world
- Migration: applied cleanly to the populated rig database (the
  nine columns are gone; `profile_id` is NOT NULL); the fresh
  install chain (134 migrations) passes `test:migrations:fresh`;
  the upgrade rehearsal from the Sept 2026 baseline passes
  `test:migrations:upgrade`
- Integration: aud-09d selector closure + canonical information
  architecture — **20/20**
- Unit suite: **291 files / 2,137 tests passing** (the 2,138th test
  in the I-02 count is the DEBT-07 503 test, which lives in PR #85 —
  see the I-02 landing note); typecheck, lint and prettier clean

## Explicitly not in this pass

- Posting-gate enforcement under model C (members can still post on
  never-joined sites) — a separate owner decision, unchanged.
- The comm-04 forum engine's wire-up-or-retire status — joins the
  DEBT-20 remainder's pre-RC3 decision slot.
- No Red-gate defects found or introduced.
