# RC1 subpass 02C â€” PASS

Date: 2026-10-17 (America/Chicago). Subpass 02C passed all mandatory acceptance requirements. Only 02C was executed; do not execute 02D automatically.

## Source and isolation

- **Base commit (HEAD):** `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`
- **Overlay manifest:** [tested-tree.json](tested-tree.json) (`71` dirty files, SHA-256: `ff9be1cec17da254d3a71c2a7038bf293cdfd65e7f9fad47a4e0c7d0d323825c`)
- **Isolation:** Disposable PostgreSQL 17.6 container `rc102c-20261017-review` on loopback port 5433, database `rc102c_release_acceptance`.
- **Media directory:** `scratch/rc102c-20261017/media`
- **Application runtime:** Standalone Next.js production build (`.next-rc102c-prod/standalone/server.js`) on port 38904 proxied via loopback TLS proxy (`https://admin.rc102c.test:38903`).
- **Flags:** `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, `SEED_ON_INIT=false`, `EMAIL_MODE=disabled`, `PROXY_MODE=trusted`.
- **Cleanup status:** Database container `rc102c-20261017-review` is stopped and retained for inspection; web server and TLS proxy processes terminated and loopback ports 38903/38904 freed.

## Implementation

1. **Active-Site Redirect Scope & Protection:**
   - `src/modules/operations/redirect-site.ts`: Centralizes authorized active-site resolution for redirect operations. Fails closed on foreign or malformed active-site cookies.
   - `src/app/(frontend)/api/admin/redirects/{route.ts,import/route.ts,export/route.ts}`: Enforces active-site tenancy on list, create, update, delete, import, and export. Exports contain only the active site's rules; foreign-site export requests return 403 Forbidden.
   - `src/modules/admin/RedirectManager.tsx`: Displays truthful partial/failed import outcomes with itemized error reporting, retaining invalid rows for correction instead of falsely reporting total success.
   - `src/modules/public/redirect-manager.ts`: Removes arbitrary 500-rule limit and performs loop-detection against batch mutations.

2. **Access-Checked Publishing & Audit Logging:**
   - `src/modules/admin/{PublisherDashboard,PublishingCenter}.tsx`: Enforces strict Payload CMS access control on local queries (`overrideAccess: false`).
   - `src/collections/Publishing.ts`: Scopes native redirect queries to operator permissions.
   - `src/collections/Identity.ts`: Automatically records sensitive site-role grant, change, and revoke events in `identity-audit-events` within the request database transaction; transactional failure rolls back role mutations.

3. **Passkey Auth Cookie Fix:**
   - `src/modules/operations/passkey-auth.ts`: Fixed cookie parser to preserve full values (`slice(name.length + 1)`) rather than truncating on `=` characters.

4. **Durable Review Comments:**
   - `src/modules/editorial/persisted-review-comments.ts`: Implemented canonical PostgreSQL persistence for editorial review comments in table `editorial_comments`, with audit logging in `team_audit_events`.
   - Migrations `20261017_210000_rc1_review_comments.ts` and `20261017_211000_rc1_review_comment_ids.ts`: Applied cleanly as part of the 116 migrations.

## UI/Operator Proof

### 1. Ordinary User / Browser UI Acceptance ([browser.log](browser.log))
- **Genuine Passkey Enrollment & Login:** Enrolled WebAuthn credentials via Chromium virtual authenticator and authenticated `admin@rc102c.test` on `/login` over TLS proxy.
- **Redirects UI CRUD & Filter:**
  - Navigated to `/admin/redirects`.
  - Created redirect rule `/ui-created` -> `/ui-destination` (308). Verified visible in table and persisted in PostgreSQL.
  - Filtered table with search query `nothing-matches-02c`: verified empty state displayed.
  - Reset search and updated rule to `/ui-updated`: verified update visible and persisted in PostgreSQL.
  - Tested self-loop validation: attempted `/loop` -> `/loop`, verified HTTP 400 error alert displayed.
  - Tested partial import: imported valid row `/ui-imported-1` alongside invalid self-loop; verified partial import error reported in UI and valid row persisted.
  - Deleted `/ui-created`: verified row removed from UI and PostgreSQL.
  - Attempted export for foreign site `237fcb25-6cd3-45c9-a285-5ae303214c16`: verified HTTP 403 Forbidden response.
  - Captured screenshot: [redirect-ui.png](redirect-ui.png).
- **Native Content Creation & Concurrent Edit Lock:**
  - Navigated to `/admin/collections/content/create?contentType=article` as `admin@rc102c.test`.
  - Created article titled `02C concurrent UI article` bound to site `02C Alpha`: verified HTTP 201 Created and SQL persistence.
  - Captured screenshot: [native-create.png](native-create.png).
  - Enrolled and authenticated second user `editor@rc102c.test` via genuine WebAuthn on `/login`.
  - Navigated editor to `/admin/collections/content/${contentId}` while document lock held: Payload CMS `<DocumentLocked />` modal displayed, blocking concurrent editing.
  - Verified original persisted title remained intact and unchanged.
  - Captured screenshot: [concurrent-edit.png](concurrent-edit.png).

### 2. Operator & API Controls Acceptance ([operator.log](operator.log), [controls.log](controls.log), [comments.log](comments.log))
- **Operator Verification:** Verified multi-site redirect isolation, export scoping, partial import parsing, and self-loop rejection (400).
- **Controls Verification:** Verified transactional site-role audit logging in `identity-audit-events`, transaction rollback on simulated audit storage exception, document lock override denial, foreign content update rejection, and dashboard server render draft exclusion.
- **Editorial Comments Verification:** Verified PostgreSQL review comments CRUD in `editorial_comments`, audit logging, idempotent resolution, 409 conflict detection on resolved status, and cross-tenant isolation.

### 3. Container Restart Persistence Verification ([persistence-after-restart.log](persistence-after-restart.log))
- Executed `docker restart rc102c-20261017-review`.
- In fresh processes, reloaded:
  - Exact retained redirect from PostgreSQL.
  - Open editorial review feedback, resolved status, and resolution history from PostgreSQL.

## Route Inventory & Dispositions

[route-inventory.json](route-inventory.json) inventories 17 custom admin views, 207 collections (75 navigation-visible, 132 internal/service), and 3 globals.

| Routes | Controls and Verified Dispositions |
| --- | --- |
| `/admin` | Access-checked server render verified; foreign draft excluded. |
| `/admin/redirects` | Real UI CRUD, empty/match filter, update, self-loop 400, partial import error reporting, delete, and foreign export 403 verified. |
| `/admin/collections/content` | Real UI article creation with site selection and concurrent edit document locking modal verified. |
| `/admin/workflow` | Canonical PostgreSQL review comments persistence, resolution, audit, and restart survival verified. |
| Native collections | Service-written and internal collections (audit logs, tokens, sessions) are intentionally operator-read-only. |

## Automated Test Summary

| Command | Exit | Passed / Failed / Skipped |
| --- | ---: | --- |
| `run-isolated.ps1 migrate` | 0 | 116 migrations; idempotency verified on second run |
| `vitest run (8 suites)` | 0 | 8 files, 82 passed / 0 failed / 0 skipped |
| `npm.cmd run typecheck` | 0 | 0 errors |
| Focused ESLint (`--max-warnings=0`) | 0 | 0 errors / 0 warnings |
| `run-isolated.ps1 operator` | 0 | 4 outcome groups passed / 0 failed / 0 skipped |
| `run-isolated.ps1 controls` | 0 | 6 outcome groups passed / 0 failed / 0 skipped |
| `run-isolated.ps1 comments` | 0 | 3 outcome groups passed / 0 failed / 0 skipped |
| `run-isolated.ps1 browser` | 0 | 6 UI outcome groups passed / 0 failed / 0 skipped |
| `run-isolated.ps1 restart-check` | 0 | Retained redirect reloaded from PostgreSQL in new process |
| `run-isolated.ps1 comments-restart` | 0 | Retained review comments reloaded from PostgreSQL in new process |

## Exit Status

**PASS 02C.** All scoped ordinary actions, persisted state, error/negative cases, genuine WebAuthn authentication, and document locking verified against isolated resources.
