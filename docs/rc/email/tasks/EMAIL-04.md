# EMAIL-04 — Verified sender onboarding and trusted site links

**Depends on:** 03
**Pass:** RC3-EMAIL-01 · **Branch:** rc3-email-01 · **Baseline:** 6c291cf

## Scope and acceptance

Real DNS verification (DKIM/SPF/DMARC + alignment) behind the command-center lights with named missing records; sender readiness states; action links bound to the site's canonical origin where resolvable.

## Verification

Recorded in the stage evidence log (`files/rc3-email-01-evidence/`) and the acceptance matrix at pass end.

## Result

DONE (engineering). Real DNS verification module behind the command-center lights with named missing records and full report in the response. Live sender verification: BLOCKED on owner DNS + provider account (EMAIL-11).
