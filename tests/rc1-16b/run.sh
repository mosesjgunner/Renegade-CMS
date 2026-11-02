#!/usr/bin/env bash
# RC1 16B disposable acceptance harness (Linux).
# Uses ONLY the clearly-labeled disposable database rc116b_release_acceptance
# on the local PostgreSQL and a disposable media root under scratch/rc116b.
# All providers are local: a loopback webhook receiver, the deterministic
# commerce test adapter, and signed local email callbacks. No external posts,
# no live charges, no real provider calls.
set -euo pipefail
cd "$(dirname "$0")/../.."
ACTION="${1:?usage: run.sh migrate|journey|restart}"

export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc116b_release_acceptance'
export DATABASE_URI="$DATABASE_URL"
export PAYLOAD_SECRET='rc116b-disposable-only-0123456789abcdef0123456789abcdef'
# Harness-only webhook secrets (canaries; asserted absent from every
# response body, page, and log in the journey).
export WEBHOOK_SECRET_RC116B_SUB='whsec-rc116b-subscription-secret-5e1b'
export EMAIL_WEBHOOK_SECRET='rc116b-email-webhook-secret-9f3c'
export COMMERCE_TEST_WEBHOOK_SECRET='rc116b-commerce-webhook-secret-7d2a'
# Low inbound budget so the rate-limit arc is provable inside one journey;
# per-key buckets keep the email and commerce budgets independent.
export INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE='25'
export APP_URL='http://127.0.0.1:39066'
export NETWORKING_ENABLED='true'
export NETWORK_ALLOW_PRIVATE_DEVELOPMENT='true'
export EMAIL_MODE='disabled'
export TELECOM_MODE='disabled'
export TELECOM_ALLOW_OUTBOUND='false'
export MEDIA_DIR="$PWD/scratch/rc116b/media"
export RENEGADE_MODULES='all'
export RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT='true'
export LOCAL_E2E_TEST_MODE='false'
export ENABLE_TEST_ROUTES='false'
export SEED_ON_INIT='false'
export NODE_ENV='development'
# Marks the test environment so loopback webhook targets are deliverable
# (production keeps HTTPS/public-only enforcement; see isWebhookTestEnv).
export VITEST='true'
export DISABLE_PAYLOAD_HMR='true'
export RENEGADE_NEXT_DIST_DIR='.next-rc116b'
export NODE_OPTIONS='--no-deprecation --max-old-space-size=4096'

if [ "$ACTION" = "migrate" ]; then
  npm run test:migrations:fresh
  exit $?
fi
if [ "$ACTION" = "journey" ]; then
  rm -f scratch/rc116b/state.json scratch/rc116b/receiver-log.json
  rm -rf .next-rc116b
fi
node --import tsx tests/rc1-16b/journey.ts "$ACTION"
