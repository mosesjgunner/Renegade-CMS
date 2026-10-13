# Stage 03 — First-run Browser, Identity, Publishing, and Authorization Matrix

## 1. First-Run Browser & Identity Acceptance

| Area                       | Requirement                                                                                  | Test Proof                                                             | Status   |
| -------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| **Production Boot**        | Server booted from standalone build on fresh disposable DB with `LOCAL_E2E_TEST_MODE=false`  | `tests/rc02/site-build.spec.ts`                                        | **PASS** |
| **Virtual WebAuthn**       | Authentic WebAuthn credentials generated via Chromium CDP virtual authenticator              | `tests/rc02/site-build.spec.ts`, `tests/rc02/staff-invitation.spec.ts` | **PASS** |
| **Owner First-Run**        | Bootstrap token verified, passkey enrolled, recovery codes displayed once, setup completed   | `tests/rc02/site-build.spec.ts`                                        | **PASS** |
| **Staff Invitation**       | Owner invites staff via Security UI with cryptographic invitation token                      | `tests/rc02/staff-invitation.spec.ts`                                  | **PASS** |
| **Staff Passkey**          | Staff redeems token, registers WebAuthn credential, receives recovery credentials            | `tests/rc02/staff-invitation.spec.ts`                                  | **PASS** |
| **Administrator Flow**     | Administrator invited to specific site, enrolls passkey, dashboard access verified           | `tests/rc02/staff-invitation.spec.ts`                                  | **PASS** |
| **Recovery Auth & Replay** | Recovery code authentication succeeds for staff/owner; code replay rejected (HTTP 400)       | `tests/rc02/staff-invitation.spec.ts`                                  | **PASS** |
| **Identity Negatives**     | Expired invitation token (410/400) and wrong origin/corrupted WebAuthn credential (HTTP 400) | `tests/rc02/staff-invitation.spec.ts`                                  | **PASS** |
| **Session Revocation**     | Logout invalidates session cookie; unauthenticated redirect to `/login` enforced             | `tests/rc02/staff-invitation.spec.ts`                                  | **PASS** |
| **Offline Owner Recovery** | CLI `recover-installation.ts` rotates owner recovery codes and revokes all active sessions   | `tests/rc02/staff-invitation.spec.ts`                                  | **PASS** |
| **Unprivileged Rejection** | Non-owner/non-admin attempts to invite staff rejected with HTTP 403                          | `tests/rc02/staff-invitation.spec.ts`                                  | **PASS** |

---

## 2. Publishing Golden Journey & Real Browser Document Locking

| Area                      | Requirement                                                                                    | Test Proof                                                                                                                           | Status   |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **Site Settings**         | Save and reload site metadata, branding, indexing mode, and canonical origins in browser       | `tests/rc02/site-build.spec.ts`                                                                                                      | **PASS** |
| **Browser Document Lock** | Owner acquires Site Settings lock; concurrent staff session detects active lock; clean release | `tests/rc02/staff-invitation.spec.ts`                                                                                                | **PASS** |
| **Lock Projection**       | Lock acquisition, conflict rejection for competing editors, heartbeat renewal, release API     | `tests/integration/rc08d-lock-projection.integration.test.ts`                                                                        | **PASS** |
| **Media Pipeline**        | File upload, storage verification, thumbnail variants, asset replacement                       | `tests/rc02/site-build.spec.ts`                                                                                                      | **PASS** |
| **Draft Isolation**       | Saved editorial revisions kept strictly isolated from public render and search index           | `tests/rc02/site-build.spec.ts`, `tests/integration/pub-04-publishing-floor.integration.test.ts`                                     | **PASS** |
| **Editorial Publishing**  | Draft submission, review, schedule publishing, worker dispatch, public render                  | `tests/rc02/site-build.spec.ts`, `tests/integration/pub-04-publishing-floor.integration.test.ts`                                     | **PASS** |
| **Public Render**         | Visual quality verification across desktop and mobile viewports, theme applied                 | `tests/rc02/site-build.spec.ts`                                                                                                      | **PASS** |
| **Discovery & Sitemap**   | Sitemap index & child sitemaps reflect live state, robots.txt respects indexingMode            | `tests/integration/disc-06-discovery-pass-gate.integration.test.ts`, `tests/integration/pub-04-publishing-floor.integration.test.ts` | **PASS** |
| **Redirects**             | Custom slug redirects created and resolve with HTTP 301/308                                    | `tests/rc02/site-build.spec.ts`                                                                                                      | **PASS** |
| **Restart Persistence**   | Server shutdown and restart refetches published content without data drift                     | `tests/rc02/site-build.spec.ts`                                                                                                      | **PASS** |

---

## 3. Two-Site Five-Actor Runtime Authorization & Tenant Boundary Matrix

Verified by `tests/integration/tenant-authorization-matrix.integration.test.ts` against real acceptance database with real authenticated Payload sessions:

| Actor         | Permitted Operations (Site A)                                             | Denied Cross-Tenant / Escalation Operations (Site B)                    | Runtime Verification                                                              |
| ------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Owner**     | Global authority: read/mutate resources across all sites (Site A, Site B) | None (Superuser); subject to schema and operational invariants          | `tests/integration/tenant-authorization-matrix.integration.test.ts` (Tests 1-6)   |
| **Admin**     | Site A organizations, merchant connections, settings, content             | ID substitution on Site B organizations & merchant connections rejected | `tests/integration/tenant-authorization-matrix.integration.test.ts` (Tests 7-9)   |
| **Staff**     | Site A drafts, content submissions, media assets                          | ID substitution on Site B draft articles & private media rejected       | `tests/integration/tenant-authorization-matrix.integration.test.ts` (Tests 10-12) |
| **Member**    | Member profile, community, member carts                                   | Operator collections, draft content, merchant configurations rejected   | `tests/integration/tenant-authorization-matrix.integration.test.ts` (Tests 13-14) |
| **Anonymous** | Public rendering, published discovery endpoints, public carts             | Any draft content, private media, administrative API access rejected    | `tests/integration/tenant-authorization-matrix.integration.test.ts` (Tests 15-16) |

Protected state persistence confirmed: denied mutation attempts leave underlying records completely unmodified.

---

## 4. Module Profiles & Resource Boundaries

Verified by `tests/integration/tenant-authorization-matrix.integration.test.ts` (Tests 17-21) and `tests/integration/setup-first-run.integration.test.ts`:

- **Lean / Default Profile**: Core CMS, publishing, media, and public routing function with minimum memory footprint.
- **Standard Profile**: Audience, catalog, and standard community enabled with enforced schema boundaries.
- **Enabled-All Profile**: Complete commerce, telecom emulator, AI control plane, and custom integrations verified under strict authorization filters. Every visible control either executes or exposes an approved truthful unavailable state.
