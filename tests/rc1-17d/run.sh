#!/usr/bin/env bash
# RC1 17D disposable acceptance harness (Linux, no Docker).
# Source and restore environments are two disposable PostgreSQL databases
# (rc117d_source / rc117d_restored) plus disposable media dirs under
# scratch/rc117d. The shipped operational backup/restore CLIs are
# Compose-bound; this harness executes the tooling's exact data-plane
# steps natively (pg_dump -Fc, media tar with the shipped exclusions,
# the product manifest/verify functions, pg_restore, forward migrations)
# against local processes — the 17C precedent. All data is fixture data;
# no real provider, charge, message or post occurs.
set -euo pipefail
cd "$(dirname "$0")/../.."
ACTION="${1:?usage: run.sh probe|source|backup|restore|restart|all}"

export APP_VERSION='0.1.0'
export EMAIL_MODE='disabled'
export TELECOM_MODE='disabled'
export TELECOM_ALLOW_OUTBOUND='false'
export RENEGADE_MODULES='all'
export RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT='true'
export LOCAL_E2E_TEST_MODE='false'
export ENABLE_TEST_ROUTES='false'
export SEED_ON_INIT='false'
export NODE_ENV='development'
export VITEST='true'
export DISABLE_PAYLOAD_HMR='true'
export NODE_OPTIONS='--no-deprecation --max-old-space-size=4096'
export WEBHOOK_SECRET_RC117D_SUB='whsec-rc117d-sub-DO-NOT-LEAK-41c'
export AI_CREDENTIAL_KEY_BASE64URL="$(node -e "process.stdout.write(Buffer.from(Array.from({length:32},(_,i)=>i+41)).toString('base64url'))")"

src_env() {
  export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc117d_source'
  export DATABASE_URI="$DATABASE_URL"
  export PAYLOAD_SECRET='rc117d-source-secret-DO-NOT-LEAK-17d'
  export APP_URL='http://127.0.0.1:39071'
  export MEDIA_DIR="$PWD/scratch/rc117d/media-source"
  export RENEGADE_NEXT_DIST_DIR='.next-rc117d-src'
  export RC117D_PORT='39071'
}
rst_env() {
  export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc117d_restored'
  export DATABASE_URI="$DATABASE_URL"
  export PAYLOAD_SECRET='rc117d-restored-secret-DO-NOT-LEAK-29e'
  export APP_URL='http://127.0.0.1:39072'
  export MEDIA_DIR="$PWD/scratch/rc117d/media-restored"
  export RENEGADE_NEXT_DIST_DIR='.next-rc117d-rst'
  export RC117D_PORT='39072'
}
psql_admin() { PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 "$@"; }

case "$ACTION" in
  probe)
    psql_admin -c 'DROP DATABASE IF EXISTS rc117d_source' -c 'CREATE DATABASE rc117d_source'
    src_env
    node --import tsx tests/rc1-17d/probe.ts carts
    ;;
  source)
    psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'rc117d_source' AND pid <> pg_backend_pid()" -c 'DROP DATABASE IF EXISTS rc117d_source' -c 'CREATE DATABASE rc117d_source'
    rm -rf scratch/rc117d/media-source scratch/rc117d/state.json .next-rc117d-src
    mkdir -p scratch/rc117d/media-source
    src_env
    npm run db:migrate
    node --import tsx tests/rc1-17d/journey.ts source
    ;;
  backup)
    src_env
    node --import tsx tests/rc1-17d/journey.ts backup
    ;;
  restore)
    psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'rc117d_restored' AND pid <> pg_backend_pid()" -c 'DROP DATABASE IF EXISTS rc117d_restored' -c 'CREATE DATABASE rc117d_restored'
    rm -rf scratch/rc117d/media-restored .next-rc117d-rst
    mkdir -p scratch/rc117d/media-restored
    rst_env
    node --import tsx tests/rc1-17d/journey.ts restore
    ;;
  restart)
    sudo pg_ctlcluster 16 main restart
    sleep 2
    rst_env
    node --import tsx tests/rc1-17d/journey.ts restart
    ;;
  all)
    "$0" source && "$0" backup && "$0" restore && "$0" restart
    ;;
esac
