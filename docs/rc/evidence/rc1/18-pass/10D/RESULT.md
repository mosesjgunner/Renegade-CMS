# RC1 10D — PASS

**2026-10-26: PASS for moderation, reports and community acceptance. Aggregate RC1 remains NOT READY.** All mandatory 10D groups were executed against the final source below. No next subpass was started.

## Exact source and resources

- Base HEAD: `87a9ef6bb35405658ef5dd3fb94f3f95771a799e`; preexisting user edits and previous pass evidence are preserved. Changes remain uncommitted.
- [source-tree.json](source-tree.json): 1,444 source/config/test/script files, tree SHA-256 `3213930391639ae711b52bc73881fbbd1f61644e785ccfa5383d3159ba758e9f`. Final containment check passed. [changed-paths.json](changed-paths.json) records all changed source/test paths with individual hashes. Dependency identity is package-lock.json. Documentation, framework-generated declarations, dependencies, secrets, and disposable test media are explicitly excluded.
- [environment.json](environment.json): Node v24.19.0, Next 16.3.8, Payload 3.90.2, development Turbopack server, all modules enabled. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`. Source execution only; no production image claim.
- Owned PostgreSQL container `rc110d-20261026`, ID `85159987dfc448b155ef9a03475eb35a25bdddd8ae1fabcbcef928fd41936cd6`, label `rc1.scope=10d`, loopback port 5458. PostgreSQL image ID `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929` (`postgres:17.6`). Primary database `rc110d_release_acceptance`; fresh database target `rc110d_fresh_release_acceptance`.
- Web used localhost:39014; the real local SMTP capture sink used 127.0.0.1:3145. Media configuration was `scratch/rc110d/media`; dist output was `.next-rc110d-turbo`. The container is stopped, web/SMTP ports are unbound, and data are retained. Existing environments were preserved.

## Implementation

- Finished moderation queue and canonical action processing:
  - Added `'reinstate'` action to `src/modules/community/moderation-actions.ts`: restores content status to `'visible'`, un-quarantines forum topics and comments, revokes sanctions associated with the target, closes the parent moderation case (`closed`), marks abuse reports `resolved`, and emits `search.rehydrate.v1` events to re-index restored content in search.
  - Repaired transaction handling in `applyModerationAction`: removed reference to non-existent `updated_at` column on `moderation_cases` that previously triggered PostgreSQL transaction aborts, ensuring atomic database persistence.
  - Added deliverability suppression in `src/modules/community/inbox-notifications.ts` for quarantined/deleted content to prevent leaking moderated content via notification outboxes.
  - Enforced member posting suspension in direct and group messaging (`assertMemberCanPost` in `src/modules/community/conversation-composer.ts` returning 403 `MEMBER_POSTING_SUSPENDED`).
- API route hardening and multi-tenant security:
  - `/api/community/reports`: Scoped to `publicSiteForHost`, added `samePublicOrigin` origin verification, CSRF validation (`x-member-csrf`), and strictly bound reporter identity to the authenticated session actor (preventing reporter impersonation).
  - `/api/community/moderation`: Scoped to `publicSiteForHost`, added `samePublicOrigin`, CSRF verification, defaulted `scopeId` to `targetId` for object-scoped actions, and returned canonical `actionId` alongside mutation payload.
  - `/api/community/moderation-sites`: Permitted both site staff and site-scoped member moderators (`isModerator || isStaff`).
  - `/api/community/moderation/appeals`: Scoped to `publicSiteForHost`, added `samePublicOrigin`, CSRF verification, and site validation.
- User and Operator Interfaces:
  - Created `/moderation` frontend route (`src/app/(frontend)/moderation/page.tsx`) serving `CommunityModerationCenter.tsx` to member moderators with member cookies, distinct from Payload's passkey-enforced `/admin` catch-all.
  - Added `csrfHeader()` (`x-member-csrf`), `credentials: 'same-origin'`, and the Reinstate action option to `CommunityModerationCenter.tsx`.

## Ordinary UI / supported operator proof

[trace.json](trace.json), [state.json](state.json), [moderation-console.png](moderation-console.png), [audit-trail.png](audit-trail.png): **35 named checks passed, 0 failed, 0 skipped; exit 0.** Successful run marker `mvpyn2pn`.

1. Four independent browser contexts (Alice author, Bob reporter, Charlie Alpha moderator, Dan Beta moderator) enrolled through ordinary email UI, loopback SMTP delivery (port 3145), and verification links. No fixture auth bypass.
2. Charlie granted moderator role for Site Alpha in `member-site-roles`; Dan granted moderator role for Site Beta only.
3. Alice published a comment on an article discussion thread on Site Alpha.
4. Negative tests for unauthorized access:
   - Regular member Bob denied moderation queue access with HTTP 403.
   - Cross-site staff overreach prevented: Beta moderator Dan denied Site Alpha queue with HTTP 403.
   - Cross-site report submission rejected with HTTP 404 (site mismatch).
   - Reporter impersonation rejected: submission with forged `reporterMemberId` ignored; database bound report strictly to Bob's authenticated member ID.
5. Bob submitted an abuse report (`reason: harassment`), creating an open parent case in `moderation_cases`.
6. Charlie navigated to `/moderation` console in Chromium:
   - Observed pending community report card in the triage queue ([moderation-console.png](moderation-console.png)).
   - Inspected immutable target snapshot evidence in decision panel (original comment text and author).
   - Selected action "Remove Content" with recorded justification "Violates community policy".
   - Executed action via console UI ([audit-trail.png](audit-trail.png)).
7. Actual persisted state verification:
   - `comments.status` updated to `'deleted'` (tombstone).
   - Parent case in `moderation_cases` closed with Charlie's `member_id` and `'remove'` disposition.
   - Community report in `community_reports` marked `'resolved'`.
   - Canonical audit record inserted into `moderation_audit_events` with trigger-verified cryptographic SHA-256 chain integrity.
8. Negative test for hidden-content disclosure:
   - Deleted comment body suppressed from both public visitor and authenticated member thread views (replaced by tombstone/suppressed).
9. Supported operator reinstatement journey:
   - Charlie executed `'reinstate'` action via supported operator endpoint.
   - Persisted state verified: comment status restored to `'visible'`.
   - Audit chain integrity remained valid and cryptographically linked.
10. Server restart durability:
    - Next.js development server cleanly stopped and restarted on port 39014.
    - Charlie re-accessed `/moderation` queue; actions and audit records persisted intact across restart.
    - Role boundaries persisted across server restart: non-moderators (Bob) strictly denied with HTTP 403.

## Automated commands and counts

[commands.json](commands.json) records exact argument arrays, exits, and log paths.

| Command | Exit | Accepted outcome |
| --- | --- | --- |
| `npx.cmd vitest run tests/unit/rc1-10d-moderation-lifecycle.test.ts ...` | 0 | 5 test files, **28 passed / 0 failed / 0 skipped** |
| `npx.cmd vitest run tests/unit/comm-03-comments-lifecycle.test.ts ...` | 0 | 4 test files, **50 passed / 0 failed / 0 skipped** |
| `npx.cmd eslint <scoped 10D paths> --max-warnings=0` | 0 | No errors / no warnings |
| `npm.cmd run typecheck` | 0 | Repository typecheck clean (0 errors) |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-10d/run.ps1 -Action browser` | 0 | **35 passed / 0 failed / 0 skipped** ([trace.json](trace.json)) |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-10d/run.ps1 -Action fresh-final` | 0 | **127 migrations** passed cleanly in guarded disposable database |
| `node --import tsx tests/rc1-10d/provenance.ts --check` | 0 | 1,444-file source containment PASS; SHA-256 `3213930391639ae711b52bc73881fbbd1f61644e785ccfa5383d3159ba758e9f` |
| `git diff --check` | 0 | No whitespace errors |

## Negatives and error cases

- Negative test: Regular member Bob denied moderation queue access with HTTP 403.
- Negative test: Staff overreach prevented; Beta moderator Dan denied Site Alpha queue with HTTP 403.
- Negative test: Cross-site report submission rejected with HTTP 404 (site mismatch).
- Negative test: Reporter impersonation rejected; report binds strictly to authenticated session actor.
- Negative test: Deleted comment content is suppressed from member and public visibility.
- Negative test: Non-moderator denied moderation actions after server restart with HTTP 403.
- Error handling: Invalid moderation scope returns HTTP 422; cross-site origin returns HTTP 403; missing CSRF returns HTTP 403.

## Aggregate RC1 status

**Aggregate RC1 status remains NOT READY.** Subpass 10D is self-contained and PASS. Outstanding passes and earlier known non-community blockers (such as social studio client crypto dependencies and remaining phases) remain unexecuted.
