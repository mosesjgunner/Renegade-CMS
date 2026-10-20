# RC1 Subpass 08A Acceptance Result

## Overview
- **Subpass**: RC1 SUBPASS 08A/70 — PROVIDER SETUP AND CAPABILITY TRUTH
- **Status**: PASS
- **Checkout Root**: `C:\Projects\RENEGADE CMS\Renegade-CMS`
- **Base Commit**: `ba65c8c7e40ff6b703ca9780d4da1ced44974934` (plus dirty tree overlay captured in `docs/rc/evidence/rc1/18-pass/08A/tested-tree.txt`)
- **Execution Date**: 2026-10-19
- **Isolated Environment**: Disposable PostgreSQL 17.6 container `rc108a-20261019` on port 5447, database `rc108a_release_acceptance`, isolated Next.js dev server on port 38995, and local AT Protocol fixture on `127.0.0.1:3130`. Zero live external calls, posts, or credential leaks.

## Requirements & Verification Summary
1. **Authorized Connection Setup & Lifecycle**:
   - `src/app/(frontend)/api/admin/social/accounts/route.ts` enhanced with full operator-authorized `POST` handler supporting `connect`, `test`, `disconnect`, and `reconcile` actions.
   - Enforces strict tenant boundary via `resolveOperatorGrantContext`: unauthenticated requests return `403`, foreign tenant operators are denied with `403`.
2. **Provider Capability Truth**:
   - Implemented `getProviderCapabilityTruth(network, modeOverride)` in `src/modules/social/provider-runtime.ts`.
   - Distinguishes `local-harness` from `remote-sandbox`, `live`, and `manual-handoff`.
   - Populates declared capabilities (text limits, image attachments, supported post types) directly from canonical adapters rather than faked defaults.
   - Integration dashboard (`/api/admin/integrations`) scopes are derived from actual provider capabilities (`social.publish.${postType}`).
3. **No Fake Success & Deterministic Failure Handling**:
   - Connecting with invalid credentials makes an actual non-destructive session check against the adapter (`createSession` on local harness) and fails truthfully (`credentialHealth: 'revoked'`, recorded sanitized error in `diagnostics.lastError`).
   - Connecting with absent credentials correctly records `not-configured` without manufacturing success.
4. **Secret Redaction & Security**:
   - Zero credentials or tokens stored in plaintext in the database `social-accounts` table (`connectionReference` stores encrypted envelope `enc:...` using AES-256-GCM via `encryptSecret`).
   - Secrets are completely redacted from API JSON responses and sanitized via `sanitizeSocialLog`.
   - SSRF protection in `src/modules/social/adapters/bluesky.ts` and `security.ts` prevents cloud instance metadata or SSRF targeting while allowing local dev loopback testing when explicitly authorized.
   - Safe disconnection sets `credentialHealth: 'revoked'`, clears `connectionReference` to null, preserves historical logs and drafts, and records audit trail.
5. **UI & Command Center**:
   - `src/modules/admin/SocialCommandCenter.tsx` truthfully surfaces connected account status, truth mode pill (e.g. `local-harness`), and capabilities without exposing credentials.
6. **Container Restart & Persistence**:
   - Executed PostgreSQL container restart (`docker restart rc108a-20261019`).
   - Verified that account configuration, health state (`healthy`), mode (`local-harness`), capability limits (`textLimit: 300`), and revoked disconnection state persist intact across restart.

## Evidence Artifacts
- `docs/rc/evidence/rc1/18-pass/08A/RESULT.md`: This acceptance report.
- `docs/rc/evidence/rc1/18-pass/08A/NEXT.md`: Handoff instructions for Subpass 08B.
- `docs/rc/evidence/rc1/18-pass/08A/tested-tree.txt`: Dirty tree manifest at test execution time.
- `docs/rc/evidence/rc1/18-pass/08A/trace-verify.json`: 28 passed operator and API assertions with timing and response payloads.
- `docs/rc/evidence/rc1/18-pass/08A/state.json`: State metadata from verify journey.
- `docs/rc/evidence/rc1/18-pass/08A/persistence-final.json`: Persisted database state verified after PostgreSQL container restart.
- `docs/rc/evidence/rc1/18-pass/08A/social-command-center.png`: Full-page browser screenshot of Social Command Center displaying connected account and truth capabilities.

## Execution Statistics
- **Unit Tests**: 21 passed (`tests/unit/rc1-08a-social-providers.test.ts`, `tests/unit/dist-05-social-api-routes.test.ts`, `tests/unit/dist-03-social-command-center.test.tsx`, `tests/unit/social-contracts.test.ts`). 0 failed, 0 skipped.
- **Integration & API Journey Assertions**: 28 passed. 0 failed, 0 skipped.
- **Restart & Persistence Assertions**: 7 passed. 0 failed, 0 skipped.
- **Total Verified Checks**: 56 passed. 0 failed, 0 skipped.
- **TypeScript & Lint**: Clean pass (`tsc -p tests/rc1-08a/tsconfig.json` exit 0, `eslint` exit 0).
