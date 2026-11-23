# RC3-19 — Audience growth and measured optimization

**Verdict: DONE at the per-area levels below** on branch `rc3-19`,
based on `4791d1f` (GitHub main at pass start — the PR #140 legal
merge on top of `027557f`). Remote CI on that HEAD was checked before
building: `accept` success, `verify` failure on format only — the
expected red, cleaned by Step 0 below.

This pass re-evidences areas #27 and #29–#36 with ONE campaign
fixture on real Postgres — permissioned signup form → confirm →
automation → landing conversion → segment → analytics readback →
unsubscribe — and builds the two missing mounted steps the survey
found: a general automation executor (#30) and a segment-driven
personalization feed (#35). It also fixes a truth defect in the
SMS/RCS operator surface (#31). Live email sending remains HELD at
the owner's word (Nov 18, 2026): every email leg terminates in the
local sink, and no level claim rests on a real mailbox or carrier.

**Step 0 (rides this branch):** the tree's pinned Prettier 3.6.2
`--write` on exactly the 7 files that were unformatted on main
(docs/creator-studio/CRE-01-POLICY.md,
src/app/(frontend)/videos/[slug]/page.tsx, src/collections/Sites.ts,
src/migrations/20261122_130000_cre01_space_description.ts,
src/migrations/index.ts,
src/modules/creator-studio/CreatorWorkspace.tsx,
docs/legal/MANAGED_HOSTING_LICENSE.md). Repo-wide `format:check`
passes after the step; the migrations index still registers the
identical 166 migrations in identical order (formatting only). The
pass's one migration (below) appends registration 167; nothing is
dropped or reordered.

## What was built

- **Automation executor** (`src/modules/audience/automation-executor.ts`,
  #30). `automation-definitions` were review records: the collections,
  the run/failure ledgers and the action vocabulary all existed, but
  nothing ever executed a general definition. The executor runs the
  bounded vocabulary (delay / condition / send-approved-message /
  add-tag / remove-tag / add-list / remove-list / create-task /
  notify / exit), journaling every step on the run row and every
  failure on `automation-failures`. Mounted entry points:
  `triggerAutomations` is called from `confirmDoubleOptIn` in
  `service.ts` (failures there are logged, never fail a confirmation),
  and the scheduled `audience-automation-resume` task in `tasks.ts`
  resumes runs parked on a delay. Safety rails: a definition runs
  only when active, same-site, valid per `validateAutomation`, and —
  when it requires approval — approved; the send step re-checks
  deliverability at send time (subscriber active, not suppressed);
  a suppressed list membership is never resurrected by add-list;
  runs are idempotent on (definition, source event) and honor the
  `never` reentry policy. Execution semantics for
  `send-approved-message`: the action's `messageId` names the
  email-messages document (the older fixture spelling `templateId`
  is accepted as the same reference); `add-tag` reads `tag`.
  Registering the resume task changes the persisted jobs task
  enums, so the pass carries one append-only migration
  (`20261122_160000_rc319_automation_resume_task`, registration 167)
  adding the slug to both enums, following the pod09/pod11 pattern.
- **Segment-driven personalization**
  (`src/modules/experiences/segment-personalization.ts`, #35). The
  runtime's `consented-segment` targeting input was never fed by the
  product. `resolveSegmentExperience` computes membership with the
  canonical `evaluateSegmentRecipients` — a subscriber is a member
  exactly when the evaluator would include them in a send to that
  segment (rules match, subscription active, not suppressed) — and
  feeds `{ 'consented-segment': segmentId }` into the runtime.
  A segment from another site returns `segment-site-mismatch` and
  can never personalize this one.
- **Telecom provider truth** (`src/modules/telecom/tasks.ts`,
  `src/modules/audience/command-center-service.ts`,
  `src/app/(frontend)/api/admin/audience/command-center/route.ts`,
  #31). The command-center health payload hardcoded
  `routesActive: ['SMS-GSM7', 'SMS-UCS2', 'RCS-Jibe']` in every mode
  and derived the provider name from Twilio credential presence
  alone — the surface claimed RCS routes that no configured provider
  offers. `telecomProviderTruth()` now derives mode, provider,
  status, display name, outbound permission and active routes from
  the adapter actually selected: disabled → no routes, name says
  disabled; emulator → routes are the contract channels suffixed
  "(emulated)", name says simulated sends only, outbound never
  allowed; Twilio → status `degraded` (configured is not verified),
  routes from its contract (SMS only — the adapter declares no RCS),
  outbound only when the live mode and the explicit
  `TELECOM_ALLOW_OUTBOUND` switch agree.

## Per-area levels (real Postgres; journeys in `tests/integration/rc319-campaign-journey.integration.test.ts`, 5 tests, and `tests/unit/rc319-telecom-truth.test.ts`, 7 tests)

- **#27 Social queue & evergreen — E1 → E2, by reference.** RC3-16
  (PR #128) proved the evergreen half; this pass adds no social leg
  (the audit scopes RC3-19's fixture to the audience journey) and
  re-evidences the row by RC3-16's suites re-running green in this
  gauntlet. Ledger row updated to E2 accordingly.
- **#29 Newsletter publishing — E2 held.** The journey's segment
  campaign travels the canonical flow (review → recipient snapshot →
  scheduled with snapshot attached → queued deliveries → delivery
  task → local sink receipt). After the subscriber unsubscribes, a
  second send to the same segment snapshots zero recipients and
  queues zero deliveries. Live sending remains HELD; no claim
  beyond the sink.
- **#30 Marketing automation — E1 → E2.** Proven end to end in the
  fixture: the welcome definition (add-tag → send-approved-message →
  create-task) completes on the real confirmation event, with the
  welcome message delivered through the delivery task into the sink;
  a zero-minute delay definition parks (`paused`) and completes via
  `resumeDueAutomationRuns`; an unapproved definition never runs;
  a foreign site's definition never fires; re-firing the same
  confirmation event creates no duplicate run.
- **#31 SMS/RCS — E2 held, provider mode emulator (recorded).** The
  fixture proves consent (preference-granted event) → campaign queue
  → delivery task → status `accepted` with provider
  `telecom-emulator` and a receipt in the emulator → inbound STOP →
  `opt-out` with suppression recorded, consent check false, requeue
  yields zero. The operator surface now displays this truth (unit
  tests pin all modes). Live carrier delivery is NOT VERIFIED — see
  named gaps. Fixture note: the recipient carries a member profile
  whose `timeZone` is currently midday somewhere on the globe,
  because the product's quiet-hours rule (21:00–08:00
  recipient-local, conservative across US zones when no timezone is
  known) delays campaign deliveries to the next morning by design;
  the delay is production behavior, and the fixture places the
  recipient outside it so the handoff itself is observable.
- **#32 Forms & lead capture — E2 held.** The permissioned signup
  form is submitted through the real public route (consent cookie,
  same-origin, idempotency key) → 201 → the intake worker task
  triages it, creating the lead contact and the follow-up workflow
  task. The same submission is the funnel's trusted conversion.
- **#33 Landing pages & funnels — E1 → E2.** The campaign landing
  page exists as a published content document (contentType `page`,
  pageTemplate `landing`); two consented visitors' page views with
  the campaign label are recorded through the real collect route;
  the form conversion is attributed to the campaign in the operator
  report (landings 2, conversions 1, converted subjects 1).
- **#34 Unified analytics — E2 held.** Readback is the operator
  report over persisted events. Cross-site negative proven:
  identical campaign activity on site B (own consent, own form)
  produces site B's funnel (landings 1, conversions 1) and leaves
  site A's numbers byte-identical. Unconsented collect is refused
  (202, `accepted: false`) and persists nothing.
- **#35 Privacy-conscious personalization — E1 → E2.** With the new
  resolver: segment member resolves the treatment component;
  a confirmed non-member resolves the default with
  `audience-mismatch`; a foreign segment returns
  `segment-site-mismatch` and the default; without personalization
  consent the runtime returns `privacy-control`; after unsubscribe
  the same member no longer qualifies and resolves the default.
- **#36 Experimentation / A-B — E2 held.** Re-proven at runtime
  level on real Postgres: 40 synthetic subjects, deterministic
  subject-hash assignment (both variants populated ≥5, same subject
  always the same variant), exposures and conversions persisted as
  analytics events, and `analyze()` read back from the persisted
  rows (treatment conversions 3, control 0). Browser-level proof
  remains with the public-experiment suite, which re-runs in this
  gauntlet.

## Gauntlet (CI order, final tree)

- Fresh migrations on a clean database: exit 0 (167 registrations,
  including `20261122_160000_rc319_automation_resume_task`).
- Seed (`ALLOW_FIXTURE_SEED=true`): exit 0.
- Upgrade-migration rehearsal: passed
  (`20260914_110000_med_05_video_workflow -> current`).
- Fresh-migration acceptance: passed. Commerce migration
  acceptance: passed.
- `format:check` (repo-wide): exit 0.
- Lint: exit 0. Typecheck: exit 0.
- Unit: **361 files / 2,902 tests, all passing** (baseline 360 /
  2,895; growth is exactly this pass's telecom-truth file, +7 tests,
  plus the resume task added to the payload-domains registry list).
- Integration: **114 files (112 passed, 2 skipped) / 669 tests —
  662 passed, 7 skipped, 0 failed** (baseline 657 passed / 7
  skipped; growth is exactly the 5 campaign-journey tests).
- Build: exit 0 (third attempt at RAYON 1 / 2 GB heap; the first two
  attempts died silently at the known sandbox OOM signature — once
  in compile, once in the TypeScript phase — with no code error).
- Smoke: PASS ("Next.js public/admin routes and Payload PostgreSQL
  persistence are operational").

One environment note: the VM was replaced mid-gauntlet (Postgres
wiped). The environment was rebuilt (PostgreSQL 16 reinstalled,
role/databases recreated), the baseline re-proven (migrations +
seed + the campaign journey 5/5), and only then was the full
integration suite run — its counts above are from the recovered
environment on the final tree. A first post-recovery integration
run showed two failures: the jobs-enum test (fixed by this pass's
migration — adding a scheduled task changes the persisted task
enums) and one PRE-04 presentation test that passes solo and passed
in the final full run (full-suite interference, not reproduced).

## Named gaps

- **#31 live carrier SMS/RCS is NOT VERIFIED.** No live provider is
  configured in this environment; all SMS evidence is emulator
  evidence and is labelled as such everywhere it appears, including
  the operator surface after this pass's truth fix. RCS behavior
  beyond the emulator's contract remains unproven.
- **#35 has no member-facing mount.** Personalization now resolves
  from real segment membership at the service layer — the layer
  every surface would call — but no public page or member UI renders
  a segment-personalized variant yet. The resolver is the mounted
  step this pass scoped; the rendering mount is a surface decision
  (see owner open calls).
- **#30 triggers beyond `confirmed-subscription` are not wired.**
  The executor is trigger-agnostic and the vocabulary includes
  form-action, published-content, commerce-event and the other
  trigger types, but only the confirmation event calls
  `triggerAutomations` today; the remaining domain events have no
  producer hook yet. Behavioral/nurture sequences beyond the
  welcome pattern are therefore vocabulary-proven, not
  journey-proven.
- **#29 live sending remains HELD** at the owner's word (Nov 18,
  2026); delivery to a real mailbox/provider is NOT VERIFIED.
- **Analytics must be switched on per installation.** First-party
  collection is disabled by default policy
  (`privacy.analyticsEnabled`); the fixture enables it in
  site-settings, as an operator running a measured campaign would.
  With it off, collection honestly refuses — proven by the
  unconsented/disabled paths — but a fresh install measures nothing
  until the operator turns it on.

## Owner open calls (named, not silently decided)

- **#35 rendering mount:** which public surface (homepage hero,
  newsletter CTA, landing pages) should first render
  segment-personalized variants through the new resolver.
- **#30 trigger wiring:** which remaining trigger types
  (form-action, published-content, commerce-event) get producer
  hooks next, and in what order.
- **#31 live provider:** whether/when to configure a real Twilio
  (or other) account so the live leg can be verified; until then
  the surface correctly reports emulator/disabled truth.
