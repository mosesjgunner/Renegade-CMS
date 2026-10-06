# RC-07 Pass 2 — BLOCKED

Date: 2026-10-05 (America/Chicago). Inspected repository HEAD:
`e25f1b554eeae6e898d754822c64181f4b8040cc`. The pre-existing working tree is dirty;
this SHA is not asserted to identify its contents or the deployed artifact.

## First invalidating failure

Both existing production Compose projects use image
`sha256:a9de7319f92a2cc94f8758ae8908c96cb3959508791301d6965614e762888e4b`.
Its OCI revision label and both web processes' `BUILD_SHA` are `unknown`.
An identical image digest proves identical deployed images, but supplies no exact
source candidate SHA. Mandatory gate 1 therefore fails. Acceptance stops here;
later destructive and adversarial gates are unexecuted, never counted as passed.

The required RC-07 Pass 1 report/evidence was not found in the repository's
current documentation inventory or the inspected operational history. Untracked
`scripts/rc07-setup-instances.mjs` and `scripts/rc07-configure-instance.mjs` exist.
They are not a completed Pass 1 evidence package. The configuration script writes
synthetic passkey credentials and installation completion directly to PostgreSQL;
it cannot establish ordinary first-run setup or working owner authentication.
The scripts were inspected, not executed in this pass.

## Bounded observations

`rc-07-pass2/preflight.json` retains mechanically observed image IDs, project
labels, origins, named mounts, network names, health, readiness responses, and
secret inequality booleans. No secret values were retained.

- `renegadeparty`: web, worker and PostgreSQL healthy; readiness HTTP 200.
- `myhigherpower`: web, worker and PostgreSQL healthy; readiness HTTP 200.
- Compose projects, network names and database/media volumes are distinct.
- APP_URL values are distinct, as are populated Payload secrets and database URLs.
- Both use `/app/media` inside their respective containers with distinct mounts.
- Supported `status:operational` returns `ready` for each project; exact outputs
  are retained in `status-a.txt` and `status-b.txt`.

These are topology/health observations, not adversarial database, cookie, cache,
job, search, redirect or provider isolation proof. HTTPS public-origin reachability
and owner login were not tested. No services or volumes were stopped or deleted.

## Upgrade predecessor decision

`CUSTOMER-UPGRADE-PROOF: UNAVAILABLE FOR rc.1`

No repository tags were found. Historical commit subjects including "Alpha
release" and "Buggy Beta" do not establish a legitimate stable customer release.
No tag/archive was fabricated. The repository migration verifier explicitly uses
`20260914_110000_med_05_video_workflow` as its supported historical schema baseline.
That baseline remains a repository migration fixture, not a customer deployment.
Neither the verifier nor `upgrade:operational` was run through a live upgrade in
this blocked pass.

## Unexecuted operational gates

Full backup, secret/session retention inspection, destructive clean-environment
restore, retained-state verification, corruption preflight, downgrade refusal,
failed/pending migration startup, worker restart with canonical side effects,
web restart and degraded operator diagnosis remain unexecuted. Existing scripts,
runbooks and unit tests do not establish those runtime guarantees.

`docs/PRODUCTION_DEPLOYMENT.md` and `docs/OPERATIONAL_BACKUP.md` were reviewed.
Their procedures are not finalized as proven RC-07 runbooks by this pass. In
particular, a raw full database dump needs actual inspection before asserting
that database-resident sessions or provider credentials are excluded. Manifest
secret-field validation does not establish database-dump sanitization.

## Checks

Six focused installer, Compose targeting, backup, lifecycle, installation readiness
and readiness-probe unit files: 27 passed, zero failed. See `unit-results.json`.
Typecheck and lint exit 0. Build result is retained in `build.txt` and reconciled
in `checks.json`. These checks apply to the current dirty source tree, not to an
immutable deployed candidate. RC-08 was not run. Restored-instance production
boot/smoke was not run because no qualifying restore occurred.

## Resume requirements

1. Recover the actual completed Pass 1 evidence and reconcile source/artifact
   provenance, or repair that prerequisite separately before claiming Pass 2.
2. Preserve existing edits and volumes. Produce an immutable source candidate
   containing the intended operational changes, build with its exact SHA, and
   deploy both disposable projects with recorded immutable image identity.
3. Establish valid ordinary setup/authentication and representative retained data.
4. Rerun from the failed gate, then execute all adversarial, upgrade, backup,
   destructive restore, failure and operator-status gates on that candidate.
5. Finalize launch/update/backup/restore/abort/health/credential-rotation runbooks
   only from executed evidence.

Remaining work is substantive acceptance, not low-cost cleanup. RC-07 cannot
proceed, and aggregate release readiness is not promoted.
