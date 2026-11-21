# RC3-02 — Audience exclusion accounting (DEBT-15) — RESULT

**Verdict: DEBT-15 CLOSED.** Matched exclusion buckets in
`evaluateSegmentRecipients` are now mutually exclusive and exhaustive
with suppression taking reporting precedence. The send policy did not
change; the deliverable set is proven identical to the pre-change
policy result (three independent legs, below).

## Baseline

- Tree: `~/workspace/rc3-02-tree`, branch `rc3-02`, from
  `2d4cb3ddf70db5b5f9570297e6bae0d7ff8774bf` (rc2 tag = main at pass
  start; fresh fetch confirmed before branching).
- Own acceptance DB: `rc302_release_acceptance` (migrations fresh +
  fixture seed, both exit 0). No other pass's database was touched.
- Defect as confirmed by RC3-00: in the matched branch of
  `src/modules/audience/service.ts`, `if (!isActive)
{ unconsentedOrPending++ } else if (isSuppressed) { suppressed++ }` —
  an inactive + suppressed subscriber never reached the suppression
  bucket. Delivery exclusion (`channelEligible: isActive &&
!isSuppressed`) was already correct; this was operator reporting.

## The change (one file, +18/−9)

`src/modules/audience/service.ts` — the matched-branch precedence is
now, in order:

1. **suppressed** — the address is on the site's suppression list,
   whatever the subscription's own state (suppression is a hard
   exclusion recorded against the address itself);
2. **unconsentedOrPending** — not suppressed, but not active (status
   pending/unsubscribed/suppressed, global unsubscribe, or erased);
3. **duplicates** — active, not suppressed, but the normalized email
   was already seen in this evaluation;
4. **eligible** — active, not suppressed, first-seen email → appended
   to `eligibleRecipients`.

Every matched subscriber lands in exactly one bucket, so
`eligible + unconsentedOrPending + suppressed + duplicates =
matchedSubscribers` holds by construction and is asserted in tests.

No other production file changed. The eligibility predicate is
untouched: the old code reached the deliverable branch exactly when
`active && !suppressed`; the new code reaches it exactly when
`!suppressed && active` — the same set, in the same iteration order.

## Before / after on the fixture (9 matched subscribers, site alpha)

Fixture: one active-clean, one active duplicate (case-variant email),
one pending, one unsubscribed, one active+globally-unsubscribed, one
active+suppressed, one bounced (unsubscribed + bounce suppression),
one pending+suppressed, one status-'suppressed'+suppressed; plus a
tenth subscriber on another site (never in scope) and a suppression
recorded against the other site for the clean subscriber's hash
(never leaks in).

| Bucket               | Before           | After                        |
| -------------------- | ---------------- | ---------------------------- |
| matchedSubscribers   | 9                | 9                            |
| suppressed           | 1                | **4**                        |
| unconsentedOrPending | 6                | **3**                        |
| duplicates           | 1                | 1                            |
| eligibleConsented    | 1                | 1                            |
| eligibleRecipients   | `[active-clean]` | `[active-clean]` (identical) |

## Deliverable-set identity proof (proven, not asserted)

1. **Analytical:** the reorder changes only which exclusion bucket an
   already-excluded subscriber is reported under; the deliverable
   predicate and iteration order are unchanged (see diff).
2. **Independent restatement:** the regression test recomputes the
   expected deliverable set from the fixture with a plain-language
   restatement of the pre-change policy (active ∧ ¬suppressed ∧
   first-seen normalized email) and deep-equals it against the
   service's `eligibleRecipients`.
3. **Old/new matrix:** a dedicated send-policy-invariant test asserts
   only quantities the fix must not move (deliverable set, eligible
   count, duplicates, matched/total, and the snapshot roll-up
   `unconsentedOrPending + suppressed = 7`). It **passes on the
   baseline code and on the fixed code**. The two counting tests
   **fail on baseline** (`expected 1 to be 4` for suppressed) and
   **pass on the fix**.

## Operator readback (same codes, same counts)

Verified by inspection; no consumer changes were needed:

- `src/app/(frontend)/api/admin/audience/campaign/route.ts` returns
  `evaluation.counts` verbatim and the snapshot's `exclusionCounts`.
- `src/modules/admin/EmailComposer.tsx` renders those exact fields
  (Total / Matched / Pending / Suppressed / Deduplicated) from the API
  payload; it recomputes nothing.
- `createRecipientSnapshot` stores `exclusionCounts.notEligible =
unconsentedOrPending + suppressed` — a sum the reorder leaves
  invariant (7 before and after on the fixture).

## Batched suppression query + scale sample

The RC2-DEBT-13 batched suppression load (one site-scoped query into
a `Set`, ~line 602) is untouched. The regression tests assert the
store is queried for `suppressions` exactly once per evaluation,
including at scale. Execution sample (in-memory store, this pass):
**25,000 subscribers evaluated in 900.4 ms** (full-suite run;
1,190.9 ms in the standalone run), counts reconciling
(24,900 eligible + 100 suppressed = 25,000 matched).
The DB-backed scale spec (`tests/rc2-fixall-audit/measure-segment
.spec.ts`, the DEBT-13 instrument) was **not re-run**: it binds to
the RC2-B-01 world fixture rather than this pass's acceptance DB,
and this change does not touch the query pattern it measures.

## Commands and actual results (final tree)

- `npm ci` — exit 0 (881 packages).
- `payload migrate` on fresh `rc302_release_acceptance` — exit 0;
  `payload seed` (ALLOW_FIXTURE_SEED=true) — exit 0.
- New tests, baseline service: 2 failed / 2 passed (counting fails,
  invariant passes). New tests, fixed service: **4/4 passed**.
- `npm run format:check` (repo-wide, as CI runs it) — exit 0,
  "All matched files use Prettier code style!"
- `eslint` on both touched files, `--max-warnings=0` — exit 0.
- `npm run typecheck` — exit 0.
- Full unit suite (`npm test`): 344 files, 2,796 tests — 2,795
  passed, 1 failed: `comm-06c-digests-and-outbox` digest test hit
  the 15 s timeout while the suite ran under heavy box contention
  (collect phase alone 1,296 s; concurrent migrate/seed + a sibling
  pass). Re-run solo on the final tree: **4/4 passed in 9.17 s** —
  contention flake, unrelated to this change (community digests; no
  audience-counting surface).
- Focused integration (`scripts/run-integration.mjs`, own DB):
  aud-09d-selector-closure 8/8, aud-09d-automation-journey-closure
  3/3, aud-08-audience-pass-gate 10/10 — **21/21 passed, exit 0**.
- **Production build: NOT RUN** — explicitly deferred to the combined
  RC2 maintenance verification, per the pass brief. Smoke: NOT RUN
  (rides with the build).

## RC3 ledger row update (for later application)

The ledger lives on the `rc3-00` branch, so the update is recorded
here verbatim for whoever applies it. Row **#29 Newsletter
publishing** (E2 — no regrade; this was a reporting fix inside an
E2 row): replace the note's DEBT-15 clause

> "DEBT-15 segment counting rides this row's service (RC3-02)."

with

> "DEBT-15 segment counting CLOSED by RC3-02 (branch rc3-02):
> suppression takes reporting precedence in evaluateSegmentRecipients;
> deliverable set proven identical to pre-change policy;
> evidence docs/rc3/evidence/RC3-02/RESULT.md."

## Remaining risks

- The fix's blast radius is one if/else chain in one function; the
  only behavioral delta anywhere is the split between the
  `suppressed` and `unconsentedOrPending` report counts (and the
  per-bucket fields stored on future recipient snapshots). Historical
  snapshots keep their old (miscounted) splits — they are immutable
  records and were not rewritten.
- RC3-07 shares `src/modules/audience/service.ts` and runs after
  this lands, per the Wave 1 ownership map; if it touches the
  evaluation path it must re-run this pass's counting proof.
