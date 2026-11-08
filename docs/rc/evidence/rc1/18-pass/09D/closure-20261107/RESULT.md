# 09D closure — selector reconciliation, automation, and journey rerun

Date: 2026-11-07. Executor: Harbor (Muse), on the final RC1 candidate tree.
This closure addresses exactly the three items the 09D RESULT/NEXT left
unexecuted: (1) the seven selector dimensions other than the already-proved
tag dimension, (2) general event-driven automation acceptance, and
(3) a rerun of the complete visitor/UI/local-sink journey against this
exact source. It does not change the 09D verdict by itself; the release
verdict flip is a separate step.

## Tested tree

- Branch `rc1-closures`, base (HEAD before closure commits)
  `d98b484bfec1443af70ef7a6808cc2349fc6491c` — the exact tree the 18D
  decision was rendered on.
- PostgreSQL **16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)** on x86_64 — recorded
  verbatim; this environment has no PostgreSQL 17 and none is claimed.
- Integration database freshly created and migrated for this work
  (132 migrations, last `20261107_120000_rc1_execution_events_site_detach`).
- All sends stayed in the local mail sink (`EMAIL_MODE=development`);
  no external delivery of any kind was attempted.

## Verdict: PASS

All three closure items are proved with executed tests against real
PostgreSQL on this tree. One genuine product defect was found and fixed
(see below); no assertion anywhere was weakened.

## The defect the closure reproduced (and the fix)

`evaluateSegmentRecipients` (`src/modules/audience/service.ts`) — the only
code path that turns a saved segment into campaign recipients — bulk-loaded
only the `lists` and `tags` projections. It hardcoded `formIds: []`,
`sourceCampaigns: []`, `roles: []`, `commerceFacts: []`,
`communityFacts: []` and never set `locale` or `engagementAt`. Consequence:
any segment using one of the other seven dimensions silently matched
nobody through every operator path (campaign evaluation, recipient
snapshots, scheduled dispatch), while the segment engine itself was fully
implemented and unit-proved against hand-built projections. Missing wiring
masqueraded as zero facts.

Fix (same file, following the existing tag loader's pattern — bulk loads,
both tenant boundaries, failures propagate): the evaluator now builds each
projection from its canonical persisted source:

| Dimension | Canonical persisted source |
| --- | --- |
| form | Subscriber's site-scoped consent events → linked form submission → its form; the submission must itself belong to the evaluated site |
| sourceCampaign | `audience-memberships.source` (e.g. `public-subscribe`, CSV import campaign names) |
| engagement | Latest site-scoped CRM `interaction-records.occurredAt` for the subscriber's contact (observed events only; the product deliberately does not infer opens/clicks) |
| role | Site-scoped `member-site-roles` via the subscriber's linked member |
| locale | Most recent site-scoped consent-event locale for the subscriber |
| commerceFact | Site-scoped `supporters` (matched by member or email hash): `supporter`; `donor` when a `donations` row for the supporter has `lifecycle = 'succeeded'`; `paid-subscription` when a `subscriptions` row is `active`/`trialing`/`grace` |
| communityFact | `profile` when a `profiles` row exists for the member; `space` when a `spaces` row exists for the member on this site |

Cross-module loaders are skipped when the owning collection is not
installed on the active module profile (Lean installs stay valid), and the
plain-object unit mocks that lack a collection registry safely skip them —
the full unit suite count is unchanged (2,104/0).

## Proof map — the seven dimensions

New file `tests/integration/aud-09d-selector-closure.integration.test.ts`
(8 cases, all passing; each case asserts the exact eligible subscriber-ID
set returned by `evaluateSegmentRecipients` against independently created
persisted facts on two fresh sites):

| Dimension | Case | Positive | Boundary |
| --- | --- | --- | --- |
| form | `form: selects subscribers whose consent ledger links a submission of that form on this site only` | Consent event linking a same-site submission of the form selects exactly that subscriber | A site-A consent event linking a site-B submission selects nobody for that form; an unknown form ID selects nobody. (A submission whose site differs from its form's site cannot even be created — the product's `guardFormWrite` rejects it — so the consent-link is the only inconsistency that can exist, and the evaluator excludes it.) |
| sourceCampaign | `sourceCampaign: selects by the acquisition source recorded on memberships` | Membership source `launch-2026` selects exactly its subscriber | `public-subscribe` source does not match; the same source on site B selects only site B's subscriber for site B's segment |
| engagement | `engagement: withinDays uses the latest observed CRM interaction on this site only` | Interaction 5 days ago matches `withinDays 30` and `withinDays 365` | Interaction 90 days ago matches only `withinDays 365`; a site-B interaction for a site-A contact counts for nothing on site A |
| role | `role: selects by site-scoped member roles; a role on another site does not count` | `moderator` granted on site A selects on A | The same member's site-B role selects only their site-B subscriber; a role-less member never matches |
| locale | `locale: the most recent consent-event locale is the subscriber locale` | Newer `es` consent event supersedes an older `en` one; `en` subscriber matches `en` | A subscriber with no consent events matches neither locale |
| commerceFact | `commerceFact: supporter/donor/paid-subscription derive from site-scoped commerce records` | Succeeded donation chain → `donor`; active subscription chain → `paid-subscription`; both also yield `supporter` | A supporter with no donation/subscription yields `supporter` only; a supporter recorded only on site B (same email hash) yields no site-A facts |
| communityFact | `communityFact: profile existence and a space on this site are distinct facts` | Member with profile + site-A space matches both facts | Profile-only member matches `profile` only; a member whose only space is on site B matches neither on site A |
| composition | `combined: an all-of segment across reconciled dimensions selects only the full match` | `sourceCampaign ∧ role ∧ locale` selects the one subscriber holding all three facts | A subscriber holding only the source fact is excluded |

Pre-existing proof this closure mapped (not re-executed as new work, all
re-run green below): the engine truth table and hand-built-projection
cases in `aud-08` §3/§4 and `shared-contract-audience-community` §3; the
tag dimension's 135-case 09D proof, unchanged.

## Proof map — event-driven automation

New file `tests/integration/aud-09d-automation-journey-closure.integration.test.ts`:

- `automation: a form submission fires create-contact and create-task through the worker task, exactly once` — a public form submission (the
  triggering event, via `submitPublicForm`, with concurrent duplicate
  submission collapsing to one journal) produces no effects until the
  product's own `audience-form-intake` worker task runs; after it runs,
  the `create-contact` and `create-task` effects are persisted (contact in
  `lead` status, workflow item whose `sourceReferences` point at the
  submission), the submission's action journal is fully `completed` with
  result IDs, its status is `triaged`, and a second worker run creates
  nothing new.
- `automation negatives: cross-site submission is rejected, and an unsupported action makes a form unavailable so nothing fires` — a
  submission addressed to another site for this site's form throws
  `Form site mismatch` and creates nothing; a form whose only action is
  the general-automation action `send-approved-message` never becomes a
  public form (`loadPublicForm` returns null), so nothing can fire
  through it.

Scope honesty (unchanged product position, confirmed by this closure's
source audit): `automation-definitions`/`automation-runs` are review
records with no event-driven executor anywhere in `src`, and the product
says so in its own UI ("Supported automations" — webhook and general
execution are labeled unavailable; RC1-SCOPE requires reconciliation
"against working paths"). The supported event-driven automation —
form-intake actions executed by the worker task, plus the scheduled
newsletter dispatch below — is what this closure proves. No new executor
was invented for the closure; the RC1 claim stands on the supported paths
exactly as scoped.

## Proof map — visitor/UI/local-sink journey rerun

Same new file, case `journey: subscribe -> confirm -> segment -> campaign
-> local-sink delivery; a post-snapshot unsubscribe receives nothing`, run
on its own fresh site so the segment universe is hermetic:

1. Public subscribe route (`POST /api/subscribers/subscribe`, 202) with
   `locale: 'es'` → pending subscriber.
2. The queued confirmation delivery is executed by the real
   `audience-email-delivery` task; the token is read from the **local
   sink** receipt; the public confirm route returns 200 →
   subscriber `active`.
3. Segment membership through the reconciled projections: the locale-`es`
   segment and the `public-subscribe` sourceCampaign segment both select
   the journey subscriber; the immutable recipient snapshot of the locale
   segment contains exactly the journey subscriber and the control.
4. Campaign lifecycle draft → review → scheduled with the snapshot
   attached (the product's own hook-enforced order).
5. The control unsubscribes (`suppressSubscriber`) **after** the snapshot;
   the real `audience-newsletter-dispatch` task then queues exactly one
   delivery — the journey subscriber's — and a second dispatch run
   queues nothing more (`queueNewsletterDeliveries` again returns 0).
6. The delivery task executes; the campaign email is observed in the
   local sink addressed to the journey subscriber only, and no sink
   receipt exists for the unsubscribed control.

## Executed runs (final tree, after formatting)

| Run | Command scope | Result |
| --- | --- | --- |
| Selector closure | `test:integration -- tests/integration/aud-09d-selector-closure.integration.test.ts` | 8/8 passed, exit 0 |
| Automation + journey closure | `test:integration -- tests/integration/aud-09d-automation-journey-closure.integration.test.ts` | 3/3 passed, exit 0 |
| Affected suites together | both closure files + `aud-08-audience-pass-gate`, `aud-public-subscription-journey`, `audience-dispatch-concurrency`, `shared-contract-audience-community` | 6 files, 46/46 passed, exit 0 |
| Full unit suite | `npm test` | 284 files, 2,104 passed / 0 failed (unchanged from the 18D baseline) |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Lint/format | `eslint --max-warnings=0` and `prettier --check` on the three changed/new files | clean |

## Files changed

- `src/modules/audience/service.ts` — the projection reconciliation fix
  (+288/−6).
- `tests/integration/aud-09d-selector-closure.integration.test.ts` — new.
- `tests/integration/aud-09d-automation-journey-closure.integration.test.ts` — new.
- This RESULT.md.

No ledger, report, or status banner was touched; the verdict flip is a
separate step.
