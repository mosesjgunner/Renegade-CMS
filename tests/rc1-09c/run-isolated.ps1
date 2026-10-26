param([ValidateSet('start-db','migrate','verify','types','telecom','telecom-restart','restart-check','stop-db')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5451/rc109c_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc109c-isolated-local-only-secret-20261021'
$env:APP_URL = 'http://localhost:39001'
$env:EMAIL_MODE = 'smtp'
$env:EMAIL_FROM = 'RC109C <sender@example.test>'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '3139'
$env:SMTP_SECURE = 'false'
$env:SMTP_CONNECTION_TIMEOUT_MS = '2000'
$env:SMTP_SEND_TIMEOUT_MS = '5000'
$env:TELECOM_MODE = 'emulator'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc109c/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_09C_DISPOSABLE = 'yes'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:WORKER_POLL_INTERVAL_MS = '1000'
$env:WORKER_HEARTBEAT_FILE = Join-Path (Get-Location) 'scratch/rc109c/heartbeat.json'
switch ($Action) {
  'start-db' { docker run -d --name rc109c-20261021 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rc109c_release_acceptance -p '127.0.0.1:5451:5432' postgres:17.6; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
  'migrate' { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
  'verify' { node --import tsx tests/rc1-09c/verify.ts; exit $LASTEXITCODE }
  'types' { npm.cmd run generate:types; exit $LASTEXITCODE }
  'telecom' { node --import tsx tests/rc1-09c/telecom.ts; exit $LASTEXITCODE }
  'telecom-restart' { node --import tsx tests/rc1-09c/telecom.ts --restart; exit $LASTEXITCODE }
  'restart-check' { docker restart rc109c-20261021; if ($LASTEXITCODE) { exit $LASTEXITCODE }; Start-Sleep -Seconds 3; node --import tsx tests/rc1-09c/verify.ts --restart; exit $LASTEXITCODE }
  'stop-db' { docker stop rc109c-20261021; exit $LASTEXITCODE }
}
