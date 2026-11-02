#!/usr/bin/env bash
# RC1 17F disposable acceptance harness (Linux, no Docker).
# Fresh/upgrade migrations and rollback boundaries: the shipped migration
# verifiers run against dedicated disposable PostgreSQL databases; the
# supported rollback path (pre-upgrade operational backup restore, with
# image rollback refused once the migration ledger has moved) is rehearsed
# natively with the product's own backup/lifecycle modules — the same
# data-plane the Compose-bound operational CLIs drive (17C/17D precedent).
# No live charge, message, payout or external post occurs.
set -euo pipefail
cd "$(dirname "$0")/../.."
SECTION="${1:?usage: run.sh fresh|upgrade|commerce|drift|additive|rollback|web|operators|all}"

export APP_VERSION='0.1.0'
export TELECOM_MODE='disabled'
export TELECOM_ALLOW_OUTBOUND='false'
export RENEGADE_MODULES='all'
export RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT='true'
export LOCAL_E2E_TEST_MODE='false'
export ENABLE_TEST_ROUTES='false'
export SEED_ON_INIT='false'
export NODE_ENV='development'
export DISABLE_PAYLOAD_HMR='true'
export NODE_OPTIONS='--no-deprecation --max-old-space-size=4096'
export RC117F_DISPOSABLE='yes'
export PAYLOAD_SECRET="rc117f-$(printf 'h%.0s' $(seq 1 30))-51f"
export APP_URL='http://127.0.0.1:39175'
export MEDIA_DIR="$PWD/scratch/rc117f/media"
export RENEGADE_NEXT_DIST_DIR='.next-rc117f'
export EMAIL_MODE='disabled'
export FRESH_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc117f_release_acceptance'
export UPGRADE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc117f_upgrade_acceptance'
export COMMERCE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc117f_commerce_release_acceptance'
export ROLLBACK_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc117f_rollback_source'
export RESTORED_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc117f_rollback_restored'

psql_admin() { PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 "$@"; }
recreate() {
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$1' AND pid <> pg_backend_pid()" -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1" >/dev/null
}

case "$SECTION" in
  fresh)    recreate rc117f_release_acceptance ;;
  upgrade)  recreate rc117f_upgrade_acceptance ;;
  commerce) recreate rc117f_commerce_release_acceptance ;;
  rollback)
    recreate rc117f_rollback_source
    recreate rc117f_rollback_restored
    rm -rf scratch/rc117f
    mkdir -p scratch/rc117f/media
    ;;
  web) rm -rf .next-rc117f ;;
  all)
    SETUP_ONLY=1 "$0" fresh
    SETUP_ONLY=1 "$0" upgrade
    SETUP_ONLY=1 "$0" commerce
    SETUP_ONLY=1 "$0" rollback
    for s in fresh upgrade commerce drift additive rollback operators web; do
      echo "=== SECTION $s ==="
      node --import tsx tests/rc1-17f/journey.ts "$s"
    done
    exit 0
    ;;
esac
[ "${SETUP_ONLY:-0}" = "1" ] || node --import tsx tests/rc1-17f/journey.ts "$SECTION"
