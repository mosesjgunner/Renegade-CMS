# Creator Studio — CRE-16 exit report

**Candidate:** GitHub main `e9f0372` (partial CRE-16 push) plus the board-green fixes on
branch `cre16-exit-board-green` (PRE-04 slug fix, origin-gate harness fix, config-debris
revert — detailed below). **Verification environment:** local PostgreSQL 16 rig
(CI uses PostgreSQL 17; the partial run's author reported the same checks on 17.12).
**Date:** 2026-11-23. **Prepared by:** Harbor, from firsthand runs on the final tree —
full logs in the verification archive (`openmove-*`), not from the candidate's own claims.

## Gate evaluation (per the CRE-16 spec)

**Required Creator journeys at E2 or better** (real mounted feature + persisted
readback + scoped permission denial):

| Journey                                       | Verdict                            | Evidence                                                                                                                                                                                                |
| --------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create / project / portfolio / private upload | **E2 — met**                       | CRE-14 portability evidence (prior run, linked in release notes); integration suites cre02/cre14 green on this tree; cross-member denial dynamically proven (below)                                     |
| Recording and captions                        | **E2 — met, recording stays beta** | CRE-12 evidence; caption/dub worker tasks are real mounted features (registry-verified); recording recovery evidence is fixture-level                                                                   |
| Native live and replay                        | **Beta — E3 NOT reached**          | Local MediaMTX two-browser proof exists (prior run); wider device/deployment proof and the recorded iOS segment-timing warning keep it below E3. Disabled for third-party rollout per the release notes |
| Paid media and catalog                        | **Beta — E3 NOT reached**          | Entitlement + revocation denial proven in scoped tests; no connected-buyer live journey. Stays beta                                                                                                     |
| External destinations                         | **Staged**                         | Local receiver proofs pass; YouTube/Twitch account delivery is a manual external step, not a verified live integration                                                                                  |

**High-risk modes (native live, recording, paid media): E3 not reached.** They ship as
functional-but-beta for supervised use and disabled for third-party rollout, with the
reasons stated — per the gate's own fallback rule, not as completed work.

## What this pass verified firsthand

| Check                                       | Result                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh migrations → seed → upgrade rehearsal | PASS (175 migrations; upgrade from `20260914_110000_med_05_video_workflow`)                                                                                 |
| format:check / lint / typecheck             | PASS on the final tree                                                                                                                                      |
| Unit suite                                  | PASS — 364 files / 2,910 tests, 0 failed                                                                                                                    |
| Integration suite                           | PASS — 671 passed / 0 failed / 11 skipped, 120 files (baseline before fixes: 668 passed / 3 failed)                                                         |
| PRE-04 composition import, solo             | PASS 5/5 (failed solo before the fix)                                                                                                                       |
| Module disable → re-enable                  | PROVEN: floor-only boot unmounts `videos` (79 collections registered); the canonical row survives in PostgreSQL; re-enable reads back the same ID and title |
| Restore rehearsal                           | PARTIAL (see below)                                                                                                                                         |
| License inventory                           | VERIFIED (see below)                                                                                                                                        |
| npm audit                                   | BLOCKED on this rig (see below)                                                                                                                             |
| Downgrade protection                        | CONFIRMED in code (see below)                                                                                                                               |

## Fixes carried by this branch

1. **PRE-04 presentation import (real defect, now fixed).**
   `prepareImportLayouts` in `src/modules/presentation/composition.ts` resolved media
   references against collection slug `media`, which does not exist; the registered slug
   is `media-assets`. Both lookup sites (same-site existence check, cross-site filename
   rebind) corrected. Proof: the PRE-04 integration file passes solo (5/5) and inside
   the full suite; before the fix it failed solo reproducibly with
   "The collection with slug media can't be found".
2. **CRE-15 origin gate vs integration harness (harness fix; gate untouched).**
   CRE-15 added a write-origin requirement to Creator submission routes: a modifying
   request must present an `Origin` header matching the site's canonical origin
   (`submission-http.ts` + `samePublicOrigin`). Its unit tests pin that behavior —
   absent or foreign origins are rejected before member resolution — and they still
   pass (13/13 with the boundary suite). The integration harnesses for cre02/cre06
   built requests the way no browser ever does: no `Origin` header at all, while their
   fixtures already register the site origin as canonical — exactly the production
   configuration. The helpers now send `Origin: <site origin>` on writes, which is
   what a real browser sends. This is not test-gaming: the gate's negative behavior
   remains pinned by unit tests, and the integration tests again exercise what they
   exist to prove — including the cross-member 404 that the gate had been masking.
3. **Config debris reverted (from the partial CRE-16 push).**
   The push repointed the generated `next-env.d.ts` at a local proof directory
   (`.next-cre14-proof`) and added matching include globs to `tsconfig.json`. Neither
   change loosens strictness (`strict: true` throughout; no paths excluded), but the
   committed tree must reference the directory the project's own typecheck generates
   (`.next-typecheck`), not one machine's proof artifacts. Both files are restored to
   their pre-push content on this branch; the lead can re-apply if the proof setup is
   ever productized.
4. **Evidence file formatting.** The push's `browser-index.json` was not
   prettier-formatted and failed `format:check` on its own; a whitespace-only
   prettier pass was applied (content unchanged) so the format gate is green.

## Restore rehearsal — partial, honestly bounded

The shipped rehearsal path is Docker-Compose-orchestrated; this VM has no Docker, so
the full rehearsal (media archive, container boot, readiness + byte comparison) could
not be executed here and is **staged** for a Docker-capable environment. The database
leg was rehearsed natively in the tool's own archive format: `pg_dump -Fc` of the
acceptance database, `pg_restore -l` listing (4,379 entries), restore into a scratch
database, and exact verification — sites 5, members 15, content 9, media-assets 3,
videos 1, migration ledger 175, canonical record identical. Per the runbook's own
standard, a database-only rehearsal is reported as partial, not complete.

## Package and license audit

- **License inventory (offline, from the lockfile production graph):** 603 production
  packages — MIT 515, Apache-2.0 26, ISC 19, BSD-3-Clause 15, remainder permissive.
  Copyleft present: sharp's libvips platform packages (LGPL-3.0-or-later, dynamically
  linked), `@wordpress/block-serialization-default-parser` (GPL-2.0-or-later), and the
  bundled ffmpeg binary (GPLv3, shipped separately with its license file). The two
  packages missing lockfile license labels — `busboy`, `streamsearch` — are MIT per
  their installed LICENSE files. **Distribution review of the GPL-family entries stays
  open**, as the release notes already state; nothing here is a surprise beyond them.
- **npm audit:** the release notes report zero production findings from the author's
  environment. The audit endpoint is policy-blocked from this rig (registry proxy
  returns 403 `policy_denied`), so that figure is **author-reported, not independently
  reproduced** here.

## Downgrade protection — explicit

`assertRollbackSchemaCompatibility` (`src/modules/operations/lifecycle.ts`) refuses
image rollback whenever the migration ledger differs from the pre-upgrade backup, and
the rollback command runs no down migrations; recovery after a schema change is
restore-from-backup. Version compatibility of the archive itself is asserted
separately. Downgrade protection is explicit, as the spec requires.

## Mock, manual, and live — kept distinct

- **Mock/fixture only:** provider destinations (local receivers), telecom/SMS legs,
  payment rails beyond test-mode Stripe, synthetic dubbing voices beyond local adapters.
- **Manual external actions:** YouTube/Twitch account-connected delivery; Apple
  Podcasts / Spotify directory legs (podcast surface) — accounts and submission are
  the operator's, not verified live.
- **Verified live on this tree:** everything in the gauntlet table above, on local
  PostgreSQL. No third-party provider receipts exist for any Creator surface yet.

## Open items (named, not buried)

1. **Tenant-isolation dynamic proof — partially closed.** Submission isolation is now
   dynamically proven (cre02 cross-member cases pass through the corrected gate).
   Portfolios and capture/editor surfaces still have no dynamic cross-site test —
   standing debt, unchanged by this pass.
2. **Native live / recording / paid media below E3** — beta labels above; the path is
   operational recovery rehearsal on real deployments plus device/browser coverage.
3. **Full Compose restore rehearsal** — staged on Docker availability (above).
4. **Production build + browser matrix on the frozen candidate** — the release notes'
   browser evidence (Chromium/Firefox/WebKit status captures + screenshots) is real
   but was produced on the author's machine; the frozen-candidate repeat belongs to
   RC3-24's rehearsal.
5. **GPL-family distribution review** — open legal review item, not an engineering one.

## Ledger reconciliation

The partial push annotated RC3-90-AREA-LEDGER rows 12 (Media Studio), 16 (Video &
livestreaming), and 18 (Events & timelines) with Creator-scope evidence pointers and
**held every whole-area grade**. That matches the evidence: scoped Creator proof does
not regrade whole areas. No further ledger changes are made by this pass.
