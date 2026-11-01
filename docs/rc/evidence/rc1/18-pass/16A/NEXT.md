# Next after 16A

Proceed to the next designated subpass per project schedule (16B — webhooks,
delivery and reconciliation). Subpass 16A is complete; no next subpass was
executed.

Pickup notes for whoever runs 16B:

- Reusable disposable harness: `tests/rc1-16a/run.sh` / `journey.ts` (Linux;
  local PostgreSQL 16 database `rc116a_release_acceptance`, no Docker).
  Create a fresh `rc116b_release_acceptance` database the same way and keep
  the fixture-session convention (no genuine passkey claim).
- Truthful-health contract to build on: a success timestamp may only come
  from an observed probe or an actually delivered record. 16A already fixed
  the webhook projection in both GET surfaces (success = latest delivered
  delivery, never an event id or secret rotation); 16B owns delivery and
  reconciliation behavior itself.
- Five unit failures are pre-existing at base `a7edf2d` (verified against a
  pristine export): `flow-04-acceptance`, `payload-domains`,
  `rc1-04d-campaign-commerce`, `shop-08-command-center-boundaries` (2).
  Do not treat them as regressions.
- AI credential keys: `AI_CREDENTIAL_KEY_BASE64URL` is `v1`;
  `AI_CREDENTIAL_KEYRING_JSON` adds keys, `AI_CREDENTIAL_ACTIVE_KEY_ID`
  selects the active one, and the Center action `rotate-credential-keys`
  (global owner) re-encrypts envelopes. Keep `v1` in the keyring until all
  envelopes have rotated.
