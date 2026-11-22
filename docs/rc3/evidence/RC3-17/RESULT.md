# RC3-17 — Editorial depth: DEBT-03 (grammar + offline), advanced publishing, taxonomy, change proposals, unified calendar

**Verdict: DONE at the per-leg levels below** on branch `rc3-17`,
based on `ef90e0a` (GitHub main at pass start). Local commits only;
nothing pushed.

This pass carries **DEBT-03** — the grammar (#7) and offline (#22)
contract types that shipped in RC2 with zero consumers — and the
re-evidence journeys for the editorial rows RC3-17 owns (#2, #3,
#19–#25). Owner decisions honored throughout: grammar is **built-in,
not BYO-model**, with **Harper** as the bundled engine; grammar +
offline are the owner's "enterprise class" markers. Posting /
member-standing enforcement was never touched.

## What was built

- **Grammar service** (`src/modules/editorial/grammar.ts`,
  `text-segments.ts`; migration `20261122_090000_rc317_editorial_depth`).
  `runGrammarCheck` lints the article's current draft with the real
  Harper engine (bundled `harper.js`, local WASM — no text leaves the
  install) and persists one issue + one suggestion per lint, anchored
  to the exact text node and pinned to the document hash. Accepting a
  suggestion splices the replacement into that node and saves through
  the normal editorial draft path — a persisted revision, never an
  in-place edit, never a publish. If the draft moved after the check
  (hash mismatch or anchor text gone), the issue is marked `stale`
  and the accept is refused. Dismissals record the decision and
  change nothing. Superseded runs: a re-check retires prior open
  issues to `stale`, so the returned set is the only live one.
- **Offline drafts + reconcile** (`src/modules/editorial/offline-drafts.ts`).
  A client registers a locally captured draft against a base
  revision; the registration is durable (re-open returns the local
  document intact). Mutations carry idempotency keys — a replay
  returns the recorded mutation and never double-applies (empty keys
  are refused outright). When the server moved while the editor was
  offline, submission records a `conflicted` mutation and leaves
  server content untouched; resolution is explicit: `keep-mine`
  re-bases the local document onto the server head as a new draft
  revision, `take-server` discards the local document. A
  `submit-review` mutation lands the article in review — offline
  sync can never publish.
- **Change proposals — the bounded git-like slice**
  (`src/modules/editorial/change-proposals.ts`). A proposal is a
  full proposed document pinned to its base revision, with a
  persisted paragraph-level diff (LCS; adjacent remove/add runs read
  as `changed`). Editors decide; acceptance is fast-forward only —
  a moved base marks the proposal `conflicted` and applies nothing.
  Acceptance lands as a draft revision through the normal save path.
  A second decision is refused. **Not built, named plainly:**
  content branches, three-way merge, per-line diffs, a merge UI.
- **Unified calendar readback** (`listUnifiedCalendar` in
  `src/modules/calendar/service.ts`). One site-scoped projection of
  all four canonical schedule sources — editorial publish jobs,
  content releases, social queue items, scheduled newsletters —
  sorted, range-filterable. Projections reference their source and
  copy no schedule state: rescheduling writes the canonical source
  (the existing `rescheduleCalendarSource` router) and the next
  readback reflects it. Before this, the only multi-source assembly
  lived inline in the command-center route and covered just two of
  the four sources.
- **Editor surface (API)**: staff-session routes under
  `src/app/(frontend)/api/admin/editorial/{grammar,offline,change-proposals}`,
  following the calendar schedule route's pattern — the editorial
  actor derives only from the authenticated session, and per-article
  access goes through the operator-grant check. These routes are the
  DEBT-03 "editor surface" consumer; a React panel is not built
  (named below).
- **Schema repair found by re-evidence**: the 20260830 realtime
  migration created `realtime_presence.id` with no database default
  while Payload's insert path relies on it (its sibling
  `realtime_events` has one). Presence writes against real Postgres
  failed with a not-null violation — the collaboration service had
  only ever been proven against a fake store. The RC3-17 migration
  sets the default; the #21 journey below now proves presence and
  checkpoint writes on real Postgres.

## Per-leg levels (real Postgres; journeys in `tests/integration/rc317-editorial-depth.integration.test.ts`, 12 tests)

| Leg                                                                        | Level               | Proof                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2 Advanced publishing: citations + series + book chapter, public readback | NOT VERIFIED → E2   | Journey 1–2: cited series article published and read back via `loadPublishedArticleBySlug` (citation ordinals/order, series name, related titles); published chapter passes the reader's own `isReleasedChapter` gate, embargoed chapter withheld                      |
| #3 Taxonomy & relationships                                                | E1 → E2             | Journey 3: series rename propagates into published readback; draft relation and cross-site relation never surface publicly                                                                                                                                             |
| #7 Grammar (DEBT-03)                                                       | E0 → E2             | Journeys 4–5: real Harper check → persisted issues/suggestions → dismiss recorded → accept lands as draft revision with corrected text → stale accept refused after a human edit                                                                                       |
| #19 Editorial workflow                                                     | E2 (floor held)     | Full gauntlet re-runs the D-01 editorial acceptance + restart-recovery suites on this HEAD (counts below)                                                                                                                                                              |
| #20 Git-like collaboration                                                 | E1 (slice at E2)    | Journeys 8–9: persisted paragraph diff, editor-only decision, fast-forward acceptance as draft revision, moved-base conflict, rejection writes nothing. The row's full scope (branches/merge) still does not exist — the row is not regraded                           |
| #21 Realtime collaboration                                                 | E1 (proof deepened) | Journey 11: two editors' presence heartbeats persisted in Postgres, leave removes presence, collaborative checkpoint saves through the editorial core and emits its durable event — after the schema repair above. Live two-client co-editing transport still unproven |
| #22 Offline / local-first authoring (DEBT-03)                              | E0 → E2             | Journeys 6–7 + guard test: register → durable re-open → conflicted submit (server untouched) → idempotent replay → keep-mine resolution; clean submit and submit-review apply without publishing                                                                       |
| #23 Coordinated releases                                                   | E2 (re-proof)       | Owner pass is RC3-14 (re-proved there); this gauntlet re-runs the release suites on current HEAD                                                                                                                                                                       |
| #24 Unified scheduling calendar                                            | E2 (gap closed)     | Journey 10: one readback contains editorial + campaign + social + newsletter entries for the site, none of them for another site; a social reschedule through the source router is reflected in the next readback                                                      |
| #25 Campaign orchestration                                                 | E1 (unchanged)      | Owner pass is RC3-14; RC3-17 claims no change on this row                                                                                                                                                                                                              |

**DEBT-03 closure check** (criterion: "type consumers 0 → ≥1 service

- 1 editor surface; rows #7/#22 re-auditable above E0"): grammar and
  offline each have a service **and** an editor API surface consuming
  the contract types; #7 and #22 both move E0 → E2. **DEBT-03 is
  closed by this pass.**

## Gauntlet (CI order, final tree)

Baseline at `ef90e0a` was fully green first (unit 354 files / 2,860
tests; integration 105 files / 632 tests passed, 2 + 6 skipped;
build ✓; smoke PASS).

Final tree @ `d0fdb45`: migrations fresh ✓ · seed ✓ · format ✓ ·
lint ✓ · typecheck ✓ · **unit 355 files / 2,867 tests, all pass**
(baseline 354 / 2,860 + this pass's 7) · build ✓ · smoke PASS
(`~/workspace/rc3-wave3-logs/gauntlet-317-final.log`).

Integration needs an honest two-run note. The gauntlet's own run
reported **1 failed | 643 passed | 6 skipped (108 files)** — and
its script tails the integration output, so the failing test's name
was not captured. A full-log re-run of the identical tree on a
re-baselined database (migrations fresh + seed, the gauntlet's own
preconditions) came back **fully green: 106 files passed + 2
skipped; 644 passed + 6 skipped, 0 fail**
(`~/workspace/rc3-wave3-logs/integration-317-clean-rerun.log`) —
650 total = baseline 638 + this pass's 12. The single gauntlet
failure is recorded as an unreproduced flake on a heavily shared
box, not hidden and not explained away; an earlier dirty-database
re-run (no re-baseline) failed unrelated suites and was discarded
as invalid evidence.

Focused RC3-17 suites, run separately before the full gauntlet:
unit `rc317-text-segments` 7/7; integration
`rc317-editorial-depth` 12/12.

## Named gaps

- **No browser/UI leg anywhere in this pass** — services, API
  routes, and journey tests only; no E3 claimed for any leg. The
  editor React panel for grammar/offline/proposals is unbuilt; the
  API seam is the surface a panel would consume.
- **Grammar bounds**: one suggestion per issue (Harper's first
  candidate; alternatives are not presented); `GrammarIssue.ruleId`
  stays null — Harper lint kinds are recorded as kinds, not dressed
  up as site style rules; accepting one suggestion retires sibling
  issues from the same run to `stale` on their next accept attempt
  (the document hash moved), so a multi-fix article needs a fresh
  check between accepts.
- **Offline bound**: what is proven is the sync/reconcile protocol
  and its server persistence. The browser's local capture store
  (IndexedDB in a real editor client) is the client's leg and is not
  built; the journey's client stand-in is the registered document
  itself.
- **#20**: content branches, three-way merge, per-line diffs, and a
  merge UI do not exist and are not implied by the proposal slice.
- **#21**: the realtime transport remains disabled by default; live
  two-client co-editing (cursors, simultaneous edits) is unproven.
  Presence/checkpoint are proven as durable Postgres records, not
  as a live session.
- **Harper dialect**: checks run Harper's default dialect/rules;
  per-site style configuration is not built.

## Owner open calls (named, not silently decided)

1. **Editor placement**: which editor surface hosts the grammar /
   offline / proposal panels (the pass built the API seam only).
2. **Grammar depth**: present all Harper candidates per issue, or
   keep the single-candidate flow; whether site style rules should
   populate `ruleId`.
3. **#20 scope**: build the wider git-like core (branches/merge) in
   a later release, or formally descope the row at RC3 exit.
4. **#21 transport**: the transport choice rides RC3-15B's measured
   comparison; enabling any live transport by default is the
   owner's call.
5. **Offline client**: the browser editor's local-store shape
   (IndexedDB capture, device identity) when the editor client is
   built.
