# RC1 09D — NOT READY

2026-10-25 (America/Chicago). Only 09D executed; aggregate RC1 remains NOT READY.

First blocker: a native operator saves a tag on a linked, confirmed active subscriber. The saved tag + newsletter-consent segment returns **HTTP 200, eligibleConsented=0, isEmpty=true; expected 1**. [segment-observed.json](segment-observed.json), [segment-trace.json](segment-trace.json), [segment.log](segment.log). `evaluateSegmentRecipients` supplies `tags: []` instead of canonical taggings. This is a real reconciliation failure, unrelated to external credentials. The assertion remains failing.

## Source and preservation

Base `05f58a570ee51b0a6154d71db9d9322340c2f59f` plus the 38-file dirty source overlay [tested-tree.json](tested-tree.json), SHA-256 `78cb48ee8d4c81257008d041e40befe753d01dfd7e1c85190705caa9a19261ae`. Application source remained unchanged during final accepted runtime checks. Harnesses received whitespace formatting afterward; the manifest identifies their final reviewed contents. No commit/reset/clean/push/tag/publication/deployment.

[initial-tree.json](initial-tree.json) records preexisting edits. All initially present paths outside the edited audience files, generated Next files, ledger and 09D evidence retain their original hashes. Previous 09D artifacts are preserved byte-for-byte under [historical-20261021](historical-20261021/RESULT.md). The old test directly changed a queued delivery to accepted, and its receipt lacks a complete hashed source overlay. Its PASS is rejected. Existing 09C evidence remains unchanged and retains its original source boundary; it is not relabelled as current acceptance.

Runtime: Next.js 16.3.8 development application, all modules; local test authentication/routes disabled. Operator browser/API sessions are fixture-issued persisted sessions, **not genuine WebAuthn enrollment/login proof**. Anonymous visitors use actual product pages. SMTP uses loopback port 3141 and only accepts `@example.test`; telecom explicitly selects local emulation with live outbound disabled. No remote delivery, inferred opens/clicks, legal compliance or production application image claim.

Own PostgreSQL 17.6 container `rc109d-review-20261025`, ID `c8825c4e0726277329700171a3f66cc9bcecc3142071e26447e4f493778fea6a`, image `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`. Loopback port 5453, database `rc109d_release_acceptance`; runner checks `rc1.scope=09d-review` before destructive migration. Isolated media/build/heartbeat paths. Web, worker, browser and sink stopped; own database stopped with data retained. Existing environments were not operated on.

## Implementation

Product changes in this run:

- `src/app/(frontend)/api/admin/audience/crm/route.ts`: site-bound complete delivery counts through persisted message ownership; finite pagination, case-insensitive search, full consent timeline and source references; malformed-ID/safe storage-error responses; same-origin writes, private exports and validated suppression input.
- `src/app/(frontend)/api/admin/audience/command-center/route.ts`: complete telecom/form status counts; separate inbox/activity notification counts; sent-calendar projection; truthful subscriber/health labels. SMTP configuration no longer implies SPF/DKIM/DMARC/TLS verification.
- `src/modules/admin/AudienceCommandCenter.tsx`: mount existing composer in Campaigns; CRM pagination/error/source display; explicit subscriber-address anonymization/retention policy; notification counts and truthful general automation/provider boundaries.
- `src/app/(frontend)/admin/email-composer/page.tsx`: wire the existing Compose Email link to the canonical component.
- `src/modules/audience/service.ts`: remove fixed segment enumeration limits and scope memberships; complete, unpopulated consent/suppression subject exports with retention boundary; null identity links and idempotent repeat anonymization. **Canonical tag and other selector projections remain unfinished.**
- Next generated `next-env.d.ts` and isolated dev type includes in `tsconfig.json`. No new schema fields; no new migration/generated Payload types needed for these repairs.

New focused tests: `tests/unit/rc1-09d-reporting.test.ts`, `tests/unit/rc1-09d-segments.test.ts`. New guarded harnesses under `tests/rc1-09d/`: `run-current.ps1`, `verify-current.ts`, `browser-current.ts`, `smtp-sink.ts`, `intake-current.ts`, `telecom-current.ts`, `restart-current.ts`, `segment-current.ts`. Original tests and unrelated source remain present.

## Commands, exits and counts

Full exact commands and log names: [commands.json](commands.json). Mechanically counted runtime assertions: [counts.json](counts.json).

| Check | Exit | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Focused ESLint, 14 files, max-warnings=0 | 0 | command | 0 | 0 |
| npx.cmd tsc --noEmit | 0 | command | 0 | 0 |
| Focused Vitest, 11 files | 0 | 115 | 0 | 0 |
| Fresh migration verifier, 125 migrations | 0 | command | 0 | 0 |
| run-current.ps1 verify | 0 | 59 | 0 | 0 |
| run-current.ps1 browser | 0 | 11 | 0 | 0 |
| run-current.ps1 intake | 0 | 15 | 0 | 0 |
| run-current.ps1 telecom | 0 | 12 | 0 | 0 |
| run-current.ps1 restart | 0 | 15 | 0 | 0 |
| run-current.ps1 telecom-restart | 0 | 5 | 0 | 0 |
| run-current.ps1 segment | **1** | 3 | **1** | 0 |
| **Final assertion total** | | **235** | **1** | **0** |

Eight acceptance cases remain unexecuted/unaccepted: canonical selector reconciliation for form, sourceCampaign, engagement, role, locale, commerceFact and communityFact; general event-driven automation execution. The UI labels general execution unavailable; supported form actions are proved. Remote providers, production image and genuine WebAuthn are outside local claims, not substitutes for failed selectors.

Rejected preliminary runs are excluded from accepted totals: missing consent-revision/Host fixtures, development reload/route-compilation effects, selector timeout, badge-text assertion and denial-code expectation. Fixtures/assertions were corrected to actual contracts; the tag assertion remains unchanged and failing. Read-only route warming stabilizes the final browser run. Nonfatal dev stream-close messages remain logged; bearer query tokens are redacted.

## UI/operator → persisted state → observed output

[browser-trace.json](browser-trace.json), [browser-state.json](browser-state.json), [browser.log](browser.log), [operator-ui.png](operator-ui.png): anonymous visitor submits actual signup and consent UI. Real worker emits confirmation MIME to local SMTP; visitor follows its observed token and confirms in UI. Active/verified state persists. Fixture operator selects a saved newsletter-consent segment with exactly one eligible recipient and schedules through the actual composer/API. Scheduled worker delivers exact MIME once; accepted status and one attempt persist. Visitor follows the preference link from observed campaign MIME and saves withdrawal. Suppression persists. A subsequent UI test-send is cancelled with zero attempts and no extra campaign MIME. CRM empty state, general-automation limitation and local emulator UI are exercised. No operator enrollment/login acceptance claim.

[journey-trace.json](journey-trace.json), [sink-summary.json](sink-summary.json): public handlers and actual worker/sink; consent history; mixed-case name, phone and status search; contact detail and normalized creation; CSV privacy threshold; bounded subscriber-address anonymization and count reconciliation. Six genuinely accepted foreign-site sends to the same address remain excluded from Alpha metrics/export. Anonymous/foreign site access, absent contact, empty search and cross-origin writes are denied/safely empty. Unit fault injection proves storage failure yields sanitized 503, not successful empty reporting.

[intake-trace.json](intake-trace.json): 51 public saved-schema submissions; idempotent replay; invalid-answer/foreign-host rejection. Worker persists completed create-contact/create-task journals, one deduplicated contact and 51 source-linked tasks. Replay adds no tasks. Form counts reconcile above the previous 50-row page. Existing community dispatcher persists an in-app notification with external email off; separate activity/inbox counts are observed. Foreign subject export is denied; export retention scope is explicit. Subscriber-address anonymization is not whole-subject/account deletion.

[telecom-trace.json](telecom-trace.json): canonical contacts/profiles, per-event preference guard, durable quiet-hour delay, zero early sends, one allowed emulated event, site-scoped STOP, no post-STOP send, no duplicate delivery on replay and denied native/foreign operations. Foreign retry uses the existing sanitized HTTP 400 denial contract; separate CRM foreign/anonymous denial proves 403.

[restart-before.json](restart-before.json), [restart-trace.json](restart-trace.json), [telecom-restart-trace.json](telecom-restart-trace.json): actual PostgreSQL restart and new application processes retain exact collection hashes/counts across 11 collections. Browser campaign remains accepted once; subsequent send remains cancelled with zero attempts. Operator counts reconcile; accepted retry returns 409; five telecom records retain status/attempts/quiet-hour scheduling. These successes do not clear the tag-selector failure.

## Handoff

**NOT READY.** Resume 09D at the persisted tag-selector mismatch. Connect advertised predicates to canonical site-scoped sources, prove counts/negatives and rerun the complete affected gate against an exact new overlay. See [NEXT.md](NEXT.md). No later subpass executed.
