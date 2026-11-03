param([ValidateSet('migrate','verify','restart-check')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc117e-email2-20261103 | ConvertFrom-Json
if ($target[0].Config.Labels.'rc1.scope' -ne '17e-email2' -or $target[0].Config.Env -notcontains 'POSTGRES_DB=rc117eemail2_release_acceptance') { throw 'Disposable target mismatch' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55423/rc117eemail2_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc117e-disposable-local-secret-20261103'
$env:APP_URL = 'http://localhost:39424'
$env:EMAIL_MODE = 'smtp'
$env:EMAIL_FROM = 'RC117E <sender@example.test>'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '31424'
$env:SMTP_SECURE = 'false'
$env:SMTP_CONNECTION_TIMEOUT_MS = '2000'
$env:SMTP_SEND_TIMEOUT_MS = '5000'
$env:TELECOM_MODE = 'emulator'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc117eemail2/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC117E_EMAIL2_DISPOSABLE = 'yes'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:WORKER_POLL_INTERVAL_MS = '1000'
$env:WORKER_HEARTBEAT_FILE = Join-Path (Get-Location) 'scratch/rc117eemail2/heartbeat.json'
switch ($Action) {
  'migrate' { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
  'verify' { node --import tsx tests/rc1-17e/email-current.ts; exit $LASTEXITCODE }
  'restart-check' { node --import tsx tests/rc1-17e/email-current.ts --restart; exit $LASTEXITCODE }
}
