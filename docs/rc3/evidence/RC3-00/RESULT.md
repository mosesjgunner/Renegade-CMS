# RC3-00 — Baseline and 90-row work queue: RESULT

**Pass type:** audit-only. No product code changed, nothing pushed,
no PR opened. All work is in the local worktree `rc3-00-tree` on
local branch `rc3-00`.

## Baseline pin

| Fact                                              | Value                                                                     | How verified                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Branch                                            | `rc3-00` (local only)                                                     | created from `refs/gh/main` in this pass                            |
| Base / HEAD SHA                                   | `2d4cb3ddf70db5b5f9570297e6bae0d7ff8774bf`                                | `git rev-parse` after a fresh fetch of GitHub main                  |
| `rc2` tag target                                  | `2d4cb3ddf70db5b5f9570297e6bae0d7ff8774bf`                                | `git rev-parse rc2` — tag and main are the same commit              |
| Ancestry                                          | HEAD == tag target; the tag is an ancestor of (identical to) the baseline | `git merge-base --is-ancestor`                                      |
| Cleanliness at creation                           | clean (no porcelain output)                                               | `git status` at worktree creation                                   |
| CI at the pin                                     | hosted `verify`: **completed / success**, two runs on the exact SHA       | GitHub API check-runs read during this pass (2026-11-20 evening CT) |
| Tree delta since the RC2 ledger audit (`62d8ece`) | 216 commits, PRs #74–#114                                                 | `git log` merge list                                                |

## Deliverables (changed paths, all under `docs/rc3/`)

1. `RC3-90-AREA-LEDGER.md` — the 90-area ledger re-issued on the
   pinned tree: names/numbers/systems verbatim from
   `docs/rc2/RC2-90-AREA-LEDGER.md`; per-row E-level, provider mode,
   owning RC3 pass, and a re-baseline note; standing facts vs owner
   decisions separated; the below-E2 family gap plan; supplementary
   rows CF (custom fields) and NEO4J.
2. `RC3-90-AREA-LEDGER.csv` — the machine-checkable index of the same
   rows (plus the two marked supplementary rows).
3. `RC3-WAVE1-FILE-OWNERSHIP.md` — per-pass file sets for 00A/01–07,
   the named collisions (`audience/service.ts`; the lockfile;
   migrations; shared harnesses), serialization rules, safe parallel
   pairs.
4. `evidence/RC3-00/POD-RC-01-RECORD-FLAG.md` — the release-record
   drift (the tag's tree contains PR #113; the notes scope it out of
   RC2) with corrected text drafted **for owner review only**.
5. This RESULT.

Local commits: `f7e0530` (deliverables 1–4) and the commit carrying
this file. Nothing was pushed; the branch exists only in this rig's
shared gitdir.

## Ledger outcome

- 90 unique numbered rows, zero dangling pass references (asserted by
  the generator script: every owning/secondary pass ∈ {00, 00A,
  01–25 incl. 15A/15B}), **zero rows without an owning pass**.
- Distribution (machine-counted): E3 4 · E2 47 whole + 2 in part ·
  E1 21 whole + 2 in part · E0 13 whole + 1 in part · NOT VERIFIED 2
  whole + 1 in part · E4 0.
- **Exactly one upward regrade:** #5 Complete SEO, E1 → E2, on
  executed proof post-dating the RC2 audit (PR #95, live probe
  43/43, DEBT-14 closed by the same pass; PR #103 closed its F5
  sitemap defect). All other levels are carried from the RC2 rows;
  post-audit movement is recorded as annotations (D1–D8 reconciled:
  #25, #62, #65, #37/#41, #42, #29, #80, and #2 carried as genuinely
  unsettled).
- Our-plan items the adopted pass structure omits, recorded so they
  cannot drop: **Neo4j** (supplementary row; own R&D pack per the
  owner's Nov 20, 2026 decision; the governing plan's demo-or-named-E0
  rule stands), **custom fields** (supplementary row CF; owning-pass
  proposal RC3-17 or a dedicated slot; ranking is the owner's call),
  **email hold** (recorded as a constraint on RC3-07: fixture-only
  until the owner authorizes real legs).

## Verification of the Sol audit's static code claims (at the pinned tree)

| #   | Claim                                                                                                                                                     | Verdict                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Federation inbox resolves discussion replies by path with no site/publication/canonical-origin predicate; discussion paths are unique per site only       | **CONFIRMED**             | `src/app/(frontend)/ap/actors/[handle]/inbox/route.ts:98-104` — `payload.find({ collection: 'discussions', where: { canonicalPath: { equals: pathname } }, overrideAccess: true })`, no site predicate; the found discussion receives the post regardless of the actor's site. `src/collections/Community.ts:189` — discussions unique index is `['site', 'canonicalPath']`. Mitigation as the audit stated: `remoteReply` (`src/modules/social/activitypub.ts:177-193`) creates the post `status: 'hidden'`, `moderationState: 'review'`. Runtime impact (an actual cross-site write) is **not** reproduced here — that is RC3-01's two-site proof. |
| 2   | DEBT-22: the inbox catch already releases the just-created dedupe record after processing failure                                                         | **CONFIRMED**             | Same route, catch block: comment cites RC2-DEBT-22; `if (createdRecordId) await releaseInbound(actor.payload, createdRecordId)`; `createdRecordId` is nulled only after the record is marked `processed`, so only unprocessed records are released. The narrow repair is present at the tag; retry/concurrency coverage remains RC3-01 work, as the audit's disposition says.                                                                                                                                                                                                                                                                        |
| 3   | DEBT-15: matched inactive subscribers are counted as pending/unconsented before suppression is evaluated                                                  | **CONFIRMED**             | `src/modules/audience/service.ts` (~lines 1005-1010): in the matched branch, `if (!isActive) { unconsentedOrPending++ } else if (isSuppressed) { suppressed++ }` — an inactive + suppressed subscriber never reaches the suppression bucket. Delivery exclusion itself is separately correct (`channelEligible: isActive && !isSuppressed`, ~line 993), matching the audit's "operator reporting" framing.                                                                                                                                                                                                                                           |
| 4   | Browser acceptance is outside the canonical CI job                                                                                                        | **CONFIRMED**             | `.github/workflows/ci.yml` defines a single job, `verify`, running `npm run verify:release`. `test:browser` exists (`package.json:32`) but no workflow invokes it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | The upgrade verifier starts from a September migration fixture                                                                                            | **CONFIRMED**             | `src/scripts/verify-upgrade-migration.ts:11` — `UPGRADE_BASELINE = '20260914_110000_med_05_video_workflow'` (Sept 14, 2026).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | Packaging: `next.config.ts` carries a docs exclusion yet docs still land in the standalone artifact; the theme package import graph uses `realpath(root)` | **CONFIRMED (mechanism)** | `next.config.ts:14` — `outputFileTracingExcludes: { '/*': ['./docs/**/*'] }` with the lane-08 comment; `src/modules/presentation/packages.ts:155` — `boundary = await realpath(root)`. Byte counts were **not** re-measured (no production build in this pass, by instruction): the audit's 826,230,127 docs bytes of 1,108,092,457 standalone bytes is consistent with the RC2 record's own measurement (~799 MB of docs in the standalone artifact, exit report §5, lane 08 failed both rounds).                                                                                                                                                   |

Checks **not** run in this pass, named plainly: no production build
(byte counts above), no test suites (no code changed; the pinned
tree's CI result stands as the test evidence), no `npm audit`
(dependency disposition is RC3-00A's own pass), no runtime
reproduction of the inbox finding (RC3-01's proof obligation), no
browser journeys.

## Go / no-go baseline statement

**GO.** The baseline is exact and reproducible (tag == main ==
`2d4cb3d`, hosted CI green on that SHA), the 90-row queue is fully
owned with zero dangling references, the five P2 riders
(DEBT-02/-03/-04/-15/-22) each sit inside a named pass (21, 17, 14,
02, 01 respectively), and every open owner decision is recorded as
open rather than silently assumed. Two carried conditions:

1. The federation inbox scope finding (claim 1) is a confirmed code
   defect of _unproven runtime impact_. It is RC3-01's first proof
   obligation; if the two-site fixture reproduces a cross-site write,
   it classifies Red under the governing plan and blocks accordingly.
2. The rows marked stale (#10, #15) hold their RC2 levels until
   their owning passes run the deciding proofs — the RC3 exit may
   not quote their evidence as current without those runs.
