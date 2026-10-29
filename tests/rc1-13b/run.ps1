param([ValidateSet('migrate','journey','restart','types','simulator')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc113b-20261029 | ConvertFrom-Json
if ($target[0].Config.Labels.'rc1.scope' -ne '13b' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc113b_release_acceptance') { throw 'Disposable database containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5469/rc113b_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc113b-disposable-only-0123456789abcdef0123456789abcdef'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:APP_URL = 'http://localhost:39025'
$env:COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED = 'true'
$env:COMMERCE_GUEST_ORDER_SECRET = 'rc113b-guest-order-secret-at-least-32-characters-long'
$env:COMMERCE_TEST_WEBHOOK_SECRET = 'rc113b-test-webhook-secret-at-least-32-characters-long'
$env:COMMERCE_DELIVERY_SECRET = 'rc113b-delivery-secret-at-least-32-characters-long-ok'
$env:COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR = '3000'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc113b/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc113b'
$env:NODE_ENV = 'development'
$env:NODE_OPTIONS = '--no-deprecation'
$env:RC1_13B_DISPOSABLE = 'yes'
$env:RENEGADE_POD_SIMULATOR_ENABLED = 'true'
$env:RENEGADE_POD_SIMULATOR_URL = 'http://127.0.0.1:39026'
$env:RENEGADE_POD_SIMULATOR_TOKEN = '13b-loopback-simulator-token-only'
New-Item -ItemType Directory -Force scratch/rc113b/media | Out-Null
New-Item -ItemType Directory -Force docs/rc/evidence/rc1/18-pass/13B | Out-Null
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
if ($Action -eq 'types','simulator') { npm.cmd run generate:types; exit $LASTEXITCODE }
if ($Action -eq 'simulator') { node --import tsx tests/rc1-13b/simulator.ts; exit $LASTEXITCODE }
node --import tsx tests/rc1-13b/journey.ts $Action
exit $LASTEXITCODE



