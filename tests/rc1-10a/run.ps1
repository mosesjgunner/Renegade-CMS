param([ValidateSet('start-db','migrate','build','browser','security','pool-close','stop-db')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5454/rc110a_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = 'rc110a-disposable-local-secret-20261026'
$env:APP_URL = 'http://localhost:39010'
$env:EMAIL_MODE = 'smtp'
$env:EMAIL_FROM = 'RC110A <sender@example.test>'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '3142'
$env:SMTP_SECURE = 'false'
$env:SMTP_CONNECTION_TIMEOUT_MS = '2000'
$env:SMTP_SEND_TIMEOUT_MS = '5000'
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc110a/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RC1_10A_DISPOSABLE = 'yes'
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc110a'
$env:RC1_10A_COMPILED = 'no'
$env:NODE_ENV = 'development'
switch ($Action) {
  'start-db' {
    docker run -d --label rc1.scope=10a --name rc110a-20261026 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rc110a_release_acceptance -p '127.0.0.1:5454:5432' postgres:17.6
    exit $LASTEXITCODE
  }
  'migrate' {
    $target = docker inspect rc110a-20261026 | ConvertFrom-Json
    if ($target[0].Config.Labels.'rc1.scope' -ne '10a') { throw 'Disposable target mismatch.' }
    npm.cmd run test:migrations:fresh
    exit $LASTEXITCODE
  }
  'browser' { node --import tsx tests/rc1-10a/browser.ts; exit $LASTEXITCODE }
  'build' {
    $env:RENEGADE_NEXT_DIST_DIR = '.next-rc110a-built'
    $env:NODE_ENV = 'production'
    $env:NEXT_PHASE = 'phase-production-build'
    node node_modules/next/dist/bin/next build --webpack
    exit $LASTEXITCODE
  }
  'security' { node --import tsx tests/rc1-10a/security.ts; exit $LASTEXITCODE }
  'pool-close' { node --import tsx tests/rc1-10a/browser.ts --test-pool-close; exit $LASTEXITCODE }
  'stop-db' { docker stop rc110a-20261026; exit $LASTEXITCODE }
}
