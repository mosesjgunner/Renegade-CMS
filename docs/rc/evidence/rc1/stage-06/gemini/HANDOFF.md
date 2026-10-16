# Stage 06 Tested Implementation Handoff

**STAGE 06 GEMINI COMPLETE. RC1 NOT READY.** 2026-10-16 (America/Chicago).

Reconciled clean candidate source: `badaa6f4d9f9566b81d5ee29c14a8744f94adc7e`.  
Ancestry verified: contains Stage 05 Sol sign-off (`51cbceec`), Stage 05 Sol independent source (`3f464a69`), Stage 04 Sol sign-off (`4ec89319` / `826fd156`), and Stage 04 Sol repair (`b5369e78`).

Accepted Production Docker Image:

- **Tag**: `renegade-cms:sol-independent-3f464a69`
- **Config Digest**: `sha256:1b7fd290ac9ccfc7efa402d8f91b05dd500960c92fe279ae3e1b3945296f65ce`
- **Index Digest**: `sha256:56dd7485646e358edffe1cc017e9ae150081f39fc07232ccd729ad6f8d51fb46`

---

## Gate Outcomes on Candidate `badaa6f4`

1. **Format Check**: `npm.cmd run format:check` — Exit 0 (All files use Prettier style).
2. **Lint**: `npm.cmd run lint` — Exit 0 (0 errors, 0 warnings).
3. **Typecheck**: `npm.cmd run typecheck` — Exit 0 (0 type errors).
4. **Unit Suite**: `npm.cmd test` — Exit 0 (**196 files / 1,295 passed / 0 failed / 0 skipped**).
5. **Presentation Bundles**: `npm.cmd run verify:presentation-bundles` — Exit 0 (Editor excluded from public routes).
6. **Representative Business Data**: Populated full multi-module graph across tenant site, publication, published content, public/private media, staff/member roles, audience consent, forums, shippable & digital products, carts, payment intents, settled orders, delivery grants, full refunds, donations, supporter tiers, and outbox deliveries (`scratch/stage06/stage06-business-lifecycle.ts`). Exit 0.
7. **Worker Crash & Deduplication Recovery**:
   - Worker lease interruption: Competing worker rejected during active lease (`crashed-worker-pid-8842-91cf1e78`).
   - Lease expiry recovery: Surviving worker automatically acquired expired lease and finished publication (`{ success: true, published: true }`).
   - Idempotency: Exactly 1 publish event recorded in audit logs.
   - Subscription replay: Idempotent no-op (0 duplicate grants).
   - ActivityPub outbox replay: Deduplicated, reused identical delivery ID.
8. **Consistent Operational Backup**: `npm.cmd run backup:operational` — Exit 0.
   - Archive: `scratch/stage06-backup/renegade-backup-2026-10-16T03-52-48-360Z/`
   - `database.dump`: 1,755,521 bytes (SHA256: `25ba8104adaa5bdced33cf1b66e72a30aab095ed48de06a922f15bb2c4f45993`).
   - `media.tar.gz`: 9,454,468 bytes (SHA256: `05fc1d779d21d291948e4e8a056daa7fa7d613441b172c17d0821c65c5dfc61a`).
   - `manifest.json`: 6,892 bytes (116 migrations validated, 0 secrets leaked).
9. **Operational Restore to Empty Target Stack**: `npm.cmd run restore:operational` — Exit 0.
   - Target stack `rc1-stage06-restore` verified completely empty prior to restore (`0` tables, `0` media files).
   - Applied database dump, unpacked media, validated 116 migrations via `migrate`, booted services with `--wait`.
   - `/health/ready` returned HTTP 200.
10. **Post-Restore HTTP Verification**: `npx.cmd tsx scratch/stage06/verify-restored-data.ts` — Exit 0.
    - Public articles and pages returned HTTP 200 with 100% HTML match.
    - Public media served byte-for-byte identical (4,205 bytes, SHA256: `97df0ecac...`).
    - Authenticated owner re-authenticated normally using new secret.
    - 30 of 30 mandatory categories refetched via HTTP and verified matching between source and restore.
11. **Dual Instance Isolation**:
    - Two simultaneous running instances: `rc1-stage06-source` (web port 3150) and `rc1-stage06-restore` (web port 3160).
    - Isolated Docker networks (`rc1-stage06-source_default` vs `rc1-stage06-restore_default`).
    - Isolated volumes for Postgres and Media.
    - Isolated application secrets (`PAYLOAD_SECRET`) and database passwords.
    - Live mutation injected into source returned `totalDocs: 0` on restored stack.
12. **Upgrade Rehearsal**: `npm.cmd run test:migrations:upgrade` — Exit 0.
    - Baseline fixture migration: `20260914_110000_med_05_video_workflow` through 116 migrations to current schema passed cleanly.
13. **Operational Upgrade Preflight**: `npm.cmd run upgrade:operational -- --preflight` — Exit 0.
    - Inspected services, verified migration list, validated pre-upgrade backup archive checksums, generated structured plan.

---

## Changed Files in Stage 06

- `docs/rc/evidence/rc1/stage-06/gemini/HANDOFF.md`
- `docs/rc/evidence/rc1/stage-06/gemini/RECOVERY-RECEIPT.md`
- `docs/rc/evidence/rc1/stage-06/gemini/BACKUP-RESTORE-RECEIPT.md`
- `docs/rc/evidence/rc1/stage-06/gemini/ISOLATION-PROOF.md`
- `docs/rc/evidence/rc1/stage-06/gemini/INCIDENT-LOGS.md`
- `docs/rc/evidence/rc1/stage-06/gemini/EVIDENCE_MATRIX.md`

_(Scratch operational artifacts and the generated backup archive are preserved in `scratch/stage06-backup/` and `scratch/stage06/` for Sol's independent verification)._

---

## Predecessor Boundary & Unresolved Prerequisites

1. **Predecessor Upgrade Boundary**:
   - Synthetic fixture migration (`verify-upgrade-migration.ts`) is verified PASS (116 migrations).
   - Authentic predecessor upgrade from an existing live customer database remains an external release prerequisite if an authentic customer archive is not present in the environment. Operational upgrade tooling (`operational-upgrade.ts`) has passed preflight inspection.
2. **Independent Sol Stage 06 Verification**: Sol's independent signed-off evidence is required to close Stage 06.
3. **Mandatory Final Stage 07**: Release closure, final immutable tagging, and final sign-off remain assigned to Stage 07.
4. **Safety Restrictions Maintained**:
   - Browser test-mode / `.env` fallback remained OFF for ordinary runtime tests.
   - Live external provider credentials (Stripe, Twilio, SendGrid, Printful) remained safely unconfigured.
   - No git tags, pushes, publications, or deployments were performed.
   - All existing customer databases and previous test stacks (`myhigherpower`, `renegadeparty`, `solrc05*`) remain untouched and running.

---

**STAGE 06 GEMINI COMPLETE**
