# RC1 10B — NOT READY

2026-10-26. The required ordinary multi-member discussion journey and its security negatives have not been established. Aggregate RC1 remains NOT READY. No next subpass was executed.

## Source and implementation

Base commit `87a9ef6bb35405658ef5dd3fb94f3f95771a799e`, initially clean. [source-tree.json](source-tree.json) records the exact seven executable changes over that commit (manifest SHA-256 `fb281f3c4fa130984115f48a8efde4b1c1e9d60f00c5751195d517c7c2fb270e`). No application image was built. The changes are uncommitted.

- The comments API uses the public-state contract to reject non-public content. Forum topic and reply POSTs now require the existing member CSRF check.
- Canonical comment and forum reply services reject foreign, removed or moderated parent/quote references before creating a post. The forum view supplies a selected parent on reply, identifies parent links and uses the public author profile.
- Two focused unit files cover reference substitution, CSRF, draft and archived comment denials. No schema change was made.

The public forum view still presents a flat post list with parent links rather than a verified multilevel tree. Its relationship to the separate forum-spaces/topics services, pagination, pin/lock controls, moderation and hidden-content discovery needs end-to-end reconciliation. The existing hard limit of 100 in `listDiscussionComments` is not proven pagination. These are not accepted as complete.

## Executed checks

- `npx.cmd vitest run tests/unit/rc1-10b-routes.test.ts tests/unit/rc1-10b-discussion-boundaries.test.ts tests/unit/comm-03-comments-lifecycle.test.ts tests/unit/comm-04a-forum-space-access.test.ts tests/unit/comm-04b-forum-composer.test.ts tests/unit/comm-04c-forum-browsing.test.ts tests/unit/comm-04d-forum-topic-operations.test.ts`: exit 0; **37 passed, 0 failed, 0 skipped**. Mocked route and service tests are not persisted acceptance.
- Scoped `npx.cmd eslint` on the seven changed source/test paths with `--max-warnings=0`: exit 0. `npm.cmd run typecheck`: exit 0 after final UI change. Scoped Prettier check and `git diff --check`: exit 0.
- Dedicated database fresh migration: first attempt exit 1 because `APP_URL` was unset ([migration.log](migration.log)); corrected retry exit 0 ([migration-retry.log](migration-retry.log)); 125 migration records observed.
- `npx.cmd vitest run tests/integration/comm-00-community-pass.integration.test.ts --no-file-parallelism --hookTimeout 120000 --testTimeout 60000`: exit 1; **10 passed, 1 failed, 0 skipped** ([integration.log](integration.log)). Fixture-created member sessions and service calls created an article comment and a forum thread/reply and read them back. The first failed assertion was profile image projection at test line 287: expected approved `/media/<id>`, received `undefined`. That profile test is adjacent to, not proof of, this subpass; it was not weakened. Revalidation also logged a missing Next static-generation store in the test context.
- Actual PostgreSQL restart in this isolated fixture environment preserved discussion counts (`attached|1`, `thread|1`) and three post records ([restart.log](restart.log)). This is count-level database persistence only, not a web restart or an ordinary authenticated reload.

## Unexecuted mandatory proof and first blocker

**First scoped blocker:** no ordinary authenticated member/UI or supported API journey has created and reloaded a multilevel forum conversation on the current source. The view remains a flat list with parent links and has not been verified as a tree. No 10B PASS is claimed.

Seven mandatory acceptance groups remain unexecuted: (1) ordinary published-article comment and nested reply UI/API persistence, (2) multiple-member multilevel forum creation/reload, (3) public forum space/topic and pagination path, (4) closed/locked mutations, (5) unpublished and cross-site/object-ID mutations against a running application, (6) role/edit/delete/pin/moderation and hidden search exclusions, and (7) full application restart and retry/error cases. Mock tests do not close these groups. The fixture integration's 10 successes and one failure are reported separately above.

## Resource containment

Only Docker container `rc110b-20261026`, ID `0c828cd33aa0875cbed2247697c8c3a3dd3b13f3463a9ba0c4f8e9a0d12545da`, label `rc1.scope=10b`, loopback port 5455, dedicated database `rc110b_release_acceptance`, and `scratch/rc110b/media` were allocated for this run. PostgreSQL image ID `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`. The container is stopped with data retained. The destructive migration script was inspected and executed only after verifying that exact container and its label. No existing environment was reset or removed. No WebAuthn/browser, production-image or remote-provider claim is made.
