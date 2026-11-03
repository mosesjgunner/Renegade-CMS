#!/usr/bin/env bash
# RC1 17B disposable acceptance harness (Linux).
# Uses ONLY the clearly-labeled disposable database rc117b_release_acceptance
# on the local PostgreSQL and disposable state under scratch/rc117b.
# All actors are local fixtures and all provider traffic goes to local
# capture/stub servers; no real provider, charge, message or post occurs.
set -euo pipefail
cd "$(dirname "$0")/../.."
ACTION="${1:?usage: run.sh migrate|journey|restart}"

export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/rc117b_release_acceptance
export DATABASE_URI="$DATABASE_URL"
export PAYLOAD_SECRET=rc1-17b-release-acceptance-secret
export APP_URL='http://127.0.0.1:39069'
export EMAIL_MODE='disabled'
export EMAIL_WEBHOOK_SECRET=rc1-17b-email-webhook-secret
export TELECOM_MODE='disabled'
export TELECOM_ALLOW_OUTBOUND='false'
export MEDIA_DIR="$PWD/scratch/rc117b/media"
export MEDIA_MAX_UPLOAD_BYTES='65536'
export INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE='25'
export WEBHOOK_SECRET_RC117B_CANARY='whsec-canary-17b-DO-NOT-LEAK-93f2'
export AI_CREDENTIAL_KEY_BASE64URL="$(node -e "process.stdout.write(Buffer.from(Array.from({length:32},(_,i)=>i+1)).toString('base64url'))")"
export SOCIAL_LOCAL_ADAPTER_ORIGINS='http://127.0.0.1:39177'
export RENEGADE_MODULES='all'
export RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT='true'
export LOCAL_E2E_TEST_MODE='false'
export ENABLE_TEST_ROUTES='false'
export SEED_ON_INIT='false'
export NODE_ENV='development'
export VITEST='true'
export DISABLE_PAYLOAD_HMR='true'
export RENEGADE_NEXT_DIST_DIR='.next-rc117b'
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
  rm -f scratch/rc117b/state.json
  rm -rf .next-rc117b .next-rc117b-prod scratch/rc117b/media
fi
node --import tsx tests/rc1-17b/journey.ts "$ACTION"
