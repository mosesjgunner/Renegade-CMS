# RC1 subpass 02B result — PASS

Date: 2026-10-17 (America/Chicago). RC1 release status remains **NOT READY**. No next subpass was executed.

## Source and isolation

- Base HEAD: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`. Preserved preexisting user edits, databases, media, secrets, and historical evidence (`myhigherpower`, `renegadeparty`, `rc101a20261017`, `rc101b20261017`, `rc101clean`, `rc101cstd`).
- Runtime source overlay SHA-256:
  - `src/modules/operations/staff-enrollment.ts`: `5A5E139BFD6207FBC207B232032BD615572ABD71E28E5E35303C537AEFD2E666`
  - `src/app/(frontend)/api/admin/staff/invite/route.ts`: `CFB451F175AF9D3731882F1236FC1E9D4029B96530911E1D150A812BF6B1D776`
- Subpass 02B test files SHA-256:
  - `tests/unit/staff-enrollment.test.ts`: `CC7AC068929B0CA7D98A388EEB31AE77C53512D09632ECFC0F13F8A8562F5CA2`
  - `tests/rc1-02b/verify-02b.ts`: `1D6F22EA153F7B1208C92EF3F6B84A75EEECEAABBDFFD6CF48B4BBF2E2C2F4E9`
- Disposable isolated test environment:
  - Container `rc101-02b-postgres` on loopback port `5433`, PostgreSQL 17.6-alpine, migrated with 116 migrations. Executed full ordinary operator journey, passkey enrollment with Chromium Playwright virtual authenticator over HTTPS, login/logout, dynamic role modification, negative security checks, and owner recovery; cleanly decommissioned with `docker rm -f`.
  - Preexisting user environments `renegadeparty` (3181), `myhigherpower` (3182), `rc101b20261017` (38742), `rc101clean` (38751), and `rc101cstd` (38752) remained completely untouched.

## Implementation and journeys

1. **Staff Invitations, Role Enrollment and Passkey Registration**:
   - `src/app/(frontend)/api/admin/staff/invite/route.ts`:
     - Added target site validation against the canonical `sites` collection before token generation, preventing orphan or invalid site invitations.
     - Enforces operator permission checks (`resolveOperatorGrantContext` and `canManageStaff`).
     - Supports token revocation via `DELETE /api/admin/staff/invite` with audit event logging in `security_audit_events`.
   - `src/modules/operations/staff-enrollment.ts`:
     - Enhanced `createStaffEnrollmentToken` and `completeStaffPasskeyEnrollment` to detect when a member re-enrolls with an updated role on the same site, immediately updating the existing `member_site_roles` record rather than failing on duplicate keys or retaining stale grants.
     - Generates cryptographically secure single-use enrollment tokens in `identity_tokens` with 7-day expiry and `maxUses = 1`.
     - `POST /api/auth/passkey/enroll`: validates token on options generation (`step=options`) and registration completion (`step=complete`). Atomically increments `usedCount`, burns the token, issues 10 emergency recovery codes in `admin_recovery_codes`, and provisions `member_site_roles` mapping (`community-manager` for `administrator`, `contributor` for `staff`).
   - Verified via Playwright CDP WebAuthn virtual authenticator (`WebAuthn.addVirtualAuthenticator`) over self-hosted HTTPS origin (`https://dispatch.rc101-02b.test:3999`), testing real WebAuthn CTAP2 resident key registration and credential storage.

2. **Policy Enforcement on Site Membership and Object Operations**:
   - Platform Owner Invariant: Global owner retains full administrative privileges across all sites (`*`).
   - Administrator Session (`community-manager` on Site A):
     - Successfully permitted administrative actions on Site A.
     - Strictly denied access to foreign Site B (`checkOperatorSiteAccess` returns false).
     - Cleanly denied unauthorized privilege escalation (attempting to invite staff without required root permissions returns HTTP 403).
     - Explicit logout via `POST /api/auth/logout` immediately invalidates session in `admin_sessions`.
   - Staff Session (`contributor` on Site A):
     - Successfully permitted staff content actions on Site A.
     - Strictly denied access to foreign Site B.
     - Cleanly denied administrative actions and staff invite capabilities (HTTP 403).
     - Explicit logout immediately invalidates session in `admin_sessions`.

3. **Immediate Effect of Dynamic Role Changes**:
   - Dynamically promoted Staff to `community-manager` in `member_site_roles`: subsequent request immediately recognized elevated role (`canManageCommunity = true`) without process restart or cache stale window.
   - Dynamically revoked Staff role in `member_site_roles`: subsequent request immediately returned unauthorized (`canAccessSite = false`), preventing lingering access.

4. **Security Negatives and Integrity Invariants**:
   - **Expired Token**: Invitation token past expiry rejected with HTTP 410 `TOKEN_EXPIRED`.
   - **Reused Token**: Invitation token already consumed (`usedCount >= 1`) rejected with HTTP 410 `TOKEN_CONSUMED`.
   - **Foreign-Site Token**: Attempting to redeem a token targeting Site B against Site A context rejected with HTTP 400 `WRONG_SITE`.
   - **Object-ID Substitution**: Staff attempting to mutate a `content-releases` object belonging to foreign Site B is cleanly denied (`Site mismatch: Release belongs to another site`), leaving the target record in the database unchanged.
   - **Revocation**: Inviting staff, revoking the token via `DELETE /api/admin/staff/invite`, and attempting enrollment fails cleanly with `TOKEN_NOT_FOUND`.
   - **Supported Owner Recovery**: Triggered emergency owner recovery rotation via `executeOwnerRecovery`, successfully rotating all 10 recovery codes in `admin_recovery_codes`, revoking all active sessions in `admin_sessions`, and logging the audit event in `security_audit_events`.

## Commands, exits and observed state

| Command/path | Exit/count | Observation |
| --- | --- | --- |
| `npm.cmd run typecheck` | 0 | TypeScript typecheck clean across entire codebase. |
| `npm.cmd run lint` | 0 | ESLint clean across entire codebase with 0 warnings. |
| `npx.cmd vitest run tests/unit/staff-enrollment.test.ts tests/unit/authorization-matrix.test.ts tests/unit/owner-recovery.test.ts` | 0; 3 files / 45 passed / 0 failed / 0 skipped | Unit tests for staff enrollment, role resolution, re-enrollment role updates, authorization matrix, and owner recovery passed. |
| `npm.cmd run test` (vitest unit suite) | 0; 201 files / 1335 passed / 0 failed / 0 skipped | Complete existing repository unit test suite executed cleanly without regressions. |
| `npx.cmd cross-env ... tsx tests/rc1-02b/verify-02b.ts` | 0; 6 acceptance phases / 22 checks passed | Full ordinary operator journey, two role invitations (Administrator & Staff), real WebAuthn passkey enrollment with Chromium virtual authenticator, logout/login, foreign-site denial, dynamic role update, negative denials, and owner recovery verified against isolated PostgreSQL container. |
| `SELECT count(*) FROM identity_tokens WHERE token_type = 'staff-enrollment' AND used_count >= max_uses;` | 0; 2 rows | Exactly 2 enrollment tokens burned and permanently marked consumed. |
| `SELECT count(*) FROM admin_recovery_codes;` | 0; 30 rows | Exactly 10 hashed recovery codes issued per enrolled identity (Owner, Admin, Staff). |
| `SELECT role, count(*) FROM member_site_roles GROUP BY role;` | 0; 2 roles (`community-manager`, `contributor`) | Scoped grants accurately mapped to canonical roles. |
| `SELECT count(*) FROM security_audit_events;` | 0; 5+ rows | Audit events recorded for staff invitations, enrollments, revocations, and owner recovery. |
| `SELECT count(*) FROM admin_sessions WHERE revoked_at IS NOT NULL;` | 0; 3+ rows | Verified authentic session invalidation upon operator logout and recovery rotation. |
