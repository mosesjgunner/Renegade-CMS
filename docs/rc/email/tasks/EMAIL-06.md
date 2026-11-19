# EMAIL-06 — Templates and remaining existing callers

**Depends on:** 04–05
**Pass:** RC3-EMAIL-01 · **Branch:** rc3-email-01 · **Baseline:** 6c291cf

## Scope and acceptance

Staff invitation email via the account outbox; community notifications, telecom fallback, and receipt resends classified and routed by purpose policy; templates carry site branding, plain text + HTML, monitored Reply-To.

## Verification

Recorded in the stage evidence log (`files/rc3-email-01-evidence/`) and the acceptance matrix at pass end.

## Result

DONE for existing callers: staff invitation email via the account outbox; community notifications on the account boundary as operational; commerce receipt resends already ride the durable audience outbox (transactional kind) unchanged. Telecom uses its own non-email adapter (Sol lead partially stale) — untouched.
