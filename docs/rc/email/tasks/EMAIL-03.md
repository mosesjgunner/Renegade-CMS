# EMAIL-03 — Production provider and deployed configuration

**Depends on:** 02
**Pass:** RC3-EMAIL-01 · **Branch:** rc3-email-01 · **Baseline:** 6c291cf

## Scope and acceptance

Postmark single-message adapter behind the existing adapter contract (stream per class, metadata correlation, MessageID, bounded timeout, Retry-After); per-boundary config validation; .env.example, Compose (web + workers), installer surfaces wired; legacy global config reports isolation as degraded.

## Verification

Recorded in the stage evidence log (`files/rc3-email-01-evidence/`) and the acceptance matrix at pass end.

## Result

DONE (engineering). Postmark adapter behind the existing contract (streams per class, metadata correlation, MessageID, bounded timeout, Retry-After); per-boundary config with hard failure on partial config; .env.example + Compose (incl. dedicated account worker service) wired. Live provider approval: BLOCKED (owner).
