# RC3-14 — Article → campaign: repurpose workflow (DEBT-04) + campaign release re-proof

**Verdict: DONE at E2 per leg** on branch `rc3-14`, based on `82b5c6c`
(GitHub main at pass start). Local commits only; nothing pushed.

Scope was set by the owner's option A decision (Nov 21, 2026): build
the non-podcast parts of RC3-12/13/14 now; podcast-dependent slices
close when RC3-10/11 land with the podcaster build.

## What was built

- **DEBT-04 closed: `content.repurpose` has a real handler**
  (`src/modules/editorial/repurpose.ts`, migration
  `20261121_200000_rc314_repurpose`). The task key was declared in
  the AI task registry with no handler anywhere — a capability claim
  the product could not back. The handler is deliberately
  deterministic (same source in, same derivative out — checksums
  prove it) and is NOT routed through the AI proposal machinery.
  Flow: stage a draft with provenance (staging writes nothing to any
  target collection) → a human approves or rejects (the decision and
  the decider are recorded; a second decision is refused) → approval
  materializes a **draft** in the target collection — social post,
  newsletter section (an email draft, never a sent one), or article
  draft — carrying the same provenance. Rejection materializes
  nothing. Nothing is ever published by this workflow. Non-staff
  actors, plain members, other sites' staff, and unpublished sources
  are refused.
- **Campaign release D-04/D-01 re-proof**: one canonical release pins
  an article + a source-linked social draft + a newsletter. An
  injected single-channel failure lands the release
  **partially-failed** with the failure visible; a retry after fixing
  the channel completes the release **without repeating acknowledged
  delivery**; a scheduled release cancelled before execution executes
  nothing.

## Per-leg levels (all E2 — real Postgres, two-site rc2 world)

| Leg                                                               | Level | Proof                                                                      |
| ----------------------------------------------------------------- | ----- | -------------------------------------------------------------------------- |
| `content.repurpose` resolves to a real handler                    | E2    | `rc314-repurpose.integration.test.ts` handler test + unit derivation tests |
| Stage-first with provenance (nothing written to target)           | E2    | repurpose integration test 1                                               |
| Approval materializes drafts only (social / newsletter / article) | E2    | repurpose integration tests 2–4                                            |
| Rejection materializes nothing; second decision refused           | E2    | repurpose integration tests 2, 5                                           |
| Authority: non-staff / member / other-site / unpublished refused  | E2    | repurpose integration test 6                                               |
| Deterministic derivation per target kind (checksum-stable)        | E2    | `tests/unit/rc3-14-repurpose.test.ts` (7 tests)                            |
| Campaign release: partial failure is visible, retry is safe       | E2    | `rc314-campaign-release.integration.test.ts` (3 tests)                     |
| Scheduled release cancellation executes nothing                   | E2    | campaign-release integration test 3                                        |

## Gauntlet (CI order, final tree @ `cca1d0f`)

Migrations ✓ · seed ✓ · format ✓ · lint ✓ · typecheck ✓ ·
**unit 349 files / 2,829 tests, all pass** · **integration 98 files
passed + 2 skipped (100); 579 passed + 6 skipped, 0 fail** ·
build ✓ · smoke PASS. Gauntlet exit 0
(`~/workspace/rc3-wave2-logs/gauntlet-314.log`).

## Harbor firsthand verification (Nov 22, 2026)

Re-baselined the pass database (migrations fresh + seed) and re-ran
the focused suites independently: unit 7/7, repurpose integration
6/6, campaign-release integration 3/3 — all pass, matching the
gauntlet counts. This RESULT.md was written by Harbor after the fact:
the building coordinator ended before filing its own evidence, and
the pass is not counted verified without it.

## Named gaps / deferred

- **Podcast repurpose targets** (episode → social/newsletter) are not
  built; they close with RC3-10/11 under the owner's option A split.
- **No browser/UI leg** — service and route level only; no E3 claimed.
- The repurpose derivations are deterministic text transforms, not
  AI rewrites; routing them through the AI proposal machinery is a
  separate design question, not silently assumed here.

Posting/member-standing enforcement was never touched.
