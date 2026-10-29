# Next Subpass Handoff: 12C -> 12D

## Completed in 12C
- One-time and recurring donation intent creation, frequency validation, and capability checks.
- Donor recognition modes (public, anonymous, private) with donor-wall privacy enforcement.
- Supporter privacy PATCH and operator GDPR/retention masking (`action: 'mask-retention'`).
- Partial and full donation refunds with entitlement revocation and duplicate reversal deduplication.
- Currency-separated donation metrics and campaign progress.
- 47 journey checks + 5 restart assertions passed on disposable database `rc112c_release_acceptance`.
- Resolved TypeScript TS2554 parameter count issue in verifier, unblocking full-workspace type checks.

## Hand-off to 12D
- **Target:** Subpass 12D/70 — Affiliate Tracking and Referrals.
- **Pre-existing Context:** Work on 12D was partially initiated in concurrent branches (`src/modules/commerce/referral-lifecycle.ts`, `tests/rc1-12d/`). Subpass 12D must verify referral link generation, cookie attribution, conversion tracking, commission calculations, and anti-fraud deduplication.
- **Database Status:** Container `rc112c-20261028` on port 5466 is stopped with data intact.
- **Constraints:** Execute strictly within 12D boundaries when invoked. Do not begin 12D automatically.

