# R-09A — NEXT (handoff)

R-09A is **PASS** (see RESULT.md in this folder). The only product
change is the duplicate-signup convergence fix in
`requestDoubleOptIn` (`src/modules/audience/service.ts`, commit
`28df0c0` on branch `rc1-repair-09a`).

## Next in the repair order

- **R-09C** (newsletter dispatch / worker retries / failure and
  restart handling) is the last of the nine repairs. Do not start
  it without a fresh instruction. Note for R-09C: the R-09A journey
  already observed the delivery handler's unknown-outcome parking,
  the eligibility re-check cancelling a parked delivery after
  suppression, SMTP-450 retryable requeue/backoff, and the retry
  route's 409 for unknown outcomes — R-09C owns the deeper
  delivery-failure acceptance (leases, worker kill/restart,
  dead-letter) on top of the frozen 09C records.

## Carried observations (not defects claimed here)

- Access (preferences/unsubscribe) tokens are signed claims with a
  persisted nonce, reusable until expiry/revocation by design;
  only confirmation tokens are single-use. Recorded as observed
  product contract.
- Restored/queued work after suppression is governed by the
  send-time `canDeliverToSubscriber` re-check; it fired correctly
  in both the retryable-queue and parked-unknown paths.

## Delivery

- The repairs chain ships as ONE combined targeted-repairs PR when
  Matthew says so. Nothing has been pushed; this branch is local.
- Binary evidence in this folder (`unsubscribed.png`) cannot ride
  the connector snapshot push — disclose at delivery time, as with
  PR #21.
