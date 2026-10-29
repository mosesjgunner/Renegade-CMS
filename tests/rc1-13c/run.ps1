param([ValidateSet('migrate','journey','restart','types','simulator')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc113c-20261029 | ConvertFrom-Json
if ($target[0].Config.Labels.'rc1.scope' -ne '13c' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc113c_release_acceptance') { throw 'Disposable database containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5470/rc113c_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc113c-disposable-only-0123456789abcdef0123456789abcdef'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:APP_URL = 'http://localhost:39035'
$env:COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED = 'true'
$env:COMMERCE_GUEST_ORDER_SECRET = 'rc113c-guest-order-secret-at-least-32-characters-long'
$env:COMMERCE_TEST_WEBHOOK_SECRET = 'rc113c-test-webhook-secret-at-least-32-characters-long'
$env:COMMERCE_DELIVERY_SECRET = 'rc113c-delivery-secret-at-least-32-characters-long-ok'
$env:COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR = '3000'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc113c/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc113c'
$env:NODE_ENV = 'development'
$env:NODE_OPTIONS = '--no-deprecation'
$env:RC1_13C_DISPOSABLE = 'yes'
$env:RENEGADE_POD_SIMULATOR_ENABLED = 'true'
$env:RENEGADE_POD_SIMULATOR_URL = 'http://127.0.0.1:39036'
$env:RENEGADE_POD_SIMULATOR_TOKEN = '13c-loopback-simulator-token-only'
New-Item -ItemType Directory -Force scratch/rc113c/media | Out-Null
New-Item -ItemType Directory -Force docs/rc/evidence/rc1/18-pass/13C | Out-Null
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
if ($Action -eq 'types') { npm.cmd run generate:types; exit $LASTEXITCODE }
if ($Action -eq 'simulator') { node --import tsx tests/rc1-13c/simulator.ts; exit $LASTEXITCODE }
node --import tsx tests/rc1-13c/journey.ts $Action
exit $LASTEXITCODE
