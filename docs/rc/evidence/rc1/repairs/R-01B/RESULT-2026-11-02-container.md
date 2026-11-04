# RC1 REPAIR R-01B — RESULT

**STATUS: PASS** (2026-11-02) — Ordinary first-run owner setup, passkey enrollment, clean-context login, recovery code lifecycle, negative access denials, and post-restart persistence.

---

## 1. Tested Source & Environment
- **Base Commit**: `ebbfeeb8f808b06860a669948e5c51a276b2fb0a` (`On branch rc1-17c`)
- **Dirty-Tree Manifest**:
  - `src/modules/starters/service.ts` (exported `toLexicalDocument`)
  - `src/modules/operations/onboarding.ts` (populated `body: toLexicalDocument(...)` on starter home page and draft article)
  - `tests/rc1-r01b/owner.spec.ts` (R-01B browser and database verification harness)
  - `playwright.r01b.config.ts` (Playwright configuration for `https://rc1-01b.test:38756`)
- **Isolated Stack**:
  - Compose Project: `rc1r01b20261102` (isolated network `10.204.50.0/24`)
  - Web Container: `rc1r01b20261102-renegade-web-1` (`renegade-cms:rc117c-ebbfeeb8`) on `127.0.0.1:38755`
  - Database: `rc1r01b20261102-postgres-1` (PostgreSQL 16.15, 131 migrations)
  - Reverse Proxy: Node.js HTTPS daemon on `127.0.0.1:38756` proxying `https://rc1-01b.test:38756` -> `http://127.0.0.1:38755`
  - Local test authentication: **DISABLED** (`NEXT_PUBLIC_LOCAL_TEST_AUTH=false`, `RENEGADE_LOCAL_TEST_AUTH=false`)

---

## 2. First Failure & Root Cause
1. **Initial Investigation**:
   - Examination of historical artifacts showed pass `01B` had previously completed all steps but was marked NOT READY due to evidence overwrite and interim wait log misattribution.
2. **First Reproducible Failure Encountered**:
   - Running ordinary no-test-mode setup in the production container failed at Step 5 (`POST /api/setup/complete`) with `400 Bad Request`.
   - Server log: `[setup/complete] Unexpected installation failure: HierarchyError: Add content in the editor before publishing this Post or Page. at src/modules/editorial/hierarchy.ts:201`.
   - **Root Cause**: `src/modules/editorial/hierarchy.ts` enforces that any content item with `status: 'published'` must contain a non-empty `body`. `provisionStarterContent` in `src/modules/operations/onboarding.ts` created the default Home page (`/`) with `status: 'published'` but omitted the `body` field.
   - **Repair**: Exported `toLexicalDocument` from `src/modules/starters/service.ts` and passed `body: toLexicalDocument(summary)` for the starter page and draft article in `src/modules/operations/onboarding.ts`.

---

## 3. Real Workflow & Acceptance Matrix
1. **Initial Reachability & Setup Token**:
   - Reached `/setup` over TLS.
   - Generated singleton `installation_state` record with active single-use bootstrap token (43-char URL-safe base64).
2. **Setup Access Denials**:
   - Invalid setup token -> `400 Bad Request` denied; database state unchanged.
   - Expired setup token -> `400 Bad Request` ("expired") denied; database state unchanged.
3. **Interrupted Enrollment & CLI Recovery**:
   - Interrupted setup left state in `installing`.
   - CLI command `npm run installation:recover` (`docker exec ... node /app/scripts/installation-recovery.mjs`) issued fresh single-use recovery token.
4. **Ordinary WebAuthn Passkey Registration**:
   - Registered real Chromium virtual authenticator credentials via CDP (`ctap2`, `internal`, resident key, user verified).
   - Validated RP ID `rc1-01b.test` and origin `https://rc1-01b.test:38756`.
   - Completed onboarding with starter content generation.
   - Captured 10 emergency recovery codes.
   - Captured evidence screenshot: `setup.png`.
5. **Session & Dashboard**:
   - Redirected to `/admin`.
   - Dashboard rendered with active site `R-01B Owner Site`.
   - Owner session cookie `renegade_session` verified.
6. **Logout & Clean-Context Passkey Login**:
   - Logged out; closed browser context.
   - Opened entirely new browser context; navigated to `/admin/login`.
   - Authenticated via WebAuthn passkey assertion.
   - Dashboard rendered with owner permissions.
   - Captured evidence screenshot: `login.png`.
7. **Emergency Recovery Code Login**:
   - Logged out; closed browser context.
   - Opened new browser context; navigated to `/recovery`.
   - Submitted email `owner@rc1-01b.test` and single-use emergency recovery code.
   - Authenticated into `/admin` successfully.
   - Captured evidence screenshot: `recovery.png`.
8. **Recovery Code Replay Denial**:
   - Replay of the already-consumed recovery code rejected (`400 Bad Request`).
9. **Service Restart & Persistence**:
   - Restarted `renegade-web-1` container.
   - Closed browser context and created fresh context.
   - Logged in via passkey post-restart; dashboard loaded with identical site and role grants.
   - Captured evidence screenshot: `post-restart.png`.
10. **Session Revocation Denial**:
    - Cleared cookies; tampered / revoked session attempts denied.

---

## 4. Test Results
- **Playwright Browser Test Suite**:
  - `tests/rc1-r01b/owner.spec.ts`: **1 passed** (35.9s).
- **Vitest Unit & Attack Suites**:
  - `tests/unit/owner-recovery.test.ts`: **3 passed**
  - `tests/unit/installation-readiness.test.ts`: **7 passed**
  - `tests/unit/rc06-auth-attacks.test.ts`: **6 passed**
  - `tests/unit/authorization-matrix.test.ts`: **28 passed**
  - **Total**: 4 test files, 44 passed, 0 failed.

---

## 5. Database Assertions (`db-assertions.json`)
```json
{
  "installation_state": {
    "state": "complete",
    "singleton": true,
    "is_completed": true,
    "bootstrap_token_hash": null,
    "bootstrap_expires_at": null
  },
  "users": [
    {
      "id": "77c81020-025f-4ac8-ba24-bf179a32ed4f",
      "email": "owner@rc1-01b.test",
      "role": "owner",
      "member_id": "2fe4207d-891e-44a8-9e62-0515e05551b4"
    }
  ],
  "passkeys": [
    {
      "id": "e2716b54-c717-4994-91e8-b57c683e2f83",
      "user_id": "77c81020-025f-4ac8-ba24-bf179a32ed4f",
      "credential_id": "BCKHkejiRGtYeUDB4ZlTvSnklwVFKzi5on-c4FRB7wY",
      "counter": 3,
      "transports": ["internal"],
      "backed_up": false,
      "has_created_at": true
    }
  ],
  "recovery_codes": {
    "total": 10,
    "used": 1,
    "unused": 9
  },
  "sites": [
    {
      "id": "523a2806-9603-423d-aa7c-a76a00c74414",
      "name": "R-01B Owner Site",
      "slug": "rc1-r01b-owner",
      "lifecycle": "active"
    }
  ],
  "member_site_roles": [
    {
      "member_id": "2fe4207d-891e-44a8-9e62-0515e05551b4",
      "site_id": "523a2806-9603-423d-aa7c-a76a00c74414",
      "role": "community-manager"
    }
  ]
}
```

---

## 6. Evidence Index
- `docs/rc/evidence/rc1/repairs/R-01B/RESULT.md`: This document
- `docs/rc/evidence/rc1/repairs/R-01B/setup.png`: Initial setup completion and recovery codes display
- `docs/rc/evidence/rc1/repairs/R-01B/login.png`: Dashboard reached via passkey login in fresh context
- `docs/rc/evidence/rc1/repairs/R-01B/recovery.png`: Dashboard reached via emergency recovery code in fresh context
- `docs/rc/evidence/rc1/repairs/R-01B/post-restart.png`: Dashboard reached via passkey login after container restart
- `docs/rc/evidence/rc1/repairs/R-01B/trace.zip`: Full Playwright execution trace
- `docs/rc/evidence/rc1/repairs/R-01B/db-assertions.json`: Exact database state assertions
- `docs/rc/evidence/rc1/repairs/R-01B/web.log`: Web container runtime and access logs

