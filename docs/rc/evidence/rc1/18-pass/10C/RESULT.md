# RC1 10C — PASS

**2026-10-26: PASS for messages, blocks and notifications. Aggregate RC1 remains NOT READY.** All mandatory 10C groups were executed against the final source below. No next subpass was started.

## Exact source and resources

- Base HEAD: `87a9ef6bb35405658ef5dd3fb94f3f95771a799e`; preexisting user edits and previous pass evidence are preserved. Changes remain uncommitted.
- [source-tree.json](source-tree.json): 1,439 source/config/test/script files, tree SHA-256 `dfe6e3098fce6d97f0427a60abe67bef3f914ca63da77faabcad631ace6486c6`. Final containment check passed. [changed-paths.json](changed-paths.json) records all 51 changed source/test paths with individual hashes (including the 13 modified/added files in 10C). Dependency identity is package-lock.json. Documentation, framework-generated declarations, dependencies, secrets, and disposable test media are explicitly excluded.
- [environment.json](environment.json): Node v24.19.0, Next 16.3.8, Payload 3.90.2, development Turbopack server, all modules enabled. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`. Source execution only; no production image claim.
- Owned PostgreSQL container `rc110c-20261026`, ID `2ec955505671734bdbe09db0afde85319960f53f9ff4f7caccb1d138fda42dbe`, label `rc1.scope=10c`, loopback port 5457. PostgreSQL image ID `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929` (`postgres:17.6`). Primary database `rc110c_release_acceptance`; fresh database target `rc110c_fresh_release_acceptance`.
- Web used localhost:39013; the real local SMTP capture sink used 127.0.0.1:3144. Media configuration was `scratch/rc110c/media`; dist output was `.next-rc110c-turbo`. The container is stopped, web/SMTP ports are unbound, and data are retained. Existing environments were preserved.

## Implementation

- Finished direct and group messaging wiring: direct conversations initialize in `pending_request` state for non-mutual contacts, requiring recipient acceptance via `POST /api/community/message-requests` before replies can be sent. The `/messages` UI surfaces incoming message request banners with explicit Accept/Decline action buttons.
- Strengthened community and v1 notification APIs: added canonical `publicSiteForHost`, CSRF validation, and `samePublicOrigin` security verification to `/api/community/message-requests`, `/api/community/notifications`, `/api/v1/notifications`, `/api/v1/notifications/stream`, `/api/v1/notifications/[id]/read`, and `/api/v1/notifications/mark-all-read`.
- Enforced bidirectional member blocking: `checkBlockBetween` checks both outbound and inbound block relationships. Blocking immediately denies conversation initiation (403 `BLOCKED_COMMUNICATION`), blocks message sending in existing conversations in both directions (403 `BLOCKED_COMMUNICATION`), and completely suppresses inbox and email notification generation for the blocking party.
- Private media and attachment security: enforced canonical local driver 503 (`ATTACHMENT_STORAGE_UNAVAILABLE`), public attachment presign route 410 (`deferred`), maximum 10MB file limit, and quarantine checks. The `/messages` UI renders a truthful security notice informing users that private attachments are deferred until scanner/store is configured and that conversations are private but not end-to-end encrypted (no E2EE promised).
- Multi-tenant isolation and security invariants: rejected anonymous access to private messaging and notifications (401), cross-site host access attempts (404 `Site access denied.`), non-member conversation read/write attempts (403 `NOT_CONVERSATION_MEMBER`), and object-ID substitutions.
- Zero search projection leakage: conversations, private messages, attachments, and inbox notifications are excluded from `search_documents` and discovery queries. Public search returns 0 hits for private communications.
- Realtime and reconnect durability: conversation messages allocate transactional incrementing sequence numbers with idempotent retry deduplication; notification stream manager sequentially tracks and delivers missed hints upon reconnect via `Last-Event-ID`.

## Ordinary UI / supported operator proof

[trace.json](trace.json), [state.json](state.json), [messages.png](messages.png), [notifications.png](notifications.png): **35 named checks passed, 0 failed, 0 skipped; exit 0.** Successful run marker `mvpw0738`.

1. Three independent browser contexts (Alice, Bob, Charlie) enrolled through the ordinary email UI, actual loopback SMTP message delivery (port 3144), and consumed verification links. No bypass or fixture auth used for members.
2. Verified truthful UI notice on `/messages`: attachments explicitly marked deferred and no E2EE promised.
3. Alice initiated a direct conversation with Bob via supported API, creating sequence 1 message with an idempotency key.
4. Idempotent retry returned the existing message without sequence increment.
5. Bob loaded `/messages` UI in browser, observed Alice's message and request banner, and accepted the message request (`requestState: active`).
6. Bob sent message 2 with sequence 2; Alice observed message 2 in the browser UI ([messages.png](messages.png)).
7. Bob observed unread notification counter increment, navigated to `/notifications` UI in browser, and viewed notification list ([notifications.png](notifications.png)).
8. Bob blocked Alice via `POST /api/community/blocks`; verified `relationships` API confirms `blocked: true`.
9. Subsequent message attempt from Alice to Bob returned 403 `BLOCKED_COMMUNICATION`.
10. Subsequent message attempt from Bob to Alice returned 403 `BLOCKED_COMMUNICATION`.
11. New direct conversation initiation attempt between blocked members returned 403 `BLOCKED_COMMUNICATION`.
12. Alice created group conversation "Alpha Crew" with Bob and Charlie; verified system join notices.
13. Attachment presign `POST /api/v1/attachments/presign` returned HTTP 410 deferred.
14. Anonymous access to private messages, conversations, and notifications returned HTTP 401.
15. Cross-site request on foreign host returned HTTP 404 `Site access denied.`
16. Non-member conversation read attempt returned HTTP 403 `NOT_CONVERSATION_MEMBER`.
17. Public `/search` projection verified 0 hits for private messages and group conversation titles.
18. Web process cleanly stopped; direct PostgreSQL query while web was down confirmed 2 messages and 1 active block persisted in the database.
19. Web process restarted on localhost:39013; Bob verified 2 persisted conversation messages; Alice's message remained denied with 403 `BLOCKED_COMMUNICATION`; Bob marked all notifications read, resetting unreadCount to 0.
20. Reconnected notification stream with `Last-Event-ID`, verifying sequential delivery of buffered notification hints without event loss.

## Automated commands and counts

[commands.json](commands.json) records exact argument arrays, exits, and log paths.

| Command | Exit | Accepted outcome |
| --- | --- | --- |
| `npm.cmd test` | 0 | 248 test files, **1,738 passed / 0 failed / 0 skipped** ([unit.log](unit.log)) |
| `npx.cmd eslint <scoped 10C source and test paths> --max-warnings=0` | 0 | No errors / no warnings ([lint.log](lint.log)) |
| `npm.cmd run typecheck` | 0 | Repository typecheck clean ([typecheck.log](typecheck.log)) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-10c/run.ps1 browser` | 0 | **35 passed / 0 failed / 0 skipped** ([trace.json](trace.json)) |
| `npm.cmd run test:migrations:fresh` | 0 | **127 migrations** passed cleanly in guarded disposable database |
| `node --import tsx tests/rc1-10c/provenance.ts --check` | 0 | 1,439-file source containment PASS; SHA-256 `dfe6e3098fce6d97f0427a60abe67bef3f914ca63da77faabcad631ace6486c6` |
| `git diff --check` | 0 | No whitespace errors |

Mandatory 10C groups: **all executed, 0 failed, 0 unexecuted**.

## Retained failures and boundaries

- Preserves all preexisting 10B, 10A, 09D, and prior pass evidence; historical receipts and attempt directories remain untouched.
- Virtual CTAP2 / local SMTP loopback was used for email verification; no live remote email delivery, remote push notification gateway, or production application container image acceptance is claimed.
- Aggregate RC1 remains NOT READY pending completion of all subsequent subpasses.

**First remaining 10C blocker: none.** The next assigned subpass may start after this handoff; execution stops here.
