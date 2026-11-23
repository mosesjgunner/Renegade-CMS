# Creator Studio incident and rollback playbook

## Detect and contain

1. Record the UTC start time, site, deployment image digest, source SHA, migration ledger, and the affected room, asset, job, or delivery IDs. Keep credentials and signed URLs out of incident notes.
2. Check web readiness, database access, account mail, and scheduled publishing independently of media and live health. Pause affected optional workers or destinations and keep the core queues running where healthy.
3. For leaked or revoked access, remove the relevant grant or session, revoke affected tokens and provider credentials, and verify denial on a fresh request. For live incidents, check source, gateway, playback, and replay independently. Keep affected replays private until reviewed.
4. Check oldest-job age, storage reserves, transfer counters, provider receipts, and retry state. Reconcile an uncertain delivery against its provider receipt before replaying it. Preserve source assets and the failure logs.

## Recover and verify

1. Quiesce the applicable writers and take a verified backup of the installation and its media. Include independent snapshots of optional recording volumes or external object stores where used.
2. Compare the live migration ledger with the pre-upgrade backup. Use image rollback only when the ledgers match exactly. The rollback command refuses schema drift and runs no down migrations. After a schema change, restore the pre-upgrade archive in an isolated environment. [Operational backup and restore](../OPERATIONAL_BACKUP.md)
3. Verify readiness, worker heartbeats, a scheduled publication, protected media authorization, a revoked credential denial, and a restored media checksum. Test the affected user journey through the browser before reopening it. Resume each optional provider or worker only after its own recovery check.
4. Leave unverified native live, recording, and paid-media modes disabled for third-party rollout. Record any beta exception and the evidence that still prevents E3 signoff. [Creator Studio operations](CRE-15-OPERATOR-RUNBOOK.md)
