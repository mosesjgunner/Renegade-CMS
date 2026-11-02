#!/usr/bin/env bash
# RC1 16C disposable acceptance harness (Linux).
# Uses ONLY the clearly-labeled disposable databases rc116c_release_acceptance
# (source) and rc116c_target_release_acceptance (clean import target) on the local
# PostgreSQL and disposable media roots under scratch/rc116c. All providers
# are local harnesses (Ollama-protocol, AT Protocol XRPC, loopback webhook)
# or in-process local adapters. No external posts, no live charges, no real
# provider calls, no real POD orders.
set -euo pipefail
cd "$(dirname "$0")/../.."
ACTION="${1:?usage: run.sh migrate|journey|restart}"

export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc116c_release_acceptance'
export DATABASE_URI="$DATABASE_URL"
export TARGET_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc116c_target_release_acceptance'
export PAYLOAD_SECRET='rc116c-disposable-only-0123456789abcdef0123456789abcdef'
# Harness portability archive key (64 hex chars, disposable-only). Passed to
# the CLI via argv; asserted absent from CLI stdout and every response body.
export PORTABILITY_KEY='a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
export PORTABILITY_WRONG_KEY='ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
export APP_URL='http://127.0.0.1:39067'
export SOCIAL_LOCAL_ADAPTER_ORIGINS='http://127.0.0.1:39168,http://127.0.0.1:39169'
export NETWORKING_ENABLED='true'
export NETWORK_ALLOW_PRIVATE_DEVELOPMENT='true'
export EMAIL_MODE='disabled'
export TELECOM_MODE='disabled'
export TELECOM_ALLOW_OUTBOUND='false'
export MEDIA_DIR="$PWD/scratch/rc116c/media"
export TARGET_MEDIA_DIR="$PWD/scratch/rc116c/media-target"
export RENEGADE_MODULES='all'
export RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT='true'
export LOCAL_E2E_TEST_MODE='false'
export ENABLE_TEST_ROUTES='false'
export SEED_ON_INIT='false'
export NODE_ENV='development'
export VITEST='true'
export DISABLE_PAYLOAD_HMR='true'
export RENEGADE_NEXT_DIST_DIR='.next-rc116c'
export NODE_OPTIONS='--no-deprecation --max-old-space-size=4096'

if [ "$ACTION" = "migrate" ]; then
  npm run test:migrations:fresh
  DATABASE_URL="$TARGET_DATABASE_URL" DATABASE_URI="$TARGET_DATABASE_URL" npm run test:migrations:fresh
  exit $?
fi
if [ "$ACTION" = "restart" ]; then
  sudo pg_ctlcluster 16 main restart
  sleep 2
fi
if [ "$ACTION" = "journey" ]; then
  rm -f scratch/rc116c/state.json
  rm -rf .next-rc116c scratch/rc116c/media scratch/rc116c/media-target
fi
node --import tsx tests/rc1-16c/journey.ts "$ACTION"
