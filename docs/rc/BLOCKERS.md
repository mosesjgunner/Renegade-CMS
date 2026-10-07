> RC-08D current verdict (2026-10-06): **PREREQUISITES PASS (RC08D-01 through RC08D-06)**. Clean candidate reconciled on `main`. [Master receipt](evidence/RC-08D-2026-10-06.md); [RC08D-01 Lock-Owner Projection](evidence/RC08D-01.md); [acceptance verification](evidence/rc-08d/RC08D-06-acceptance-verification.md); [dependency decision](evidence/rc-08d/RC08D-05-dependency-image-decision.md).
>
> Reconciled site-settings lock reload (RC08D-01: [RC08D-01.md](evidence/RC08D-01.md)), staff passkey enrollment (RC08D-02), tenant authorization and scoped operator grants (RC08D-03), live fulfillment surface (RC08D-04), dependency graph and Docker image reachability decision (RC08D-05), and automated acceptance verification (RC08D-06). Prerequisite provenance established for RC08D-07 restart.

> Historical RC-08C verdict (2026-10-06): **FAIL / NOT READY**. Tested clean source `01908f39a3ce40b5eae5d4dec64b981e103d5fb1`. [Final report](FINAL_RC_REPORT.md); [dependency-ordered repair cards](repairs/RC08C-closure-blockers.md); [exact checks](evidence/rc-08c-2026-10-06/checks.json).

The dependency-ordered RC-08C cards supersede older active-blocker summaries; no mandatory path is converted to a deferral.

All snapshots below are historical. Their PASS, VERIFIED, source SHA and count statements apply only to their recorded scope and do not override RC-08D.

---

> RC-08B deferred capability promotion sweep - **PASS**, 2026-10-06. Promotes 14 previously deferred capabilities to VERIFIED with executed unit (171 files / 1,126 tests), integration (10 passed), browser (Playwright passed), and restart evidence on isolated database and runtime. Resolves historical deferrals for calendar UI, calendar feeds, timelines, composer draft dispatch, local federation interoperability, public forms, audience automations, telecom dispatch contracts, external community notifications, community digests, per-event notification switches, contribution export, conversation export, and audience reporting. Truthfully retains deferrals for live SMS/RCS carrier delivery, permanent account deletion, and private community attachments with explicit rationale. Misleading demo surfaces (graphics studio fake save, Printful fake IDs/mockups, fulfillment fake metrics) removed. [Evidence](evidence/RC-08B-2026-10-06.md); [deferral ledger](RC-08B-DEFERRAL-LEDGER.md). Aggregate release acceptance remains with RC-08C.

> RC-08A unit repair - **PASS**, 2026-10-06, based on clean HEAD `8ce1485d34bc7ed96532a4265a563df509a61d32`. The dedicated repair closes RC08-UNIT-RELEASE at the unit level: **169 files / 1,107 tests passed**, plus format, zero-warning lint and typecheck. [Repair evidence](evidence/RC-08A-2026-10-06.md). Aggregate RC-08 remains **NOT READY**; restart on the repair commit with fresh dependencies before later integration/migration/build/browser/security/restore gates. The failed clean-candidate report below is retained as historical evidence.

> Historical RC-08 gate — **FAIL / NOT READY**, 2026-10-06. Tested clean candidate `07e75a47dec8424d26d7829ec9daba7e34c4c859`: npm ci, format, lint and typecheck pass; full unit gate reports 1,106 passed / 1 failed. First blocker: **RC08-UNIT-RELEASE**. Integration, migrations, build, golden browser/security and restore are unexecuted. [Current evidence](evidence/RC-08-2026-10-06.md); [repair card](repairs/RC08-05-unit-release.md). Earlier candidate/dirty-tree findings below are historical and do not describe this restart.

## RC-04 Pass 2 result — 2026-10-04

Source `3a3260f120f500a48d51a5251a7fd3b900ba6e93` has no remaining blocker in the supported newsletter/local-email/canonical-forum/member-privacy/moderation/direct-group-message/in-app-notification acceptance subset. [Evidence](evidence/RC-04-PASS2.md). Unsupported audience/community entry points are explicitly deferred; live providers, configured private storage, and all broader RC-01 role/tenant/module, upgrade and restore gates below remain open. This pass does not confer aggregate release readiness.

> Historical orchestration gate: **RC-03 PASS 3 PASS**, source `97ce2c1e4a253289d0d4f9da66c154afce74c6e9`. [Final gate evidence](evidence/RC-03-PASS3.md). Small cleanup reconciled operator claims; final browser, 107 unit and 18 integration tests, typecheck, lint and build pass. Calendar/feed/timelines and remote federation remain deferred. Broader RC-01 release blockers remain open. NEXT: RC-04 and RC-05.

Historical orchestration gate: **RC-03 PASS 2 PASS**, source `bb93ea8b562bc91e71e64afeabb6d7ead6607bc2`. [Evidence](evidence/RC-03.md). Partial provider failure, failed-only recovery and worker restart/idempotency proved on the RC-02 publication copy. Calendar/timeline deferred; federation limited to local signing/outbox/failure. Broader RC-01 release blockers remain open. Sol Light: small cleanup only.

## RC-02 acceptance ? PASS ? 2026-10-03

No remaining blocker in the core site-build journey. Frozen source `b684ee11460637bf2177f349057f14d6e804bbbd` passed a fresh production Standard/all install, all required checks and actual web/worker restart. [Evidence](evidence/RC-02.md). Two Rendered Quality informational suggestions are recorded, with no warnings/blocking findings.

This closes RC-02 only. The historical RC-01 findings below remain open; their old instruction not to advance was superseded by explicit user authorization for RC-02. The active working branch is intentionally preserved; the tested immutable source is on `rc02-site-build-candidate`.

# Dependency-ordered blockers

## RC-01 current blockers — 2026-10-03

Base HEAD: `6818864c9e601860d6a7c7874ae02fd0b7fdb48d`. RC-01 verdict: BLOCKED; no advance to RC-02.

1. **RC01-MODERATION:** Ordinary owner opens /admin/moderation; requests to /api/community/reports?siteId=default and /api/community/moderation?siteId=default return 403. Community actor resolution accepts member sessions, while setup creates an admin passkey session. Do not weaken authentication or add a global role bypass. Resolve actual authorized site selection and a scoped admin-to-community policy, then test denied and cross-site cases. Final failing trace and JSON are preserved under evidence/rc-01.
2. **RC01-ACTIONS-ROLES:** Full matrix stopped at that failure (16 passed, one failed, 156 not run). Four-role route enumeration exists; administrator/staff/anonymous matrix cases and mutation-denial cases are unexecuted. Every advertised CRUD, delete/archive, preview, publish/dispatch/execute, validation, empty/provider state requires ordinary-path proof. The route appendix explicitly marks all 42 configured/visible targets and 15 additional static workspace link candidates BLOCKER.
3. **RC01-UNAVAILABLE:** Audience reporting, Social and Fulfillment command centers explicitly report unavailable; complete persisted/scoped implementation and verify it before promoting them. Their old demo components are not shipping entry points. Non-admin social-studio/graphics-studio, connections reads, POD adapter synthesized responses and other RC-00 provider findings remain blockers until independently repaired/proved. No claim of universal zero fake metrics is made.
4. **RC01-LEAN-DISCOVERY:** Before-nav optional collection links now follow actual registrations, but custom Payload views remain unconditional and Capability Center/nested/frontend entry points still require Lean and permissions acceptance. Standard/all source visibility is not complete rendered-action proof.
5. **RC01-CANDIDATE:** Repairs are uncommitted against the base SHA, not a frozen clean runtime candidate. Installation-policy/dependency findings from RC-00 remain open; this task did not rerun npm ci or the full RC suite.

The historical dependency list below is retained; the navigation invalid-content-status 500 and setup passkey-support hydration mismatch were repaired with focused proof. These repairs do not close the blockers above.

Source candidate: `e24fc53d9e370e28f01398c561b0f5adc4884756`. Reconciled 2026-10-03. Initial working tree was clean. This documentation freeze binds the source candidate; its artifact commit is discoverable with git log -- docs/rc. It does not establish runtime release readiness.

1. **RC-01 candidate and baseline freeze.** Resolve baseline failures recorded in evidence/RC-00.md, commit reconciliation, freeze a clean candidate, and rerun required checks. This source SHA is not a newly verified runtime release.
2. **RC-02 operational truth and tenant security.** Audience command-center uses first site with overrideAccess, counts all subscribers, treats SMTP configuration as SPF/DKIM/DMARC/TLS verification and supplies fake campaigns. Telemetry substitutes 142/118/64/28 for empty counts. Remove demo operational truth and prove site-bound authorized reads before dependent dashboards. Sources: src/app/(frontend)/api/admin/audience/command-center/route.ts; src/modules/admin/AudienceCommandCenter.tsx; src/app/(frontend)/api/admin/telemetry/dashboard/route.ts.
3. **RC-03 visible optional-module safety.** PublishingLinks unconditionally links podcasts; Lean does not register podcast-shows. All custom views remain mounted independently of module gating. Prove graceful unavailable states or hide/defer entry points. Inspect frontend/custom-view duplicate URLs for actual route precedence.
4. **RC-04 ordinary workflow and security acceptance.** Every shipping registration/surface has BLOCKER status until current-candidate CRUD/public/member/action workflows, negative roles, tenant boundaries, console/network errors and persistence are observed. Begin with first-run setup, identity and core publishing, then modules in dependency order. Existing test files are not execution evidence.
5. **RC-05 provider correctness.** Printful uploadPrintFile returns synthesized remote ID/URL without upload and preflight synthesizes provider mockup provenance. PodMappingCenter defaults to an approved emulator mapping; verify reachability before claiming deferral. Prove real request/outcome boundaries before configuring live credentials or advertising fulfillment. SMTP configuration is not DNS/delivery proof; Stripe adapter is explicitly stripe-test.
6. **RC-06 recovery and release evidence.** Prove matching DB/media backup+restore, restart/reconciliation, fresh/upgrade migrations, worker durability and physical schema on the frozen candidate. Real-customer upgrade requires an authentic predecessor artifact.
7. **RC-07 claims approval.** Only after dependency gates pass, promote individual ledger statuses and advertise precisely the verified subset. Until then release readiness is BLOCKED.

Additional source-confirmed dependencies of RC-02/04/05:

- `/connections` queries connection/delivery/audit records with `overrideAccess: true` even when `isStaff` is false and passes them to the rendered component. `isStaff` hides management controls, not all operational data. Prove anonymous/member/admin and cross-site boundaries before advertising provider management.
- `/social-studio` reports “Scheduled” or “Queued for dispatch” by setting client state; its submit handler does not persist or enqueue the post. `/graphics-studio` save sets descriptive text without creating the named records. These visible actions remain BLOCKER until implemented or deliberately hidden/deferred.
- FulfillmentCommandCenter's mappings tab mounts `PodMappingCenter` without initial persisted mappings or a save callback. Its default approved sample mapping is therefore reachable source behavior, not a dormant fixture.
- `npm ci` exits 1 under the installed npm 11.17.0 allowScripts policy despite populating dependencies. The log also reports 51 dependency audit findings, including 15 high and 2 critical. Triage applicability and resolve the reproducible installation gate; do not run an unreviewed `audit fix --force` as part of documentation reconciliation.

## RC-04 final result — 2026-10-04

No blocker remains within the supported RC-04 subset on tested source `fb8c9d7c3211f4c257ad569edb366d089074e492`; see [final evidence](evidence/RC-04-PASS3.md). Live providers, the explicitly deferred surfaces, and broader RC-01 release gates remain outside this verdict.

## RC-07 Pass 2 — BLOCKED — 2026-10-05

Both running projects report `BUILD_SHA=unknown`; deployed image revision is
also `unknown`. Inspected dirty-tree HEAD is
`e25f1b554eeae6e898d754822c64181f4b8040cc`, not a proven deployed candidate.
Gate 1 fails before destructive acceptance. Completed RC-07 Pass 1 evidence
was not found; existing configuration scripts use synthetic passkeys/direct
setup completion. [Pass 2 evidence](evidence/RC-07-PASS2.md) preserves bounded
health/topology observations and 27 passing unit tests plus typecheck/lint/build.
All later runtime gates remain unexecuted; no recovery/isolation PASS follows.
Resume requires provenance and valid setup repair, then substantive acceptance.
