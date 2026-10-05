# RC-04 Pass 3 cleanup and final gate

Date: 2026-10-04. Tested source: `fb8c9d7c3211f4c257ad569edb366d089074e492`.

RC-04 receives a bounded final **PASS** for the accepted audience, newsletter email, member identity, canonical community, moderation, direct/group messaging, in-app notification and cross-surface privacy journeys. The broader RC-01 release matrix and live provider acceptance remain independent gates.

## Cleanup and claim reconciliation

The audit covered all 51 implementation and test files changed between RC-04 Pass 1 and the final Pass 2 source. Focused lint and formatting checks found no unused imports, temporary debugging, stale TODOs or formatting failures. The moderation console now labels a failed audit-chain check as `Review required` instead of displaying `Verified`. The surfaced `FEATURE_READINESS` snapshot now reflects the accepted forum, newsletter and consent journeys and explicitly retains the provider and deferred boundaries.

No identity, audience, email, community or messaging architecture changed. No test was weakened.

## Final verification

- 270 focused unit tests in 36 files passed.
- 52 focused PostgreSQL integration tests in five files passed against a newly created, migrated disposable database.
- Three sequential production-style Chromium journeys passed with zero failures, skips or flaky results against a separate disposable RC-04 database copy.
- Typecheck, zero-warning lint and the production standalone build passed.
- The ordinary local standalone server was restarted after the build. `/` and `/api/setup/readiness` returned HTTP 200; the existing local database was preserved.

The browser gate proves public signup and consent, confirmation/preferences/suppression/re-subscribe, real local SMTP MIME and retry recovery, real member sessions, public community participation, site-scoped moderation, private object denial, direct/group messages, notification preferences, mute/block, owned export and a suppressed newsletter recipient receiving only the permitted in-app community notification. Raw results, traces, screenshots, redacted MIME and logs are retained in `rc-04-pass3/`.

## Final boundary

Production inbox delivery and live SMS/RCS remain provider-required. Forms/automation, telecom dispatch, external community notifications/digests, per-event relationship switches, permanent deletion, complete contribution/message export and private attachment upload/scanning/download remain deferred. No encryption, distributed rate-limit, fresh-install, upgrade, restore or aggregate release-readiness claim is made.
