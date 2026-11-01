# RC1 15A ? PASS (2026-11-01)

Scoped consent-safe collection/reconciliation PASS. **Aggregate RC1 remains NOT READY.** Only 15A executed. No commit, tag, push, external message, charge, publication or deployment.

## Exact source and containment

Started at `c7e10f524cd695a4e7b9c2f4172c7bccdaf02d3f` with preexisting 14A?14D edits/evidence. Another actor advanced HEAD to **`d83a1cc2539a06d024bec148fa212a7b69c3d40d`** during this work. No unrelated work was reset or edited.

`source-tree.json` pins all 1562 source/config/test files. Accepted journey tree SHA-256 **`a1789e2d0c0b1907bcf7b1070f1c195a4f4e281a1f23a80ec85f67df7c2bd28c`**; accepted restart tree **`320876b800b41391c8f5849ca99dd92404d3b398a0c90d288a05de334dd63944`**. `containment.json` records the sole restart delta: verifier pool teardown. **All production files are byte-identical across both accepted runs.** Final handoff tree **`ec1bc3eb5f0981024e376728c1c347ce4e42b43814a4df0c020b67ec52b95a01`** restores only Next-generated `next-env.d.ts`/`tsconfig.json` byte-for-byte to retained 14D configuration (verified including Windows CRLF). No checkout-wide equality or inherited runtime PASS is claimed. Earlier receipts retain their original sources; the prior-attempt manifest/logs are not accepted proof.

Runtime: Node 24.19.0, installed Next 16.3.8 development/webpack, Payload 3.90.2; all modules, test auth/routes **false**. Owned PostgreSQL 17.6 container `rc115a-20261101`, label `rc1.scope=15a`, image `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, loopback 5475, database `rc115a_release_acceptance`; web 39061; media `scratch/rc115a/media`; dist `.next-rc115a`. No production application image was built or claimed.

## Implementation

- Collection requires a persisted current, site-bound consent grant, honors policy/version/DNT/GPC, bots and marked/authenticated internal activity, and ignores caller identity. The server derives a site-scoped consent-subject hash. Browser events are explicitly unverified client observations; browser-supplied paid/form conversions are rejected. Query/fragment data are stripped, event IDs bounded/required, and stale/future timestamps rejected.
- Database advisory locks serialize subject collection/withdrawal and event deduplication across processes. Event identity and dedupe are site scoped, including the globally unique stored event ID. Native operator create/update/delete cannot forge raw events or consent evidence.
- Consent save and withdrawal cleanup are transactional; failure does not produce a success cookie/UI. Withdrawal removes linked raw events and experiment mirrors and invalidates unlinked site rollups, preserving canonical submissions and immutable consent evidence. A pre-withdrawal signed cookie cannot restore collection. The UI stops local tracking when withdrawal is requested and keeps failed saves visibly unsaved.
- Successful canonical public form submission emits one consented conversion keyed to the actual persisted submission, without answers/email in analytics. Form replay deduplicates telemetry; telemetry failure cannot change the canonical business result. Experiment telemetry validates persisted site/experiment/variant; conversion requires that subject's canonical consented form outcome. Experiment attribution events are excluded from general business-conversion totals.
- Attribution uses only same-site, consented, identity-matching touchpoints; missing identity cannot infer unrelated paths. Reports exclude expired, disabled-policy, stale-grant and unknown legacy/unlinked browser events. Provenance includes source/outcome, trust/grain, receipt/occurrence and expiry; unobserved traffic/rejections/duplicates and missing attribution remain unknown. Removed fixed funnel counts, invented bot/duplicate percentages and unsupported daily-salt identity descriptions.
- Existing registered retention task removes expired raw records; no schema/type migration was necessary because canonical fields/collections already cover this scope.

Changed source/verifier paths (plus this evidence directory and the single ledger row):

- `src/app/(frontend)/api/admin/telemetry/dashboard/route.ts`
- `src/app/(frontend)/api/admin/telemetry/funnel/route.ts`
- `src/app/(frontend)/api/analytics/collect/route.ts`
- `src/app/(frontend)/api/analytics/consent/route.ts`
- `src/app/(frontend)/api/analytics/report/route.ts`
- `src/app/(frontend)/api/experiences/conversion/route.ts`
- `src/app/(frontend)/api/experiences/exposure/route.ts`
- `src/app/(frontend)/api/forms/[formId]/route.ts`
- `src/collections/Analytics.ts`
- `src/modules/analytics/ConsentManager.tsx`
- `src/modules/analytics/browser-events.ts`
- `src/modules/analytics/contracts.ts`
- `src/modules/analytics/definitions.ts`
- `src/modules/analytics/inventory.ts`
- `src/modules/analytics/privacy.ts`
- `src/modules/analytics/reporting.ts`
- `src/modules/analytics/service.ts`
- `tests/rc1-15a/journey.ts`
- `tests/rc1-15a/provenance.ts`
- `tests/rc1-15a/run.ps1`
- `tests/rc1-15a/tsconfig.json`
- `tests/unit/analytics-15a.test.ts`

## Ordinary path ? persistence ? observed output

`journey-trace.json`: **40 passed / 0 failed / 0 skipped**. Actual anonymous Chromium `/events` visit shows privacy choices without a beacon/identifier. A deliberately failed consent response remains visibly unsaved. Selecting Analytics through the actual UI produces HTTP 201 and a PostgreSQL page-view row. Anonymous and consented submissions both use `/api/forms/:id`; both produce canonical saved outcomes, while only the opted-in conversion produces telemetry with matching subject/provenance. The idempotent public form retry returns the same outcome and one conversion. Five concurrent browser-event retries return exactly one accepted and four deduplicated responses, with one stored row.

UI withdrawal waits for the successful product response, then proves zero linked analytics records, retained canonical outcome, rejected old-cookie replay, withdrawn returning choices and zero operator event count. Authorized staff sees persisted provenance; anonymous/foreign operator and native guessed-row lookup are denied. A one-site operator is denied global settings; the owner with both site grants changes analytics off/version through supported Payload global REST, blocking collection/reporting without mutating business outcomes.

Browser is headless Chromium with a standard desktop user agent for the positive branch; Googlebot/marked-internal filtering is tested explicitly. Anonymous consent UI is real browser evidence. Operator identities/site grants/sessions and form/experiment definitions are isolated fixtures, **not genuine passkey enrollment/login acceptance**.

## Commands and counts

Exact commands/arguments/exits are in `commands.json`; each accepted command exited **0**, including explicit child-process exits. Six focused Vitest files: **33 passed / 0 failed / 0 skipped**. Journey: **40/0/0**. Fresh PostgreSQL/web restart: **7/0/0**. Accepted total **80 passed / 0 failed / 0 skipped**; mandatory scoped 15A groups unexecuted: **0**. Fresh verifier applies **129 migrations**, reruns them idempotently and validates physical schema. Scoped ESLint/Prettier/TypeScript and diff checks pass. Full unit/build/image/final RC gates were not executed or claimed.

Retention proof calls the registered task handler against the actual isolated database (no separate polling-worker claim), observes one expired fixture deletion, and preserves the live event and consent records. `persistence.log`: 129 migrations, one remaining nonwithdrawn page view, two canonical form outcomes, two grants/one withdrawal, zero experiment mirrors and zero rollups. Rejected browser requests intentionally create **no identifying event row**; their returned reasons and zero-row assertions are recorded in traces/logs rather than a tracking store of denied visitors.

## Negatives, retry and restart

DNT, GPC, bot/internal headers, authenticated operator visits, malformed/business-forgery/late/cross-origin events, foreign-site collection/experiment references, wrong-site native lookup/report, anonymous reporting, native mutation and one-site global-settings writes are denied without inflated results. Experiment exposure/conversion and canonical submission retries deduplicate. Withdrawal, cookie replay, policy off/version, missing identities and legacy/denied attribution are covered by actual paths plus focused units.

`restart-trace.json`: **7 passed** after actual PostgreSQL restart and fresh Next process: one retained event, stable dedupe on retry, persisted withdrawal blocks old cookie, canonical form outcome preserved, exact scoped report and foreign operator denial. Initial harness-only failures and the rejected shutdown run are explicitly retained in `commands.json` and `initial-*.log`; none contributes to accepted counts.

Open scoped blocker: **none**. No remote provider, live commerce, genuine passkey, production-image or aggregate RC1 acceptance claim. Email suppressions remain canonical audience consent; browser subjects are not joined to email hashes. Missing/legacy identities remain ineligible rather than being invented or linked.

Owned web/browser processes stopped; owned database stopped with data retained. Resume through the guarded runner; `migrate` **destructively resets only this disposable schema**, while `restart` reads/retries retained state. Stop here; no next subpass started.
