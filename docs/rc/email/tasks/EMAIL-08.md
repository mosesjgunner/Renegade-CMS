# EMAIL-08 — Subscription consent and one-click unsubscribe

**Depends on:** 06–07
**Pass:** RC3-EMAIL-01 · **Branch:** rc3-email-01 · **Baseline:** 6c291cf

## Scope and acceptance

Existing audience consent/one-click path re-verified against the contracts: send-time eligibility recheck, GET never unsubscribes, POST token flow idempotent, suppression immediate; confirmation class prioritized within audience capacity.

## Verification

Recorded in the stage evidence log (`files/rc3-email-01-evidence/`) and the acceptance matrix at pass end.

## Result

VERIFIED EXISTING + HARDENED. Audience consent/one-click path already rechecked eligibility at send time and never unsubscribes on GET; this pass adds dispatch pauses + confirmation priority in the sweep. No consent regressions: audience unit/integration suites in the gauntlet.
