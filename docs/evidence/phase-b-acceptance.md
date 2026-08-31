# Phase B acceptance report — 2026-08-31

## Result

## Reconciliation addendum — 2026-08-31

**Gate not accepted locally.** The persisted Phase B migration/workflow regressions are repaired, but browser/output proof remains incomplete: the standalone server rejects the browser harness configuration, and no single HTTP publisher fixture proves consent/suppression through signed external delivery.

### Fresh local evidence

- `npm run db:migrate` applied B04–B06 and reconciliation migrations `20260831_150000`–`20260831_180000`; the ledger is fully applied.
- `npm run generate:types`, lint, typecheck, and `npm test` passed; unit evidence is **58 files / 223 tests**.
- Individual persisted PostgreSQL acceptance passed: canonical architecture (12), Payload persistence (1), discoverability (1), editorial (2), content release (1), experiences (3), media (1), and long-form/Quality Center (1).
- The media proof includes idempotent podcast/video fixture sync, ordered book chapters, and derived-media boundaries. The long-form proof includes chapter redirects, Quality Center finding/remediation, duplicate-safe scans, ignored advisories, tenant rejection, and stale-scan state.
- `npm run build` completed and emitted `.next/standalone/server.js`; its manifest includes analytics, events, podcast feed, video, sitemap, and public API routes.

### Repairs made

- Reconciled missing Payload lock relations, book/scoped-media lifecycle columns, and the `videos_rels` has-many captions table.
- Corrected Quality Center persistence to write the required issue site from the scan.

### Remaining local blockers

- `npm run test:browser` starts the standalone server, but requests fail closed with `CONFIGURATION_INVALID` for `APP_URL`, `DATABASE_URL`, `MEDIA_DIR`, and `PAYLOAD_SECRET`.
- The full aggregate integration run and operation/installation stages exceed this Windows command host window. The emitted operations evidence shows all three retry attempts and terminal failure logging, but no aggregate terminal result was captured.
- Fresh/upgrade migration verifiers correctly refused to run without their dedicated acceptance database URLs.

### Provider-required behavior

- SMTP/inbound callbacks; hosted media encoding, transcription/TTS, and externally reachable media URLs.
- A production secret manager, HTTPS webhook receiver, and multi-instance analytics/rate-limit behavior.

### Minimal repair prompts

1. “Make standalone runtime environment loading match `next start`, then prove `npm run test:browser` on port 3110 with feed/metadata and keyboard-accessibility assertions.”
2. “Add one PostgreSQL HTTP publisher fixture covering consented form input, analytics, unsubscribe/suppression, public event/podcast/video/book output, Quality remediation, scoped API idempotency, and a local signed webhook receiver. Assert withdrawal/suppression blocks tracking and marketing.”
3. “Provision dedicated fresh/upgrade acceptance databases and run both migration verifiers plus the full serial integration suite to terminal completion without weakening tenant, consent, idempotency, retry, or dead-letter assertions.”

**Gate not accepted locally.** The code-level Phase B regression suite is green, but the required persisted publisher operation and browser/output-boundary proof could not run because the local PostgreSQL acceptance environment was unavailable and the production standalone build did not complete within the command window.

## Locally verified

- `npm test`: 58 files / 223 tests passed.
- `npm run lint` and `npm run typecheck` passed.
- `npm run generate:types` completed; generated Payload types include the API idempotency collection.
- Quality Center regression repaired: asset-only rescans no longer emit unrelated metadata findings.
- Event recurrence regression repaired: timezone resolution now uses a bounded offset/DST search, so 250-occurrence expansion completes quickly while preserving DST behavior.
- API/webhook contracts: 8 focused tests passed for machine credential scope and tenant gates, public-only event envelopes, timestamped signatures, replay rejection guidance, retry/disable policy, and duplicate delivery enqueue prevention.
- Canonical API and webhook changes are documented in `docs/PUBLIC_API_WEBHOOKS.md`; migration `20260831_140000_public_api_webhooks` registers retained payloads/idempotency records and the webhook dispatcher task.

## Not locally verified

- A disposable publisher fixture persisted through newsletter consent/suppression, form submission, analytics, events, podcast/video/book outputs, Quality Center remediation, API HTTP client, and a live signed receiver.
- Database integration suite: `npm run test:integration` skipped its database-backed tests because PostgreSQL was not reachable/ready.
- Browser E2E, feed/metadata checks, and accessibility smoke: blocked because `.next/standalone/server.js` was absent after the build window.
- Any real SMTP, analytics, podcast/video hosting, webhook receiver, or secret-manager provider behavior.

## Provider-required items

- SMTP delivery and inbound email provider callbacks.
- Hosted media encoding/transcription/TTS and externally reachable podcast/video assets.
- Production webhook secret manager and an HTTPS receiver reachable from the worker.
- Analytics deployment/edge rate limiting in multi-instance production.

## Minimal repair prompts

1. “Start the project PostgreSQL stack, apply `npm run db:migrate`, then run `npm run test:integration`; fix every non-skipped acceptance failure without weakening tenant, consent, or idempotency assertions.”
2. “Make `npm run build` reliably produce the configured standalone output, then run `npm run test:browser` and add a browser smoke covering consent withdrawal before analytics/newsletter submission, public feeds/metadata, and keyboard accessibility.”
3. “Add one PostgreSQL HTTP acceptance fixture that creates a consented publisher audience/form/event/podcast/video/book, drives `content.created` through execution outbox to a local HTTPS webhook receiver, verifies retry/duplicate/redelivery/rotation/dead-letter history, and asserts draft/private fields never appear.”
