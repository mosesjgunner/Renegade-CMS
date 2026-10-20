# RC1 subpass 03B — PASS

Date: 2026-10-18 (America/Chicago). Subpass 03B passed all mandatory acceptance requirements. Only 03B was executed; do not execute 03C automatically.

## Source and isolation

- **Base commit (HEAD):** `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`
- **Overlay manifests:**
  - Initial 03B overlay: [tested-tree.json](tested-tree.json) (`102` files, SHA-256: `ccbe4eae149b06e2c7e1cf5f7de96d311a85266b1a1321a7c2c86cbe6c869a08`)
  - Current checkout overlay: [current-tree.json](current-tree.json) (`159` files, SHA-256: `f906cd49e82cab209b6f3ca2ad8d0badc55937b757b654d79c7e9f2cf93b5a47`)
- **Isolation:** Disposable PostgreSQL 17.6 container `rc103b-20261018-review` on loopback port 5435, database `rc103b_release_acceptance`.
- **Media directory:** `scratch/rc103b-20261018/media`
- **Application URL:** `https://admin.rc103b.test:38905`
- **Flags:** `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, `SEED_ON_INIT=false`, `EMAIL_MODE=disabled`, `PROXY_MODE=trusted`.
- **Cleanup status:** Database container `rc103b-20261018-review` stopped and preserved for inspection.

## Implementation

1. **Lexical Rich-Text Editing & Rendering (`src/modules/editorial/RichText.tsx`):**
   - Extended `SafeRichText` component with full support for standard elements (`heading` h1-h6, `paragraph`, `quote`, `list` ordered/bullet/checklist, `horizontalrule`, `link`) and inline styles (bold, italic, strikethrough, underline, inline code).
   - Added support for `upload` nodes (rendering images with altText, dimensions, and captions) and `relationship` nodes (cross-referencing media assets and content).
   - Added support for custom `block` nodes (such as callouts, media embeds, and custom components) with safe fallback rendering.
   - Preserves semantic HTML and strict XSS hygiene without leaking unsafe HTML or unvetted scripts.

2. **Preview Token Hashing & Resolution (`src/modules/editorial/persistence.ts`):**
   - Exported `hashPreviewToken` function generating deterministic `sha256:<hex_digest>` hashes matching the storage schema of `PreviewTokens`.
   - Verified `createEditorialPreviewToken` and `resolveEditorialPreviewToken` with expiration checks, creator-session validation, and device viewport adaptations (`desktop`, `mobile`, `tablet`).

3. **Public Discovery and Non-Indexing Contract (`src/modules/public/discovery.ts`):**
   - Verified that unpublished and draft content is strictly non-indexable (`indexable: false`, `reason: 'draft'`).
   - Directed `robotsDirectives` to enforce `{ index: false, follow: false }` headers and meta tags on all draft and preview presentations.
   - Enforced that public readers (`loadPublishedArticleByPath`, `canRenderPublic`, `canDiscoverPublic`) reject draft articles with an error.

4. **Document Locking & Concurrency Protection (`payload-locked-documents` & `checkDocumentLockStatus`):**
   - Integrated Payload 3.x document locking (`getIsLocked`, `checkDocumentLockStatus`) ensuring active editor sessions hold exclusive write locks.
   - Concurrently conflicting editor updates receive clear `Locked` feedback while preserving PostgreSQL table contents without corruption.
   - Document locks are automatically cleared upon successful update completion.

## UI/Operator Proof

### 1. Ordinary Content Creation & Save/Reload Persistence
- Seeded Site Alpha (`site-alpha`), Site Beta (`site-beta`), Publications, Authors (`Jane Author`, `Mark Columnist`), and Media Assets in isolated PostgreSQL 17.6.
- Created two draft articles and one page with rich formatting, lists, quotes, links, and media relationships:
  - Article 1: `Alpha Investigative Field Report` (`id=2ba4db75-e227-4a62-a871-6644ba18ca52`)
  - Article 2: `Alpha Economic Outlook` (`id=38c56faa-ff7c-4ced-9de6-d0449dd0abc7`)
  - Page 1: `About Alpha Investigation Team` (`id=f3419a64-0081-479c-a522-5f940ca85815`)
- Reloaded all three documents from PostgreSQL; verified title, draft status, author metadata, and body AST integrity.
- Verified automatic creation of `article-family-content` companion record (`id=c265a6ab-339c-44b6-a701-cc41b68cf691`, `currentRevisionSequence=1`) and initial `revision-records` record (`sequence=1`, `reason='created'`, `rev1Id=64fc0be8-109e-4736-beaf-d335b9222b34`).

### 2. Draft Editing & Revision History Advancement
- Edited Article 1 to simulate autosave/draft updates.
- Verified revision sequence automatically advanced to `2` (`reason='edited'`, `parentRevision=rev1.id`, `rev2Id=694ace4b-8efb-49c2-a290-3739c4c14d10`).
- Content updates persisted accurately in PostgreSQL.

### 3. Historical Revision Restore
- Executed `restoreEditorialRevision` to restore historical Revision 1.
- Verified revision sequence advanced to `3` in an append-only audit trail (`reason='restored'`, `restoredFromRevision=rev1.id`).
- Verified that `content.body` in PostgreSQL reverted to Revision 1 content, cleanly omitting Edit 2 additions while preserving the original heading and structure.

### 4. Unpublished Preview & Search Engine No-Index Enforcement
- Generated raw preview token for Revision 3.
- Resolved preview presentation with owner session:
  - Verified `presentation.preview === true`
  - Extracted Table of Contents from headings (`Executive Summary and Primary Findings`)
  - Verified author metadata resolved to `Jane Author`
- Tested public reader access: `loadPublishedArticleByPath` threw error, and `canRenderPublic`/`canDiscoverPublic` evaluated to `false`.
- Tested discovery document generation: `discovery.indexability.indexable === false`, `discovery.indexability.reason === 'draft'`, and `robotsDirectives === { index: false, follow: false }`.

### 5. Negative Preview Cases (Expired, Foreign User, Tampered)
- **Expired Token:** Created token with timestamp in the past; resolution was rejected with `Token expired` error.
- **Foreign User Session:** Attempted resolution using Staff Beta session (foreign operator from another site); rejected with `Unauthorized creator session` error.
- **Tampered Token:** Attempted resolution with invalid hex token; rejected with `Token not found` error.

### 6. Negative Edit Cases (Unauthorized & Cross-Site)
- Recorded PostgreSQL rowset snapshot before attack attempts: `SELECT id, site_id, title FROM content ORDER BY id`.
- **Foreign Staff Edit:** Staff Beta attempted to mutate Site Alpha article -> Blocked by `tenantUpdateAccess`.
- **Anonymous Edit:** Anonymous request attempted to mutate Article 1 -> Blocked at access layer.
- **Subscriber Member Edit:** Non-staff subscriber member attempted to mutate Article 1 -> Blocked at access layer.
- **Database Unchanged Assertion:** Executed post-attack SQL snapshot and compared against baseline; 100% identical.

### 7. Document Locking & Simultaneous Editor Sessions
- Owner acquired editing lock on Article 1 (`payload-locked-documents`, `lockId=65c0ff58-b552-46db-bb14-49038d9d599f`).
- Verified lock status: `isLocked === false` for active owner; `isLocked === true` for concurrent Staff Alpha.
- Staff Alpha attempted concurrent update with `checkDocumentLockStatus({ overrideLock: false })` -> Threw `Document is locked` error.
- Verified PostgreSQL content row remained unchanged during the locked conflict.
- Owner released lock.
- Staff Alpha acquired lock and executed approved update (`Alpha Field Report - Staff Approved Note`).
- Verified document lock automatically cleared upon update completion.

### 8. Container Restart Persistence Verification
- Restarted isolated PostgreSQL 17.6 container (`docker restart rc103b-20261018-review`).
- Executed `run-isolated.ps1 restart-check` in a new Node process.
- Reloaded Sites, Authors, Articles, Page, Article Family Companion, and all 3 Revision Records.
- Verified 100% data integrity and relationship consistency across full container restart.

## Scoped Acceptance Matrix

| Check / Requirement | Status | Observed Proof |
| --- | --- | --- |
| **Lexical Rich-Text Editing** | **PASS** | Headings, paragraphs, inline styles, quotes, lists, links, media relationships verified in database and SafeRichText. |
| **Author Metadata** | **PASS** | Multi-author displayOrder and roles (`Lead Reporter`, `Economics Editor`) populated and persisted. |
| **Autosave / Draft Persistence** | **PASS** | Draft mutations advance revision sequence to 2 (`reason='edited'`). |
| **Revision Restore** | **PASS** | Historical revision restored to sequence 3 (`reason='restored'`), body reverted to Rev 1 state in DB. |
| **Preview Authorization** | **PASS** | Only creator session can resolve preview token; expired, foreign, and tampered tokens rejected. |
| **Private Content No-Index** | **PASS** | `canRenderPublic: false`, `canDiscoverPublic: false`, `robotsDirectives: { index: false, follow: false }`. |
| **Document Locking & Conflicts** | **PASS** | Concurrent edit blocked with `Locked` error; PostgreSQL unchanged during collision; auto-cleared on save. |
| **Denied Roles & Cross-Site Edits** | **PASS** | Foreign staff, anonymous, and subscriber member edits blocked; DB snapshot unchanged. |
| **Restart Persistence** | **PASS** | Container restarted; all documents, companions, and revision records reloaded intact. |

## Automated Verification Commands & Counts

```powershell
# 1. Fresh Migration on Isolated Container (120 migrations applied cleanly)
powershell.exe -ExecutionPolicy Bypass -File tests/rc1-03b/run-isolated.ps1 migrate
# Exit: 0

# 2. End-to-End Acceptance Verification (All 10 phases passed)
powershell.exe -ExecutionPolicy Bypass -File tests/rc1-03b/run-isolated.ps1 verify
# Exit: 0

# 3. Persistence Across Full Container Restart
powershell.exe -ExecutionPolicy Bypass -File tests/rc1-03b/run-isolated.ps1 restart-check
# Exit: 0

# 4. Scoped Typecheck & ESLint
npx.cmd eslint src/modules/editorial/RichText.tsx src/modules/editorial/persistence.ts tests/unit/rich-editor-draft-preview.test.tsx tests/rc1-03b/verify-rich-editor.ts tests/rc1-03b/verify-restart.ts
# Exit: 0 (0 errors, 0 warnings)
# Whole-repo typecheck: 0 errors in scoped files; only 6 TS errors in independent tests/rc1-03d/verify-import-and-build.ts

# 5. Focused Vitest Suites (28 passed across 5 test files)
npx.cmd vitest run tests/unit/rich-editor-draft-preview.test.tsx tests/unit/rc02-content-preview.test.ts tests/unit/rc02-published-revision.test.ts tests/unit/rc08d-lock-projection.test.ts tests/unit/editorial-workflow.test.ts
# Exit: 0 (28 passed, 0 failed, 0 skipped)
```
