# Handoff after 15A

15A scoped PASS: 33 units + 40 real UI/API/persistence checks + 7 PostgreSQL/web restart checks = 80 passed, zero failed/skipped and zero mandatory scoped groups unexecuted. 129 migrations and scoped lint/types/format/diff pass. Aggregate RC1 remains NOT READY; prior receipts retain their own sources.

Base `d83a1cc2539a06d024bec148fa212a7b69c3d40d`; final 1562-file handoff SHA-256 `ec1bc3eb5f0981024e376728c1c347ce4e42b43814a4df0c020b67ec52b95a01`. `RESULT.md`, `source-tree.json`, `containment.json`, `commands.json` and traces bind the exact journey/restart/handoff sources. Production code did not change after the accepted journey; only verifier teardown and restored Next-generated configuration differ.

Reuse canonical event/consent/form stores and the persisted consent gate. Browser identity is a site-scoped consent subject, not email/member identity or a person count. Withdrawals purge linked events/mirrors and invalidate rollups. Keep canonical outcomes separate from client observations and experiment attribution; do not restore fixed metrics, unlinked attribution or browser-asserted conversions. Old/unknown legacy browser records are ineligible for reports.

Owned PostgreSQL `rc115a-20261101` stopped/data retained, loopback 5475, DB `rc115a_release_acceptance`; web 39061/browser stopped. State `scratch/rc115a/state.json`, media `scratch/rc115a/media`, dist `.next-rc115a`. Start only the labelled owned container, then `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-15a/run.ps1 restart` for retained read/retry proof. `migrate` resets its disposable schema; `journey` is a fresh-state run.

Anonymous consent UI and real public form/collector APIs are proved. Operator sessions/configuration are fixtures; no genuine passkey, remote provider or production-image acceptance. Continue only on the next separately assigned subpass. No next subpass executed.
