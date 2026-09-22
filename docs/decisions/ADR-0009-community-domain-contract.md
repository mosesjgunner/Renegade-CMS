# ADR-0009 Community Domain Contract

> COMM-01 update (2026-09-20): `members` is the canonical account-lifecycle record; `member-site-roles` is the canonical, unique site-member community role record and does not grant Payload administrator access. `20260920_100000_comm_01_member_auth_lifecycle.ts` provides the additive schema migration for lifecycle states, WebAuthn token purposes, member/profile/site fields, and the role table. This implementation still needs regenerated Payload types plus unit, virtual-WebAuthn browser, PostgreSQL, HTTP, restart, backup/restore, and aggregate build evidence before release verification.

Status: executable for the COMM-00 member journey; broader boundary verification remains partial
Date: 2026-09-20
Next contract owner: COMM-01

## Decision

The Community domain uses the existing `members` collection as the canonical community person identity. Authentication credentials, `member-sessions`, identity tokens, administrator `users`, roles, and channel addresses remain separate. `profiles` is a deliberate public projection and never an auth-record serialization.

Community ownership is retained by the existing Payload objects:

- `profiles` owns public member projection.
- `forum-sections` and `forums` own spaces for forum navigation.
- `discussions` owns attached discussions and forum threads.
- `discussion-posts` owns comments and replies.
- `relationships` owns block/follow relationship records.
- `community_reactions`, `community_reports`, `moderation_actions`, `community_conversations`, and `community_messages` own their respective durable records.
- Existing notifications, activity events, media attachments, jobs, and audit paths remain shared platform boundaries.

`src/modules/community/policy.ts` is the single service policy evaluator for site tenancy, actor status, visibility, moderation state, block precedence, authentication, and moderator capability. Service reads and writes must resolve through this policy before using `overrideAccess` for controlled persistence.

## Migration and retained data

`src/migrations/20260920_090000_comm_00_community_domain.ts` is the upgrade path. It is idempotent and creates the durable reaction, report, moderation action, conversation, participant, and message tables with member/site foreign keys and lookup indexes. Existing Payload-owned community records are retained; no duplicate User/Member/Person record is introduced. A deployment runs the normal Payload migration command, then verifies the COMM-00 integration journey against the upgraded database.

No destructive consolidation or automatic deletion is part of this pass. Any future import of legacy community rows must map to the canonical member/profile relationship and preserve source IDs in an auditable backfill, with a dry-run and count check before writes.

## Readiness

### Executable and verified

- Magic-link registration, one-time consumption, member session lookup, profile update, and sanitized anonymous profile projection.
- Anonymous public comment visibility, member forum thread/reply, reaction persistence, notification recipient isolation, report/block race behavior, moderator removal and suspension, session revocation, direct messaging participant checks, restart/history persistence.
- Real PostgreSQL integration evidence: `tests/integration/comm-00-community-pass.integration.test.ts` passes all 10 journey steps.
- Policy unit evidence: `tests/unit/comm-00-community-policy.test.ts` passes all 13 cases.

### Implemented but not fully verified in this pass

- Passkey paths, public REST/GraphQL route parity, Payload collection access parity, search indexing leakage controls, realtime transport authorization, attachment authorization, export/backup exclusions, deletion retention workflows, worker restart reconciliation, and browser-level two-member/moderator coverage.
- The integration helper uses real database state and the existing event/realtime boundary, but it is not a substitute for a browser/reconnect proof.
- The full module configuration currently warns at 178 registered collections; production installs should enable only required modules or explicitly accept the collection-count guard.

## Handoff

COMM-01 owns the next contract: browser and HTTP boundary proof for Community, including passkey/login restart, stale sessions, wrong-site access, search and notification leakage, attachment authorization, export/backup behavior, and realtime reconnect authorization. COMM-01 must preserve this member/profile separation and the policy evaluator as the ownership boundary.
