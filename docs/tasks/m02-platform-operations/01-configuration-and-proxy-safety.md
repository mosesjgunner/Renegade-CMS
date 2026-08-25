# Task 01: Configuration and proxy safety

Scope: expand the centralized validator for database, URL, proxy policy, local storage, email placeholders, secrets and production safety; wire canonical CSRF/CORS and secure auth cookies; document reverse-proxy behavior.

Tests: unit matrix for safe development and rejected production configurations; type-check, lint and build.

Done when errors name only keys, unsafe production values fail early, cookie/origin behavior derives from validated configuration, and operators can identify required persistent storage/proxy settings.

Non-goals: SMTP delivery, object storage, edge-provider integration.

## Handoff

Completed 2026-08-11. Central validation now covers production URL, database credentials, secret strength/placeholders, explicit proxy policy/hops, persistent local storage, SMTP placeholders, test-route prohibition, version metadata and redacted warnings. Payload CORS/CSRF and auth cookie security derive from validated APP_URL. Evidence: type-check, 9 unit tests and lint pass; build/integration remain for the milestone suite.
