# EMAIL-05 — Dispatch, recovery, and resource isolation

**Depends on:** 02–04
**Pass:** RC3-EMAIL-01 · **Branch:** rc3-email-01 · **Baseline:** 6c291cf

## Scope and acceptance

Account and audience dispatch/recovery split by class with separate worker profiles (WORKER_PROFILE=account|audience); audience recovery sweep no longer touches account intents and vice versa; per-boundary credentials/quotas; account retry policy 4 attempts / 5 min bounded by action expiry.

## Verification

Recorded in the stage evidence log (`files/rc3-email-01-evidence/`) and the acceptance matrix at pass end.

## Result

DONE. Account/audience sweeps split; WORKER_PROFILE=account|audience; audience sweep never touches email-intents and vice versa; pause re-read immediately before submission; confirmations ordered ahead of marketing in the audience sweep; retry policy per class bounded by action expiry.
