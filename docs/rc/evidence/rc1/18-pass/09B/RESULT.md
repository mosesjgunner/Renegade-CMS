# RC1 09B - Campaigns, Templates and Recipient Selection

PASS - bounded 09B only, 2026-10-20. Aggregate RC1 and the concurrently changing checkout remain NOT READY for a full release claim. No next subpass was executed by this run.

## Source and runtime identity

- Tested base: `8775209d84d7a3071d0ba49919c71021be82ea39` plus dirty-tree overlay recorded in [tested-tree.txt](tested-tree.txt).
- Node: `v24.19.0`, Next.js `16.3.8` (Turbopack/webpack dev), Payload `3.90.2`.
- Disposable PostgreSQL container: `rc109b-20261020` on port `5450`, database `rc109b_release_acceptance`, 124 migrations applied cleanly.
- Isolated test runner: `tests/rc1-09b/run-isolated.ps1` and `tests/rc1-09b/verify.ts`.
- Retained traces and state: [state.json](state.json), [journey-trace.json](journey-trace.json), [restart-trace.json](restart-trace.json).

## Implementation

- **Newsletter & Campaign Composer UI (`src/modules/admin/EmailComposer.tsx`)**:
  - Full operator view registered at `/admin/email-composer`.
  - Article Derivation: Select published articles for the active site; automatically populates campaign subject, preheader, heading, body copy, button action, and pinned `content-card` block with canonical URL and article summary.
  - MIME-Safe Templates & Brand Tokens: Editable color tokens (`background`, `foreground`, `accent`, typography) and design blocks (`heading`, `text`, `content-card`, `button`, `divider`, `legal`).
  - Mandatory CAN-SPAM / GDPR Compliance: Enforced physical mailing address, preferences URL, and unsubscribe link in footer blocks.
  - Responsive Preview & Companion Tab: Desktop (600px) and Mobile (360px) viewport switching, responsive HTML container constraints, plain-text companion view, approximation warning banner, and deterministic SHA-256 render hashing.
  - Operator Test Send: Real-time operator test delivery dispatch to local mail sink with delivery ID tracking.
  - Review & Scheduling: Datetime picker, "Save Draft", "Submit for Review", and "Schedule Campaign" button triggering transition to `SCHEDULED` status with pinned recipient snapshot.

- **Audience Segment Evaluation & Targeting Service (`src/modules/audience/service.ts`)**:
  - `evaluateSegmentRecipients`: Evaluates subscribers for a given site against segment rules.
  - Strict site boundary: Rejects segment evaluation attempts outside the owning site (HTTP 403 Forbidden).
  - Consent enforcement: Verifies `consentPurposes: ['newsletter']` and active subscription status; filters out pending and unconsented subscribers into `unconsentedOrPending` count.
  - Suppression exclusion: Automatically checks subscriber email hashes against `suppressions` collection (bounces, complaints) and excludes them into `suppressed` count.
  - Recipient deduplication: Normalizes email addresses using `normalizeEmailAddress` (`NFKC` + lowercase trim); deduplicates uppercase/redundant email instances into `duplicates` count.
  - Empty audience detection: Returns `isEmpty: true` when 0 eligible consented recipients are matched, preventing scheduling to empty audiences.
  - `createRecipientSnapshot`: Persists an immutable `recipient-snapshots` record with SHA-256 fingerprint hash of eligible recipients, audit exclusion counts, and approval metadata.
  - `queueNewsletterDeliveries`: Extended to support delivery dispatch from pinned immutable `recipientSnapshot` records.

- **Campaign API Endpoints (`src/app/(frontend)/api/admin/audience/campaign/route.ts`)**:
  - `GET`: Authenticated, site-scoped query returning active site, published articles, template presets, approved segments, and existing campaign messages.
  - `POST` `action: 'preview'`: Validates message design, generates responsive MIME HTML, plain-text companion, render hash, and approximation warnings via `renderEmailDesign`.
  - `POST` `action: 'evaluate-segment'`: Executes `evaluateSegmentRecipients` with strict multi-tenant boundary checks.
  - `POST` `action: 'test-send'`: Validates test recipient address, validates message design, creates draft message, and queues test delivery via `queueTestSend`.
  - `POST` `action: 'save-and-schedule'`: Enforces valid lifecycle progression (`draft` -> `review` -> `scheduled`), pins immutable `recipientSnapshot` and `approvedRender`, and transitions message to `scheduled`.

## UI / Operator Proof

The automated operator acceptance journey (`tests/rc1-09b/verify.ts`) was executed with Playwright Chromium against the Next.js dev server on port 38998 and PostgreSQL on port 5450:
1. **Article Derivation**: Selected published article `"Freedom Act Update 2026"`; verified subject line auto-derived and pinned content card rendered.
2. **Responsive MIME Preview**: Updated preview; verified responsive container (`max-width:600px`), derived article title, mandatory legal unsubscribe link, approximation warning, and plain-text companion view.
3. **Audience Targeting & Deduplication**: Selected active supporters segment (5 subscribers in list); verified live analysis matched all 5, counted exactly 2 eligible consented recipients, identified 1 duplicate email deduplicated, 1 pending unconsented subscriber, and 1 suppressed subscriber.
4. **Empty Audience State**: Selected segment matching 0 subscribers; verified warning banner displayed (`Empty audience: 0 eligible consented recipients found`) and Schedule button was disabled.
5. **Campaign Scheduling**: Re-selected active segment, set schedule time, clicked "Schedule Campaign"; verified success banner, campaign status transitioned to `SCHEDULED`, snapshot SHA-256 hash displayed, and frozen count displayed as 2.
6. **Operator Test Send**: Entered operator email, clicked "Send Test"; verified test send queued into local sink with delivery ID.
7. **Database Persistence**: Verified `email-messages` record in PostgreSQL has `status: 'scheduled'`, `scheduledFor` timestamp, `approvedRender` snapshot, and pinned `recipientSnapshot` reference.
8. **Snapshot Integrity**: Verified `recipient-snapshots` record in DB has SHA-256 hash, exactly 2 frozen recipients, and exclusion counts (`duplicates: 1`, `unconsentedOrPending: 1`, `suppressed: 1`).

## Negatives & Security Boundaries

1. **Multi-Tenant Site Isolation**: Evaluated foreign site segment via API; rejected with HTTP 403 Forbidden and error message: `Segment site mismatch: access denied to segment outside owning site.`
2. **Anonymous Access Denial**: Attempted anonymous GET on `/api/admin/audience/campaign`; rejected with HTTP 403 Forbidden.
3. **Consent & Suppression Delivery Protection**: Verified database `email-deliveries` has zero sends to pending/unconsented subscriber (`pending@renegadeparty.org`) and zero sends to suppressed subscriber (`bounced@renegadeparty.org`).

## Restart Persistence Verification

Disposable container `rc109b-20261020` was restarted via `docker restart`. State persistence was verified:
- Site Alpha retained with slug `renegadeparty-09b`.
- Campaign email message retained with `status: 'scheduled'`.
- `scheduledFor` date and `approvedRender` HTML and hash preserved.
- `recipient-snapshots` record retained with identical SHA-256 hash (`f374ec4ad0fb...`).
- Frozen recipient count preserved as 2.
- Exclusion counts preserved (`duplicates: 1`, `unconsentedOrPending: 1`).

## Commands and counts

| Command | Exit | Result / Evidence |
| --- | --- | --- |
| `powershell -File tests/rc1-09b/run-isolated.ps1 start-db` | 0 | Container `rc109b-20261020` started on port 5450 |
| `powershell -File tests/rc1-09b/run-isolated.ps1 migrate` | 0 | 124 migrations applied to fresh database |
| `powershell -File tests/rc1-09b/run-isolated.ps1 unit` | 0 | 15/15 unit tests passed ([rc1-09b-campaigns-templates.test.ts](../../../../../tests/unit/rc1-09b-campaigns-templates.test.ts)) |
| `powershell -File tests/rc1-09b/run-isolated.ps1 lint` | 0 | ESLint: 0 errors, 0 warnings |
| `npx.cmd tsc --noEmit` | 0 | TypeScript check: 0 errors |
| `powershell -File tests/rc1-09b/run-isolated.ps1 verify` | 0 | 43/43 acceptance checks passed ([journey-trace.json](journey-trace.json)) |
| `powershell -File tests/rc1-09b/run-isolated.ps1 restart-check` | 0 | 10/10 restart checks passed ([restart-trace.json](restart-trace.json)) |
| `powershell -File tests/rc1-09b/run-isolated.ps1 stop-db` | 0 | Container stopped and removed cleanly |

**Final Check Counts**: **68 passed = 15 unit + 43 journey + 10 restart; 0 failed, 0 skipped, 0 mandatory local checks unexecuted**.

## Unexecuted / Unclaimed Categories

1. Ordinary WebAuthn passkey ceremony (fixture session tokens used for isolated acceptance).
2. Live third-party email provider dispatch (all sends routed to local development capture adapter).
3. Production container image build / deployment.

## Conclusion

PASS subpass 09B. Scoped campaigns, MIME-safe templates, audience segment selection, recipient deduplication, empty audience handling, scheduling, and multi-tenant security boundaries are verified. Ready for subpass 09C handoff.
