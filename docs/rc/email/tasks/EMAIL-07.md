# EMAIL-07 — Native feedback, suppression, and reconciliation

**Depends on:** 03–06
**Pass:** RC3-EMAIL-01 · **Branch:** rc3-email-01 · **Baseline:** 6c291cf

## Scope and acceptance

Native Postmark webhook with durable receipt before ack, idempotent application, trusted correlation; bounce classification (invalid vs deferral vs full vs policy); invalid-address suppression stops account attempts for the site; bounded reconciliation for stale accepted/unknown rows.

## Verification

Recorded in the stage evidence log (`files/rc3-email-01-evidence/`) and the acceptance matrix at pass end.

## Result

DONE (engineering). Native Postmark webhook with Basic-auth boundary identification, durable application before ack, idempotent replays, bounce classification, hard-bounce+inactive site suppression incl. account class. Live event receipt: NOT VERIFIED (no provider account yet).
