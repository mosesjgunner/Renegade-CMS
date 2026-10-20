# 03B handoff

Subpass 03B PASS is recorded in `RESULT.md` for the base SHA `bb3c0347d6c648e71f0bf7eac646df70fd1b5714` across both initial 102-file dirty tree manifest (`tested-tree.json`, overlay SHA `ccbe4eae149b06e2c7e1cf5f7de96d311a85266b1a1321a7c2c86cbe6c869a08`) and current 159-file checkout manifest (`current-tree.json`, overlay SHA `f906cd49e82cab209b6f3ca2ad8d0badc55937b757b654d79c7e9f2cf93b5a47`).
Authors can write and revise without content loss or leaking unpublished work:
- Lexical rich-text editing verified for headings, paragraphs, inline styles, quotes, lists, links, media relationships, uploads, and block fallbacks.
- Multi-author display order and editorial roles persisted and displayed in preview presentations.
- Autosave and draft persistence advance revision sequences (`reason='edited'`).
- Historical revision restore tested and verified in append-only audit trail (`reason='restored'`) with content body correctly reverted to Rev 1 state.
- Unpublished preview tokens hashed with SHA-256 and authorized strictly for creator sessions; expired, foreign, and tampered tokens rejected.
- Private and draft content strictly non-indexable (`indexable: false`, `reason: 'draft'`, `robots: { index: false, follow: false }`) and blocked from public readers.
- Document locking and concurrent edit collision prevention verified; simultaneous edit attempts receive immediate `Locked` error feedback while PostgreSQL rows remain untouched; locks clear automatically on save.
- State persistence verified across full PostgreSQL container restart (`rc103b-20261018-review`). 120 fresh migrations, 28 focused unit tests passed, 0 eslint errors/warnings.

Disposable container `rc103b-20261018-review` is stopped and preserved. Preexisting user edits, media, databases, and historical evidence are preserved.
Execution stops here; do not start Subpass 03C automatically.
