param([ValidateSet('migrate','journey','restart','notifications')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc111d-20261028 | ConvertFrom-Json
if ($target[0].Config.Labels.'rc1.scope' -ne '11d' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc111d_release_acceptance') { throw 'Disposable database containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5462/rc111d_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc111d-disposable-only-0123456789abcdef0123456789abcdef'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:APP_URL = 'http://localhost:39018'
$env:COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED = 'true'
$env:COMMERCE_GUEST_ORDER_SECRET = 'rc111d-guest-order-secret-at-least-32-characters-long'
$env:COMMERCE_TEST_WEBHOOK_SECRET = 'rc111d-test-webhook-secret-at-least-32-characters-long'
$env:COMMERCE_DELIVERY_SECRET = 'rc111d-delivery-secret-at-least-32-characters-long-ok'
$env:COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR = '3000'
$env:EMAIL_MODE = 'disabled'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc111d/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc111d'
$env:NODE_ENV = 'development'
$env:NODE_OPTIONS = '--no-deprecation'
$env:RC1_11D_DISPOSABLE = 'yes'
New-Item -ItemType Directory -Force scratch/rc111d/media | Out-Null
New-Item -ItemType Directory -Force docs/rc/evidence/rc1/18-pass/11D | Out-Null
if ($Action -eq 'migrate') { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
if ($Action -eq 'notifications') {
  $env:EMAIL_MODE = 'smtp'
  $env:EMAIL_FROM = 'RC111D <sender@11d.test>'
  $env:SMTP_HOST = '127.0.0.1'
  $env:SMTP_PORT = '3143'
  $env:SMTP_SECURE = 'false'
  $env:SMTP_CONNECTION_TIMEOUT_MS = '2000'
  $env:SMTP_SEND_TIMEOUT_MS = '5000'
  node --import tsx tests/rc1-11d/notifications.ts
  exit $LASTEXITCODE
}
node --import tsx tests/rc1-11d/journey.ts $Action
exit $LASTEXITCODE

