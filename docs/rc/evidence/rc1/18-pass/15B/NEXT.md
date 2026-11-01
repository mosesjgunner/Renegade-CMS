# Handoff after 15B

15B scoped PASS: 39 focused units + 23 ordinary UI/API/persistence checks + 5 PostgreSQL/web restart checks = 67 passed, zero failed/skipped; 129 migrations and scoped quality checks pass. Aggregate RC1 remains NOT READY.

Base `d83a1cc2539a06d024bec148fa212a7b69c3d40d`; runtime tree `63672dc95fd2fb44c858122b1a50284a8b0fe8a53a465307892de7ba736080a7`; final 1568-file handoff tree `61fd587f3687d00beaab620afaa9adac7410fa47e4c968706bbfbefdae7a06ed`. RESULT.md, source-tree.json and containment.json bind exact sources; commands/traces/reconciliations preserve the actual outcomes. Seven existing production paths plus the new shared operator report service and five verifier/test paths changed; no unrelated predecessor source changed.

Reuse current-consent subject/event stores and canonical form/order outcomes. Campaign labels describe observed landings, not verified outbound dispatches or human identity. First/last touch is confined to the selected UTC [start,end) window; fees/net/payout remain unknown. Canonical commerce is independent of analytics consent. Do not re-add snapshots to order gross or infer visitor links from email/member IDs. Subscriber/community fixture counts were zero, not positive workflow acceptance.

Owned `rc115b-20261101` stopped/data retained, loopback 5476, DB `rc115b_release_acceptance`; web 39062/browser stopped; state `scratch/rc115b/state.json`, media `scratch/rc115b/media`, dist `.next-rc115b`. To retain state, start only this labelled owned container then run `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-15b/run.ps1 restart`. `migrate` resets only the guarded disposable schema; `journey` requires fresh state. Sessions/configuration are fixtures; local deterministic adapter only; no genuine passkey, remote provider or production-image acceptance.

Continue only on the next separately assigned subpass. No next subpass executed.
