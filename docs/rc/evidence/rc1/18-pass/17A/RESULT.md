# RC1 17A - adversarial identity, role and tenant security

**Verdict: PASS 17A (2026-11-02).** Aggregate RC1 remains NOT READY. Only 17A is assigned; no later subpass is executed.

## Source and isolation

Base commit: `c322d2eecd02c1352a6a01c43e7f9057aac83aac`. The initial checkout was clean. Tested executable source is the complete dirty-tree manifest in `source-tree.json`; it includes dependencies by `package-lock.json`, the verifier, configuration and all tracked/eligible untracked source. This is development-source acceptance, not an application-image or production deployment receipt.

The runner uses test authentication/routes disabled, local storage, localhost WebAuthn RP/origin, local SMTP only, and a dedicated Next output directory. The final acceptance database is `rc117a_verified_release_acceptance`, PostgreSQL 17.11, in the newly created loopback-only container `rc117a-20261102` (port 5467). Its media root is `scratch/rc117a-verified/media`. Four investigation databases and their media are retained separately; exact names are in `resources.json`. The fresh-migration script was inspected before execution: it drops only the explicitly selected disposable database's public schema. No retained user environment was migrated, reset or stopped.

Local SMTP is the newly created `rc117a-mail-20261102` container, with SMTP/API on loopback 39171/39172. All recipients are synthetic `.test` identities. The hostile browser origin uses loopback 39173; the application uses `http://localhost:39170`. Secrets, cookies, recovery codes, challenges and private authenticator material stay outside evidence under ignored scratch paths. No external message, live provider call, charge, payout, real order, external post, git push/tag, deployment or external publication was performed.

## Implementation

- `src/collections/Users.ts`: native account reads use canonical member/site scope. Global identity creation, role changes and deletion require global owner authority; a scoped owner cannot change a shared account across tenants.
- `src/collections/Sites.ts`: native operational site/settings enumeration and deletion are scoped to persisted grants; provisioning another tenant requires global owner authority. Public server projections retain their explicit public reads.
- `src/collections/Identity.ts`: publication reads deny private/draft records to anonymous clients, preserve active public output, and scope operators to their own tenants. Membership-grant creation, changes and deletion require owner authority over the persisted site. A caller cannot grant themselves a foreign tenant or move a grant across tenants.
- `src/modules/operations/operator-grants.ts`: a linked owner with no remaining grants is denied. Revocation no longer promotes that owner through the legacy installation fallback.
- `tests/unit/rc1-17a-user-scope.test.ts`: 13 new regressions for directory isolation, scoped/global authority, grant substitution, final-grant revocation and private publication reads. Existing authentication, tenant, staff enrollment and negative suites remain intact.
- `tests/rc1-17a/`: guarded PowerShell runner, real browser/operator journey, focused type configuration and source provenance verifier. No schema changes or migrations are required for these policy repairs.

## Reproduced defects and repair evidence

At the base policy, a genuine site-A staff session read a site-B operator through `GET /api/users/:id?depth=0`: HTTP 200 exposed the foreign email/member relation. `identity-read-before.json` records the exact substituted object path and observed exposure without credential material. The new policy regressions initially had 3 failures/5 passes. After the first repair, the runtime identity read was denied, but unrestricted native Sites reads remained; their owning policy was repaired as well. A separate final-grant regression initially had 1 failure/10 passes, proving the scoped-owner promotion defect before its repair.

Exploratory browser attempts also exposed verifier defects: transpiler function-name serialization, a hydration/navigation race, checksum-prefix and token-digest mismatches, stale counters when restoring a virtual authenticator between attempts, and an HTTP preconnect socket that held cleanup open. These were repaired in the harness. They are not accepted application success receipts. The final confirmation run begins with an empty database and newly generated authenticators; no successful session is manufactured or imported for admission.

## Executed ordinary paths and persistence

The final journey uses Chromium's virtual CTAP2 authenticator for actual WebAuthn ceremonies. Supported bootstrap options/complete create the owner/site/session. Owner REST creates a second site and issues a site-A staff invitation; the staff enrollment UI registers its passkey, and the supported login API verifies a browser-signed assertion and persists its session. Member admission requests a normal magic link, receives it in the independent local SMTP inbox, consumes it through the ordinary API, then registers and authenticates a real browser passkey.

Owner REST creates a private draft and uploads actual PDF originals to both tenants. SQL/Payload reads verify persisted site ownership, draft title, checksum, account/session/grant outcomes. An authorized owner downloads exact original PDF bytes with private cache headers. Role changes, revocations and deletion run through supported authenticated endpoints, including removing a scoped owner's final grant, restoring only the original site, revoking staff/member sessions, and deleting the staff user.

`journey.json` records every accepted case, safe request payload/class, exact path/method/status, safe server response, session-count invariance and before/after protected-state SHA-256. The protected-state digest covers complete persisted rows in sites, content, publications, media assets/blobs, profiles, settings, users, membership grants, passkeys and linked identities, plus every original file's bytes. Failed requests must also leave the combined operator/member session count unchanged. Authentication challenge expiry is injected only into this disposable database's challenge deadlines, with a matching-row assertion; no business outcome/status is fabricated. `server.log` supplies redacted server-side request/status and denial logs.

## Mandatory negative classes

- Owner/scoped owner/staff/member/anonymous across two sites: allowed own-scope reads and owner writes; denied foreign identity/site/settings reads/writes, role escalation, invitations, tenant provisioning/deletion and self-granting another site.
- Object substitution: foreign draft reads/writes, caller-supplied authorized site hint with a foreign media ID, private metadata updates, cross-site physical reassignment and private original bytes.
- Operator and member WebAuthn: wrong signed client-data origin, wrong challenge, expired persisted challenge, valid signed login and replay denial. Synthetic registration/recovery codes and local test-auth routes are not used to authenticate.
- CSRF: missing member double-submit token; authenticated API request with hostile Origin; actual cross-origin same-site browser request with a genuine owner cookie. CDP verifies the transmitted Origin/cookie and server 403 independently of the browser's opaque fetch response.
- Revocation: current database role is honored immediately; removing the final scoped-owner grant fails closed; staff's original site grant is removed; all actual member/staff sessions are revoked; replayed previously issued cookies fail; deleted users cannot obtain new challenges.

## Commands, counts and boundaries

Exact commands, exits and counts are recorded in `commands.json`, with focused quality/baseline errors in `quality.log`. The accepted totals and final containment are recorded below. No skipped or unexecuted mandatory scoped checks may be counted as passed.

Workspace-wide `npm.cmd run typecheck` exits 2 on two pre-existing TS2352 casts in `src/scripts/portability.ts:200` and `:216`. The same two errors, and no others, reproduce at clean base `c322d2eecd02c1352a6a01c43e7f9057aac83aac` in isolated read-only worktree `C:/Projects/RENEGADE CMS/rc117a-base-typecheck`; it shares dependencies by a junction and runs no database or application. The 17A scoped typecheck covers the changed collections/policy, their application dependencies and the new verifier/tests. Portability is unchanged and outside this subpass.

No physical authenticator, remote SMTP delivery, production image, arbitrary full-route penetration test or aggregate RC1 acceptance is claimed. Prior receipts remain bound to their historical source; this result does not relabel them.

## Final accepted receipt

Runtime source: 1,608 files, SHA-256 `da8286261c9c28cf1608f330a07aad02ad4ebdad858687f6f7dc92fbefc06560`. Handoff source SHA-256: `edfe7a1d46b632a5767e8026265f6fdb1f810036267837f4fb9e57a21b1a4395`. `containment.json` proves 1,606 identical source files and exactly two generated type-configuration deltas (`next-env.d.ts`, `tsconfig.json`), restored to HEAD after stopping the runtime. All application, policy and verifier files are byte-identical to the executed run. The initial tree was clean; the implementation is uncommitted. No application image was built or claimed; exact installed package/Node and local container identities are in `resources.json`.

| Accepted gate                                             | Exit |            Passed | Failed | Skipped |
| --------------------------------------------------------- | ---: | ----------------: | -----: | ------: |
| Fresh guarded migration verifier (131 applied migrations) |    0 |            1 gate |      0 |       0 |
| Six focused Vitest files                                  |    0 |                91 |      0 |       0 |
| Ordinary Chromium/API/SQL/file journey                    |    0 |                68 |      0 |       0 |
| PostgreSQL + web process restart verifier                 |    0 |                 6 |      0 |       0 |
| Scoped TypeScript                                         |    0 |          0 errors |      0 |       0 |
| Scoped ESLint                                             |    0 | 0 errors/warnings |      0 |       0 |
| Scoped Prettier / git diff whitespace                     |    0 |             clean |      0 |       0 |

**165 accepted assertions passed, 0 failed, 0 skipped; 0 mandatory 17A groups unexecuted.** Migration/quality gates are separate from that assertion total. Diagnostic failing runs are explicitly excluded and recorded in `commands.json`; publication regressions added two further pre-repair failures/eleven passes. `publication-read-before.json` independently records anonymous HTTP 200 for an owner-created private draft before repair. The final run returns 404 for that class and still returns 200 for the public listing containing only active/public records.

Exact entry commands (process environment `RC117A_LANE=verified`; runner sets isolated configuration):

`powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-17a/run-isolated.ps1 migrate`

`powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-17a/run-isolated.ps1 journey`

`docker restart rc117a-20261102`, an actual stop/start of the identified web process, then `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-17a/run-isolated.ps1 restart`.

Focused units: `npx.cmd vitest run tests/unit/rc1-17a-user-scope.test.ts tests/unit/security-negative-matrix.test.ts tests/unit/tenant-isolation.test.ts tests/unit/authorization-matrix.test.ts tests/unit/rc06-auth-attacks.test.ts tests/unit/staff-enrollment.test.ts`.

Scoped types: `npx.cmd tsc --noEmit -p tests/rc1-17a/tsconfig.json`. Exact lint/format commands and their explicit exits are in `commands.json`.

The six restart assertions prove identical persisted protected rows and media-byte hashes, the owner's existing session, denied revoked staff/member cookies, continued CSRF denial and a new genuinely signed owner WebAuthn login. No database status was advanced to simulate any successful business action. Both newly owned containers and the tested web process are stopped, with all databases/media retained; unrelated running containers were left alone.

Scoped blockers: **none**. The two baseline portability TypeScript errors remain workspace/release blockers outside this policy change. Aggregate RC1 remains NOT READY. Full release/production-image, remote-provider and physical-authenticator acceptance remain unexecuted and are not part of this scoped PASS. Stop here; 17B has not been started.

Evidence redaction sweep: zero matches for known disposable secrets, actual retained session/CSRF cookies and bootstrap tokens (redaction.json).
