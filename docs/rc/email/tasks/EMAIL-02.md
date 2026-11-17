# EMAIL-02 — Durable account path and first complete slice

**Depends on:** 01
**Pass:** RC3-EMAIL-01 · **Branch:** rc3-email-01 · **Baseline:** 6c291cf

## Scope and acceptance

Member sign-in (magic link) and email-link confirmation write durable `email-intents` before responding; account dispatch task sends via the boundary adapter; token + intent lifecycle proven with the development sink: transient rejection, restart recovery, duplicate input, expired token.

## Verification

Recorded in the stage evidence log (`files/rc3-email-01-evidence/`) and the acceptance matrix at pass end.

## Result

DONE. Magic-link + email-link routes write durable email-intents before responding (compensating token revocation on enqueue failure); dispatch via boundary adapter; proven in the isolation integration suite (dedupe, transient-rejection recovery, near-expiry no-send).
