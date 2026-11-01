#!/usr/bin/env bash
# RC1 16A disposable acceptance harness (Linux).
# Uses ONLY the clearly-labeled disposable database rc116a_release_acceptance
# on the local PostgreSQL and a disposable media root under scratch/rc116a.
set -euo pipefail
cd "$(dirname "$0")/../.."
ACTION="${1:?usage: run.sh migrate|journey|restart}"

export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc116a_release_acceptance'
export DATABASE_URI="$DATABASE_URL"
export PAYLOAD_SECRET='rc116a-disposable-only-0123456789abcdef0123456789abcdef'
# v1 credential key: bytes 1..32 (same derivation the 15E harness used).
export AI_CREDENTIAL_KEY_BASE64URL="$(node -e "process.stdout.write(Buffer.from(Array.from({length:32},(_,i)=>i+1)).toString('base64url'))")"
if [ "$ACTION" = "restart" ]; then
  # Restart phase: the keyring gains v2 (bytes 33..64) and v2 becomes active,
  # so the rotation operator action has somewhere to rotate envelopes to.
  # v1 remains in the keyring, so pre-rotation envelopes stay decryptable.
  export AI_CREDENTIAL_KEYRING_JSON="{\"v2\":\"$(node -e "process.stdout.write(Buffer.from(Array.from({length:32},(_,i)=>i+33)).toString('base64url'))")\"}"
  export AI_CREDENTIAL_ACTIVE_KEY_ID='v2'
fi
export RENEGADE_POD_ENCRYPTION_KEY='rc116a-disposable-pod-key-0123456789abcdef'
export APP_URL='http://127.0.0.1:39065'
export NETWORKING_ENABLED='true'
export NETWORK_ALLOW_PRIVATE_DEVELOPMENT='true'
export EMAIL_MODE='disabled'
export TELECOM_MODE='disabled'
export TELECOM_ALLOW_OUTBOUND='false'
export MEDIA_DIR="$PWD/scratch/rc116a/media"
export RENEGADE_MODULES='all'
export RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT='true'
export LOCAL_E2E_TEST_MODE='false'
export ENABLE_TEST_ROUTES='false'
export SEED_ON_INIT='false'
export NODE_ENV='development'
export DISABLE_PAYLOAD_HMR='true'
export RENEGADE_NEXT_DIST_DIR='.next-rc116a'
export NODE_OPTIONS='--no-deprecation --max-old-space-size=4096'

if [ "$ACTION" = "migrate" ]; then
  npm run test:migrations:fresh
  exit $?
fi
if [ "$ACTION" = "journey" ]; then
  rm -f scratch/rc116a/state.json
  rm -rf .next-rc116a
fi
node --import tsx tests/rc1-16a/journey.ts "$ACTION"
