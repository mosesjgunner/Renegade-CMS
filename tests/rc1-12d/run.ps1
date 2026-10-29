param([ValidateSet('migrate','journey','restart','types')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc112d-20261029 | ConvertFrom-Json
if ($target[0].Config.Labels.'rc1.scope' -ne '12d' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc112d_release_acceptance') { throw 'Disposable database containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5467/rc112d_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc112d-disposable-only-0123456789abcdef0123456789abcdef'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:APP_URL = 'http://localhost:39023'
$env:COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED = 'true'
$env:COMMERCE_GUEST_ORDER_SECRET = 'rc112d-guest-order-secret-at-least-32-characters-long'
$env:COMMERCE_TEST_WEBHOOK_SECRET = 'rc112d-test-webhook-secret-at-least-32-characters-long'
$env:COMMERCE_DELIVERY_SECRET = 'rc112d-delivery-secret-at-least-32-characters-long-ok'
$env:COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR = '3000'
$env:BILLING_GRACE_HOURS = '0.02'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc112d/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc112d'
$env:NODE_ENV = 'development'
$env:NODE_OPTIONS = '--no-deprecation'
$env:COMMERCE_STRIPE_TEST_ENABLED = 'true'
$env:COMMERCE_STRIPE_TEST_SECRET_KEY = 'sk_test_rc112d_local_harness_only'
$env:COMMERCE_STRIPE_TEST_WEBHOOK_SECRET = 'rc112d-signature-secret-local-only'
$env:RC112D_PAYMENT_HARNESS = 'http://127.0.0.1:3146'
$env:RC1_12D_DISPOSABLE = 'yes'
New-Item -ItemType Directory -Force scratch/rc112d/media | Out-Null
New-Item -ItemType Directory -Force docs/rc/evidence/rc1/18-pass/12D | Out-Null
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
if ($Action -eq 'types') { npm.cmd run generate:types; exit $LASTEXITCODE }
node --import tsx tests/rc1-12d/journey.ts $Action
exit $LASTEXITCODE



