# EMAIL-10 — Legacy migration, fault injection, and two-site proof

**Depends on:** 05–09
**Pass:** RC3-EMAIL-01 · **Branch:** rc3-email-01 · **Baseline:** 6c291cf

## Scope and acceptance

Hand-written migration for email-intents/email-pauses (fresh + upgrade verified); integration proof: two sites, audience flood + revoked audience credentials + site A campaign pause — account mail on both sites unaffected; crash-before/after-acceptance recovery.

## Verification

Recorded in the stage evidence log (`files/rc3-email-01-evidence/`) and the acceptance matrix at pass end.

## Result

DONE (local proof). Hand-written reversible-by-design migration (down refuses to erase delivery evidence); fresh + upgrade verifiers in the gauntlet. Two-site fault proof: 6/6 integration tests incl. campaign pause + backlog with account mail flowing. The 10k-delivery load row was exercised at reduced scale (12-delivery backlog + sweeps); the full 10k p95 measurement is NOT claimed.
