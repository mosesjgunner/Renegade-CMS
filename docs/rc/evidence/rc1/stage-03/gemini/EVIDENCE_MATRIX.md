# Stage 03 — First-run Browser, Identity, Publishing, and Authorization Matrix

## 1. First-Run Browser & Identity

| Area | Requirement | Test Proof | Status |
|---|---|---|---|
| **Production Boot** | Server booted from standalone build on fresh disposable DB with `LOCAL_E2E_TEST_MODE=false` | `tests/rc02/site-build.spec.ts` | **PASS** |
| **Virtual WebAuthn** | Authentic WebAuthn credentials generated via Chromium CDP virtual authenticator | `tests/rc02/site-build.spec.ts`, `tests/rc02/staff-invitation.spec.ts` | **PASS** |
| **Owner First-Run** | Bootstrap token verified, passkey enrolled, recovery codes displayed once, setup locked | `tests/rc02/site-build.spec.ts` | **PASS** |
| **Staff Invitation** | Owner invites staff via `POST /api/admin/staff/invite` with cryptographic invitation token | `tests/rc02/staff-invitation.spec.ts` | **PASS** |
| **Staff Passkey** | Staff redeems token, registers WebAuthn credential, receives recovery credentials | `tests/rc02/staff-invitation.spec.ts` | **PASS** |
| **Recovery Auth** | Recovery code authentication succeeds for owner/staff; replay rejected (400) | `tests/rc02/staff-invitation.spec.ts` | **PASS** |
| **Unprivileged Rejection** | Non-owner/non-admin attempts to invite staff rejected with HTTP 403 | `tests/rc02/staff-invitation.spec.ts` | **PASS** |

---

## 2. Publishing Golden Journey & Document Locking

| Area | Requirement | Test Proof | Status |
|---|---|---|---|
| **Site Settings** | Save and reload site metadata, branding, indexing mode, and canonical origins | `tests/rc02/site-build.spec.ts`, `tests/integration/pub-04-publishing-floor.integration.test.ts` | **PASS** |
| **Document Locking** | Acquire lock on edit, conflict rejection for competing editors, heartbeat renewal, clean release | `tests/integration/rc08d-lock-projection.integration.test.ts` | **PASS** |
| **Media Pipeline** | File upload, storage verification, thumbnail variants, asset replacement | `tests/rc02/site-build.spec.ts` | **PASS** |
| **Draft Isolation** | Saved revisions kept strictly isolated from public render and search index | `tests/rc02/site-build.spec.ts`, `tests/integration/pub-04-publishing-floor.integration.test.ts` | **PASS** |
| **Editorial Scheduling** | Schedule target revision, worker lease lock, DST boundary safety, publish on trigger | `tests/integration/flow-03-scheduler-api.integration.test.ts` | **PASS** |
| **Public Render** | Visual quality verification across desktop and mobile viewports, theme applied | `tests/rc02/site-build.spec.ts` | **PASS** |
| **Discovery & Sitemap** | Sitemap index & child sitemaps reflect live state, robots.txt respects indexingMode | `tests/integration/disc-06-discovery-pass-gate.integration.test.ts`, `tests/integration/pub-04-publishing-floor.integration.test.ts` | **PASS** |
| **Redirects** | Custom slug redirects created and resolve with HTTP 301/308 | `tests/rc02/site-build.spec.ts` | **PASS** |
| **Restart Persistence** | Server shutdown and restart refetches published content without data drift | `tests/rc02/site-build.spec.ts` | **PASS** |

---

## 3. Two-Site Actor Matrix & Authorization Boundaries

| Actor | Permitted Operations | Denied Operations | Verification |
|---|---|---|---|
| **Owner** | Full system control across all sites, staff management, settings, billing | Denied foreign tenant access without explicit cross-tenant grant | `tests/unit/authorization-matrix.test.ts` |
| **Admin** | Site management, staff invite, content publishing, catalog, moderation | System-wide owner actions, foreign site mutation | `tests/unit/authorization-matrix.test.ts`, `tests/unit/tenant-isolation.test.ts` |
| **Staff** | Content authoring, draft submission, media asset management | Role elevation, system settings mutation, foreign site editing | `tests/unit/authorization-matrix.test.ts`, `tests/rc02/staff-invitation.spec.ts` |
| **Member** | Authenticated community engagement, cart/checkout, personal profile | Admin routes, editorial tools, private media of other members | `tests/unit/authorization-matrix.test.ts` |
| **Anonymous** | Public page read, public search, cart creation | Admin APIs, member endpoints, draft previews, unpublished assets | `tests/unit/authorization-matrix.test.ts`, `tests/integration/pub-04-publishing-floor.integration.test.ts` |

---

## 4. Module Profiles & Resource Boundaries

- **Lean / Default Profile**: Core CMS, publishing, media, and public routing function with minimum memory footprint.
- **Standard Profile**: Audience, catalog, and standard community enabled with enforced schema boundaries.
- **Enabled-All Profile**: Complete commerce, telecom emulator, AI control plane, and custom integrations verified under strict authorization filters. Every visible control either executes or exposes an approved truthful unavailable state.
