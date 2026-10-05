# RC-04 Pass 2 current-tree recheck

Date: 2026-10-04 (America/Chicago). Source repair: `d1cb789908c11f3624cba6468d59c8ec556a029f`. Verdict: **PASS within the supported RC-04 subset**, with working-tree attribution.

The checkout already contained completed Pass 2 and Pass 3 work. AGENTS.md, the RC control plane, RC_SCOPE, the four-file Pass 1 change and subsequent audience/community changes were inspected and retained. Existing source changes outside RC-04 were preserved. This run is not a clean immutable candidate claim: `rc-04-pass2-recheck/source-working-tree.patch` records the additional tested source, and `source-manifest.json` records its file hashes. The patch SHA-256 is `6aacb2870e6043a089745c908dd8515986e2bc5b40dea76ddac4587b94fa4ff1`.

## Failure and repair

The first browser attempt passed the email journey but failed fresh-session profile persistence. Its trace shows the settings save actually submitted `New member` and omitted the edited bio. The initial profile request had overwritten edits entered before loading completed. This was a product loading race, not an identity reset on login.

The settings form now appears only after the authenticated profile loads. Loading failure shows an explicit retry state; unauthorized sessions retain the sign-in state. The strengthened browser journey deliberately holds the real profile response, asserts that editing controls are absent during loading, then verifies the saved display name, bio and privacy immediately and after a fresh login. The first failure is retained separately in `rc-04-pass2-recheck/failure/`; its skipped abuse case is not counted as passed.

## Executed proof

- 270 focused unit tests in 36 files passed, including AUD/COMM contracts, identity, consent/subscription, email, moderation, messaging/notifications and privacy.
- 52 focused integration tests in five files passed on a newly created, migrated disposable database.
- Three sequential Chromium journeys passed on a separate newly created, migrated RC-02 publication copy, using the rebuilt production standalone server and real worker. No failures, skips or flaky cases. This is existing-publication acceptance, not fresh-install/upgrade/restore proof.
- Typecheck, zero-warning lint and the production build passed again after the repair.
- Eight final trace archives passed CRC inspection; their SHA-256 hashes and HTTP/console observations are retained. No page errors were observed. Expected denied/deferred responses and deliberate SMTP failures remain in the logs.

The visitor journey proves consent/version, double opt-in, duplicate signup, confirmation, preferences, one-click unsubscribe/suppression and confirmed re-subscribe. Real local SMTP DATA proves multipart/UTF-8 MIME, headers and recipient-specific links, queued/accepted outcomes, deliberate 451 failure, retry and disabled-transport operator recovery. Member journeys prove profile/privacy, forums/replies/follow, moderation queue/action/audit and denied authority, closed/locked/private/suspended behavior, direct/group messaging, notification read/unread, mute/block, owned export, and fresh-session persistence. A suppressed newsletter recipient receives the permitted in-app reply notification without new external mail; in-app-off and mute prevent new notifications. Foreign private conversations, guessed attachment use and private profiles are denied.

Canonical public forum comments expose open/members/closed policies; premoderation contracts are not promoted as a new accepted public path. Message read receipts are not claimed by notification read/unread proof. Private attachment launch is deferred; successful configured upload/download is not inferred from denial tests. Telecom STOP/HELP/opt-in/opt-out/quiet-hour/emulator assertions remain contract/integration proof, with shipping dispatch deferred.

Raw current results and `checks.json` live in `rc-04-pass2-recheck/`. Final browser traces, screenshots, redacted newsletter MIME, fixtures and runtime logs live in its `final/` directory. Original RC-04 historical evidence bytes were restored after capturing the new run. An initial PowerShell test-inventory selection error was stopped; its broad attempts confer no acceptance claim. Only the explicit 36-file/5-file focused results and completed final browser run are counted.

## Handoff boundary

Production email and live SMS/RCS remain **PROVIDER-REQUIRED**. Forms/automation, telecom dispatch, external community notifications/digests, per-event switches, permanent deletion, complete contribution/message export and private attachment upload/scanning/download remain **DEFERRED** with their existing hidden/denied/410 boundaries preserved. No encryption or distributed rate-limit claim is made.

No implementation blocker remains in this supported RC-04 subset. Remaining cleanup is stale-copy reconciliation and clean-candidate final verification after the pre-existing changes are reconciled. Broader role/tenant/module, live-provider, upgrade and restore gates remain open. Do not infer aggregate release readiness or begin another RC phase from this result.
