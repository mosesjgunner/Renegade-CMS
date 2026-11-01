# RC1 Subpass 16A — Result

**Status: PASS (bounded)** — Connection management, credentials and health.
Operators know what is configured and what actually succeeded: health in the
Connections Center is now derived only from observed probe results, disconnect
purges credentials for every family that holds one, and AI credential
envelopes can be rotated onto a new key without losing the stored secret.

Base commit `a7edf2dc2d5e8af21c54894c5ca3d265bf2c59fc` on local branch
`rc1-16a` (not pushed; delivery is the reviewer's step). Source containment:
1,591 files. The tree that executed the acceptance runs hashes to SHA-256
`ef01cf0a628de5ea578df4053262b8c5cf91f6d867c7fcbe2205ba229c347ebf`
(`source-tree.json` as frozen at run time). After the runs, the only change
was a Prettier formatting pass over `tests/rc1-16a/journey.ts` (no logic
change; harness typecheck re-passed), and provenance was re-frozen at
SHA-256 `7595400e25693ae9ba32e06bec27a79ad13659d6d8dafb897276e30e09c6209a`,
which is the `source-tree.json` stored beside this file.

Environment substitution (recorded, not hidden): this VM has no Docker, so the
disposable acceptance database is a clearly-labeled local PostgreSQL 16.15
database, `rc116a_release_acceptance`, with a disposable media root under
`scratch/rc116a/`. No existing or default development database was touched.
131 fresh migrations applied and verified by `test:migrations:fresh`
(exit 0, "Fresh migration acceptance passed").

## Implementation

1. **Truthful health (`src/modules/integrations/service.ts`,
   `src/app/(frontend)/api/admin/integrations/route.ts`,
   `src/app/(frontend)/connections/page.tsx`,
   `src/modules/extensions/ConnectionsCenter.tsx`)** —
   `reconcileProviderState` no longer stamps `lastSuccessAt` from how stored
   fields look. It accepts an observed probe result: `lastSuccessAt` is set
   only when a probe was performed and succeeded; `lastHealthCheckAt` only
   when a probe was performed; an unprobed configured connection reports
   `healthState: 'unknown'`. The Center reconcile action now runs the family's
   real probe where one exists — the AI provider test (model discovery + text
   + structured completion), a Bluesky session probe for social accounts, and
   the POD adapter health check — persists the observed outcome (including
   failures, as `degraded` with a redacted error), and records
   `probePerformed` / `observedSuccess` / `dryRun` in the audit event.
   Families without a probe (merchant, API clients, webhooks) are reviewed
   configuration-only and told "No success was recorded". Both GET
   projections (API route and `/connections` page) were corrected to match:
   webhook success now comes only from actually delivered deliveries (never
   from an event id or a secret rotation), merchant rows report unknown with
   null timestamps, social success counts only when credential health is
   healthy, POD success matches the real probe vocabulary (`healthy`), and AI
   success counts only when the last probe left the connection `active`;
   `disconnected` is preserved instead of being collapsed to `disabled`.
2. **Disconnect purges credentials (integrations route)** — Center disconnect
   for `ai-connections` now deletes the `ai-credentials` envelope rows first
   (and refuses with 500 if the purge fails, rather than claiming one),
   matching the AI family route; for `pod-connections` it overwrites
   `encryptedApiKey` with an encrypted tombstone (`renegade-credential-revoked`;
   the field is required and decrypt-validated, so the real key is destroyed
   while the record stays valid) and clears `encryptedWebhookSecret`.
   Responses and audit subjects report `credentialsPurged`.
3. **AI credential rotation (`src/modules/ai/connections.ts`)** — the cipher
   no longer hardcodes key `v1`. `credentialKeyring()` builds a multi-key
   keyring: `AI_CREDENTIAL_KEY_BASE64URL` remains `v1`,
   `AI_CREDENTIAL_KEYRING_JSON` adds further keys, and
   `AI_CREDENTIAL_ACTIVE_KEY_ID` selects the active key; misconfiguration
   fails closed with the original actionable error. New operator action
   `rotate-credential-keys` (global owner only) re-encrypts every stored AI
   envelope onto the active key via `rotateAiCredentialEnvelopes`, counts
   rotated / already-current / failed (undecryptable rows are left untouched),
   and writes a `credential_keys.rotated` audit event.

## UI / operator proof (live, disposable resources)

Harness: `tests/rc1-16a/run.sh` + `journey.ts` (Linux equivalent of the 15E
harness). Operator sessions are fixture passkey sessions
(`createPasskeySession`), the 15E convention — no genuine passkey claim. The
AI provider is a local Ollama-protocol harness on loopback and the POD
provider is the local `pod-emulator` adapter: these are **local-adapter
successes, not real-world provider success**.

Journey phase — 20/20 checks passed (`journey-trace.json`,
`journey-console.log`, `web.log`):

- Owner connects an AI connection through the real probe (201, `active`,
  text + structured capabilities, `lastTestedAt` persisted); exactly one `v1`
  credential envelope persists, contains no plaintext, and decrypts to the
  saved key; the harness observed discovery + both generate probes with the
  credential sent only to the provider endpoint.
- Connections Center and the rendered `/connections` page report the
  connection active/healthy with `lastSuccessAt` from the observed probe and
  contain no credential material; anonymous API access is denied (403).
- Center reconcile records observed success (audit: `probePerformed=true`,
  `dryRun=false`, outcome `allowed`); with the harness stopped it records the
  observed failure instead — no success claimed, connection persisted
  `degraded` with a redacted error, audit outcome `failed` — and the family
  test action recovers it to `active` once the harness returns.
- Merchant reconcile performs no probe and fabricates nothing
  (`probePerformed=false`, `observedSuccess=false`, health `unknown`,
  `lastSuccessAt` null).
- POD reconcile runs the emulator health probe and persists `healthy`;
  Center POD disconnect destroys the stored key (decrypts to the tombstone,
  never the saved key), clears the webhook secret, and disables the record.
- Missing credential-encryption configuration fails closed with "AI
  credential encryption is not configured…" and persists no connection or
  credential rows. This check ran at route-handler level in-process (a second
  web deployment without the key was not stood up); it is labeled as such in
  the trace.
- Canary secrets appear in no API/page response body and not in the web log.

Restart phase — 12/12 checks passed (`restart-trace.json`,
`restart-console.log`, `restart-web.log`). Web and PostgreSQL were both
restarted between phases; the restart phase ran with `v2` added to the
keyring and made active:

- Connection still `active` with the original `lastTestedAt`; the `v1`
  envelope still decrypts (v1 retained in the keyring).
- Owner rotates keys through the Center operator action: 1 envelope
  re-encrypted `v1` → `v2`, secret intact, no secret in the response, audit
  event recorded; a second rotation is idempotent (rotated 0,
  alreadyCurrent 1).
- Reconcile still probes successfully with the rotated envelope; Center and
  `/connections` still report the connection active/healthy.
- Center disconnect then purges the envelope (0 rows remain), the connection
  is `disconnected` with capabilities/models cleared, Center health reflects
  it (`lastSuccessAt` null, `canDisconnect` false), and a family test on the
  disconnected connection is refused with the reconnect instruction.
- Canary sweep clean for the restart phase as well.

Negatives proven live: foreign-site administrator denied on AI read (403),
AI connect (403), Center reconcile (403), and key rotation (403), with
nothing persisted by the attempts; anonymous access denied; failed probe
never recorded as success; disconnected connection refuses retest.

## Automated proof

- Focused suites (exact command:
  `npx vitest run tests/unit/ai-credential-keyring.test.ts tests/unit/integrations-operational-ux.test.ts tests/unit/integrations-service.test.ts tests/unit/connection-runtime.test.ts tests/integration/integrations-admin-api.integration.test.ts`):
  **52 passed, 0 failed**. Coverage includes the keyring/rotation contract
  (legacy `v1` envelopes under a multi-key keyring, fail-closed cases),
  truthful reconcile states, Center reconcile against a live local
  Ollama-protocol HTTP harness (success and failure), Center disconnect
  purges for AI and POD, rotation through the route, and rotation refused
  for a non-global administrator (403).
- Full unit suite (`npm run test`): **2000 passed, 5 failed, 2005 total**.
  The 5 failures are pre-existing at base `a7edf2d` and unrelated to this
  subpass — verified by running the same four files against a pristine base
  export, which failed identically (same 5 tests): `flow-04-acceptance`
  (hardcoded waiver expiry now in the past), `payload-domains` (domain count
  drift 33 vs 32), `rc1-04d-campaign-commerce` (widget fixture), and
  `shop-08-command-center-boundaries` (2 tests, 403 vs 200/409).
- `tests/integration/ai-control-plane.integration.test.ts`: **1 passed**
  against the disposable DB (previously environment-blocked/skipped without
  PostgreSQL; it verifies an encrypted credential and review decision persist
  across database reads).
- `npm run typecheck` (`tsc --noEmit`): exit 0. Harness typecheck
  (`tsc --noEmit -p tests/rc1-16a/tsconfig.json`): exit 0.
- ESLint `--max-warnings=0` over every touched source and test file: exit 0.
  Prettier `--check` over the same set: clean.

## Not executed / out of scope

- Live Bluesky session probe: the code path is implemented and the unprobed
  social contract is covered by integration tests, but no local Bluesky
  harness was stood up for this subpass, so no live social probe is claimed.
- Real POD provider health (Printful/Printify network calls) was not
  exercised; only the local `pod-emulator` adapter was probed, by design.
- `npm run verify:release` (clean-clone release gate) was not run; that is
  Pass 18 scope.
- No live charges, payouts, messages, orders, or external posts were made.

## Open blockers

None for the 16A scope. Aggregate RC1 remains NOT READY (later passes
pending). The five pre-existing full-suite unit failures listed above are
recorded here so the next subpass does not chase them as regressions.

## Resources

Disposable database `rc116a_release_acceptance` retained on the local
PostgreSQL service for inspection; disposable state under `scratch/rc116a/`.
Web and harness processes stopped. Local branch `rc1-16a` holds the commits;
nothing was pushed and no PR was created.
