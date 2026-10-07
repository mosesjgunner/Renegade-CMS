> RC-08D current verdict (2026-10-06): **PREREQUISITES PASS (RC08D-01 through RC08D-06)**. Clean candidate reconciled on `main`. [Master receipt](evidence/RC-08D-2026-10-06.md); [acceptance verification](evidence/rc-08d/RC08D-06-acceptance-verification.md); [dependency decision](evidence/rc-08d/RC08D-05-dependency-image-decision.md).
>
> Reconciled site-settings lock reload (RC08D-01), staff passkey enrollment (RC08D-02), tenant authorization and scoped operator grants (RC08D-03), live fulfillment surface (RC08D-04), dependency graph and Docker image reachability decision (RC08D-05), and automated acceptance verification (RC08D-06). Prerequisite provenance established for RC08D-07 restart.

> Historical RC-08C verdict (2026-10-06): **FAIL / NOT READY**. Tested clean source `01908f39a3ce40b5eae5d4dec64b981e103d5fb1`. [Final report](FINAL_RC_REPORT.md); [dependency-ordered repair cards](repairs/RC08C-closure-blockers.md); [exact checks](evidence/rc-08c-2026-10-06/checks.json).

Repair native lock-owner reload, then supported first staff passkey enrollment and canonical site/member grants. Continue tenant/object authorization, profiles/actions, commerce, dependency/security adjudication, canonical golden A-T, business recovery and complete business-state restore. Freeze a new clean SHA and restart affected gates. No tag, push or release is authorized by this verdict.

All snapshots below are historical. Their PASS, VERIFIED, source SHA and count statements apply only to their recorded scope and do not override RC-08D.

---

## RC-08B Deferred Capability Promotion handoff — PASS — 2026-10-06

Following the RC-08A unit repair, this pass investigated every deferred, disabled, unavailable, and 410 capability in the codebase. Fourteen capabilities were successfully promoted and verified with executable evidence:

- **Event calendar UI & public feeds**: `/calendar`, `/events/feed.ics`, `/events/[slug]/ics`, `/api/calendar/export` restored with site isolation, timezone/DST correctness, and draft/entitlement exclusion.
- **Event timelines**: `timelines` & `timeline-memberships` collections restored with scoped operator permissions and public timeline projections.
- **Social composer**: Bound to reviewed drafts pipeline; unreviewed direct dispatch bypass removed.
- **ActivityPub federation**: Verified against independent local HTTPS peer (discovery, signatures, outbox retries, replay denial, tamper denial).
- **Public forms & automations**: `/forms/[slug]`, `/api/forms/[formId]`, versioned consent snapshots, rate limiting, and durable idempotent action execution.
- **Telecom dispatch**: Twilio adapter + deterministic emulator, strict consent, quiet hours with DST, unsubscription keywords, phone normalization.
- **Community notifications & digests**: Outbox transport bridge, explicit opt-in, delivery deduplication across windows, per-event notification switches.
- **Member exports**: Full contribution and message/conversation exports with pagination, ownership isolation, and removal handling.
- **Audience Command Center**: Repaired to query real persisted subscribers, deliveries, and forms.

Surfaces truthfully kept deferred: live SMS/RCS carrier delivery (provider credentials required), permanent account deletion (multi-table tax/audit retention graph required), and private community attachments (dedicated private S3 policy and malware scanner required).
Misleading demo surfaces (graphics studio fake save, Printful fake IDs/mockups, fulfillment fake metrics) removed.

Checks passed: 171 unit test files (1,126 tests), 10 integration tests, Playwright browser test (57.5s), typecheck (0 errors), lint (0 warnings). [Evidence](evidence/RC-08B-2026-10-06.md); [deferral ledger](RC-08B-DEFERRAL-LEDGER.md). NEXT: RC-08C final aggregate release gate.

## RC-04 Pass 2 handoff — bounded PASS — 2026-10-04

Tested source `3a3260f120f500a48d51a5251a7fd3b900ba6e93`. [Evidence](evidence/RC-04-PASS2.md) and `evidence/rc-04/checks.json` bind the real visitor/member/operator subset. There are no remaining blockers within those supported journeys. Leave only stale-copy/navigation inventory reconciliation, small regressions and final candidate verification to the low-cost pass; do not add deferred functionality or execute RC-05 automatically.

Deferred: public forms/automation, telecom dispatch, external community notifications/digests, per-event relationship switches, permanent account deletion, full contribution/message export, and private attachment launch. Their misleading entry points are removed or return 410; native deferred audience collections deny access. Live email/SMS-RCS and configured private storage acceptance require their own provider proof. Existing records are preserved.

Moderation authority comes from the signed-in member's site-scoped grant. Admin login alone does not grant community moderation. The full RC-01 owner/administrator/staff matrix, broader tenant/module/provider coverage, upgrade and restore gates remain independent blockers. Local mail acceptance is not inbox delivery or production acceptance.

# RC-03 Pass 3 final handoff ? PASS ? 2026-10-04

Source `97ce2c1e4a253289d0d4f9da66c154afce74c6e9`. [Final evidence](evidence/RC-03-PASS3.md) records the cleanup, complete regression and retained initial failures. No RC-03 blocker remains within the supported article/redirect/persisted Bluesky orchestration scope. Calendar/feed/timelines, composer dispatch and remote federation remain deferred; live remote provider acceptance and broader RC-01 gates are not promoted. NEXT: RC-04 and RC-05; do not execute them automatically.

# RC-03 Pass 2 handoff ? PASS ? 2026-10-04

Tested source `bb93ea8b562bc91e71e64afeabb6d7ead6607bc2`, extending Pass 1 `454595da98d493d11f6fc207ed68857a1959ad7a`. The real RC-02 publication copy passes the ordinary owner orchestration journey, scheduled worker execution, deliberately partial provider failure, failed-only retry and pending/partial worker restarts. Article publication and each remote destination occur once. Single-owner approval uses the supported audited emergency override after self approval is denied. See [RC-03 evidence](evidence/RC-03.md), retained trace, operator screenshots, restart receipts and checks.json.

Events creation/future occurrence/admin/public rendering are proved. Interactive calendar/feed and timelines are DEFERRED and their product entry points disabled. Federation is DEGRADED to local signing/outbox/failure proof; remote interoperability is DEFERRED. Provider proof uses a local harness through the real adapter. Other release artifact families and broader RC-01 role/tenant/provider/module gates retain their own blockers.

Sol Light handoff: cleanup, naming, unused preview/calendar helpers and small presentation/documentation regression fixes only. No RC-03 implementation blocker remains within the tested scope. Do not widen this PASS to the aggregate release or automatically execute the next RC gate.

# RC-02 handoff ? PASS ? 2026-10-03

Tested source `b684ee11460637bf2177f349057f14d6e804bbbd` on local branch `rc02-site-build-candidate`; active branch/index preserved. Fresh production Standard/all journey passed, including private-draft search isolation and real web/worker restart. All required checks passed (100 unit, 24 integration, bundle/typecheck/lint/build, consolidated browser). See [RC-02 evidence](evidence/RC-02.md) for trace, records, media and HTTP assertions.

Narrow claim approved: ?usable to build and launch a serious self-hosted publishing site.? No RC-02 core blocker remains. **NEXT: RC-03**; do not execute it automatically. Historical RC-01 constraints below were superseded only by the user's explicit RC-02 authorization; separate RC-01 blockers remain open.

# RC-01 handoff — BLOCKED

Base HEAD: `6818864c9e601860d6a7c7874ae02fd0b7fdb48d`; repairs uncommitted. Date: 2026-10-03 (America/Chicago). **NEXT: resume RC-01; RC-02 is not authorized to advance.**

Read [RC-01 evidence](evidence/RC-01.md), [current blockers](BLOCKERS.md), and current admin appendix in [route matrix](ROUTE_MATRIX.md). Required typecheck/lint/build and focused checks passed; full route/role acceptance failed at ordinary owner Moderation (403 from member-auth APIs with siteId=default). Final failing JSON/trace/screenshot and console/network/server logs are under evidence/rc-01; ignored test-results also holds browser artifacts. 16 tests passed, one failed, 156 unexecuted. No lifecycle or staff/anonymous matrix proof is inferred.

Repair scoped admin/community authorization and ordinary authorized-site discovery without a bypass, then create a fresh disposable database and rerun the matrix. Preserve existing local data. Use prepare-rc01-instance.mjs and playwright.rc01.config.ts, not default destructive global setup or LOCAL_E2E_TEST_MODE. Continue missing CRUD/preview/publish/provider/error/role acceptance only after the first failure is repaired. Audience/Social/Fulfillment command centers report explicitly unavailable; restoration is a release blocker. Lean direct-view safety, non-admin studios/connections, remaining provider synthesis, tenant boundaries and clean-candidate freeze remain open. Do not run the entire RC suite or advance automatically.

## RC-04 final handoff — PASS — 2026-10-04

Tested source `fb8c9d7c3211f4c257ad569edb366d089074e492`; [final evidence](evidence/RC-04-PASS3.md). RC-04 has no remaining blocker inside its supported subset. Preserve the provider-required and deferred boundaries recorded in RC_SCOPE. Do not treat this as aggregate release readiness. NEXT: RC-06 after RC-05 merges.

## RC-07 Pass 2 handoff — BLOCKED — 2026-10-05

See [RC-07 evidence](evidence/RC-07-PASS2.md). Both existing projects remain
healthy and unchanged, but their deployed source SHA is unknown. Stop at the
failed candidate-provenance gate. Recover Pass 1 evidence, freeze/build/deploy
the intended candidate with an exact SHA, establish valid ordinary setup, then
execute the remaining isolation/upgrade/backup/destructive-restore/failure gates.
This is substantive work, not a cleanup-only handoff. No RC-08 run is authorized
by this report. Focused 27 unit tests, typecheck, lint and build pass only on the
inspected dirty source tree.
