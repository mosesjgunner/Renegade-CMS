# Stage 06 Operational Backup and Restore Receipt

**Date**: 2026-10-16 (America/Chicago)  
**Source Stack**: `rc1-stage06-source` (Web: `http://127.0.0.1:3150`, Postgres: `127.0.0.1:15438`)  
**Restore Target**: `rc1-stage06-restore` (Web: `http://127.0.0.1:3160`, Postgres: internal)  
**Operator**: Gemini Stage 06

---

## 1. Operational Backup Execution

### Command Line

```powershell
npm.cmd run backup:operational -- --output scratch/stage06-backup --maintenance-window-confirmed --compose-file compose.production.yaml --env-file .env.production.stage06
```

- **Exit Code**: 0
- **Duration**: ~6.2 seconds
- **Generated Archive**: `scratch/stage06-backup/renegade-backup-2026-10-16T03-52-48-360Z/`

### Archive Manifest & Artifacts

| Artifact        | File Size       | SHA256 Checksum                                                    |
| :-------------- | :-------------- | :----------------------------------------------------------------- |
| `database.dump` | 1,755,521 bytes | `25ba8104adaa5bdced33cf1b66e72a30aab095ed48de06a922f15bb2c4f45993` |
| `media.tar.gz`  | 9,454,468 bytes | `05fc1d779d21d291948e4e8a056daa7fa7d613441b172c17d0821c65c5dfc61a` |
| `manifest.json` | 6,892 bytes     | `eef19d67ce7b438ea2d79075ce8696fc4c28d2d6bb36c398e8bf951a82f3c051` |

### Manifest Properties

- **Renegade Version**: `0.1.0-rc.1`
- **Build SHA**: `3f464a6903ff26e7489179df29749f065cb55299`
- **PostgreSQL Version**: `17.6`
- **Consistency Mode**: `maintenance-window`
- **Migration Count**: 116 migrations validated (from `20260812_010209_initial_foundation` to `20261014_230000_rc1_machine_request_scope`)
- **Secret Exclusion Audit**: Verified. Zero environment files, zero passwords, zero payload secrets, zero provider tokens contained in the archive.

---

## 2. Pre-Restore Target Cleanliness Audit

Before invoking the operational restore tool, the target disposable volumes and database were explicitly audited:

```powershell
docker compose --project-name rc1-stage06-restore --env-file .env.restore.stage06 -f compose.restore.yaml exec -T postgres psql -U renegade -d renegade -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
# Output: 0

docker compose --project-name rc1-stage06-restore --env-file .env.restore.stage06 -f compose.restore.yaml run --rm --no-deps renegade-web find /app/media -type f
# Output: empty (0 files)
```

Target stack was verified 100% empty.

---

## 3. Operational Restore Execution

### Command Line

```powershell
npm.cmd run restore:operational -- --archive scratch/stage06-backup/renegade-backup-2026-10-16T03-52-48-360Z --target-version 0.1.0-rc.1 --isolated --authorize-restore --compose-file compose.restore.yaml --env-file .env.restore.stage06
```

- **Exit Code**: 0
- **Duration**: ~26.4 seconds
- **Restore Actions**:
  1. Validated backup integrity and computed SHA256 checksums matching manifest.
  2. Applied `database.dump` into `rc1-stage06-restore` PostgreSQL instance.
  3. Extracted `media.tar.gz` into target media volume (`rc1-stage06-restore_renegade_restore_media`).
  4. Executed `docker compose run --rm --no-deps migrate` (verified 116 migrations).
  5. Started `renegade-web` and `renegade-worker` services with `--wait`.
  6. Verified target health readiness probe (`/health/ready`) returned HTTP 200.

---

## 4. Post-Restore Verification Audit

Automated verification script `scratch/stage06/verify-restored-data.ts` executed against both stacks simultaneously:

### 1. Anonymous & Public Route Serving

- `/articles/decentralized-truth`: Source HTTP 200, Restored HTTP 200 (HTML match: 100%)
- `/platform`: Source HTTP 200, Restored HTTP 200 (HTML match: 100%)

### 2. Public Media Serving

- Public asset: `/media/b563aa7a-2b60-4347-888d-7128f60b5ba0` (`renegade-emblem.png`)
  - Source: HTTP 200 (4,205 bytes)
  - Restored: HTTP 200 (4,205 bytes)
  - Byte comparison: Exact match (`bytesMatch: true`, SHA256: `97df0ecac3746e73f93420443b00c601b59aa68073e40a6272ec8cd758dbd882`)

### 3. Re-Authentication Security

- Restored Owner: `founder@renegadeparty.org`
- Session cookie signed with pre-restore secret (`sourceSecret`):
  - Invalidation test: Source secret rejected on restored stack.
- Session cookie signed with restored stack's new secret (`restoreSecret`):
  - Acceptance test: HTTP 200 OK, authenticated as `founder@renegadeparty.org` (role: `owner`).

### 4. Mandatory Category Refetch Count Comparison

| Business Category             | Source Count | Restored Count | Match Status |
| :---------------------------- | :----------- | :------------- | :----------- |
| `users`                       | 2            | 2              | MATCH        |
| `members`                     | 4            | 4              | MATCH        |
| `member-site-roles`           | 4            | 4              | MATCH        |
| `media-assets`                | 10           | 10             | MATCH        |
| `content`                     | 9            | 9              | MATCH        |
| `article-family-content`      | 9            | 9              | MATCH        |
| `audience-lists`              | 1            | 1              | MATCH        |
| `subscribers`                 | 12           | 12             | MATCH        |
| `audience-memberships`        | 12           | 12             | MATCH        |
| `consent-events`              | 6            | 6              | MATCH        |
| `email-messages`              | 5            | 5              | MATCH        |
| `contacts`                    | 5 (baseline) | 5 (restored)   | MATCH        |
| `forum-sections`              | 1            | 1              | MATCH        |
| `forums`                      | 1            | 1              | MATCH        |
| `discussions`                 | 5            | 5              | MATCH        |
| `discussion-posts`            | 5            | 5              | MATCH        |
| `merchant-connections`        | 5            | 5              | MATCH        |
| `payment-method-capabilities` | 5            | 5              | MATCH        |
| `products`                    | 6            | 6              | MATCH        |
| `orders`                      | 3            | 3              | MATCH        |
| `digital-delivery-grants`     | 2            | 2              | MATCH        |
| `commerce-refunds`            | 2            | 2              | MATCH        |
| `supporters`                  | 2            | 2              | MATCH        |
| `subscriptions`               | 0            | 0              | MATCH        |
| `entitlements`                | 4            | 4              | MATCH        |
| `donation-campaigns`          | 2            | 2              | MATCH        |
| `donation-intents`            | 2            | 2              | MATCH        |
| `donations`                   | 2            | 2              | MATCH        |
| `scheduled-publish-jobs`      | 2            | 2              | MATCH        |
| `outbound-network-deliveries` | 1            | 1              | MATCH        |

_Note on contacts_: During live instance isolation verification, 2 probe records were created on the source stack (`Isolation Probe iso-...`), increasing source to 7 while the restored stack remained untouched at 5.
