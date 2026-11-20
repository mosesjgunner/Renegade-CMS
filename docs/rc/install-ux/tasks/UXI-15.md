# UXI-15 — Finish every shipped surface

Partial: the install/setup/recovery spine was audited end to end and its dishonest or placeholder states were removed (static "Verified" claims, mislabeled profile, log-dump handoff). The complete shipped-surface audit (every operator route incl. raw collection views and deep links) was NOT completed in this pass and remains open for the RC3 surface program. Repository gates run for this pass: format, lint, typecheck, unit, integration, production build, smoke — see ACCEPTANCE_RESULTS.md for the candidate's actual numbers.

## Continuation (Stage 9) — full-surface re-audit and dispositions (2026-11-20)

The complete shipped-surface audit left open above was finished in
two parts: the Stage 1 inventory (69 page surfaces + 24 API groups,
236 route files) during the remainder's first stage, and this closing
re-audit on the final tree. Method: every registered defect
(UXI-D10–D17) traced to its fixing stage and re-verified, plus a live
unauthenticated crawl of 29 routes against the production build
(`tests/browser/uxi15-surface-crawl.spec.ts`): **29/29, no 5xx**;
public surfaces 200; staff surfaces (`/pos`, `/moderation`,
`/connections`, `/admin/operations`, `/admin/releases`) redirect
anonymous visitors to `/login`; the `/preferences` redirect lands on
`/subscribe/preferences`; `/podcasts/demo-show` 404s only because no
such show is seeded in the audit database.

Dispositions (full table in the matrix addendum,
`JOURNEY_AND_SURFACE_MATRIX.md` §9): D10, D11, D12, D14, D16 CLOSED;
D13 CLOSED with named remainders (four honestly-labelled unlinked
public/preview surfaces recorded as navigation debt); D15 CARRIED
(honest preview-only capability gap — closing it is feature work);
D17 half-closed (`/preferences` redirects; `/checkout` CARRIED as a
verified working alias — retiring a commerce URL is an owner call).
The `/moderation` route remains a gated duplicate of the Payload
moderation view; consolidation is CARRIED as a named follow-up.

No new defects were found by the crawl. Authenticated operator
journeys were covered by the Stage 5 walk and the integration suites,
not by this crawl; that boundary is stated, not hidden.
