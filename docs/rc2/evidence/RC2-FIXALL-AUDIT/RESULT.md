# RC2-FIXALL-AUDIT — closure audit: DEBT-05, 06, 08, 09, 10, 12, 13

**Verdict: PASS.** The seven remaining desk-and-rig debts from the RC2
register's closure audit are closed under the owner's "fix everything"
direction (Nov 16, 2026). Two were documentation/consistency repairs
(05, 09), one a deletion (06), one a logging sweep (10), one a guard
plus a documented rule (12) — and two were **proven defects with live
fixes**: DEBT-08 (a floor install served donors a 500) and DEBT-13
(segment evaluation carried a per-subscriber N+1 measured at ~1 ms per
subscriber). No Red-gate defects were found or introduced.

## Candidate identity

- Base: GitHub main `be4abf5` (PR #86 merge, RC2-DEBT-01). Branch
  `rc2-fixall-audit`. Rig verification ran against a production
  standalone build of this tree.

## DEBT-05 — capability ledger told the truth again

A full programmatic cross-check of `docs/rc/CAPABILITY_LEDGER.md`'s
gate column against `src/modules/module-registry.ts` (the runtime
truth — it drives registration gating; unclaimed means floor): 232
rows checked, **10 cells were wrong** (the register named 7; the check
found 3 more — albums and calendar-entry-audits claimed by no module,
and webhook-delivery-dispatch claimed by integrations, not floor).
All 10 corrected; re-check: **0 mismatches**, and every registry claim
appears in the ledger. A provenance note is appended at the file end.

## DEBT-06 — stale webhook types deleted

`WebhookSubscription` and `WebhookDelivery` removed from
`src/modules/extensions/api.ts`. Verified the module's only importer
imports only `PUBLIC_MANIFESTS`; the same-named types in generated
payload-types are a different symbol and stay.

## DEBT-08 — floor donate surface 500: DEFECT CONFIRMED, gated

The register's suspicion was right. On a floor-profile boot
(RENEGADE_MODULES empty) of the pre-fix build, with the site-settings
`commerceCheckout` capability switched on (a settings toggle, a
separate axis from the module gate), a donor POST to
`/api/commerce/donations/intent` returned **HTTP 500 with an empty
body** — the server log shows the unhandled throw: "The collection
with slug merchant-connections can't be found." The same request on
the full profile degrades by design: **503 with a clean JSON error**
("A hosted test payment provider is not configured"). The capability
and the module gate were two switches for one feature, and only one
of them was wired.

Fix: the donation/subscription family gates **with** commerce in the
module registry — donation-campaigns, donation-intents, donations,
donation-events, subscriptions, subscription-events, plus the
commerce-reconcile-subscriptions and commerce-reconcile-referrals
tasks, which work the same stores. (The register named the first
three collections; the rest of the family shares the identical seam
and is included so the gate is complete, not sampled.) Ledger gates
updated to match, including the previously missing
commerce-reconcile-referrals row. The donate page already converts a
missing campaign to a 404; the intent route's campaign lookup already
catches to a 404 — so absent-by-gate is clean on every surface.
Post-fix floor probe (production build of this tree): the campaigns
REST route is absent (404 "Route not found"), and the intent POST
answers **404 {"error":"Campaign not found."}** — the route's own
clean degradation; no 500 anywhere on the seam. The full-profile
control on the same build finds the campaign and answers with its
normal validation responses. A unit test pins the family out of the
floor set. Observed adjacent, **not** changed (no proof run):
the POD collections (pod-connections, pod-jobs,
manual-fulfillment-packages) are likewise commerce-owned and
floor-gated in the ledger — named here for RC3/I-03, per the
anti-trap rule against speculative gating.

## DEBT-09 — AI floor status: deliberate, documented, pinned

Disposition: **floor-by-design, not a new module.** Modules are opt-in
via RENEGADE_MODULES; claiming the ai-\* collections under a new module
would strip them from every existing install whose env predates the
id. The registry header now documents the design (AI is BYO-model; the
collections are inert until a provider connection is configured — the
connection is the activation switch), and a unit test pins the three
collections in the floor set so a future claim fails loudly as a
product decision. Stated for the owner's veto at this pass's PR.

## DEBT-10 — silent catches in permission/money paths now log

Swallowed errors in operator-grants (5 catches), comment-composer
(5), and the commerce fulfillment-reconcile sweep (1) now
`console.error` with greppable prefixes, following the codebase's
passkey-auth precedent. Fail-closed behavior is unchanged — only the
silence is gone. `recordExecutionEvent` was considered and rejected
for these paths: it needs a store and site context and performs its
own writes inside access-control failure paths.

## DEBT-12 — layering rule documented; boundary guard green; a finding

The rule is written into the module-registry header: collections may
import leaf helpers only; the one modules→collections path is each
domain's `payload-domain.ts` registrar registering its own domain
(recorded exception: Community collections are registered by the
editorial registrar — there is no community registrar). A new guard
test builds the value-import graph (type-only imports excluded — they
are erased at compile time) over src/collections + src/modules and
fails on any cycle touching src/collections: **green — no cycle
crosses the boundary.** The same analysis surfaces a **finding, not a
fix**: five modules-internal cycles exist (largest: a 7-file
media/editorial/collaboration cluster and a 5-file community
notifications cluster that DEBT-21's retirement may shrink). They work
because their bindings are called after evaluation; gating them was
rejected as scope creep beyond DEBT-12's remediation, and they are
named in the guard test for RC3.

## DEBT-13 — unbounded finds: measured; one N+1 indicted and fixed

`evaluateSegmentRecipients` (the newsletter send path) was timed at
seeded scale (`tests/rc2-fixall-audit/measure-segment.spec.ts`):

| subscribers | before    | after        |
| ----------- | --------- | ------------ |
| 0           | 12 ms     | 15 ms        |
| 5,000       | 4,906 ms  | **455 ms**   |
| 25,000      | 22,542 ms | **1,783 ms** |

The profile (`measure-segment-parts.spec.ts`) isolated it: the bulk
finds cost ~2.5 s of the 22.5 s; the rest was a **per-subscriber
suppression query inside the evaluation loop** — one database round
trip per subscriber in a function that otherwise bulk-loads every
fact into maps. The site's suppression hashes now load once, with the
other facts; the loop reads a Set. Semantics are unchanged (audience
unit 57/57, selector-closure + pass-gate integration 18/18). The
remaining `limit: 0` finds in the measured path are one-query bulk
fact loads, linear at 25k (~0.07 ms/subscriber all-in) — recorded as
measured-safe at seeded scale; the other registered `limit: 0` sites
sit in unmeasured paths and stay named in the register row's scope
for RC3 rather than being speculatively rewritten.

## Verification

- Typecheck clean; unit suite **292 files / 2,139 tests** green
  (includes the new import-cycle guard and the DEBT-08/09 registry
  pins).
- DEBT-08: floor + full probes on the production build (above).
- DEBT-13: before/after timings on the same rig and seed (above);
  audience correctness suites green.
- Prettier applied to every shipped file.
