# EMAIL-09 — Operator diagnosis, alerts, and test-send UX

**Depends on:** 04–08
**Pass:** RC3-EMAIL-01 · **Branch:** rc3-email-01 · **Baseline:** 6c291cf

## Scope and acceptance

Command center shows per-boundary readiness, real DNS states, intent search/timeline, pause/resume controls; 'provider accepted; placement unknown' labeling preserved; queue-age surfacing for account intents.

## Verification

Recorded in the stage evidence log (`files/rc3-email-01-evidence/`) and the acceptance matrix at pass end.

## Result

DONE (data surface). Command center returns emailDns (observed records), emailBoundaries (isolation state), accountQueue (per-state counts + oldest actionable). Copy states accepted != placed. No new admin UI screens were built; the existing command-center payload carries the data.
