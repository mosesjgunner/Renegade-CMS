# Stage 07 handoff entry point

Prepared 2026-10-16 (America/Chicago). **Acceptance remains BLOCKED.** Current preparation results and limits are in [PREPARATION.md](PREPARATION.md).

This package belongs to the existing Stage 07 assignment. It adds no new stage or prompt round and does not replace the required Sol Stage 06 sign-off.

| Item                        | Exact handoff                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepared isolated checkout  | `C:/Projects/RENEGADE CMS/rc1-stage07-prepared-6ca6fb63`                                                                                                                                |
| Prepared source commit      | `6ca6fb63fee0b68ba64aba13428424f0a17d1d94`                                                                                                                                              |
| Executable repair source    | `45713b95d8b0ad28a15c017c10425fbde8cf3532`                                                                                                                                              |
| Previous accepted image     | `renegade-cms:sol-independent-3f464a69`, index `sha256:56dd7485646e358edffe1cc017e9ae150081f39fc07232ccd729ad6f8d51fb46`                                                                |
| Candidate/image distinction | Prepared checkout has the backup and proxy-confirmation repairs. Source/image receipts in PREPARATION.md retain their actual SHAs; no final image acceptance is inferred.               |
| Signed prerequisite records | `stage-01/sol` through `stage-06/sol`; [reconciliation](RECONCILIATION.md)                                                                                                              |
| Current first failure       | [Sol Stage 06 BLOCKED](../../stage-06/sol/HANDOFF.md)                                                                                                                                   |
| Full final gate accounting  | [18 required gate groups](RECONCILIATION.md), all unexecuted by Stage 07                                                                                                                |
| Ordinary browser constraint | Default Playwright reads `.env` and forces test-auth on. Use the accepted explicit isolated ordinary-browser harness, with test-auth and environment fallback off.                      |
| Scope / provider decisions  | [Scope](../../../../RC1-SCOPE.md), [providers](../../../../PROVIDER_MATRIX.md), [security](../../../../SECURITY_LEDGER.md); no scope exclusions added                                   |
| Operator instructions       | [Backup/restore](../../../../../OPERATIONAL_BACKUP.md), [release checklist](../../../../../RELEASE_CHECKLIST.md), [blocked release notes](../../../../../release/BETA_RELEASE_NOTES.md) |

Run the read-only prerequisite check from the main repository (it does not need installed dependencies):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/rc/evidence/rc1/stage-07/gemini/preflight.ps1 `
  -Repository 'C:/Projects/RENEGADE CMS/rc1-stage07-prepared-6ca6fb63' `
  -CandidateSha 6ca6fb63fee0b68ba64aba13428424f0a17d1d94
```

The execution-policy argument applies only to that PowerShell process; no machine or user policy is changed. Exit 1 is expected while Sol Stage 06 says BLOCKED. Exit 0 only clears this limited prerequisite inspection; it never declares release PASS. The prepared checkout intentionally has no installed dependencies, environment files, database, media or running services. Do not use existing installations to supply fixtures.

Before handing a candidate to final independent Sol acceptance, the existing Stage 06 pair must close its repaired-image, populated business crash/retry/pending restore, and authentic supported predecessor upgrade/rollback requirements. An exact predecessor package must include immutable source/version/image digest, representative secret-excluded DB/media archive, nonsecret module/configuration/migration manifest and rollback expectations. Same-candidate backups, synthetic baselines and an old tag alone do not meet that requirement. No predecessor claim was removed to make this green.

Once prerequisites actually pass, record their evidence commit, select the clean executable candidate, create a new isolated acceptance checkout if the candidate changed, and execute the existing Stage 07 chain. Refresh receipt hashes and rerun impacted checks after every executable repair. Preserve the existing RC1 tag; only final Sol may act on it after actual PASS. Never push, publish, deploy, incur charges or send outbound messages without the corresponding authorization.
