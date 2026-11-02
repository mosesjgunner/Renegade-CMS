#!/usr/bin/env bash
# RC1 17E disposable acceptance harness (Linux, no Docker).
# Interruption recovery, deduplication and job integrity: real web and
# worker processes are SIGKILLed at lease/dispatch/settlement/grant/
# fulfillment boundaries against isolated provider harnesses (local SMTP
# server, durable POD simulator, local Stripe API harness) on one
# disposable PostgreSQL database (rc117e_release_acceptance).
# No live charge, message, payout or external post occurs.
set -euo pipefail
cd "$(dirname "$0")/../.."
SECTION="${1:?usage: run.sh setup|publication|payment|subscription|fulfillment|email-smtp|email-dev|restart|all}"

export APP_VERSION='0.1.0'
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
export RC117E_DISPOSABLE='yes'
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/rc117e_release_acceptance'
export DATABASE_URI="$DATABASE_URL"
export PAYLOAD_SECRET="rc117e-$(printf 'h%.0s' $(seq 1 30))-51f"
export APP_URL='http://127.0.0.1:39075'
export MEDIA_DIR="$PWD/scratch/rc117e/media"
export RENEGADE_NEXT_DIST_DIR='.next-rc117e'
export COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED='true'
export COMMERCE_GUEST_ORDER_SECRET="guest17e-$(printf 'g%.0s' $(seq 1 30))"
export COMMERCE_TEST_WEBHOOK_SECRET="whsec17e-$(printf 'w%.0s' $(seq 1 30))"
export COMMERCE_STRIPE_TEST_ENABLED='true'
export COMMERCE_STRIPE_TEST_SECRET_KEY='sk_test_17e_harness_not_live_0000000000'
export COMMERCE_STRIPE_TEST_WEBHOOK_SECRET="whsecstripe17e-$(printf 's%.0s' $(seq 1 26))"
export RC117E_PAYMENT_HARNESS='http://127.0.0.1:39098'
export RENEGADE_POD_SIMULATOR_URL='http://127.0.0.1:39097'
export RENEGADE_POD_SIMULATOR_ENABLED='true'
export RENEGADE_POD_SIMULATOR_TOKEN="podtok17e-$(printf 'p%.0s' $(seq 1 24))"
export SMTP_HOST='127.0.0.1'
export SMTP_PORT='39096'
export SMTP_SECURE='false'
export EMAIL_FROM='Renegade 17E <17e@local.test>'
export SMTP_SEND_TIMEOUT_MS='30000'
export SMTP_CONNECTION_TIMEOUT_MS='10000'

case "$SECTION" in
  email-smtp) export EMAIL_MODE='smtp' ;;
  *) export EMAIL_MODE='development' ;;
esac

psql_admin() { PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 "$@"; }

case "$SECTION" in
  setup)
    psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'rc117e_release_acceptance' AND pid <> pg_backend_pid()" -c 'DROP DATABASE IF EXISTS rc117e_release_acceptance' -c 'CREATE DATABASE rc117e_release_acceptance'
    rm -rf scratch/rc117e .next-rc117e
    mkdir -p scratch/rc117e/media
    EMAIL_MODE='disabled' npm run db:migrate
    ;;
  all)
    "$0" setup
    for s in publication payment subscription fulfillment email-smtp email-dev restart; do
      echo "=== SECTION $s ==="
      "$0" "$s"
    done
    ;;
  *)
    node --import tsx tests/rc1-17e/journey.ts "$SECTION"
    ;;
esac
