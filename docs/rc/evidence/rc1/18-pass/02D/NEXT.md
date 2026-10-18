# 02D handoff

Subpass 02D PASS is recorded in `RESULT.md` for the exact 93-file dirty tree manifest in `tested-tree.json` (base SHA `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`, overlay SHA `de2ba37266052d626d93817f67a344899464c411202130caf5cac015e62654d7`).
Administration and permissions survive adversarial multi-site and module configuration tests:
- Global owner, scoped owner, administrator, staff, member, and anonymous actors verified across two sites.
- Cross-site object-ID substitution blocked and verified with DB-unchanged assertions.
- Cross-site re-parenting / site moves denied at the access layer via `preserveRecordRelationshipsAccess`.
- Active-site switcher route access and cookie setting verified.
- Lean/default, Standard/default, Standard/all, and Lean/all module profiles verified with safe HTTP 503 degradation on unmounted routes.
- Restart persistence confirmed in PostgreSQL container `rc102d-20261017-review`.

Disposable container `rc102d-20261017-review` is stopped and preserved. Preexisting user edits, media, databases, and historical evidence are preserved.
Execution stops here; do not start Subpass 02E automatically.
