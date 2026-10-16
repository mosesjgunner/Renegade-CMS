# Stage 07 handoff preparation

Date: 2026-10-16 (America/Chicago). Codex performed this continuation of the requested handoff preparation. **STAGE 07 BLOCKED; RC1 NOT READY.** No independent model sign-off is asserted.

The package now has a [single entry point](START-HERE.md), an executable read-only [preflight](preflight.ps1), a clean detached checkout, source comparisons, current prerequisite accounting and supplemental runtime evidence. This is substantive preparation and prerequisite repair; the final 18-group Stage 07 acceptance chain remains unexecuted.

## Candidate and repair

Prepared checkout: `C:/Projects/RENEGADE CMS/rc1-stage07-prepared-6ca6fb63`, commit `6ca6fb63fee0b68ba64aba13428424f0a17d1d94`. It contains source repair `45713b95d8b0ad28a15c017c10425fbde8cf3532`. Its executable/configuration/test paths compare equal to that repair source. Documentation and earlier signed receipts are merged separately. No `.env`, media, dependencies or runtime targets were installed in the prepared checkout.

The complete Git comparison also records removal of 12 old generated miniPaint bundle files beneath `.next-*` output directories, plus documentation and `.gitattributes` changes. Those generated outputs are excluded by `.dockerignore` and are not the source `public/vendor` assets. [Package validation](package-validation.json) lists every such path; executable-input equality does not claim identical entire Git trees.

The repaired local test checkout page already checked the incoming Host header, but confirmation checked the internal request URL. In the production reverse proxy this produced an actual HTTP 404 at confirmation after the page opened. The route now uses the same host check as the page. Guest authorization, the explicit local-only switch, long signing-key requirements and allowed-host checks remain enforced. The regression covers the proxied configured host, foreign test/public hosts, absent guest capability and disabled local checkout. Two executable/test paths changed; no schema or dependency changes were made.

Quality on clean repair source `45713b95`: `npm.cmd ci --include=dev`, `format:check`, `lint`, `typecheck`, full unit all exit 0. **196 unit files / 1,296 passed / 0 failed / 0 skipped.** Unit output, exact commands, timings and source bindings are retained in the supplemental artifacts. Installation printed audit findings; installation exit 0 is not a security clearance. No force audit fix was performed.

## Supplemental runtime proof

Before the proxy repair, the backup-tool candidate `51fa1c2310519ae478905e365befe6114c5ddcc1` was successfully built as `renegade-cms:sol06-51fa1c23`, index `sha256:7518f5e5555b4c23dbdd350768124c37bb2d2382d2a28fc9e847a5520a5b7f0d`. Web/worker boot, supported maintenance backup, separate empty-project restore and the ordinary browser login/refetch case all exit 0. The browser invocation has **1 passed / 0 failed / 0 skipped**, covering owner/staff WebAuthn and a new member MIME magic link. All 21 archived media files match; 306/309 table digests match, with differences limited to Payload job housekeeping. Embedded SHA, OCI revision, provenance and backup-tool bytes agree. This supersedes the earlier canceled-build limitation only for that source; it does not prove the later proxy repair.

The ordinary audience and community population cases also pass on `51fa1c23`: actual DOI/preferences/suppression, SMTP rejection/recovery, disabled worker transport and supported operator retry; real member sessions, forums/moderation/private messages and persistence. Their combined invocation still exits 1 because the subsequent commerce case failed. Only the two passing cases are retained as bounded workflow proof; the invocation is not relabeled PASS. Restored business-state proof must use a later archive containing these actual records.

The clean repaired-image rebuild for `45713b95` was canceled after the shared Docker API again returned HTTP 500. The recorded build-client exit is `4294967295`; there is no successful repaired-image digest. A scoped attempt to pause only this run's disposable source web/worker also returned HTTP 500, exit 1. The host reported approximately 0.9 GB free memory out of 16 GB. This is an observed host/runtime blocker, not a compiler diagnosis. Only the identified build client was stopped; no shared Docker restart, WSL shutdown, prune or installation lifecycle command was used.

The post-cancellation read-only engine probe timed out after 15 seconds. Existing-installation availability and completion of the disposable source pause cannot be reverified after that failure. No stronger claim of unchanged availability is made.

The new-candidate local commerce rerun, extra donation/subscription population and populated archive checks are **unexecuted after that failed image prerequisite**. Their prepared source-hashed harnesses are inspectable, but are not acceptance receipts. No new whole-image security acceptance, authentic predecessor upgrade or final release acceptance is implied by the earlier image boot or bounded cases.

## Preserved failures and environment

The first business harness attempt failed before meaningful workflow execution because automatic and manual tracing both started. The config now lets the reused cases own their traces. The next commerce attempts exposed missing explicit local-checkout and digital-delivery signing configuration; generated keys were stored only in ignored disposable environment files. A long navigation wait was interrupted by stopping only the identified test CLI and its children; the strengthened harness then asserted the actual confirmation HTTP 404. All unsuccessful commands retain their real exits and are excluded from passing counts. Product assertions were not removed or weakened.

Ordinary test authentication and test routes remain off. The source project is the previously verified disposable `solrc06-independent-20261016`; new restore projects and bindings are explicit in command records. All email uses the existing explicit local SMTP sink. Deterministic payment and operator-recorded manual fulfillment are local outcomes, with no live charge, delivery or fulfillment claim. Archives, MIME, authentic session state, virtual-device credentials and traces remain private with hashes. Only sanitized copies are exported.

Additional source edits appeared in main during preparation. [Their observed hashes](unreviewed-main-edits.json) are preserved; they are outside the committed prepared candidate and these acceptance claims. They were not staged, reverted or overwritten. The prepared candidate is clean despite the mutable main worktree. Any decision to include those edits requires source reconciliation and affected reruns.

## Remaining release conditions

1. Independent Sol Stage 06 remains explicitly BLOCKED. Supplemental preparation cannot rewrite that signature or stand in for its remaining coverage. Shared engine access and completion of the `45713b95` image are prerequisites to its affected runtime reruns. The earlier successful `51fa1c23` image must not substitute.
2. Actual interrupted message/outbox/payment/fulfillment settlement, failed-only retry and restored pending work without duplicate effects remain mandatory wherever not proved by the new records. Ordinary successful transactions and empty queues are not substitutes.
3. No authentic supported predecessor package has been supplied during this continuation. The required immutable source/version/image digest, representative DB/media backup, nonsecret configuration/migration manifest and rollback expectations remain open. Same-candidate archives and synthetic fixture migrations remain distinct.
4. Any additional main-worktree edits must be reconciled before they become a release candidate. All final Stage 07 quality/migration/integration/build/bundle/browser/smoke/provider/security/image/recovery/restore/upgrade groups and independent Sol decision still require execution on the actual final candidate.

The [prepared-checkout preflight](prepared-checkout-preflight.json) returns exit 1 solely because Sol Stage 06 has no leading PASS. This is an expected refusal, not a passing acceptance gate. No RC tag was created or moved; the pre-existing historical tag remains unchanged. No push, publication or deployment was performed.

[Supplemental summary](preparation/SUMMARY.json) records actual results and unexecuted work. [Artifact manifest](preparation/ARTIFACTS.json) binds 91 sanitized files and 36 private artifact hashes. Package validation checks those public file hashes, local dossier links, the preflight script hash and the clean checkout. Credential-bearing archives, traces and devices are not included in Git.
