# Resume 09D — NOT READY

Do not start a later subpass. Base `05f58a570ee51b0a6154d71db9d9322340c2f59f` plus [tested-tree.json](tested-tree.json). [RESULT.md](RESULT.md) governs; old 2026-10-21 PASS is preserved as historical and rejected.

First blocker: [segment-observed.json](segment-observed.json). A confirmed active subscriber is linked to a contact with a saved native operator tag. The tag + newsletter-consent segment returns HTTP 200 with zero eligible recipients; expected one. `evaluateSegmentRecipients` supplies `tags: []`. Reconcile canonical tag/form/sourceCampaign/engagement/role/locale/business-fact sources rather than treating missing wiring as zero. General automation definitions remain review records; general execution is unproved/unavailable. Supported form actions and notification dispatch have persisted proof.

Final totals: 235 passed, 1 failed, 0 skipped; 8 specified acceptance cases unexecuted/unaccepted. Anonymous visitor UI → real SMTP confirmation → scheduled campaign/worker/MIME → preference UI → suppression passes. Operator sessions are fixtures, not WebAuthn acceptance. Exact collection hashes survive actual PostgreSQL restart; local telecom emulation/restart pass. Aggregate RC1 remains NOT READY.

Own container `rc109d-review-20261025` is stopped with data retained. Inspect `rc1.scope=09d-review`, then `docker start rc109d-review-20261025` to inspect/reuse the failed fixture. `powershell -ExecutionPolicy Bypass -File tests/rc1-09d/run-current.ps1 segment` reproduces with a fresh fixture. Do not use `migrate` to inspect retained data: it destroys the isolated schema. Web/worker/browser/sink are stopped. Preserve sibling resources and preexisting source/evidence. No push/tag/publication/deployment.
