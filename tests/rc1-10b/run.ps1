param([ValidateSet('migrate','fresh-final','upgrade','browser','probe','stop-db')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot/../..")
$target = docker inspect rc110b-complete-20261026 | ConvertFrom-Json
if ($target[0].Id -ne '826aa246c801119c1d0fdcb947383b586c9fc989bfe852baaa9b5d8521b4bfa5' -or $target[0].Config.Labels.'rc1.scope' -ne '10b-complete') { throw 'Disposable database containment mismatch.' }
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5456/rc110b_complete_release_acceptance'
$env:DATABASE_URI = $env:DATABASE_URL
$env:PAYLOAD_SECRET = [guid]::NewGuid().ToString()+[guid]::NewGuid().ToString()
$env:RENEGADE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:APP_URL = 'http://localhost:39012'
$env:EMAIL_MODE = 'smtp'
$env:EMAIL_FROM = 'RC110B <sender@example.test>'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '3143'
$env:SMTP_SECURE = 'false'
$env:SMTP_USERNAME = ''
$env:SMTP_PASSWORD = ''
$env:TELECOM_MODE = 'disabled'
$env:TELECOM_ALLOW_OUTBOUND = 'false'
$env:MEDIA_DIR = Join-Path (Get-Location) 'scratch/rc110b-complete/media'
$env:RENEGADE_MODULES = 'all'
$env:RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT = 'true'
$env:LOCAL_E2E_TEST_MODE = 'false'
$env:ENABLE_TEST_ROUTES = 'false'
$env:SEED_ON_INIT = 'false'
$env:DISABLE_PAYLOAD_HMR = 'true'
$env:RENEGADE_NEXT_DIST_DIR = '.next-rc110b-turbo'
$env:NODE_ENV = 'development'
$env:RC1_10B_DISPOSABLE = 'yes'
switch ($Action) {
  'migrate' { npm.cmd run test:migrations:fresh; exit $LASTEXITCODE }
  'fresh-final' {
    docker exec rc110b-complete-20261026 createdb -U postgres rc110b_fresh_release_acceptance
    if ($LASTEXITCODE -ne 0) { throw 'Fresh database must be newly created; no existing target may be reset.' }
    $env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5456/rc110b_fresh_release_acceptance'
    $env:DATABASE_URI = $env:DATABASE_URL
    npm.cmd run test:migrations:fresh
    exit $LASTEXITCODE
  }
  'upgrade' { npm.cmd run db:migrate -- --force; exit $LASTEXITCODE }
  'browser' { node --import tsx tests/rc1-10b/browser.ts; exit $LASTEXITCODE }
  'probe' { node --import tsx tests/rc1-10b/probe.ts; exit $LASTEXITCODE }
  'stop-db' { docker stop rc110b-complete-20261026; exit $LASTEXITCODE }
}
