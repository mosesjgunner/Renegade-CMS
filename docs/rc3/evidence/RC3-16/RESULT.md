# RC3-16 — Social queue and provider truth — Result

Date: 2026-11-21. Branch: `rc3-16` (local only; nothing pushed).
Base: `refs/gh/main` at `82b5c6c`, which already contains the salvaged
Codex partial for this pass (`c0ea18f`). Per Matthew's decision the
partial stays on main; this branch verifies it where it sits and
completes the pass on top. This document replaces the earlier draft,
whose unproven claims are re-graded below. No real network was posted
to at any point; all provider evidence is against the repository's
deterministic AT-protocol fixture on localhost.

## Phase 1 — salvage verdicts (commit `c0ea18f`, verified on main)

| Salvaged piece                                                                                                                                                                                                                 | Verdict                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unknown` delivery quarantine in queue/worker (publish exceptions after submit and `remoteOutcome: 'unknown'` results park the delivery with retries cleared)                                                                  | **Sound.** `tests/unit/rc3-16-social-outcome.test.ts` passes 5/5 on the main tree; the bounded-reconcile integration suite passes (below); the Phase 2 journey re-proves it through a live dispatch.                                                     |
| Provider-runtime truth hardening (`getProviderCapabilityTruth` cannot be overridden past manual-handoff/unavailable; accounts route derives truth from server-side credentials; caller-supplied `body.mode` promotion removed) | **Sound.** Focused integration on main: 4 social suites, 14/14 pass (`social-bounded-reconcile`, `social-accounts-connect-tenant`, `social-drafts-variant-binding`, `social-release-distribution-key`); journey test 6 re-asserts the promotion refusal. |
| Bluesky adapter routed through the dispatch boundary with strict expected-URI confirmation; 5xx-after-submit → `unknown`; receipts carry providerMode                                                                          | **Sound** at fixture level (same suites). No live-network claim.                                                                                                                                                                                         |
| Provider fixture port isolation (`SOCIAL_FIXTURE_PORT`)                                                                                                                                                                        | **Sound** (the Phase 2 journey runs its own fixture instance on a second port concurrently-safe).                                                                                                                                                        |
| Operator journey, manual handoff, evergreen                                                                                                                                                                                    | **Absent from the salvage (E0).** Built in Phase 2 — the RC3 ledger (area #27) assigns the evergreen half to this pass: "recurring slots, recurring promotion, pause/resume was absent in code at audit."                                                |

Baselines recorded on `refs/gh/main` (`82b5c6c`), database
`rc316_release_acceptance`: unit 348 files / 2,822 tests pass;
integration 98 files (96 pass, 2 skipped) / 576 tests (570 pass,
6 skipped); fresh migrations and fixture seed pass.

## Phase 2 — what was built

- **Evergreen recurrence** (area #27): queue items carry
  `recurrenceIntervalDays` / `recurrenceSeriesKey` /
  `recurrenceOccurrence` (migration `20261121_130000_rc316_evergreen_handoff`,
  which also adds the `paused` and `manual-handoff` values to the three
  social status enums). Scheduling a draft with a recurrence interval
  starts a series; each successful publish spawns the next occurrence
  in the same transaction — anchored to the slot's scheduled time so
  cadence does not drift, carrying the same approval hash, keyed
  deterministically (`evergreen:<series>:<n>:<approvalHash>`) so a
  replayed completion cannot spawn a duplicate.
- **Pause/resume**: `paused` joins the social state contract
  (queued/scheduled ⇄ paused); paused items are invisible to the
  outbox sweep and skipped by direct dispatch. Worker route actions
  `pause-item` / `resume-item`.
- **Manual handoff as a first-class outcome**: dispatch to a
  manual-handoff destination no longer fails as "unsupported" — it
  parks the queue item in `manual-handoff` with the approved copy,
  link, canonical URL and attachments in the item's `handoff` payload,
  records no publish attempt (no provider request is made), and waits
  for the operator. `completeManualHandoff` (worker action
  `complete-manual`) records the operator's live-post URL as the
  receipt: an `external-posts` row plus the completion stamp, settling
  variant and draft exactly like a provider publish.
- The upgrade-migration verifier's `social_queue_items` sentinel now
  inserts baseline-only columns directly (that verifier's own pattern
  for post-baseline columns), so the historical-upgrade acceptance
  covers the new migration.

## Phase 2 — proof

Suite: `tests/integration/rc316-social-journey.integration.test.ts`
(6 tests, all passing) against the AT-protocol fixture on
127.0.0.1:13161, plus `tests/unit/rc3-16-evergreen.test.ts` (3 tests)
for the state contract.

| Leg                                                            | Level | Proof                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source-linked draft → schedule → dispatch → final receipt      | E2    | Journey test 1: queue/variant/draft settle `published`; exactly one `external-posts` receipt; the fixture recorded exactly one create.                                                                                                                                                                            |
| Pause / resume / cancel                                        | E2    | Journey test 2: a paused due item is untouched by the outbox sweep and skipped by direct dispatch; resume releases it to publish; a cancelled item never dispatches and cannot be paused.                                                                                                                         |
| Retry gates                                                    | E2    | Journey test 3: the automatic gate refuses a validation-class failure; the operator gate retries it (still failing, zero provider creates).                                                                                                                                                                       |
| Uncertain outcome cannot double-post (salvage, re-proven live) | E2    | Journey test 3 (continued): accept-then-lose-response → `unknown` quarantine with retries cleared; blind retry refused; read-only reconcile settles `published` with the fixture's create count still 1 and its submission count unchanged. The bounded-out variant is covered by the pre-existing DEBT-25 suite. |
| Manual handoff + operator completion                           | E2    | Journey test 4: dispatch parks in `manual-handoff` with the approved copy/link, zero publish attempts; completion requires the live URL and settles queue/variant/draft with the operator receipt.                                                                                                                |
| Evergreen recurrence                                           | E2    | Journey test 5: occurrence 1 publishes and spawns occurrence 2 exactly 7 days after the slot (not after completion); replaying the completed item spawns nothing; occurrence 2 publishes and spawns 3; pausing 3 holds the series against the sweep. Provider creates: exactly one per occurrence.                |
| Provider truth agreement                                       | E2    | Journey test 6: roster, capability truth and dispatch behavior agree (`manual`/`x` are manual-handoff everywhere; caller-supplied `live` cannot promote them; Bluesky is automatable). Command-center/API readback agreement is additionally covered by the pre-existing dist-03/dist-05 unit suites.             |
| Network promotion to live                                      | E0    | No network was promoted. Promotion requires current provider documentation plus authorized live evidence per network; neither exists in this pass. Live delivery to any real network remains NOT VERIFIED (area #26 stays sandbox-only).                                                                          |

## Gauntlet (branch tree, CI order, database `rc316_release_acceptance`)

| Step             | Result                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh migrations | Pass (including `20261121_130000_rc316_evergreen_handoff`)                                                                                                                                                                              |
| Fixture seed     | Pass                                                                                                                                                                                                                                    |
| Format check     | Pass (repo-wide, pinned Prettier 3.6.2)                                                                                                                                                                                                 |
| Lint             | Pass                                                                                                                                                                                                                                    |
| Typecheck        | Pass (payload types regenerated for the new queue fields/states)                                                                                                                                                                        |
| Unit             | 349 files / 2,825 tests pass — baseline plus the 3 new contract tests                                                                                                                                                                   |
| Integration      | 99 files (97 pass, 2 skipped) / 582 tests (576 pass, 6 skipped) — baseline plus the 6 journey tests, no regressions. The one interim failure (upgrade-migration sentinel) was fixed as described above and the full suite re-run green. |
| Production build | Pass (reduced-memory recipe)                                                                                                                                                                                                            |
| Smoke            | Pass                                                                                                                                                                                                                                    |

## Open items (at their true level)

- No browser-driven UI leg: the journey drives the same service
  functions the admin routes call, and the worker route's new actions
  are thin wrappers over them, but no browser clicked through the
  Social Command Center — legs are E2, not E3.
- Draft-time content validation still consults the worker adapter
  registry (the salvage draft flagged this); mode _truth_ is
  roster-derived everywhere it is reported, but the validation
  registry and the dispatch roster remain two lists.
- Evergreen scope is deliberately bounded: fixed day-interval slots
  per draft/variant series. There is no cron-style calendar UI, no
  per-account default schedule grid, and no bulk scheduling — the
  BUILD_PLAN's wider queue vision stays open beyond this slice.
- Real-provider evidence (any network) remains unclaimed; the
  fixture's Bluesky path is a local harness, not a live post.
