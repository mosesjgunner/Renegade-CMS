# RC1 05A — Upload, Library and Asset Lifecycle

Status: **05A PASS** (2026-10-18, America/Chicago). Bounded subpass receipt, not aggregate RC1 readiness.

## Exact source and isolation

Base commit: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714` / `8df3bd8fd771144129ac4719eef85f3cc9ed7a28`.
Tested tree overlay documented in [tested-tree.json](tested-tree.json).
No commit, push, tag, publication or deployment. Preexisting user edits, databases, media, secrets and historical evidence remain preserved in place.

Runtime: Dedicated disposable PostgreSQL container `rc105a-20261018`, port 5443, database `rc105a_release_acceptance`.
Isolated media directory: `scratch/rc105a-20261018/media`.
`LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, email disabled, no external provider actions. All operator actions authenticated via real signed passkey sessions in `admin_sessions`.

## Actual implementation

- Ingested, listed, filtered, and searched governed media assets across images, documents, audio, and video fixtures.
- Chunked resumable upload session recovery with interrupted connection cleanup and premature finalization protection (409 conflict).
- Negative file type (415 executable rejection) and size limit enforcement.
- Stable asset ID reference preservation across replacement and deletion/tombstone lifecycle semantics.
- Tenant isolation: verified cross-site media access and updates are denied.

## Executed path and persisted assertions

- Ingested PNG image, PDF document, WAV audio, and MP4 video fixtures with metadata extraction.
- Uploaded and attached PDF inline to article; attached hero image to published article.
- Successfully replaced hero asset while preserving referencing content stability.
- Exercised deletion and tombstone policies; verified tombstone retention and search exclusion.
- Verified disk blob, delivery hash, and public HTML persistence across container restart.

## Commands and counts

All commands run against isolated container `rc105a-20261018`:

- Unit tests (`tests/unit/rc1-05a-media-lifecycle.test.ts`): 18 passed / 0 failed / 0 skipped.
- Isolated verification journey: 62 passed / 0 failed / 0 skipped.
- Restart audit check: 5 passed / 0 failed / 0 skipped.
- Total accepted scoped assertions: **85 passed / 0 failed / 0 skipped**.

Artifacts: [journey-checks.json](journey-checks.json), [restart-checks.json](restart-checks.json), [state.json](state.json), [tested-tree.json](tested-tree.json), [media-library-desktop.png](media-library-desktop.png), [article-replaced-hero.png](article-replaced-hero.png).

## Remaining boundaries and handoff

No open blockers within 05A scope. Aggregate RC1 remains NOT READY.
