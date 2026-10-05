# RC-04 Pass 2 acceptance and privacy evidence

2026-10-04. Final source candidate: `3a3260f120f500a48d51a5251a7fd3b900ba6e93`. Final results are recorded in `rc-04/checks.json`; only that candidate and its completed browser result establish this pass's narrow verdict.

Pass 1 baseline: `35f17573a97f7a40aaf9127788ab8deca95db956`. Pass 1's subscription fallback, suppression-clearing and shared-contract work was inspected and retained. This pass strengthens ordinary visitor, member and authenticated operator boundaries rather than repeating internal contract journeys as browser proof.

## Fixture and execution boundary

Browser acceptance uses a new disposable copy of the RC-02 publication database for each attempt, then applies registered migrations. It is an existing-publication journey, **not a fresh installation claim**. The original database is preserved. New ordinary records are created by browser UI or authenticated product REST. No SQL inserts, internal service calls, fixture seed route or test authentication bypass create browser journey records.

The web process uses the production standalone build and the real jobs worker. A local TLS proxy and loopback SMTP sink retain actual DATA bytes. SMTP 451 recipient rejection is deliberate; a disabled worker transport and a subsequent SMTP worker restart exercise unconfigured transport recovery. No live provider credentials or external delivery were used.

Integration tests use a separately created empty, migrated disposable database with fixture seeding explicitly enabled. Their service calls are contract/integration evidence only. Telecom emulator assertions are not operator or remote-provider delivery proof.

## Repairs made

- Public signup validates email before writes, resolves the host site, persists fixed consent wording/version, and starts with an unchecked opt-in control. Confirmation cannot clear bounce, complaint or administrative suppressions. Recipient selection and send-time checks use normalized relationship IDs and site scope.
- Scheduled native messages require reviewed, validated saved content. Marketing MIME carries a real one-click unsubscribe endpoint and recipient-specific preference and unsubscribe links, including legal design blocks. Preference withdrawal and re-subscribe preserve suppression until fresh confirmation.
- SMTP envelope rejection is classified by its SMTP response rather than incorrectly treating temporary RCPT rejection as permanent authentication failure. Failed disabled deliveries can be retried through a staff-authorized operator action; permanent/unknown/accepted outcomes are rejected.
- Required operator collections are exposed through progressive disclosure. The email composer links to real messages, delivery outcomes and suppressions, and reports transport acceptance rather than inbox arrival.
- Notifications project read/unread state correctly, enforce owned notification updates, respect in-app off and block/mute, and keep private-message notification bodies generic. External community email/SMS/digests return a deferred state.
- Forum reads, private thread SSR, replies and canonical posts enforce tenant and visibility checks. Public native collection reads no longer serialize member/contact/profile records. Message GET denial preserves a 403 and binds the database query correctly.
- The canonical forum report target is connected to the transactional moderation case/action/audit path. A registered additive migration expands allowed canonical target types. Case actions must match site and target. The console resolves the actual signed-in member's site and sends object scope IDs. Admin login alone does not grant member moderator authority.
- The self-service identity route queries the global member-owned profile correctly; profiles do not have a site field. Sites remain scoped through the separate identity spaces model.

## Deliberate deferrals

Forms and automation remain contract-only. Their native collections are hidden and deny product access; public forms return 410. Community external notifications and digests are deferred and cannot be selected as active delivery channels. Telecom dispatch collections are hidden/denied and telecom tasks are removed from shipping registration; source services and emulator contracts remain for future validation.

Permanent member deletion returns 410 and its misleading control is removed. The account export is limited to its actual identity/profile/billing/relationships/audit scope; complete contribution/message export is deferred. Private attachment authorization is exercised as a denial boundary. New private uploads return 410 at `/api/v1/attachments/presign`; existing records and internal scanner/authorization contracts are preserved. Successful private upload/scanning/download requires future configured storage acceptance and is not advertised as launch-ready. No end-to-end encryption claim is made.

Per-event follower/mention/direct-message switches were only stored rather than enforced. Those controls are removed, profile API attempts return 410, and settings direct members to the enforced in-app channel preference. Stored legacy preference records are preserved.

## Verification

Final candidate SHA, commands, counts and result: see `rc-04/checks.json`. Raw browser result is `rc-04/browser-results.json`, and the native CLI exit is `browser-exit.json`. Traces include owner/operator, visitor, four individual member sessions and public abuse. `browser-observations.json` extracts HTTP/console/page-error evidence from those eight contexts. Archive CRC and SHA-256 are in `trace-integrity.json`. Actual delivered newsletter MIME is retained with bearer tokens redacted and the unredacted byte hash in `audience-email.json`.

The focused suites cover 270 unit tests in 36 files and 52 integration tests in five files. The browser gate comprises three sequential journeys with no skipped cases. Typecheck, lint and the production standalone build are separate checks. The browser additionally asserts unreviewed scheduling rejection, actual one-click unsubscribe, suppressed-member in-app notification, preference-off suppression, public removed-post exclusion, private thread API/SSR denial, closed and locked reply denial, suspended thread creation denial, direct/group messaging, foreign conversation/attachment denial, mute/block, owned export, explicit deferred deletion/upload/per-event preferences, and fresh-session persistence.

Each invalidating browser attempt stopped immediately. Named initial harness, invalid design, link extraction, SMTP envelope classification, hidden operator collection, worker-restart timing, status selector, member profile query, moderation selector, server-header adapter and MIME header-unfolding failures are retained. These are historical failures, not additional passing cases. Early working-tree attempts are preliminary evidence; they are not attributed to the immutable final candidate. Windows PowerShell could turn a native warning into a wrapper failure; final commands explicitly capture `$LASTEXITCODE` and the browser native exit rather than infer it from redirected warning output. The final attempt alone determines the browser verdict.

## Release limit and handoff

This evidence does not clear the broader RC-01 owner/administrator/staff matrix, all tenant/module/provider gates, remote interoperability, customer upgrade or restore proof. A local SMTP acceptance is not production email success. Twilio/remote SMS-RCS and external email infrastructure remain PROVIDER-REQUIRED. Contract-only functionality is not promoted by passing integration test names.
