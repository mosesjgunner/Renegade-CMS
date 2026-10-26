param([ValidateSet('start-db','migrate','verify','restart-check','stop-db','browser','intake','telecom','telecom-restart','capture','restart','segment')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5453/rc109d_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc109d-isolated-local-only-secret-20261021'
$env:APP_URL = 'http://localhost:39003'
$env:EMAIL_MODE = 'smtp'
$env:EMAIL_FROM = 'RC109D <sender@example.test>'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '3141'
$env:SMTP_SECURE = 'false'
$env:SMTP_CONNECTION_TIMEOUT_MS = '2000'
$env:SMTP_SEND_TIMEOUT_MS = '5000'
$env:TELECOM_MODE = 'emulator'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc109d-review/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_09D_DISPOSABLE = 'yes'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:WORKER_POLL_INTERVAL_MS = '1000'
$env:WORKER_HEARTBEAT_FILE = Join-Path (Get-Location) 'scratch/rc109d-review/heartbeat.json'

switch ($Action) {
  'start-db' {
    docker run -d --label rc1.scope=09d-review --name rc109d-review-20261025 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rc109d_release_acceptance -p '127.0.0.1:5453:5432' postgres:17.6
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
  }
  'migrate' {
    $target = docker inspect rc109d-review-20261025 | ConvertFrom-Json
    if ($target[0].Config.Labels.'rc1.scope' -ne '09d-review') { throw 'Disposable target identity mismatch.' }
    npm.cmd run test:migrations:fresh
    exit $LASTEXITCODE
  }
  'segment' { node --import tsx tests/rc1-09d/segment-current.ts; exit $LASTEXITCODE }
  'capture' { node --import tsx tests/rc1-09d/restart-current.ts --capture; exit $LASTEXITCODE }
  'restart' {
    docker restart rc109d-review-20261025
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    Start-Sleep -Seconds 3
    node --import tsx tests/rc1-09d/restart-current.ts
    exit $LASTEXITCODE
  }
  'telecom' { node --import tsx tests/rc1-09d/telecom-current.ts; exit $LASTEXITCODE }
  'telecom-restart' { node --import tsx tests/rc1-09d/telecom-current.ts --restart; exit $LASTEXITCODE }
  'intake' { node --import tsx tests/rc1-09d/intake-current.ts; exit $LASTEXITCODE }
  'browser' {
    $env:RENEGADE_NEXT_DIST_DIR = '.next-rc109d-review'
    node --import tsx tests/rc1-09d/browser-current.ts
    exit $LASTEXITCODE
  }
  'verify' {
    node --import tsx tests/rc1-09d/verify-current.ts
    exit $LASTEXITCODE
  }
  'restart-check' {
    docker restart rc109d-review-20261025
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    Start-Sleep -Seconds 3
    node --import tsx tests/rc1-09d/verify-current.ts --restart
    exit $LASTEXITCODE
  }
  'stop-db' {
    docker stop rc109d-review-20261025
    exit $LASTEXITCODE
  }
}
