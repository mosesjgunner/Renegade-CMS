param([ValidateSet('migrate','journey','restart')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc117e-grant-20261103 | ConvertFrom-Json
if ($target[0].Config.Labels.'rc1.scope' -ne '17e-grant' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc117egrant_release_acceptance') { throw 'Disposable database containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55422/rc117egrant_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc112b-disposable-only-0123456789abcdef0123456789abcdef'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:APP_URL = 'http://localhost:39423'
$env:COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED = 'true'
$env:COMMERCE_GUEST_ORDER_SECRET = 'rc112b-guest-order-secret-at-least-32-characters-long'
$env:COMMERCE_TEST_WEBHOOK_SECRET = 'rc112b-test-webhook-secret-at-least-32-characters-long'
$env:COMMERCE_DELIVERY_SECRET = 'rc112b-delivery-secret-at-least-32-characters-long-ok'
$env:COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR = '3000'
$env:BILLING_GRACE_HOURS = '0.02'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc117egrant/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc117egrant'
$env:NODE_ENV = 'development'
$env:NODE_OPTIONS = '--no-deprecation'
$env:COMMERCE_STRIPE_TEST_ENABLED = 'true'
$env:COMMERCE_STRIPE_TEST_SECRET_KEY = 'sk_test_rc112b_local_harness_only'
$env:COMMERCE_STRIPE_TEST_WEBHOOK_SECRET = 'rc112b-signature-secret-local-only'
$env:RC117E_GRANT_HARNESS = 'http://127.0.0.1:31423'
$env:RC117E_GRANT_DISPOSABLE = 'yes'
New-Item -ItemType Directory -Force scratch/rc117egrant/media | Out-Null
New-Item -ItemType Directory -Force docs/rc/evidence/rc1/18-pass/17E/grant | Out-Null
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
node --import tsx tests/rc1-17e/grant-journey.ts $Action
exit $LASTEXITCODE
