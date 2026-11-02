#!/usr/bin/env bash
# RC1 17A disposable acceptance harness (Linux).
# Uses ONLY the clearly-labeled disposable database rc117a_release_acceptance
# on the local PostgreSQL and disposable state under scratch/rc117a.
# All actors are local fixtures; WebAuthn is exercised with a software
# authenticator (generated P-256 key pair, protocol-level responses) —
# no genuine hardware/browser passkey ceremony is claimed.
set -euo pipefail
cd "$(dirname "$0")/../.."
ACTION="${1:?usage: run.sh migrate|journey|restart}"

export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc117a_release_acceptance'
export DATABASE_URI="$DATABASE_URL"
export PAYLOAD_SECRET='rc117a-disposable-only-0123456789abcdef0123456789abcdef'
export APP_URL='http://127.0.0.1:39068'
export EMAIL_MODE='disabled'
export TELECOM_MODE='disabled'
export TELECOM_ALLOW_OUTBOUND='false'
export MEDIA_DIR="$PWD/scratch/rc117a/media"
export RENEGADE_MODULES='all'
export RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT='true'
export LOCAL_E2E_TEST_MODE='false'
export ENABLE_TEST_ROUTES='false'
export SEED_ON_INIT='false'
export NODE_ENV='development'
export VITEST='true'
export DISABLE_PAYLOAD_HMR='true'
export RENEGADE_NEXT_DIST_DIR='.next-rc117a'
export NODE_OPTIONS='--no-deprecation --max-old-space-size=4096'

if [ "$ACTION" = "migrate" ]; then
  npm run test:migrations:fresh
  exit $?
fi
if [ "$ACTION" = "restart" ]; then
  sudo pg_ctlcluster 16 main restart
  sleep 2
fi
if [ "$ACTION" = "journey" ]; then
  rm -f scratch/rc117a/state.json
  rm -rf .next-rc117a scratch/rc117a/media
fi
node --import tsx tests/rc1-17a/journey.ts "$ACTION"
