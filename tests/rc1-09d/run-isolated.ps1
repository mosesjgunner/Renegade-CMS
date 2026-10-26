param([ValidateSet('start-db','migrate','verify','restart-check','stop-db')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5452/rc109d_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc109d-isolated-local-only-secret-20261021'
$env:APP_URL = 'http://localhost:39002'
$env:EMAIL_MODE = 'smtp'
$env:EMAIL_FROM = 'RC109D <sender@example.test>'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '3140'
$env:SMTP_SECURE = 'false'
$env:SMTP_CONNECTION_TIMEOUT_MS = '2000'
$env:SMTP_SEND_TIMEOUT_MS = '5000'
$env:TELECOM_MODE = 'emulator'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc109d/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_09D_DISPOSABLE = 'yes'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:WORKER_POLL_INTERVAL_MS = '1000'

switch ($Action) {
  'start-db' {
    docker run -d --name rc109d-20261021 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rc109d_release_acceptance -p '127.0.0.1:5452:5432' postgres:17.6
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
  }
  'migrate' {
    npm.cmd run test:migrations:fresh
    exit $LASTEXITCODE
  }
  'verify' {
    node --import tsx tests/rc1-09d/verify.ts
    exit $LASTEXITCODE
  }
  'restart-check' {
    docker restart rc109d-20261021
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    Start-Sleep -Seconds 3
    node --import tsx tests/rc1-09d/verify.ts --restart
    exit $LASTEXITCODE
  }
  'stop-db' {
    docker stop rc109d-20261021
    docker rm -f rc109d-20261021
    exit $LASTEXITCODE
  }
}
