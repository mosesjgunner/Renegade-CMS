param([ValidateSet('migrate','journey','restart')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc112a-20261028 | ConvertFrom-Json
if ($target[0].Config.Labels.'rc1.scope' -ne '12a' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc112a_release_acceptance') { throw 'Disposable database containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5464/rc112a_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc112a-disposable-only-0123456789abcdef0123456789abcdef'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:APP_URL = 'http://localhost:39020'
$env:COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED = 'true'
$env:COMMERCE_GUEST_ORDER_SECRET = 'rc112a-guest-order-secret-at-least-32-characters-long'
$env:COMMERCE_TEST_WEBHOOK_SECRET = 'rc112a-test-webhook-secret-at-least-32-characters-long'
$env:COMMERCE_DELIVERY_SECRET = 'rc112a-delivery-secret-at-least-32-characters-long-ok'
$env:COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR = '3000'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc112a/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc112a'
$env:NODE_ENV = 'development'
$env:NODE_OPTIONS = '--no-deprecation'
$env:COMMERCE_STRIPE_TEST_ENABLED = 'true'
$env:COMMERCE_STRIPE_TEST_SECRET_KEY = 'sk_test_rc112a_local_harness_only'
$env:COMMERCE_STRIPE_TEST_WEBHOOK_SECRET = 'rc112a-signature-secret-local-only'
$env:RC112A_PAYMENT_HARNESS = 'http://127.0.0.1:3144'
$env:RC1_12A_DISPOSABLE = 'yes'
New-Item -ItemType Directory -Force scratch/rc112a/media | Out-Null
New-Item -ItemType Directory -Force docs/rc/evidence/rc1/18-pass/12A | Out-Null
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
node --import tsx tests/rc1-12a/journey.ts $Action
exit $LASTEXITCODE
