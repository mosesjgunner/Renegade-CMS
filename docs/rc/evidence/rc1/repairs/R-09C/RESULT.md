# R-09C — Newsletter delivery workers, failures, retries and deduplication

## STATUS

- **09C (newsletter dispatch / worker retries / failure & restart): PASS**
- **R-09C: PASS** (2026-11-03, local production processes on this
  Docker-less host). Branch `rc1-repair-09c` from `rc1-repair-09a` @
  `e749a0f`; tested tree `e113ef1` (two harness-only commits on top of
  the base; `src/` byte-identical to the base). Production build at
  `f2c4a5d`, provenance `clean: true`.
- The frozen 09C record (2026-10-21, preserved in
  `docs/rc/evidence/rc1/18-pass/09C/` and in the ledger row history)
  was a bounded PASS: fixture sessions, route handlers imported
  in-process, no production application processes and no WebAuthn
  ceremony. This repair re-executes the same acceptance on the
  current tree against the production standalone server and the real
  jobs-worker process lifecycle, with the genuine installer WebAuthn
  owner — meeting and, for email dispatch, exceeding the frozen
  bound. **No product defect was reproduced; no product code
  changed (evidence-only PASS).**
- R-09C is the ninth and last of the nine targeted repairs.

## BASE PARITY

Before any claim, the R-09C-scoped source (`src/modules/audience`,
`src/modules/email`, `src/modules/telecom`,
`src/scripts/run-jobs-worker.ts`, the admin audience campaign/retry
routes) was diffed against the corrected union `rc1-union` @
`604e940`: the **only** scoped diff is
`src/modules/audience/service.ts`, which is exactly commit `28df0c0`
— the accepted R-09A duplicate-signup fix (adjacent audience
service, treated as accepted base). The full `src/` diff vs the
union is exactly the ten accepted files from R-03A, 17E, R-05C,
R-03D and R-08 — all outside R-09C scope.

## ENVIRONMENT

- Node v24.22.1; PostgreSQL **16.15** (local cluster); **131
  migrations** applied to the disposable database `rc1r09c_main`.
- Production standalone web server as a local process behind a
  local HTTPS proxy (ports 38911/38912); jobs workers are the real
  `src/scripts/run-jobs-worker.ts` processes, spawned, SIGKILLed and
  restarted by the verifier itself. Standard profile, test auth
  DISABLED; the operator owner is a genuine WebAuthn software-
  authenticator ceremony (no fixture session for the owner).
- Mail: `EMAIL_MODE=smtp` to a failure-injecting capture SMTP server
  run by the verifier on 127.0.0.1:3243 (connection timeout 2000 ms,
  send timeout 5000 ms). Recipient prefixes select the injected
  behavior. EMAIL_FROM `newsletter@rc1-09c.test`. No external sends;
  loopback sink only.
- Telecom: `TELECOM_MODE=emulator`, `TELECOM_ALLOW_OUTBOUND=false`
  (the product's deterministic local emulator; no carrier).

## FIRST FAILURE

No product defect reproduced. The frozen concerns dissolved on
reproduction, and the three dispatch-semantics behaviors R-09A had
recorded as observations were reconciled against the R-09C prompt —
all three are the product's designed, truthful semantics, proven
again here under the failure matrix (below): ambiguous send outcomes
park `unknown`/`unknown_outcome` non-retryable; the send-time
eligibility re-check cancels queued/parked work after suppression;
the operator retry route refuses anything but failed/dead-letter
outcomes with a retryable record (409).

Supervisor run 1 failed at journey check 11 on a **harness**
assertion, not a product behavior: the "no mail for the unconfirmed
subscriber" check counted the subscriber's own confirmation email.
The assertion was scoped to campaign mail (commit `e113ef1`) and
run 2 is the recorded acceptance, fully green.

## CHANGES

- None required (evidence-only PASS). No product file changed.
- Harness (tests only, `tests/rc1-r09c/`): `f2c4a5d` (supervisor +
  verify: production-process variant of the frozen
  `tests/rc1-09c/verify.ts` + `telecom.ts` assertion families) and
  `e113ef1` (the assertion scoping above).

## REAL WORKFLOW (supervisor run 2)

Journey **44/44** (`journey-trace.json`), telecom **9/9**
(`telecom-trace.json`), restart **37/37** (`restart-trace.json`),
against persisted state read back from PostgreSQL and the capture
sink at every step:

- Installer ceremony → Alpha site; two subscribers complete double
  opt-in (browser/API signup → captured confirmation → browser
  confirm → active), a third stays pending.
- Campaign: preview renders with a stable hash → segment evaluation
  counts 3 total / 2 deliverable → save-and-schedule pins a snapshot
  of exactly the 2 consented recipients → the real worker delivers
  both. Captured MIME is exact: subject, `From:
  newsletter@rc1-09c.test`, `Message-ID` header equal to the
  delivery's recorded `rfcMessageId`, `List-Unsubscribe` present,
  multipart HTML/plain with the design body. The pending subscriber
  has no campaign delivery and no campaign mail.
- Failure matrix via the operator campaign **test-send** action
  (real route over HTTPS, owner session) — see the table below;
  structured form in `failure-table.json`, wire record in
  `smtp-trace.json`, specimen in `controlled-message.eml`.
- Duplicate provider callback: a controlled bounce event marks the
  campaign delivery `bounced` and suppresses the address; replaying
  the identical event creates no second event row and no state
  change.
- Duplicate queue command: `queueTestSend` twice for the same
  message + recipient returns the same delivery ID → one attempt,
  one DATA.
- Telecom (worker stopped; handler in-process — see bounds):
  emulator explicitly selected with outbound disabled; canonical
  contact phone + profile timezone produce a durable quiet-hours
  delay (early replay sends nothing, attempts stay 0); a per-event
  follow opt-out cancels; an allowed event is accepted once with the
  exact emulated body; a site-scoped STOP cancels the queued Alpha
  delivery, cannot touch the foreign tenant's delivery on the same
  phone, and persists the phone-hash suppression; campaign replay
  queues nothing new.

## FAILURE TABLE

| Scenario | Injected failure | Attempts | Final status | Retry route | DATA at sink |
| --- | --- | --- | --- | --- | --- |
| Campaign baseline | none | 1 | accepted (×2 recipients) | n/a | 2 |
| Accept | none | 1 | accepted | 409 (not retryable); 403 foreign origin | 1 |
| Temporary 451 once | 451 at RCPT (1st attempt) | 2 | accepted | automatic | 1 |
| Recover | 451 at RCPT (attempts 1–4) | 5 | accepted | 200 on dead-letter | 1 |
| Permanent 550 | 550 at RCPT | 1 | failed (`permanent_recipient_error`, retryable false) | 409 | 0 |
| Exhaust + suppress | 451 always; suppression after operator retry queued | 4 | cancelled (`suppressed-before-send`) | 200 with worker stopped; 2nd retry 409 | 0 |
| Lost response | DATA captured, connection dropped, no 250 | 1 | unknown (`unknown_outcome`, retryable false) | 409 | 1 |
| Stall past timeout | 250 delayed 20 s (send timeout 5 s) | 1 | unknown (`unknown_outcome`) | 409 | 1 |
| Worker killed mid-send | no reply; worker SIGKILLed during send | 1 | unknown (`interrupted_send` after natural ~60 s lease expiry) | 409 | 1 |
| Foreign-tenant retry | none (tenant boundary) | 4 | dead-letter (unchanged) | 400 for the Alpha-only owner | 0 |
| Duplicate provider callback | same bounce event ×2 | 1 | bounced; exactly 1 event row | n/a | 1 |
| Duplicate queue command | `queueTestSend` ×2 | 1 | accepted | n/a | 1 |

Automatic retry cycle bound is 4 attempts (1 s→8 s bounded backoff
via the durable outbox scan); the operator retry establishes a new
cycle base (`retryAttemptBase`) without erasing lifetime attempts —
the recovered delivery succeeded at lifetime attempt **5**.

## NEGATIVES

- Anonymous campaign test-send → 403; anonymous retry → 403.
- Foreign-origin retry with a valid owner session → 403, before any
  state change.
- Foreign tenant: the Alpha-only owner retrying a Beta dead-letter
  delivery → 400 (not found under the caller's access); the delivery
  is unchanged.
- Native collection control (in-process Payload access, labelled
  fixture staff user): staff status mutation of a delivery denied;
  anonymous delivery creation denied.
- Unconfirmed subscriber: no campaign delivery, no campaign mail.
- Suppressed recipient: never sent to in any path (queued retry,
  parked unknown per R-09A, campaign snapshot).

## RESTART

Web process restart **and** a real PostgreSQL cluster restart
(`pg_ctlcluster restart`) between phases. Post-restart (37/37):
every recorded delivery (15 rows) keeps its status, lifetime
attempts and provider message ID across the restart and across a
20 s worker observation window (zero sends); unknown and permanent
retries are still refused 409; the three terminal telecom rows are
retained; a fresh test-send still completes end to end exactly once.

## TESTS

- Supervisor acceptance (run 2): journey **44/44**, telecom
  **9/9**, restart **37/37**; supervisor exit 0.
- Focused units (the frozen 09C 13-file set): **96/97 passed** —
  the single failure is `payload-domains`, one of the five named
  pre-existing baseline failures (an unrelated commerce task
  inventory drift). Every 09C-scoped file passes, including
  `rc1-09c-delivery` 5/5, `rc1-09c-telecom`, `email-delivery` and
  `audience-interrupted-delivery`.
- Full unit suite on the final tree: **2065 passed / 5 failed
  (2070)** — identical to the standing baseline (flow-04-acceptance,
  payload-domains, rc1-04d-campaign-commerce, shop-08 ×2). Delta
  zero.
- Final-tree `npx tsc --noEmit`: **exit 0**. Scoped ESLint on the
  R-09C source surface and the harness: **exit 0**. Production
  build: exit 0, provenance `clean: true` (sourceSha `f2c4a5d`).

## BOUNDED / UNEXECUTED

- No Docker/Compose proof on this host (definitively unavailable
  here); production processes are the local bound, as in prior
  repairs.
- Local SMTP capture sink only — no remote provider or real-world
  delivery claim. The SMTP adapter offers no reconciliation, so
  `unknown` outcomes are permanently parked by design (truthful
  unresolved-unknown handling); a reconciliation-capable remote
  provider path was not exercised.
- Connection-refused classification was not re-injected in this
  run; it stands proven on byte-identical scoped source by R-09A's
  sink-down Beta scenario (`unknown_outcome` parking + suppression
  cancellation of a parked delivery). This run proves the drop,
  timeout and worker-kill variants directly.
- Telecom delivery handler executed in-process against the
  production database (emulator receipts are process-local by
  design) — the same bound as the frozen 09C telecom proof; all
  queueing, persistence, consent and suppression effects are real
  product services. Email dispatch exceeds the frozen bound (real
  worker processes, genuine WebAuthn owner).
- The bounce provider event is a service-level controlled event
  (SMTP has no remote webhook in this topology), as in the frozen
  run; it is not a remote-provider receipt claim.
- Aggregate RC1 remains NOT READY; no other repair or subpass was
  started. This completes the nine targeted repairs.
