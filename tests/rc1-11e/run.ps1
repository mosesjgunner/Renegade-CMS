param([ValidateSet('migrate','journey','restart')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc111e-20261028 | ConvertFrom-Json
if ($target[0].Config.Labels.'rc1.scope' -ne '11e' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc111e_release_acceptance') { throw 'Disposable database containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5463/rc111e_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc111e-disposable-only-0123456789abcdef0123456789abcdef'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:APP_URL = 'http://localhost:39019'
$env:COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED = 'true'
$env:COMMERCE_GUEST_ORDER_SECRET = 'rc111e-guest-order-secret-at-least-32-characters-long'
$env:COMMERCE_TEST_WEBHOOK_SECRET = 'rc111e-test-webhook-secret-at-least-32-characters-long'
$env:COMMERCE_DELIVERY_SECRET = 'rc111e-delivery-secret-at-least-32-characters-long-ok'
$env:COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR = '3000'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc111e/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc111e'
$env:NODE_ENV = 'development'
$env:NODE_OPTIONS = '--no-deprecation'
$env:RC1_11E_DISPOSABLE = 'yes'
New-Item -ItemType Directory -Force scratch/rc111e/media | Out-Null
New-Item -ItemType Directory -Force docs/rc/evidence/rc1/18-pass/11E | Out-Null
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
node --import tsx tests/rc1-11e/journey.ts $Action
exit $LASTEXITCODE

