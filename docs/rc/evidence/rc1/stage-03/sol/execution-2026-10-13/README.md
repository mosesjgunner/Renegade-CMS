# Inspectable Stage 03 execution receipts

Actual tested source: `d311396876fabc104826e4375d26feef0b5e2b39`. The main containment merge is recorded separately; historical failures retain their own source identity. Evidence files are documentation only.

- `commands/gates-from-0.json`, `unit.json`, `integration.json`: exact final ordered commands, exits and runner counts. `dependency-containment.json` identifies unchanged retained install inputs.
- `commands/browser-final3.json` and `browser/final3/results.json`: complete 18-case invocation/report. `commands/configuration-gates-v4.json` and the six `browser/config-v4-*/results.json`: complete configuration runs.
- `commands/freeze-*-before.json` / `after.json`: clean source/tree and unchanged executed harness hashes during each final invocation.
- `commands/migrations-*.json`: explicit nonsecret targets/settings and migration exits. `final3-empty-state.json`, `final3-persisted-state.json` and `final3-media-manifest.json`: real before/after persistence. Worker, lock, identity, authorization and media JSONs are in the associated browser directory.
- `browser/*/*.txt`: sanitized web/worker/server logs. `traces/**/network-summary.json`: methods/URLs/status/timing without auth headers or request bodies. `private-trace-manifest.json`: exact raw trace file paths, byte counts and SHA256 for private local inspection. Public screenshots cover worker publication, miniPaint and theme rollback.
- `source-manifest.json` / `harness-manifest.json`: exact source and ignored harness identities. `harness/*.receipt`: reviewable executed scripts; receipt suffix deliberately prevents TypeScript compilation of evidence copies. They are not new production APIs. Reproduction requires an isolated checkout, restoring receipts to the named ignored scratch paths and creating new explicitly disposable DB/media/environment files; secrets/authentication states are deliberately not distributed. The helpers enforce owned targets, real first-run/session flows and test-auth off. Existing diagnostic DBs are never reset or reused as empty proof.
- `quality-history`, earlier `browser/*` and command receipts preserve repaired failures, not replacement PASS claims. `resource-profile-guidance.json` is parsing/published guidance, not capacity acceptance.

Final acceptance is [BROWSER_ACCEPTANCE.md](../BROWSER_ACCEPTANCE.md). Later mandatory RC1 stages remain open. No tag, external publication, deployment, live provider charge or outbound delivery was performed.

Rendered text receipts normalize line endings and trailing terminal whitespace after redaction. Original command logs are retained privately with SHA256/byte counts in `private-command-log-manifest.json`. Harness receipt text is a sanitized normalized display; harness hashes identify the actual executed files. Counts, exits and JSON values are unchanged.
