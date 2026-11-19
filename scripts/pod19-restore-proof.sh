#!/usr/bin/env bash
# POD-19 RESTORE PROOF — the scripted platform-backup restore that
# closes the L1 recovery leg left PARTIAL by POD-04.
#
# Flow (all destructive work happens ONLY in pod19_* scratch DBs and a
# scratch work dir; the acceptance DB is only ever READ — pg_dump and
# fixture creation through the normal test path):
#   1. Fixture + bundle: pod19-portability integration suite runs on
#      the acceptance install (creates the fixture show, exports the
#      portability bundle + fixture marker to scratch/pod19/).
#   2. Backup set: pg_dump (custom format) + media tar, with an
#      operational-backup manifest (src/modules/operations/backup.ts
#      format) written beside them.
#   3. Restore: scratch DB pod19_restore + scratch media dir are built
#      from the backup set alone.
#   4. Verify: pod19-restore-verify suite runs against the restored
#      install — the restored show's feed validates (POD-01) and an
#      episode enclosure byte-matches its recorded checksum.
#   5. Import: pod19-import suite runs against a second fresh scratch
#      DB (pod19_scratch) — the bundle round trip.
#
# Verdict line at the end: POD19_RESTORE_PROOF: PASS only when every
# step succeeded (set -e aborts before it otherwise).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
ENV_FILE="${POD19_ENV:-$HOME/workspace/gui01b-logs/seo10-acceptance-env.local}"
WORK="${POD19_WORK:-/tmp/pod19-restore-proof}"
BACKUP_DIR="$WORK/backup"
mkdir -p "$BACKUP_DIR" "$WORK/import-media" "$WORK/media"

env_value() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2-; }
DATABASE_URL="$(env_value DATABASE_URL)"
MEDIA_DIR="$(env_value MEDIA_DIR)"
PG_VERSION="$(psql "$DATABASE_URL" -Atc 'show server_version')"

echo "== [1/5] fixture + bundle on the acceptance install =="
python3 "$HOME/workspace/with-env.py" "$ENV_FILE" \
  node scripts/run-integration.mjs tests/integration/pod19-portability.integration.test.ts

echo "== [2/5] backup set: pg_dump + media tar + operational manifest =="
pg_dump "$DATABASE_URL" -Fc -f "$BACKUP_DIR/database.dump"
tar -czf "$BACKUP_DIR/media.tar.gz" -C "$MEDIA_DIR" .
python3 - "$BACKUP_DIR" "$PG_VERSION" <<'PYEOF'
import hashlib, json, os, sys, datetime
root, pg_version = sys.argv[1], sys.argv[2]
files = []
for name in ("database.dump", "media.tar.gz"):
    data = open(os.path.join(root, name), "rb").read()
    files.append({"path": name, "sha256": "sha256:" + hashlib.sha256(data).hexdigest(), "bytes": len(data)})
manifest = {
    "format": "renegade-operational-backup",
    "version": 1,
    "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "renegade": {"version": "pod19-restore-proof", "buildSha": None},
    "postgresql": {"version": pg_version},
    "consistency": {"mode": "maintenance-window", "confirmedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()},
    "includedComponents": ["postgresql-data", "media-and-local-generated-assets", "db-extension-and-capability-state", "non-secret-installation-metadata"],
    "files": files,
    "totals": {"files": len(files), "bytes": sum(f["bytes"] for f in files)},
    "migrationState": ["see docs/podcast-studio/BACKUP.md"],
    "installation": {"storageDriver": "local", "mediaDir": "restored-media", "imageTag": None},
    "exclusions": ["environment variables and .env files", "database passwords", "Payload secrets", "provider credentials", "archive encryption keys", "rebuildable backup diagnostic status"],
}
open(os.path.join(root, "manifest.json"), "w").write(json.dumps(manifest, indent=2))
print("manifest:", manifest["totals"])
PYEOF

drop_scratch() { # $1 = db name — terminate lingering backends first
  sudo -u postgres psql -qc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$1'" >/dev/null
  sudo -u postgres psql -qc "DROP DATABASE IF EXISTS $1"
  sudo -u postgres psql -qc "CREATE DATABASE $1 OWNER renegade"
}

echo "== [3/5] restore into scratch DB pod19_restore + scratch media =="
drop_scratch pod19_restore
RESTORE_URL="${DATABASE_URL%/*}/pod19_restore"
pg_restore --no-owner --dbname="$RESTORE_URL" "$BACKUP_DIR/database.dump"
mkdir -p "$WORK/media"
tar -xzf "$BACKUP_DIR/media.tar.gz" -C "$WORK/media"

scratch_env() { # $1 = db name, $2 = media dir, $3 = out file
  sed -e "s|\(://[^/]*/\)[A-Za-z0-9_]*|\1$1|" \
      -e "s|^MEDIA_DIR=.*|MEDIA_DIR=$2|" \
      -e "s|^UPGRADE_MIGRATION_DATABASE_URL=.*|UPGRADE_MIGRATION_DATABASE_URL=${DATABASE_URL%/*}/$1|" \
      "$ENV_FILE" > "$3"
}
scratch_env pod19_restore "$WORK/media" "$WORK/restore.env"

echo "== [4/5] verify the restored install (feed validates + enclosure byte-match) =="
python3 "$HOME/workspace/with-env.py" "$WORK/restore.env" \
  npx vitest run tests/integration/pod19-restore-verify.integration.test.ts

echo "== [5/5] bundle import into fresh scratch DB pod19_scratch =="
drop_scratch pod19_scratch
scratch_env pod19_scratch "$WORK/import-media" "$WORK/import.env"
python3 "$HOME/workspace/with-env.py" "$WORK/import.env" \
  npx tsx src/scripts/pod19-migrate-scratch.ts
python3 "$HOME/workspace/with-env.py" "$WORK/import.env" \
  npx vitest run tests/integration/pod19-import.integration.test.ts

echo "POD19_RESTORE_PROOF: PASS"
