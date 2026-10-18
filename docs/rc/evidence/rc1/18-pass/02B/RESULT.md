# RC1 subpass 02B result — PASS

Date: 2026-10-17 (America/Chicago). This is a bounded 02B result; RC1 remains NOT READY. The earlier 02B receipt is preserved as [PRIOR_RESULT.md](PRIOR_RESULT.md) for its older source hashes. Its original runner had two material proof gaps: it issued grants at invitation time and checked substituted object IDs without sending a mutation. This receipt supersedes its 02B verdict. The current rerun includes a site-boundary repair to the invitation revocation route.

## Exact source and isolation

- Base HEAD: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`, plus the 60-entry dirty checkout [tested-tree.json](tested-tree.json). No commit was created. The manifest hashes executable edits and preexisting dirty paths, excluding this evidence directory and the cumulative ledger to avoid self-reference.
- 02B implementation changed: `src/modules/operations/staff-enrollment.ts` (`9524E7A1D5EA61653F5A1DC50EE13F010A33A21F0BABFC8AE1186424E71E40B2`) and `src/collections/Users.ts` (`123C67D09C58E610D754240D2A7B6B3D22896D64884D1B254FED510C19368412`). Focused tests changed: `tests/unit/staff-enrollment.test.ts` (`0D1C2BFB4D5876C85643ACA83E1C0424E936243B7676D174238FEA1E55BAF800`) and `tests/rc1-02b/verify-02b.ts` (`AFB0E2E693E97A1AB684F2829E14563961785E3939B70297F06AF95F4683B38C`). The preexisting invitation route and security UI are included in the manifest.
- Current repair: `src/app/(frontend)/api/admin/staff/invite/route.ts` now checks resolved owner grants before DELETE, limits token revocation to the owner's sites, and reserves broad user/email revocation for global owners. `tests/unit/staff-invite-route.test.ts` proves a foreign token and broad revocation are denied without calling the mutation. Their exact hashes are in the current manifest.
- Dedicated disposable `postgres:17.6-alpine` container `rc102b-20261017-reverify`, database `rc102b_release_acceptance`, loopback port 5433; 116 migrations. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`; no remote provider. The runner refuses other database names/hosts/ports without its explicit disposable flag. Media was directed to a new scratch directory. No preexisting database, media, Compose project, or secret was changed. Container removed after verification. No image build was part of 02B.

## Implementation and observed operator path

- Creating an invitation now creates canonical user/member identity and a bounded pending token **without granting a site role**. The Users hook also skips its automatic one-site grant for pending invitations. A role is created or updated only after verified WebAuthn redemption. The default lifetime is seven days; nonpositive or greater than seven-day lifetimes are rejected. Token identity email and role are checked at redemption; a previously existing member account receives its operator role on successful redemption.
- The owner invitation route issued administrator and staff invitations for Site A. Before redemption, neither identity had an operator grant. Chromium's CTAP2 virtual authenticator created genuine resident passkeys on an HTTPS origin; the enrollment API consumed each token once and returned ten recovery codes per user. The passkey options and completion routes then issued persisted login sessions for both identities. Both logged out; the session rows were revoked.
- After login, the administrator and staff were allowed Site A and denied Site B. Staff created a Site A `content-releases` record through access-checked Payload operations; both identities received 403 from the owner-only invitation route. The owner changed and removed the staff site grant through access-checked Payload operations; resolution changed immediately, and a subsequent staff write was denied.
- A newly logged-in administrator sent a `cancel` action to the real release action route with Site B's release ID. It returned 403; full before/after release documents matched. Expired and reused tokens returned 410, a wrong-site token returned 400, and a revoked invitation returned 410. The added focused route test returned 403 for a foreign-site revocation and left the revocation service uncalled. Owner recovery rotated ten codes, revoked the owner session, and wrote the owner recovery audit event. No external message was sent.
- These were in-process calls to the actual Next route handlers and access-checked Payload local API against PostgreSQL, with WebAuthn cryptography performed in Chromium. A deployed HTTP/UI journey was not run in this subpass; this PASS is for the supported operator/API path specified by 02B, not deployment or full browser acceptance.

## Commands and counts

| Check | Exit | Passed / failed / skipped / unexecuted |
| --- | ---: | --- |
| `npm.cmd run test:migrations:fresh` on the named disposable DB | 0 | 116 migrations; 0 failed; wider migration gates unexecuted |
| `npx.cmd vitest run tests/unit/staff-invite-route.test.ts tests/unit/staff-enrollment.test.ts tests/unit/authorization-matrix.test.ts tests/unit/owner-recovery.test.ts` | 0 | 49 passed / 0 failed / 0 skipped / 0 unexecuted in scope |
| `npm.cmd run typecheck` | 0 | TypeScript clean; 0 errors |
| `npx.cmd eslint 'src/app/(frontend)/api/admin/staff/invite/route.ts' tests/unit/staff-invite-route.test.ts --max-warnings=0` | 0 | 0 errors / 0 warnings; prior focused source lint retained only for unchanged paths |
| `npx.cmd tsx tests/rc1-02b/verify-02b.ts` with the disposable DB environment and explicit guard | 0 | 6 journey phases passed / 0 failed / 0 skipped; individual assertions are in the runner |
| `docker restart rc102b-20261017-reverify` then read-only `psql` counts | 0 | 116 migrations, 3 passkeys, 1 live grant after staff revocation, 3 releases, 4 revoked sessions, 30 recovery-code rows persisted |

The current rerun had 0 failed phases and 0 skipped phases. The prior `ECONNREFUSED 127.0.0.1:5433` attempt is historical; the fresh named instance passed. Other RC1 gates, full HTTP UI, and remote providers were unexecuted here.
